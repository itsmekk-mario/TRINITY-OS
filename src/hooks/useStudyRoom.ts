import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppData } from '../types';
import { toDateKey } from '../lib/date';
import { studyTotals } from '../lib/studyTotals';
import { readStudyClock, STUDY_CLOCK_EVENT, studyClockElapsedSeconds } from '../lib/useStudyClock';
import {
  createStudyRoomTicket,
  studyRoomWebSocketUrl,
  type ConnectionState,
  type StudyParticipant,
  type StudyRoomInfo,
  type StudyState,
} from '../lib/studyRoom';
import { useLiveKitRoom } from './useLiveKitRoom';

const emptyStudy: StudyState = { status: 'idle', active: false, elapsedSeconds: 0, todayMinutes: 0 };
const asParticipant = (value: StudyParticipant): StudyParticipant => ({
  ...value,
  cameraEnabled: value.cameraEnabled === true,
  microphoneEnabled: value.microphoneEnabled === true,
  studyState: value.studyState ?? emptyStudy,
  connectionState: value.connectionState ?? 'connecting',
});

function localStudyState(data: AppData): StudyState {
  const clock = readStudyClock();
  const completedToday = studyTotals(data.sessions)[toDateKey()] ?? 0;
  if (!clock) return { status: 'break', active: false, elapsedSeconds: 0, todayMinutes: Math.round(completedToday / 60) };
  const elapsedSeconds = studyClockElapsedSeconds(clock);
  const completedFocusSeconds = Math.floor(clock.segments
    .filter((segment) => segment.kind === 'focus')
    .reduce((sum, segment) => sum + Date.parse(segment.end) - Date.parse(segment.start), 0) / 1000);
  return {
    status: clock.running ? 'studying' : 'break',
    subject: clock.subject,
    active: clock.running,
    startedAt: clock.running ? clock.since : undefined,
    elapsedSeconds: clock.running ? completedFocusSeconds : elapsedSeconds,
    todayMinutes: Math.round((completedToday + elapsedSeconds) / 60),
  };
}

export function useStudyRoom(
  code: string,
  initialRoom: StudyRoomInfo,
  data: AppData,
  localStream?: MediaStream,
  cameraEnabled = false,
  microphoneEnabled = false,
) {
  const [presenceParticipants, setPresenceParticipants] = useState<StudyParticipant[]>([]);
  const [room, setRoom] = useState(initialRoom);
  const [selfId, setSelfId] = useState('');
  const [presenceState, setPresenceState] = useState<ConnectionState>('connecting');
  const [presenceError, setPresenceError] = useState('');
  const socketRef = useRef<WebSocket | undefined>(undefined);
  const selfIdRef = useRef('');
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const cameraEnabledRef = useRef(cameraEnabled);
  const microphoneEnabledRef = useRef(microphoneEnabled);
  const studyStateRef = useRef(localStudyState(data));
  const intentionalClose = useRef(false);
  const reconnectRef = useRef<() => void>(() => undefined);

  const send = useCallback((value: unknown) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify(value));
  }, []);
  const updateParticipant = useCallback((id: string, update: Partial<StudyParticipant>) => {
    setPresenceParticipants((current) => current.map((item) => item.id === id ? { ...item, ...update } : item));
  }, []);
  const selfConnectionId = presenceParticipants.find((participant) => participant.id === selfId)?.connectionId ?? '';
  const media = useLiveKitRoom(code, selfId, selfConnectionId, presenceParticipants, localStream);

  useEffect(() => {
    setRoom(initialRoom);
    setPresenceParticipants([]);
    setSelfId('');
    selfIdRef.current = '';
  }, [code, initialRoom]);

  useEffect(() => {
    if (!code) {
      setPresenceState('offline');
      setPresenceError('');
      return;
    }
    intentionalClose.current = false;
    let disposed = false;
    let connecting = false;
    let reconnectTimer = 0;
    let attempts = 0;
    const scheduleReconnect = () => {
      if (disposed || intentionalClose.current || reconnectTimer) return;
      setPresenceState('reconnecting');
      const delay = Math.min(10_000, 800 * 2 ** Math.min(attempts, 4));
      attempts += 1;
      reconnectTimer = window.setTimeout(() => { reconnectTimer = 0; void connect(); }, delay);
    };
    const handleMessage = (event: MessageEvent<string>) => {
      let value: Record<string, unknown>;
      try { value = JSON.parse(event.data) as Record<string, unknown>; } catch { return; }
      if (value.type === 'room-state') {
        const incoming = (Array.isArray(value.participants) ? value.participants : []).map((item) => asParticipant(item as StudyParticipant));
        selfIdRef.current = String(value.selfId || '');
        setSelfId(selfIdRef.current);
        setRoom((current) => ({ ...current, ...(value.room as Partial<StudyRoomInfo>) }));
        setPresenceParticipants(incoming.map((item) => item.id === selfIdRef.current ? {
          ...item,
          stream: streamRef.current,
          connectionState: 'connected',
          cameraEnabled: cameraEnabledRef.current,
          microphoneEnabled: microphoneEnabledRef.current,
          studyState: studyStateRef.current,
        } : item));
        send({ type: 'camera-state', enabled: cameraEnabledRef.current });
        send({ type: 'microphone-state', enabled: microphoneEnabledRef.current });
        send({ type: 'study-state', ...studyStateRef.current });
      } else if (value.type === 'participant-joined') {
        const participant = asParticipant(value.participant as StudyParticipant);
        if (participant.id !== selfIdRef.current) {
          setPresenceParticipants((current) => [...current.filter((item) => item.id !== participant.id), participant]);
        }
      } else if (value.type === 'participant-left') {
        setPresenceParticipants((current) => current.filter((item) => item.id !== String(value.participantId || '')));
      } else if (value.type === 'camera-state') {
        updateParticipant(String(value.userId || ''), { cameraEnabled: value.enabled === true });
      } else if (value.type === 'microphone-state') {
        updateParticipant(String(value.userId || ''), { microphoneEnabled: value.enabled === true });
      } else if (value.type === 'study-state') {
        updateParticipant(String(value.userId || ''), { studyState: {
          status: value.status === 'studying' || value.status === 'break' ? value.status : 'idle',
          subject: typeof value.subject === 'string' ? value.subject : undefined,
          active: value.active === true,
          startedAt: typeof value.startedAt === 'string' ? value.startedAt : undefined,
          elapsedSeconds: Number(value.elapsedSeconds) || 0,
          todayMinutes: Number(value.todayMinutes) || 0,
        } });
      }
    };
    const connect = async () => {
      if (disposed || connecting || intentionalClose.current ||
        socketRef.current?.readyState === WebSocket.OPEN || socketRef.current?.readyState === WebSocket.CONNECTING) return;
      connecting = true;
      setPresenceError('');
      setPresenceState(attempts ? 'reconnecting' : 'connecting');
      try {
        const ticket = await createStudyRoomTicket(code);
        if (disposed) return;
        const socket = new WebSocket(studyRoomWebSocketUrl(ticket.websocketPath, ticket.ticket));
        socketRef.current = socket;
        socket.onopen = () => {
          attempts = 0;
          connecting = false;
          setPresenceError('');
          setPresenceState('connected');
        };
        socket.onmessage = handleMessage;
        socket.onerror = () => undefined;
        socket.onclose = (event) => {
          connecting = false;
          if (socketRef.current === socket) socketRef.current = undefined;
          if (disposed || intentionalClose.current) return;
          setPresenceState('offline');
          if (event.code === 4001) {
            setPresenceError('다른 탭 또는 기기에서 같은 계정으로 이 Study Room에 다시 연결했습니다.');
            return;
          }
          scheduleReconnect();
        };
      } catch (cause) {
        connecting = false;
        if (!disposed) {
          setPresenceError(cause instanceof Error ? cause.message : 'Study Room에 연결하지 못했습니다.');
          scheduleReconnect();
        }
      }
    };
    reconnectRef.current = () => { if (!disposed) void connect(); };
    const visible = () => { if (document.visibilityState === 'visible') void connect(); };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', visible);
    void connect();
    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', visible);
      socketRef.current?.close(1000, 'Leaving');
      socketRef.current = undefined;
    };
  }, [code, send, updateParticipant]);

  useEffect(() => {
    streamRef.current = localStream;
    cameraEnabledRef.current = cameraEnabled;
    microphoneEnabledRef.current = microphoneEnabled;
    if (selfIdRef.current) updateParticipant(selfIdRef.current, {
      stream: localStream,
      cameraEnabled,
      microphoneEnabled,
      connectionState: 'connected',
    });
    send({ type: 'camera-state', enabled: cameraEnabled });
    send({ type: 'microphone-state', enabled: microphoneEnabled });
  }, [cameraEnabled, localStream, microphoneEnabled, send, updateParticipant]);

  useEffect(() => {
    const push = () => {
      const state = localStudyState(data);
      studyStateRef.current = state;
      if (selfIdRef.current) updateParticipant(selfIdRef.current, { studyState: state });
      send({ type: 'study-state', ...state });
    };
    push();
    const timer = window.setInterval(push, 30_000);
    window.addEventListener(STUDY_CLOCK_EVENT, push);
    window.addEventListener('storage', push);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(STUDY_CLOCK_EVENT, push);
      window.removeEventListener('storage', push);
    };
  }, [data, send, updateParticipant]);

  const participants = presenceParticipants.map((participant) => participant.id === selfId
    ? { ...participant, stream: localStream, connectionState: 'connected' as const }
    : {
        ...participant,
        stream: media.remoteStreams.get(participant.id),
        connectionState: (media.remoteStreams.has(participant.id) || !participant.cameraEnabled
          ? 'connected'
          : media.connectionState) as ConnectionState,
      });
  const leave = useCallback(() => {
    intentionalClose.current = true;
    socketRef.current?.close(1000, 'Leaving');
    media.disconnect();
  }, [media]);

  return {
    room,
    participants,
    selfId,
    connectionState: presenceState === 'connected' ? media.connectionState : presenceState,
    presenceConnectionState: presenceState,
    mediaConnectionState: media.connectionState,
    error: presenceError || media.error,
    mediaError: media.error,
    audioPlaybackBlocked: media.audioPlaybackBlocked,
    startAudio: media.startAudio,
    leave,
    reconnect: reconnectRef.current,
  };
}
