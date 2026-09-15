import type { StudyParticipant } from '../../lib/studyRoom';
import ParticipantTile from './ParticipantTile';

export default function StudyGrid({ participants, selfId }: { participants: StudyParticipant[]; selfId: string }) {
  const ordered = [...participants].sort((a, b) => a.id === selfId ? -1 : b.id === selfId ? 1 : a.name.localeCompare(b.name));
  return <section className={`study-grid participants-${Math.max(1, ordered.length)}`} aria-label="Study Room 참가자">
    {ordered.map((participant) => <ParticipantTile key={participant.id} participant={participant} isSelf={participant.id === selfId} />)}
  </section>;
}
