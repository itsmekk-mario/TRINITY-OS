import { FormEvent, useRef, useState } from 'react';
import { useDialogFocus } from './motion/useDialogFocus';
import { ArrowUp, MessageCircle, X } from 'lucide-react';
import { requestCoachChat, type CoachChatMessage } from '../lib/aiCoach';
import { answerLocalCoachQuestion } from '../lib/coach/localCoach';
import type { AIStudyCoachContext, LearningAnalysis } from '../lib/coach/types';

export default function CoachChat({ analysis, context, onClose }: { analysis: LearningAnalysis; context: AIStudyCoachContext; onClose: () => void }) {
  const [messages, setMessages] = useState<CoachChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(true, dialogRef, onClose);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const content = input.trim().slice(0, 300);
    if (!content || busy) return;
    const next = [...messages, { role: 'user' as const, content }].slice(-6);
    setMessages(next);
    setInput('');
    const localAnswer = answerLocalCoachQuestion(content, analysis);
    if (localAnswer) {
      setMessages([...next, { role: 'assistant' as const, content: localAnswer }].slice(-6));
      return;
    }
    setBusy(true);
    try {
      const reply = await requestCoachChat(context, next);
      setMessages((value) => [...value, { role: 'assistant' as const, content: reply.message }].slice(-6));
    } catch (error) {
      const detail = error instanceof Error ? error.message : '지금은 AI 상담을 연결할 수 없습니다.';
      setMessages((value) => [...value, { role: 'assistant' as const, content: `${detail}\n\n기본 제안: ${analysis.diagnosis.nextAction.description}` }].slice(-6));
    } finally { setBusy(false); }
  };

  return <div className="coach-sheet-backdrop" role="presentation" onPointerDown={onClose}><section ref={dialogRef} tabIndex={-1} className="coach-sheet" role="dialog" aria-modal="true" aria-labelledby="coach-chat-title" onPointerDown={(event) => event.stopPropagation()}><header><div><span className="card-label">TRINITY COACH</span><h2 id="coach-chat-title">AI 학습 상담</h2><p>기본 질문은 로컬에서, 복잡한 상담만 AI로 답합니다.</p></div><button className="icon-button" aria-label="상담 닫기" onClick={onClose}><X size={18} /></button></header><div className="coach-messages" aria-live="polite">{messages.length ? messages.map((message, index) => <p className={message.role} key={`${message.role}-${index}`}>{message.content}</p>) : <div className="coach-start"><MessageCircle size={18} /><p>예: “현재 병목이 뭐야?”는 AI 호출 없이 바로 답합니다.</p></div>}{busy && <p className="assistant loading">상담 내용을 확인하고 있습니다…</p>}</div><form onSubmit={send}><input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} maxLength={300} placeholder="학습 상황을 짧게 물어보세요" aria-label="AI 코치에게 질문" /><button className="button primary" type="submit" disabled={!input.trim() || busy} aria-label="질문 보내기"><ArrowUp size={17} /></button></form></section></div>;
}
