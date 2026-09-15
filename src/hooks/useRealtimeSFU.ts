import { useCallback, useEffect, useRef, useState } from 'react';
import { createRealtimeSession, getIceServers, publishRealtimeTrack, renegotiateRealtimeSession, subscribeRealtimeTrack, type ConnectionState, type StudyParticipant } from '../lib/studyRoom';

export function useRealtimeSFU(code: string, selfId: string, presenceConnectionId: string, participants: StudyParticipant[], localStream?: MediaStream) {
  const [ready, setReady] = useState(false), [generation, setGeneration] = useState(0), [connectionState, setConnectionState] = useState<ConnectionState>('connecting'), [error, setError] = useState('');
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(() => new Map());
  const peer = useRef<RTCPeerConnection | undefined>(undefined), sessionId = useRef(''), sender = useRef<RTCRtpSender | undefined>(undefined), published = useRef(false), subscriptions = useRef(new Set<string>()), midOwners = useRef(new Map<string, string>()), queue = useRef<Promise<void>>(Promise.resolve());
  const enqueue = useCallback((operation: () => Promise<void>) => { const next = queue.current.then(operation, operation); queue.current = next.catch(() => undefined); return next; }, []);
  const disconnect = useCallback(() => { peer.current?.close(); peer.current = undefined; sessionId.current = ''; sender.current = undefined; published.current = false; subscriptions.current.clear(); midOwners.current.clear(); setReady(false); setRemoteStreams(new Map()); }, []);

  useEffect(() => {
    if (!selfId || !presenceConnectionId) return;
    let disposed = false;
    disconnect(); setConnectionState('connecting'); setError('');
    void (async () => {
      try {
        const created = await createRealtimeSession(code); if (disposed) return;
        const pc = new RTCPeerConnection({ iceServers: getIceServers(), bundlePolicy: 'max-bundle' });
        peer.current = pc; sessionId.current = created.sessionId;
        pc.ontrack = (event) => { const owner = event.transceiver.mid ? midOwners.current.get(event.transceiver.mid) : undefined; if (!owner) return; const stream = event.streams[0] ?? new MediaStream([event.track]); setRemoteStreams((current) => new Map(current).set(owner, stream)); };
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'connected') setConnectionState('connected');
          else if (pc.connectionState === 'disconnected') setConnectionState('reconnecting');
          else if (pc.connectionState === 'failed') { setConnectionState('reconnecting'); window.setTimeout(() => { if (!disposed) setGeneration((value) => value + 1); }, 900); }
          else if (pc.connectionState === 'closed') setConnectionState('offline');
        };
        setReady(true);
      } catch (cause) { if (!disposed) { setConnectionState('offline'); setError(cause instanceof Error ? cause.message : 'Cloudflare Realtime 영상 세션을 시작하지 못했습니다.'); window.setTimeout(() => { if (!disposed) setGeneration((value) => value + 1); }, 5_000); } }
    })();
    return () => { disposed = true; disconnect(); };
  }, [code, disconnect, generation, presenceConnectionId, selfId]);

  useEffect(() => {
    if (!ready || !peer.current || !sessionId.current) return;
    const track = localStream?.getVideoTracks()[0] ?? null;
    if (published.current && sender.current) { void sender.current.replaceTrack(track); return; }
    if (!track) return;
    void enqueue(async () => {
      const pc = peer.current; if (!pc || !sessionId.current || published.current) return;
      const transceiver = pc.addTransceiver(track, { direction: 'sendonly', sendEncodings: [{ maxBitrate: 500_000, maxFramerate: 15 }] }); sender.current = transceiver.sender;
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      if (!transceiver.mid || !pc.localDescription) throw new Error('카메라 track 협상을 준비하지 못했습니다.');
      const result = await publishRealtimeTrack(code, { sessionId: sessionId.current, sessionDescription: pc.localDescription, trackName: track.id, mid: transceiver.mid });
      if (!result.sessionDescription) throw new Error('Cloudflare Realtime publish 응답이 올바르지 않습니다.');
      await pc.setRemoteDescription(result.sessionDescription); published.current = true;
    }).catch((cause) => setError(cause instanceof Error ? cause.message : '카메라 영상을 publish하지 못했습니다.'));
  }, [code, enqueue, localStream, ready]);

  useEffect(() => {
    if (!ready || !selfId) return;
    for (const participant of participants) {
      if (participant.id === selfId || !participant.realtimeSessionId || !participant.publishedTrackName) continue;
      const key = `${participant.id}:${participant.realtimeSessionId}:${participant.publishedTrackName}`; if (subscriptions.current.has(key)) continue;
      subscriptions.current.add(key);
      void enqueue(async () => {
        const pc = peer.current; if (!pc || !sessionId.current) return;
        const result = await subscribeRealtimeTrack(code, sessionId.current, participant.id);
        for (const track of result.tracks ?? []) if (track.mid) midOwners.current.set(track.mid, participant.id);
        if (result.requiresImmediateRenegotiation && result.sessionDescription) {
          await pc.setRemoteDescription(result.sessionDescription);
          const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
          if (pc.localDescription) await renegotiateRealtimeSession(code, sessionId.current, pc.localDescription);
        }
      }).catch((cause) => { subscriptions.current.delete(key); setError(cause instanceof Error ? cause.message : '참가자 영상을 subscribe하지 못했습니다.'); });
    }
    const active = new Set(participants.map((participant) => participant.id));
    setRemoteStreams((current) => { const next = new Map(current); for (const [id, stream] of next) if (!active.has(id)) { stream.getTracks().forEach((track) => track.stop()); next.delete(id); } return next; });
  }, [code, enqueue, participants, ready, selfId]);

  useEffect(() => { const visible = () => { if (document.visibilityState === 'visible' && (peer.current?.connectionState === 'failed' || peer.current?.connectionState === 'disconnected')) setGeneration((value) => value + 1); }; document.addEventListener('visibilitychange', visible); window.addEventListener('online', visible); return () => { document.removeEventListener('visibilitychange', visible); window.removeEventListener('online', visible); }; }, []);
  return { remoteStreams, connectionState, error, disconnect };
}
