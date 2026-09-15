import { Copy, ShieldCheck } from 'lucide-react';
import type { ConnectionState, StudyParticipant, StudyRoomInfo } from '../../lib/studyRoom';

const totalLabel = (minutes: number) => `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
export default function StudyRoomHeader({ room, participants, connectionState }: { room: StudyRoomInfo; participants: StudyParticipant[]; connectionState: ConnectionState }) {
  const total = participants.reduce((sum, participant) => sum + participant.studyState.todayMinutes, 0);
  const copy = () => void navigator.clipboard?.writeText(room.code);
  return <header className="study-room-header"><div><p className="eyebrow">STUDY ROOM</p><h1>{room.name}</h1><div className="study-room-summary"><strong>{participants.length}명 공부 중</strong><span>오늘 참가자 총 공부시간 {totalLabel(total)}</span></div></div><div className="study-room-code"><small>INVITE CODE</small><button onClick={copy} aria-label="초대 코드 복사"><b>{room.code}</b><Copy size={15} /></button><span className={connectionState}><i />{connectionState === 'connected' ? '연결됨' : connectionState === 'reconnecting' ? '다시 연결 중' : '연결 중'}</span></div><p className="study-privacy"><ShieldCheck size={16} />캠 영상은 실시간으로만 전송되며 TRINITY OS에 저장되지 않습니다.</p></header>;
}
