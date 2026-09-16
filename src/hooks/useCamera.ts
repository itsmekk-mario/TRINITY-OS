import { useCallback, useEffect, useRef, useState } from 'react';

type FacingMode = 'user' | 'environment';
const videoConstraints = (facingMode: FacingMode): MediaStreamConstraints => ({
  audio: false,
  video: {
    facingMode: { ideal: facingMode },
    width: { ideal: 640, max: 640 },
    height: { ideal: 360, max: 360 },
    frameRate: { ideal: 15, max: 15 },
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
    stopKind('video');
  }, [stopKind]);
  const stopMicrophone = useCallback(() => {
    microphoneWanted.current = false;
    stopKind('audio');
  }, [stopKind]);
  const stopAll = useCallback(() => {
    cameraWanted.current = false;
    microphoneWanted.current = false;
    current.current.getTracks().forEach((track) => track.stop());
    current.current = new MediaStream();
    setStream(undefined);
  }, []);

  const start = useCallback(async (nextFacing: FacingMode = facingMode) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('이 브라우저에서는 카메라를 사용할 수 없습니다.');
      return;
    }
    cameraWanted.current = true;
    setStarting(true);
    setError('');
    stopKind('video');
    try {
      const next = await navigator.mediaDevices.getUserMedia(videoConstraints(nextFacing));
      for (const track of next.getVideoTracks()) current.current.addTrack(track);
      setFacingMode(nextFacing);
      publishSnapshot();
    } catch (cause) {
      cameraWanted.current = false;
      const name = cause instanceof DOMException ? cause.name : '';
      setError(name === 'NotAllowedError'
        ? '카메라 권한이 허용되지 않았습니다.'
        : name === 'NotFoundError'
          ? '사용 가능한 카메라를 찾지 못했습니다.'
          : '카메라를 시작하지 못했습니다.');
    } finally {
      setStarting(false);
    }
  }, [facingMode, publishSnapshot, stopKind]);

  const startMicrophone = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicrophoneError('이 브라우저에서는 마이크를 사용할 수 없습니다.');
      return;
    }
    microphoneWanted.current = true;
    setMicrophoneStarting(true);
    setMicrophoneError('');
    stopKind('audio');
    try {
      const next = await navigator.mediaDevices.getUserMedia(audioConstraints);
      for (const track of next.getAudioTracks()) current.current.addTrack(track);
      publishSnapshot();
    } catch (cause) {
      microphoneWanted.current = false;
      const name = cause instanceof DOMException ? cause.name : '';
      setMicrophoneError(name === 'NotAllowedError'
        ? '마이크 권한이 허용되지 않았습니다.'
        : name === 'NotFoundError'
          ? '사용 가능한 마이크를 찾지 못했습니다.'
          : '마이크를 시작하지 못했습니다.');
    } finally {
      setMicrophoneStarting(false);
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
