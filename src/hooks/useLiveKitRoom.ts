import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client';
import { createLiveKitAccess, type ConnectionState, type StudyParticipant } from '../lib/studyRoom';

const RETRY_DELAYS = [3_000, 5_000, 10_000, 20_000];

export function useLiveKitRoom(
  code: string,
  selfId: string,
  presenceConnectionId: string,
  participants: StudyParticipant[],
  localStream?: MediaStream,
) {
  const [ready, setReady] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [error, setError] = useState('');
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(() => new Map());
  const roomRef = useRef<Room | undefined>(undefined);
  const publishedRef = useRef<Map<string, MediaStreamTrack>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLMediaElement>>(new Map());
  const manualDisconnectRef = useRef(false);
  const retryCountRef = useRef(0);

  const clearRemoteMedia = useCallback(() => {
    for (const element of audioElementsRef.current.values()) element.remove();
    audioElementsRef.current.clear();
    setRemoteStreams(new Map());
    setAudioPlaybackBlocked(false);
  }, []);

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    const room = roomRef.current;
    roomRef.current = undefined;
    publishedRef.current.clear();
    setReady(false);
    setConnectionState('offline');
    clearRemoteMedia();
    // useCamera owns the MediaStreamTrack lifecycle. Never stop those tracks just
    // because the LiveKit room is being recreated or explicitly left.
    if (room) void room.disconnect(false).catch(() => undefined);
  }, [clearRemoteMedia]);

  const startAudio = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.startAudio();
      setAudioPlaybackBlocked(!room.canPlaybackAudio);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '오디오 재생을 시작하지 못했습니다.');
    }
  }, []);

  useEffect(() => {
    if (!code || !selfId || !presenceConnectionId) return;
    let disposed = false;
    let reconnectTimer: number | undefined;
    manualDisconnectRef.current = false;
    setReady(false);
    setError('');
    setConnectionState('connecting');

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      stopLocalTrackOnUnpublish: false,
      singlePeerConnection: true,
      publishDefaults: {
        simulcast: true,
        videoEncoding: { maxBitrate: 450_000, maxFramerate: 15 },
        dtx: true,
        red: true,
      },
    });
    roomRef.current = room;

    const syncAudioPlaybackState = () => {
      setAudioPlaybackBlocked(audioElementsRef.current.size > 0 && !room.canPlaybackAudio);
    };
    const removeVideo = (identity: string) => setRemoteStreams((current) => {
      if (!current.has(identity)) return current;
      const next = new Map(current);
      next.delete(identity);
      return next;
    });
    const removeAudio = (identity: string) => {
      audioElementsRef.current.get(identity)?.remove();
      audioElementsRef.current.delete(identity);
      syncAudioPlaybackState();
    };
    const onTrackSubscribed = (
      track: RemoteTrack,
      _publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      if (track.kind === Track.Kind.Video) {
        setRemoteStreams((current) => new Map(current).set(
          participant.identity,
          new MediaStream([track.mediaStreamTrack]),
        ));
      } else if (track.kind === Track.Kind.Audio) {
        removeAudio(participant.identity);
        const element = track.attach();
        element.autoplay = true;
        element.style.display = 'none';
        element.dataset.livekitParticipant = participant.identity;
        document.body.appendChild(element);
        audioElementsRef.current.set(participant.identity, element);
        syncAudioPlaybackState();
      }
    };
    const onTrackUnsubscribed = (
      track: RemoteTrack,
      _publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      track.detach().forEach((element) => element.remove());
      if (track.kind === Track.Kind.Video) removeVideo(participant.identity);
      if (track.kind === Track.Kind.Audio) removeAudio(participant.identity);
    };
    const onParticipantDisconnected = (participant: RemoteParticipant) => {
      removeVideo(participant.identity);
      removeAudio(participant.identity);
    };
    const scheduleRetry = () => {
      if (disposed || manualDisconnectRef.current || reconnectTimer !== undefined) return;
      const delay = RETRY_DELAYS[Math.min(retryCountRef.current, RETRY_DELAYS.length - 1)];
      retryCountRef.current += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined;
        if (!disposed) setGeneration((value) => value + 1);
      }, delay);
    };
    const onDisconnected = () => {
      if (disposed) return;
      setReady(false);
      setConnectionState('offline');
      scheduleRetry();
    };

    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    room.on(RoomEvent.AudioPlaybackStatusChanged, syncAudioPlaybackState);
    room.on(RoomEvent.Reconnecting, () => !disposed && setConnectionState('reconnecting'));
    room.on(RoomEvent.Reconnected, () => {
      if (disposed) return;
      retryCountRef.current = 0;
      setConnectionState('connected');
      setError('');
      syncAudioPlaybackState();
    });
    room.on(RoomEvent.Disconnected, onDisconnected);

    void (async () => {
      try {
        const access = await createLiveKitAccess(code, presenceConnectionId);
        if (disposed) return;
        room.prepareConnection(access.url, access.token);
        await room.connect(access.url, access.token, { autoSubscribe: true });
        if (disposed) return void room.disconnect(false);
        retryCountRef.current = 0;
        setReady(true);
        setConnectionState('connected');
        setError('');
        syncAudioPlaybackState();
      } catch (cause) {
        if (disposed) return;
        setReady(false);
        setConnectionState('offline');
        setError(cause instanceof Error
          ? cause.message
          : '캠 서버가 현재 오프라인입니다. 학습방 기능은 계속 사용할 수 있습니다.');
        scheduleRetry();
      }
    })();

    return () => {
      disposed = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      room.removeAllListeners();
      if (roomRef.current === room) roomRef.current = undefined;
      publishedRef.current.clear();
      // Reconnects must not stop the browser-owned camera/microphone tracks.
      void room.disconnect(false).catch(() => undefined);
      clearRemoteMedia();
    };
  }, [clearRemoteMedia, code, generation, presenceConnectionId, selfId]);

  useEffect(() => {
    if (!ready || !roomRef.current) return;
    const room = roomRef.current;
    let cancelled = false;
    void (async () => {
      const nextTracks = new Map<string, MediaStreamTrack>();
      for (const track of localStream?.getTracks() ?? []) {
        if (track.readyState === 'live') nextTracks.set(track.kind, track);
      }
      for (const [kind, previous] of publishedRef.current) {
        if (previous !== nextTracks.get(kind)) {
          await room.localParticipant.unpublishTrack(previous, false).catch(() => undefined);
          publishedRef.current.delete(kind);
        }
      }
      for (const [kind, track] of nextTracks) {
        if (publishedRef.current.get(kind) === track) continue;
        await room.localParticipant.publishTrack(track, kind === 'video' ? {
          name: `camera-${selfId}`,
          source: Track.Source.Camera,
          simulcast: true,
          videoEncoding: { maxBitrate: 450_000, maxFramerate: 15 },
        } : {
          name: `microphone-${selfId}`,
          source: Track.Source.Microphone,
          dtx: true,
          red: true,
        });
        if (cancelled) {
          await room.localParticipant.unpublishTrack(track, false).catch(() => undefined);
        } else {
          publishedRef.current.set(kind, track);
        }
      }
      if (!cancelled) setError('');
    })().catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : '카메라 또는 마이크를 LiveKit에 연결하지 못했습니다.');
    });
    return () => { cancelled = true; };
  }, [localStream, ready, selfId]);

  useEffect(() => {
    const active = new Set(participants.map((participant) => participant.id));
    setRemoteStreams((current) => {
      const next = new Map(current);
      for (const id of next.keys()) if (!active.has(id)) next.delete(id);
      return next.size === current.size ? current : next;
    });
  }, [participants]);

  useEffect(() => {
    const recover = () => {
      if (document.visibilityState === 'visible' && connectionState === 'offline' && !manualDisconnectRef.current) {
        setGeneration((value) => value + 1);
      }
    };
    document.addEventListener('visibilitychange', recover);
    window.addEventListener('online', recover);
    return () => {
      document.removeEventListener('visibilitychange', recover);
      window.removeEventListener('online', recover);
    };
  }, [connectionState]);

  return {
    remoteStreams,
    connectionState,
    error,
    audioPlaybackBlocked,
    startAudio,
    disconnect,
  };
}
