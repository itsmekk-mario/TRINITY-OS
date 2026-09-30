import { useEffect, useMemo, useState } from 'react';
import type { StudyParticipant } from '../../lib/studyRoom';
import ParticipantTile from './ParticipantTile';

type Props = { participants: StudyParticipant[]; selfId: string; focusedId?: string; onFocus: (id?: string) => void };

export default function StudyGrid({ participants, selfId, focusedId, onFocus }: Props) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const ordered = useMemo(() => [...participants].sort((a, b) => (
    a.id === focusedId ? -1 : b.id === focusedId ? 1 : a.id === selfId ? -1 : b.id === selfId ? 1 : a.name.localeCompare(b.name)
  )), [focusedId, participants, selfId]);
  const focused = ordered.some((participant) => participant.id === focusedId);
  return <section className={`study-grid participants-${Math.max(1, ordered.length)} ${focused ? 'focus-view' : ''}`} aria-label="Study Room participants">
    {ordered.map((participant) => <ParticipantTile key={participant.id} participant={participant} isSelf={participant.id === selfId} focused={participant.id === focusedId} now={now} onFocus={() => onFocus(focusedId === participant.id ? undefined : participant.id)} />)}
  </section>;
}
