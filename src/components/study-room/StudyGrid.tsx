import { useState } from 'react';
import type { StudyParticipant } from '../../lib/studyRoom';
import ParticipantTile from './ParticipantTile';

export default function StudyGrid({ participants, selfId }: { participants: StudyParticipant[]; selfId: string }) {
  const [focusedId, setFocusedId] = useState<string>();
  const ordered = [...participants].sort((a, b) => a.id === focusedId ? -1 : b.id === focusedId ? 1 : a.id === selfId ? -1 : b.id === selfId ? 1 : a.name.localeCompare(b.name));
  const focused = ordered.some((participant) => participant.id === focusedId);
  return <section className={`study-grid participants-${Math.max(1, ordered.length)} ${focused ? 'focus-view' : ''}`} aria-label="Study Room 참가자">
    {ordered.map((participant) => <ParticipantTile key={participant.id} participant={participant} isSelf={participant.id === selfId} focused={participant.id === focusedId} onFocus={() => setFocusedId((current) => current === participant.id ? undefined : participant.id)} />)}
  </section>;
}
