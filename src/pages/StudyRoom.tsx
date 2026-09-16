import { useEffect, useState } from 'react';
import type { AppData } from '../types';
import { useCamera } from '../hooks/useCamera';
import { useStudyRoom } from '../hooks/useStudyRoom';
import type { StudyRoomInfo } from '../lib/studyRoom';
import StudyRoomLobby from './StudyRoomLobby';
import StudyGrid from '../components/study-room/StudyGrid';
import StudyRoomHeader from '../components/study-room/StudyRoomHeader';
import StudyRoomControls from '../components/study-room/StudyRoomControls';

function ActiveStudyRoom({ initialRoom, data, onExit }: { initialRoom: StudyRoomInfo; data: AppData; onExit: () => void }) {
  const media = useCamera();
  const session = useStudyRoom(
    initialRoom.code,
    initialRoom,
    data,
    media.stream,
    media.enabled,
    media.microphoneEnabled,
  );
  useEffect(() => {
    const recover = () => { if (document.visibilityState === 'visible') media.recover(); };
    document.addEventListener('visibilitychange', recover);
    return () => document.removeEventListener('visibilitychange', recover);
  }, [media.recover]);
  const leave = () => {
    session.leave();
    media.stopAll();
    onExit();
  };
  const deviceError = media.error || media.microphoneError;
  const remoteMicrophoneActive = session.participants.some(
    (participant) => participant.id !== session.selfId && participant.microphoneEnabled,
  );
  return <div className="study-room-active">
    <StudyRoomHeader room={session.room} participants={session.participants} connectionState={session.mediaConnectionState} />
    {(deviceError || session.mediaError || (session.error && session.presenceConnectionState !== 'connected')) &&
      <div className="study-room-notice" role="status">
        <b>{deviceError ? '카메라 또는 마이크가 꺼져 있습니다.' : session.mediaError ? '캠 서버가 현재 오프라인입니다.' : session.error}</b>
        <p>{deviceError
          ? '장치 없이도 Study Room의 학습방 기능에 참여할 수 있습니다.'
          : session.mediaError
            ? '영상·음성만 사용할 수 없습니다. 학습방 기능은 계속 작동합니다.'
            : '학습방 연결을 자동으로 다시 시도하고 있습니다.'}</p>
        {media.error && <button className="button" onClick={() => void media.start()}>카메라 다시 허용</button>}
        {media.microphoneError && <button className="button" onClick={() => void media.startMicrophone()}>마이크 다시 허용</button>}
      </div>}
    {session.audioPlaybackBlocked && remoteMicrophoneActive &&
      <div className="study-room-notice" role="status">
        <b>오디오 재생 권한이 필요합니다.</b>
        <p>브라우저의 자동재생 정책 때문에 다른 참가자의 마이크 소리가 일시 정지되어 있습니다.</p>
        <button className="button" onClick={() => void session.startAudio()}>오디오 켜기</button>
      </div>}
    <StudyGrid participants={session.participants} selfId={session.selfId} />
    <StudyRoomControls
      cameraEnabled={media.enabled}
      cameraStarting={media.starting}
      microphoneEnabled={media.microphoneEnabled}
      microphoneStarting={media.microphoneStarting}
      onCamera={() => media.enabled ? media.stop() : void media.start()}
      onMicrophone={() => media.microphoneEnabled ? media.stopMicrophone() : void media.startMicrophone()}
      onFlip={() => void media.flip()}
      onLeave={leave}
    />
  </div>;
}

export default function StudyRoom({ data }: { data: AppData }) {
  const [room, setRoom] = useState<StudyRoomInfo>();
  const enter = (next: StudyRoomInfo) => {
    setRoom(next);
    window.history.replaceState({}, '', `/study-room?room=${encodeURIComponent(next.code)}`);
  };
  const exit = () => {
    setRoom(undefined);
    window.history.replaceState({}, '', '/study-room');
  };
  return room
    ? <ActiveStudyRoom initialRoom={room} data={data} onExit={exit} />
    : <StudyRoomLobby onEnter={enter} />;
}
