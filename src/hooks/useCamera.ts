import { useCallback, useEffect, useRef, useState } from 'react';

type FacingMode = 'user' | 'environment';
const constraints = (facingMode: FacingMode): MediaStreamConstraints => ({ audio: false, video: { facingMode: { ideal: facingMode }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 20 } } });

export function useCamera() {
  const [stream, setStream] = useState<MediaStream>();
  const [facingMode, setFacingMode] = useState<FacingMode>('user');
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const current = useRef<MediaStream | undefined>(undefined);
  const wanted = useRef(false);

  const stop = useCallback((keepIntent = false) => {
    current.current?.getTracks().forEach((track) => track.stop());
    current.current = undefined; setStream(undefined);
    if (!keepIntent) wanted.current = false;
  }, []);

  const start = useCallback(async (nextFacing: FacingMode = facingMode) => {
    if (!navigator.mediaDevices?.getUserMedia) { setError('이 브라우저에서는 카메라를 사용할 수 없습니다.'); return; }
    wanted.current = true; setStarting(true); setError('');
    current.current?.getTracks().forEach((track) => track.stop());
    try {
      const next = await navigator.mediaDevices.getUserMedia(constraints(nextFacing));
      current.current = next; setStream(next); setFacingMode(nextFacing);
    } catch (cause) {
      current.current = undefined; setStream(undefined);
      const name = cause instanceof DOMException ? cause.name : '';
      setError(name === 'NotAllowedError' ? '카메라 권한이 허용되지 않았습니다.' : name === 'NotFoundError' ? '사용 가능한 카메라를 찾지 못했습니다.' : '카메라를 시작하지 못했습니다.');
    } finally { setStarting(false); }
  }, [facingMode]);

  const flip = useCallback(() => start(facingMode === 'user' ? 'environment' : 'user'), [facingMode, start]);
  const recover = useCallback(() => { if (wanted.current && !current.current?.getVideoTracks().some((track) => track.readyState === 'live')) void start(facingMode); }, [facingMode, start]);
  useEffect(() => () => stop(), [stop]);
  return { stream, enabled: Boolean(stream), facingMode, error, starting, start, stop, flip, recover };
}
