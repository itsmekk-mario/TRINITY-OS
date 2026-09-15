import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppData } from '../types';
import { toDateKey } from '../lib/date';
import { studyTotals } from '../lib/studyTotals';
import { readStudyClock, STUDY_CLOCK_EVENT, studyClockElapsedSeconds } from '../lib/useStudyClock';
import { createStudyRoomTicket, studyRoomWebSocketUrl, type ConnectionState, type StudyParticipant, type StudyRoomInfo, type StudyState } from '../lib/studyRoom';
import { useRealtimeSFU } from './useRealtimeSFU';

const emptyStudy: StudyState = { status: 'idle', active: false, elapsedSeconds: 0, todayMinutes: 0 };
const asParticipant = (value: StudyParticipant): StudyParticipant => ({ ...value, studyState: value.studyState ?? emptyStudy, connectionState: value.connectionState ?? 'connecting' });
function localStudyState(data: AppData): StudyState {
  const clock = readStudyClock(), completedToday = studyTotals(data.sessions)[toDateKey()] ?? 0;
  if (!clock) return { status: 'break', active: false, elapsedSeconds: 0, todayMinutes: Math.round(completedToday / 60) };
  const elapsedSeconds = studyClockElapsedSeconds(clock), completedFocusSeconds = Math.floor(clock.segments.filter((segment) => segment.kind === 'focus').reduce((sum, segment) => sum + Date.parse(segment.end) - Date.parse(segment.start), 0) / 1000);
  return { status: clock.running ? 'studying' : 'break', subject: clock.subject, active: clock.running, startedAt: clock.running ? clock.since : undefined, elapsedSeconds: clock.running ? completedFocusSeconds : elapsedSeconds, todayMinutes: Math.round((completedToday + elapsedSeconds) / 60) };
}

export function useStudyRoom(code: string, initialRoom: StudyRoomInfo, data: AppData, localStream?: MediaStream, cameraEnabled = false) {
  const [presenceParticipants, setPresenceParticipants] = useState<StudyParticipant[]>([]), [room, setRoom] = useState(initialRoom), [selfId, setSelfId] = useState(''), [presenceState, setPresenceState] = useState<ConnectionState>('connecting'), [presenceError, setPresenceError] = useState('');
  const socketRef = useRef<WebSocket | undefined>(undefined), selfIdRef = useRef(''), streamRef = useRef<MediaStream | undefined>(undefined), cameraEnabledRef = useRef(cameraEnabled), studyStateRef = useRef(localStudyState(data)), intentionalClose = useRef(false), reconnectRef = useRef<() => void>(() => undefined);
  const send = useCallback((value: unknown) => { const socket = socketRef.current; if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value)); }, []);
  const updateParticipant = useCallback((id: string, update: Partial<StudyParticipant>) => setPresenceParticipants((current) => current.map((item) => item.id === id ? { ...item, ...update } : item)), []);
  const selfConnectionId = presenceParticipants.find((participant) => participant.id === selfId)?.connectionId ?? '';
  const sfu = useRealtimeSFU(code, selfId, selfConnectionId, presenceParticipants, localStream);

  useEffect(() => {
    let disposed = false, connecting = false, reconnectTimer = 0, attempts = 0;
    const scheduleReconnect = () => { if (disposed || intentionalClose.current || reconnectTimer) return; setPresenceState('reconnecting'); const delay = Math.min(10_000, 800 * 2 ** Math.min(attempts, 4)); attempts += 1; reconnectTimer = window.setTimeout(() => { reconnectTimer = 0; void connect(); }, delay); };
    const handleMessage = (event: MessageEvent<string>) => {
      let value: Record<string, any>; try { value = JSON.parse(event.data) as Record<string, any>; } catch { return; }
      if (value.type === 'room-state') {
        const incoming = (Array.isArray(value.participants) ? value.participants : []).map(asParticipant);
        selfIdRef.current = String(value.selfId || ''); setSelfId(selfIdRef.current); setRoom((current) => ({ ...current, ...value.room }));
        setPresenceParticipants(incoming.map((item) => item.id === selfIdRef.current ? { ...item, stream: streamRef.current, connectionState: 'connected', cameraEnabled: cameraEnabledRef.current, studyState: studyStateRef.current } : item));
        send({ type: 'camera-state', enabled: cameraEnabledRef.current }); send({ type: 'study-state', ...studyStateRef.current });
      } else if (value.type === 'participant-joined') {
        const participant = asParticipant(value.participant as StudyParticipant); if (participant.id !== selfIdRef.current) setPresenceParticipants((current) => [...current.filter((item) => item.id !== participant.id), participant]);
      } else if (value.type === 'participant-left') setPresenceParticipants((current) => current.filter((item) => item.id !== String(value.participantId || '')));
      else if (value.type === 'camera-state') updateParticipant(String(value.userId || ''), { cameraEnabled: value.enabled === true });
      else if (value.type === 'study-state') updateParticipant(String(value.userId || ''), { studyState: { status: value.status, subject: value.subject, active: value.active === true, startedAt: value.startedAt, elapsedSeconds: Number(value.elapsedSeconds) || 0, todayMinutes: Number(value.todayMinutes) || 0 } });
      else if (value.type === 'realtime-session') updateParticipant(String(value.userId || ''), { realtimeSessionId: String(value.sessionId || ''), publishedTrackName: undefined });
      else if (value.type === 'realtime-track') updateParticipant(String(value.userId || ''), { realtimeSessionId: String(value.sessionId || ''), publishedTrackName: String(value.trackName || '') });
    };
    const connect = async () => {
      if (disposed || connecting || intentionalClose.current || socketRef.current?.readyState === WebSocket.OPEN || socketRef.current?.readyState === WebSocket.CONNECTING) return;
      connecting = true; setPresenceError(''); setPresenceState(attempts ? 'reconnecting' : 'connecting');
      try {
        const ticket = await createStudyRoomTicket(code); if (disposed) return;
        const socket = new WebSocket(studyRoomWebSocketUrl(ticket.websocketPath, ticket.ticket)); socketRef.current = socket;
        socket.onopen = () => { attempts = 0; connecting = false; setPresenceState('connected'); };
        socket.onmessage = handleMessage;
        socket.onerror = () => undefined;
        socket.onclose = (event) => { connecting = false; if (socketRef.current === socket) socketRef.current = undefined; if (!disposed && !intentionalClose.current && event.code !== 4001) scheduleReconnect(); };
      } catch (cause) { connecting = false; if (!disposed) { setPresenceError(cause instanceof Error ? cause.message : 'Study Room에 연결하지 못했습니다.'); scheduleReconnect(); } }
    };
    reconnectRef.current = () => { if (!disposed) void connect(); };
    const visible = () => { if (document.visibilityState === 'visible') void connect(); }; document.addEventListener('visibilitychange', visible); window.addEventListener('online', visible); void connect();
    return () => { disposed = true; window.clearTimeout(reconnectTimer); document.removeEventListener('visibilitychange', visible); window.removeEventListener('online', visible); socketRef.current?.close(1000, 'Leaving'); socketRef.current = undefined; };
  }, [code, send, updateParticipant]);

  useEffect(() => { streamRef.current = localStream; cameraEnabledRef.current = cameraEnabled; if (selfIdRef.current) updateParticipant(selfIdRef.current, { stream: localStream, cameraEnabled, connectionState: 'connected' }); send({ type: 'camera-state', enabled: cameraEnabled }); }, [cameraEnabled, localStream, send, updateParticipant]);
  useEffect(() => { const push = () => { const state = localStudyState(data); studyStateRef.current = state; if (selfIdRef.current) updateParticipant(selfIdRef.current, { studyState: state }); send({ type: 'study-state', ...state }); }; push(); const timer = window.setInterval(push, 30_000); window.addEventListener(STUDY_CLOCK_EVENT, push); window.addEventListener('storage', push); return () => { window.clearInterval(timer); window.removeEventListener(STUDY_CLOCK_EVENT, push); window.removeEventListener('storage', push); }; }, [data, send, updateParticipant]);

  const participants = presenceParticipants.map((participant) => participant.id === selfId ? { ...participant, stream: localStream, connectionState: 'connected' as const } : { ...participant, stream: sfu.remoteStreams.get(participant.id), connectionState: (sfu.remoteStreams.has(participant.id) || !participant.cameraEnabled ? 'connected' : sfu.connectionState) as ConnectionState });
  const leave = useCallback(() => { intentionalClose.current = true; socketRef.current?.close(1000, 'Leaving'); sfu.disconnect(); }, [sfu]);
  return { room, participants, selfId, connectionState: presenceState === 'connected' ? sfu.connectionState : presenceState, error: presenceError || sfu.error, leave, reconnect: reconnectRef.current };
}
