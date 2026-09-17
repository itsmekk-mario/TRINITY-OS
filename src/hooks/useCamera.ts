import { useCallback, useEffect, useRef, useState } from 'react';

type FacingMode = 'user' | 'environment';
type CaptureProfile = { width: number; height: number };
const captureProfiles: CaptureProfile[] = [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
  { width: 854, height: 480 },
];
const videoConstraints = (facingMode: FacingMode, profile: CaptureProfile): MediaStreamConstraints => ({
  audio: false,
  video: {
    facingMode: { ideal: facingMode },
    width: { ideal: profile.width },
    height: { ideal: profile.height },
    frameRate: { ideal: 30, max: 30 },
  },
});
const audioConstraints: MediaStreamConstraints = {
  video: false,
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
};

export function useCamera() {
  const [stream, setStream] = useState<MediaStream>();
  const [facingMode, setFacingMode] = useState<FacingMode>('user');
  const [error, setError] = useState('');
  const [microphoneError, setMicrophoneError] = useState('');
  const [starting, setStarting] = useState(false);
  const [microphoneStarting, setMicrophoneStarting] = useState(false);
  const current = useRef<MediaStream>(new MediaStream());
  const cameraWanted = useRef(false);
  const microphoneWanted = useRef(false);
  const cameraRequest = useRef(0);
  const microphoneRequest = useRef(0);

  const publishSnapshot = useCallback(() => {
    const tracks = current.current.getTracks().filter((track) => track.readyState === 'live');
    setStream(tracks.length ? new MediaStream(tracks) : undefined);
  }, []);
  const stopKind = useCallback((kind: 'audio' | 'video') => {
    for (const track of current.current.getTracks().filter((item) => item.kind === kind)) {
      track.stop();
      current.current.removeTrack(track);
    }
    publishSnapshot();
  }, [publishSnapshot]);
  const stop = useCallback(() => {
    cameraWanted.current = false;
    cameraRequest.current += 1;
    setStarting(false);
    stopKind('video');
  }, [stopKind]);
  const stopMicrophone = useCallback(() => {
    microphoneWanted.current = false;
    microphoneRequest.current += 1;
    setMicrophoneStarting(false);
    stopKind('audio');
  }, [stopKind]);
  const stopAll = useCallback(() => {
    cameraWanted.current = false;
    microphoneWanted.current = false;
    cameraRequest.current += 1;
    microphoneRequest.current += 1;
    setStarting(false);
    setMicrophoneStarting(false);
    current.current.getTracks().forEach((track) => track.stop());
    current.current = new MediaStream();
    setStream(undefined);
  }, []);

  const start = useCallback(async (nextFacing: FacingMode = facingMode) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('이 브라우저에서는 카메라를 사용할 수 없습니다.');
      return;
    }
    const requestId = cameraRequest.current + 1;
    cameraRequest.current = requestId;
    cameraWanted.current = true;
    setStarting(true);
    setError('');
    stopKind('video');
    try {
      let next: MediaStream | undefined;
      let lastError: unknown;
      for (const profile of captureProfiles) {
        try {
          next = await navigator.mediaDevices.getUserMedia(videoConstraints(nextFacing, profile));
          break;
        } catch (cause) {
          lastError = cause;
        }
      }
      if (!next) throw lastError instanceof Error ? lastError : new Error('Camera unavailable');
      if (cameraRequest.current !== requestId || !cameraWanted.current) {
        next.getTracks().forEach((track) => track.stop());
        return;
      }
      for (const track of next.getVideoTracks()) current.current.addTrack(track);
      setFacingMode(nextFacing);
      publishSnapshot();
    } catch (cause) {
      if (cameraRequest.current !== requestId) return;
      cameraWanted.current = false;
      const name = cause instanceof DOMException ? cause.name : '';
      setError(name === 'NotAllowedError'
        ? '카메라 권한이 허용되지 않았습니다.'
        : name === 'NotFoundError'
          ? '사용 가능한 카메라를 찾지 못했습니다.'
          : '카메라를 시작하지 못했습니다.');
    } finally {
      if (cameraRequest.current === requestId) setStarting(false);
    }
  }, [facingMode, publishSnapshot, stopKind]);

  const startMicrophone = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicrophoneError('이 브라우저에서는 마이크를 사용할 수 없습니다.');
      return;
    }
    const requestId = microphoneRequest.current + 1;
    microphoneRequest.current = requestId;
    microphoneWanted.current = true;
    setMicrophoneStarting(true);
    setMicrophoneError('');
    stopKind('audio');
    try {
      const next = await navigator.mediaDevices.getUserMedia(audioConstraints);
      if (microphoneRequest.current !== requestId || !microphoneWanted.current) {
        next.getTracks().forEach((track) => track.stop());
        return;
      }
      for (const track of next.getAudioTracks()) current.current.addTrack(track);
      publishSnapshot();
    } catch (cause) {
      if (microphoneRequest.current !== requestId) return;
      microphoneWanted.current = false;
      const name = cause instanceof DOMException ? cause.name : '';
      setMicrophoneError(name === 'NotAllowedError'
        ? '마이크 권한이 허용되지 않았습니다.'
        : name === 'NotFoundError'
          ? '사용 가능한 마이크를 찾지 못했습니다.'
          : '마이크를 시작하지 못했습니다.');
    } finally {
      if (microphoneRequest.current === requestId) setMicrophoneStarting(false);
    }
  }, [publishSnapshot, stopKind]);

  const flip = useCallback(
    () => start(facingMode === 'user' ? 'environment' : 'user'),
    [facingMode, start],
  );
  const recover = useCallback(() => {
    if (cameraWanted.current && !current.current.getVideoTracks().some((track) => track.readyState === 'live')) void start(facingMode);
    if (microphoneWanted.current && !current.current.getAudioTracks().some((track) => track.readyState === 'live')) void startMicrophone();
  }, [facingMode, start, startMicrophone]);

  useEffect(() => stopAll, [stopAll]);
  return {
    stream,
    enabled: Boolean(stream?.getVideoTracks().some((track) => track.readyState === 'live')),
    microphoneEnabled: Boolean(stream?.getAudioTracks().some((track) => track.readyState === 'live')),
    facingMode,
    error,
    microphoneError,
    starting,
    microphoneStarting,
    start,
    stop,
    startMicrophone,
    stopMicrophone,
    stopAll,
    flip,
    recover,
  };
}
