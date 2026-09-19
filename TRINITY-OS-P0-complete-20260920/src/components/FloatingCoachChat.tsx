import { MessageCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AppData } from '../types';
import { analyzeLearningData } from '../lib/coach/analytics.ts';
import { buildAIStudyCoachContext } from '../lib/coach/context.ts';
import CoachChat from './CoachChat';

export default function FloatingCoachChat({ data }: { data: AppData }) {
  const [open, setOpen] = useState(false);
  const analysis = useMemo(() => analyzeLearningData(data), [data]);
  const context = useMemo(() => buildAIStudyCoachContext(analysis), [analysis]);

  return <>
    <button
      type="button"
      className="floating-ai-chat"
      aria-label="TRINITY AI 채팅 열기"
      aria-expanded={open}
      onClick={() => setOpen(true)}
    >
      <span><MessageCircle size={17}/></span>
      <b>AI CHAT</b>
    </button>
    {open && <CoachChat analysis={analysis} context={context} onClose={() => setOpen(false)}/>} 
  </>;
}
