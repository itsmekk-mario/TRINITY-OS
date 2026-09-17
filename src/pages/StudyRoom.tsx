import { useEffect } from 'react';
import type { AppData } from '../types';
import { useCamStudy } from '../components/study-room/CamStudyProvider';
import StudyRoomLobby from './StudyRoomLobby';
import StudyGrid from '../components/study-room/StudyGrid';
import StudyRoomHeader from '../components/study-room/StudyRoomHeader';
import StudyRoomControls from '../components/study-room/StudyRoomControls';

function ActiveStudyRoom() {
  const { camera, leaveRoom, session } = useCamStudy();
  useEffect(() => {
    const recover = () => { if (document.visibilityState === 'visible') camera.recover(); };
    document.addEventListener('visibilitychange', recover);
    return () => document.removeEventListener('visibilitychange', recover);
  }, [camera.recover]);
  const deviceError = camera.error || camera.microphoneError;
  const remoteMicrophoneActive = session.participants.some((participant) => participant.id !== session.selfId && participant.microphoneEnabled);
  return <div className="study-room-active">
    <StudyRoomHeader room={session.room} participants={session.participants} connectionState={session.mediaConnectionState} />
    {(deviceError || session.mediaError || (session.error && session.presenceConnectionState !== 'connected')) &&
      <div className="study-room-notice" role="status">
        <b>{deviceError ? '카메라 또는 마이크를 확인해 주세요.' : session.mediaError ? '미디어 서버 연결을 복구하는 중입니다.' : session.error}</b>
        <p>{deviceError ? '장치 없이도 학습방 기능은 계속 작동합니다.' : '방 연결은 자동으로 다시 시도합니다.'}</p>
        {camera.error && <button className="button" onClick={() => void camera.start()}>카메라 다시 연결</button>}
        {camera.microphoneError && <button className="button" onClick={() => void camera.startMicrophone()}>마이크 다시 연결</button>}
      </div>}
    {session.audioPlaybackBlocked && remoteMicrophoneActive && <div className="study-room-notice" role="status"><b>오디오 재생 권한이 필요합니다.</b><button className="button" onClick={() => void session.startAudio()}>오디오 켜기</button></div>}
    <StudyGrid participants={session.participants} selfId={session.selfId} />
    <StudyRoomControls
      cameraEnabled={camera.enabled}
      cameraStarting={camera.starting}
      microphoneEnabled={camera.microphoneEnabled}
      microphoneStarting={camera.microphoneStarting}
      onCamera={() => camera.enabled ? camera.stop() : void camera.start()}
      onMicrophone={() => camera.microphoneEnabled ? camera.stopMicrophone() : void camera.startMicrophone()}
      onFlip={() => void camera.flip()}
      onLeave={leaveRoom}
    />
  </div>;
}

export default function StudyRoom({ data: _data }: { data: AppData }) {
  const { enterRoom, room } = useCamStudy();
  return room ? <ActiveStudyRoom /> : <StudyRoomLobby onEnter={enterRoom} />;
}
