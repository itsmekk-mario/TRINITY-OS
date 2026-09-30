import { memo, useEffect, useRef } from 'react';
import { Mic, MicOff, UserRound, VideoOff } from 'lucide-react';
import type { StudyParticipant } from '../../lib/studyRoom';

const formatClock = (seconds: number) => [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), Math.floor(seconds % 60)].map((value) => String(Math.max(0, value)).padStart(2, '0')).join(':');
const formatToday = (minutes: number) => minutes >= 60 ? `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m` : `${Math.round(minutes)}m`;
type Props = { participant: StudyParticipant; isSelf: boolean; focused: boolean; now: number; onFocus: () => void };

function ParticipantTile({ participant, isSelf, focused, now, onFocus }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (video.current && video.current.srcObject !== participant.stream) video.current.srcObject = participant.stream ?? null; }, [participant.stream]);
  const state = participant.studyState;
  const liveSeconds = state.elapsedSeconds + (state.active && state.startedAt ? Math.max(0, Math.floor((now - Date.parse(state.startedAt)) / 1000)) : 0);
  const connection = participant.connectionState === 'reconnecting' ? 'RECONNECTING' : participant.connectionState === 'offline' ? 'OFFLINE' : participant.connectionState === 'connecting' ? 'CONNECTING' : '';
  return <article className={`study-participant ${participant.cameraEnabled ? 'camera-on' : 'camera-off'} ${focused ? 'focused' : ''}`} tabIndex={0} onClick={onFocus} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onFocus(); } }} aria-label={`${participant.name} video. ${focused ? 'Exit focus' : 'Focus'}`}>
    <div className="study-video-frame">
      {participant.cameraEnabled && participant.stream ? <video ref={video} autoPlay playsInline muted={isSelf} aria-label={`${participant.name} camera`} /> : <div className="study-camera-placeholder"><span><UserRound size={30} /></span><b>{participant.name.slice(0, 1).toUpperCase()}</b><small><VideoOff size={14} />CAMERA OFF</small></div>}
      <div className="study-tile-topline">{isSelf && <span className="study-you-badge">ME</span>}{connection && <span className={`study-connection-label ${participant.connectionState}`}>{connection}</span>}</div>
      <div className="study-tile-gradient" />
      <footer className="study-participant-meta"><div><strong>{participant.name}</strong><span className={`study-status ${state.status}`}><i />{state.status === 'studying' ? 'FOCUSING' : state.status === 'break' ? 'BREAK' : 'READY'}</span></div><p>{state.subject || 'Study session'} <span>·</span> {formatClock(liveSeconds)}</p><small>TODAY {formatToday(state.todayMinutes)}</small></footer>
      <span className={`study-mic-badge ${participant.microphoneEnabled ? '' : 'muted'}`} title={participant.microphoneEnabled ? 'Microphone on' : 'Microphone off'}>{participant.microphoneEnabled ? <Mic size={13} /> : <MicOff size={13} />}</span>
    </div>
  </article>;
}

export default memo(ParticipantTile);
