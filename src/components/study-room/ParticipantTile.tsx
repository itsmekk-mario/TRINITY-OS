import { useEffect, useRef, useState } from 'react';
import { UserRound, VideoOff } from 'lucide-react';
import type { StudyParticipant } from '../../lib/studyRoom';

const formatClock = (seconds: number) => [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), Math.floor(seconds % 60)].map((value) => String(Math.max(0, value)).padStart(2, '0')).join(':');
const formatToday = (minutes: number) => minutes >= 60 ? `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m` : `${Math.round(minutes)}m`;

export default function ParticipantTile({ participant, isSelf }: { participant: StudyParticipant; isSelf: boolean }) {
  const video = useRef<HTMLVideoElement>(null), [now, setNow] = useState(Date.now());
  useEffect(() => { if (video.current && video.current.srcObject !== participant.stream) video.current.srcObject = participant.stream ?? null; }, [participant.stream]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1_000); return () => window.clearInterval(timer); }, []);
  const state = participant.studyState;
  const liveSeconds = state.elapsedSeconds + (state.active && state.startedAt ? Math.max(0, Math.floor((now - Date.parse(state.startedAt)) / 1000)) : 0);
  const connectionLabel = participant.connectionState === 'connecting' ? '연결 중…' : participant.connectionState === 'reconnecting' ? '다시 연결 중…' : participant.connectionState === 'offline' ? '연결 끊김' : '';
  return <article className={`study-participant ${participant.cameraEnabled ? 'camera-on' : 'camera-off'}`}>
    <div className="study-video-frame">
      {participant.cameraEnabled && participant.stream ? <video ref={video} autoPlay playsInline muted={isSelf} aria-label={`${participant.name} 카메라`} /> : <div className="study-camera-placeholder"><span><UserRound size={28} /></span><b>{participant.name.slice(0, 1).toUpperCase()}</b><small><VideoOff size={14} />{participant.cameraEnabled ? '영상 연결 중' : 'CAM OFF'}</small></div>}
      {isSelf && <span className="study-you-badge">YOU</span>}
      {connectionLabel && <span className="study-connection-label">{connectionLabel}</span>}
    </div>
    <div className="study-participant-meta"><div><strong>{participant.name}</strong><span className={`study-status ${state.status}`}><i />{state.status === 'studying' ? '집중 중' : state.status === 'break' ? '휴식' : '상태 확인 중'}</span></div><p>{state.subject || '과목 미선택'} · {formatClock(liveSeconds)}</p><small>TODAY {formatToday(state.todayMinutes)}</small></div>
  </article>;
}
