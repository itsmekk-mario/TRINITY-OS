import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  VideoQuality,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client';
import { createLiveKitAccess, type ConnectionState, type StudyParticipant } from '../lib/studyRoom';

const RETRY_DELAYS = [3_000, 5_000, 10_000, 20_000];

export type VideoDiagnostics = {
  outbound?: MediaStats;
  inbound?: MediaStats;
};
type MediaStats = {
  width?: number;
  height?: number;
  fps?: number;
  bitrateKbps?: number;
  codec?: string;
  packetsLost?: number;
  roundTripTime?: number;
  jitter?: number;
};
type RtpEndpoint = { getStats?: () => Promise<RTCStatsReport> };
type StatsCursor = { bytes: number; timestamp: number };

async function readVideoStats(endpoint: RtpEndpoint | undefined, direction: 'outbound-rtp' | 'inbound-rtp', previous?: StatsCursor) {
  const report = await endpoint?.getStats?.();
  if (!report) return { stats: undefined, cursor: undefined };
  let rtp: Record<string, unknown> | undefined;
  const codecs = new Map<string, Record<string, unknown>>();
  report.forEach((item) => {
    const value = item as unknown as Record<string, unknown>;
    if (value.type === direction && value.kind === 'video') rtp = value;
    if (value.type === 'codec') codecs.set(String(value.id), value);
  });
  if (!rtp) return { stats: undefined, cursor: undefined };
  const bytes = Number(direction === 'outbound-rtp' ? rtp.bytesSent : rtp.bytesReceived) || 0;
  const timestamp = Number(rtp.timestamp) || 0;
  const elapsed = previous ? Math.max(0, timestamp - previous.timestamp) : 0;
  const bitrateKbps = previous && elapsed > 0 ? Math.round(((bytes - previous.bytes) * 8) / elapsed) : undefined;
  const codec = codecs.get(String(rtp.codecId));
  return {
    stats: {
      width: Number(rtp.frameWidth) || undefined,
      height: Number(rtp.frameHeight) || undefined,
      fps: Number(rtp.framesPerSecond) || undefined,
      bitrateKbps,
      codec: typeof codec?.mimeType === 'string' ? codec.mimeType.replace('video/', '').toUpperCase() : undefined,
      packetsLost: Number(rtp.packetsLost) || undefined,
      roundTripTime: Number(rtp.roundTripTime) || undefined,
      jitter: Number(rtp.jitter) || undefined,
    } satisfies MediaStats,
    cursor: { bytes, timestamp },
  };
}

export function useLiveKitRoom(
  code: string,
  selfId: string,
  presenceConnectionId: string,
  participants: StudyParticipant[],
  localStream?: MediaStream,
  focusedParticipantId?: string,
  roomVisible = true,
) {
  const [ready, setReady] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [error, setError] = useState('');
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(() => new Map());
  const [remoteScreenStreams, setRemoteScreenStreams] = useState<Map<string, MediaStream>>(() => new Map());
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);
  const [screenShareStarting, setScreenShareStarting] = useState(false);
  const [screenShareError, setScreenShareError] = useState('');
  const [diagnostics, setDiagnostics] = useState<VideoDiagnostics>();
  const roomRef = useRef<Room | undefined>(undefined);
  const publishedRef = useRef<Map<string, MediaStreamTrack>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLMediaElement>>(new Map());
  const manualDisconnectRef = useRef(false);
  const retryCountRef = useRef(0);
  const statsCursorRef = useRef<{ outbound?: StatsCursor; inbound?: StatsCursor }>({});

  const clearRemoteMedia = useCallback(() => {
    for (const element of audioElementsRef.current.values()) element.remove();
    audioElementsRef.current.clear();
    setRemoteStreams(new Map());
    setRemoteScreenStreams(new Map());
    setScreenShareEnabled(false);
    setScreenShareStarting(false);
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
        // LiveKit keeps its default 180p/360p simulcast layers and publishes the
        // 1080p capture as the high layer. Adaptive stream + dynacast select the
        // smallest useful layer for grid tiles and suspend unused layers.
        videoEncoding: { maxBitrate: 3_500_000, maxFramerate: 30 },
        dtx: true,
        red: true,
      },
    });
    roomRef.current = room;

    const syncAudioPlaybackState = () => {
      setAudioPlaybackBlocked(audioElementsRef.current.size > 0 && !room.canPlaybackAudio);
    };
    const removeVideo = (identity: string, source: Track.Source) => {
      const setter = source === Track.Source.ScreenShare ? setRemoteScreenStreams : setRemoteStreams;
      setter((current) => {
        if (!current.has(identity)) return current;
        const next = new Map(current);
        next.delete(identity);
        return next;
      });
    };
    const removeAudio = (identity: string, source?: Track.Source) => {
      for (const [key, element] of audioElementsRef.current) {
        if ((!source && key.startsWith(`${identity}:`)) || key === `${identity}:${source}`) {
          element.remove();
          audioElementsRef.current.delete(key);
        }
      }
      syncAudioPlaybackState();
    };
    const onTrackSubscribed = (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      if (track.kind === Track.Kind.Video) {
        const setter = publication.source === Track.Source.ScreenShare ? setRemoteScreenStreams : setRemoteStreams;
        setter((current) => new Map(current).set(
          participant.identity,
          new MediaStream([track.mediaStreamTrack]),
        ));
      } else if (track.kind === Track.Kind.Audio) {
        removeAudio(participant.identity, publication.source);
        const element = track.attach();
        element.autoplay = true;
        element.style.display = 'none';
        element.dataset.livekitParticipant = participant.identity;
        document.body.appendChild(element);
        audioElementsRef.current.set(`${participant.identity}:${publication.source}`, element);
        syncAudioPlaybackState();
      }
    };
    const onTrackUnsubscribed = (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      track.detach().forEach((element) => element.remove());
      if (track.kind === Track.Kind.Video) removeVideo(participant.identity, publication.source);
      if (track.kind === Track.Kind.Audio) removeAudio(participant.identity, publication.source);
    };
    const onParticipantDisconnected = (participant: RemoteParticipant) => {
      removeVideo(participant.identity, Track.Source.Camera);
      removeVideo(participant.identity, Track.Source.ScreenShare);
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
    room.on(RoomEvent.LocalTrackPublished, (publication) => {
      if (publication.source === Track.Source.ScreenShare) {
        setScreenShareEnabled(true);
        setScreenShareStarting(false);
        setScreenShareError('');
      }
    });
    room.on(RoomEvent.LocalTrackUnpublished, (publication) => {
      if (publication.source === Track.Source.ScreenShare) {
        setScreenShareEnabled(false);
        setScreenShareStarting(false);
      }
    });
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
          videoEncoding: { maxBitrate: 3_500_000, maxFramerate: 30 },
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
    const prune = (current: Map<string, MediaStream>) => {
      const next = new Map(current);
      for (const id of next.keys()) if (!active.has(id)) next.delete(id);
      return next.size === current.size ? current : next;
    };
    setRemoteStreams(prune);
    setRemoteScreenStreams(prune);
  }, [participants]);

  useEffect(() => {
    const room = roomRef.current;
    if (!ready || !room) return;
    for (const [identity, participant] of room.remoteParticipants) {
      const publication = participant.getTrackPublication(Track.Source.Camera);
      publication?.setVideoQuality(!roomVisible
        ? VideoQuality.LOW
        : identity === focusedParticipantId
          ? VideoQuality.HIGH
          : VideoQuality.MEDIUM);
      participant.getTrackPublication(Track.Source.ScreenShare)?.setVideoQuality(
        roomVisible ? VideoQuality.HIGH : VideoQuality.LOW,
      );
    }
  }, [focusedParticipantId, participants, ready, remoteScreenStreams, remoteStreams, roomVisible]);

  useEffect(() => {
    if (!ready || !roomRef.current || !import.meta.env.DEV) {
      setDiagnostics(undefined);
      return;
    }
    let disposed = false;
    const collect = async () => {
      const room = roomRef.current;
      if (!room || disposed) return;
      const localPublication = room.localParticipant.getTrackPublication(Track.Source.Camera);
      const remotePublication = focusedParticipantId
        ? room.remoteParticipants.get(focusedParticipantId)?.getTrackPublication(Track.Source.Camera)
        : undefined;
      const [outbound, inbound] = await Promise.all([
        readVideoStats((localPublication?.track as unknown as { sender?: RtpEndpoint } | undefined)?.sender, 'outbound-rtp', statsCursorRef.current.outbound),
        readVideoStats((remotePublication?.track as unknown as { receiver?: RtpEndpoint } | undefined)?.receiver, 'inbound-rtp', statsCursorRef.current.inbound),
      ]);
      if (disposed) return;
      statsCursorRef.current = { outbound: outbound.cursor, inbound: inbound.cursor };
      setDiagnostics({ outbound: outbound.stats, inbound: inbound.stats });
    };
    void collect();
    const timer = window.setInterval(() => void collect(), 2_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [focusedParticipantId, ready]);

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

  const screenShareSupported = typeof navigator !== 'undefined'
    && Boolean(navigator.mediaDevices?.getDisplayMedia);

  const startScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!screenShareSupported) {
      setScreenShareError('이 브라우저에서는 화면 공유를 지원하지 않습니다. PC Chrome 또는 Edge를 사용해 주세요.');
      return;
    }
    if (!room || connectionState !== 'connected') {
      setScreenShareError('미디어 서버에 연결된 뒤 화면 공유를 시작할 수 있습니다.');
      return;
    }
    setScreenShareStarting(true);
    setScreenShareError('');
    try {
      await room.localParticipant.setScreenShareEnabled(true, { audio: true });
      setScreenShareEnabled(true);
    } catch (cause) {
      const name = cause instanceof DOMException ? cause.name : '';
      if (name !== 'NotAllowedError') {
        setScreenShareError(cause instanceof Error ? cause.message : '화면 공유를 시작하지 못했습니다.');
      }
      setScreenShareEnabled(false);
    } finally {
      setScreenShareStarting(false);
    }
  }, [connectionState, screenShareSupported]);

  const stopScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    setScreenShareStarting(true);
    try {
      await room.localParticipant.setScreenShareEnabled(false);
      setScreenShareEnabled(false);
      setScreenShareError('');
    } catch (cause) {
      setScreenShareError(cause instanceof Error ? cause.message : '화면 공유를 종료하지 못했습니다.');
    } finally {
      setScreenShareStarting(false);
    }
  }, []);


  return {
    remoteStreams,
    remoteScreenStreams,
    screenShareSupported,
    screenShareEnabled,
    screenShareStarting,
    screenShareError,
    startScreenShare,
    stopScreenShare,
    connectionState,
    error,
    audioPlaybackBlocked,
    startAudio,
    disconnect,
    diagnostics,
  };
}
