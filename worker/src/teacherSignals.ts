import type { TeacherSignal } from '../../src/lib/teacherSignals';
import type { Subject } from '../../src/types';

const subjects = ['국어','수학','영어','탐구'];
const text = (value: unknown, max = 1200) => typeof value === 'string' ? value.trim().slice(0,max) : '';
export function readSignal(value: unknown): TeacherSignal | undefined {
  try { const parsed = typeof value === 'string' ? JSON.parse(value) : value; return parsed && typeof parsed === 'object' && ['subject_teacher','academic_manager'].includes(parsed.sourceRole) && ['subject_teacher','academic_manager'].includes(parsed.targetRole) && subjects.includes(parsed.subject) && ['open','accepted','resolved','dismissed'].includes(parsed.status) ? parsed as TeacherSignal : undefined; } catch { return undefined; }
}
export function newSignal(value: unknown, role: string, assignedSubject: string | null): TeacherSignal | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== 'object' || !['subject_teacher','academic_manager'].includes(role)) throw new Error('Invalid signal');
  const input = value as Record<string,unknown>;
  const subject = role === 'subject_teacher' ? assignedSubject : input.subject;
  if (!subjects.includes(String(subject))) throw new Error('Invalid subject');
  const signal:TeacherSignal = { sourceRole: role as TeacherSignal['sourceRole'], targetRole: role === 'subject_teacher' ? 'academic_manager' : 'subject_teacher', subject: subject as Subject,
    priority: ['low','medium','high'].includes(String(input.priority)) ? input.priority as TeacherSignal['priority'] : 'medium',
    type: role === 'subject_teacher' ? (input.type === 'intervention' ? 'intervention' : 'diagnosis') : (input.type === 'execution_issue' ? 'execution_issue' : 'reassessment_request'),
    evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs.filter((item): item is string=>typeof item==='string').map(item=>text(item,100)).slice(0,20) : [], status:'open' };
  return input.weeklyGoal || input.dailyDrill ? {...updateSignal(signal,input),status:'open'} : signal;
}
export function updateSignal(previous: TeacherSignal, body: Record<string,unknown>): TeacherSignal {
  const next = { ...previous };
  if (body.status !== undefined) {
    if (!['open','accepted','resolved','dismissed'].includes(String(body.status))) throw new Error('Invalid status');
    next.status = body.status as TeacherSignal['status'];
  }
  if (body.weeklyGoal) {
    const value = body.weeklyGoal as Record<string,unknown>;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value.weekStart)) || !text(value.ability)) throw new Error('Invalid goal');
    next.weeklyGoal = { weekStart:String(value.weekStart), subject:previous.subject, ability:text(value.ability,160), successCriterion:text(value.successCriterion), drillDesign:text(value.drillDesign), evidence:text(value.evidence,2000) };
    next.status = 'accepted';
  }
  if (body.dailyDrill) {
    const value = body.dailyDrill as Record<string,unknown>, minutes = Number(value.minutes);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value.date)) || !text(value.title) || !Number.isFinite(minutes) || minutes < 1 || minutes > 360) throw new Error('Invalid drill');
    next.dailyDrill = { date:String(value.date), subject:previous.subject, title:text(value.title,160), action:text(value.action), successCriterion:text(value.successCriterion), minutes:Math.round(minutes) };
    next.status = 'accepted';
  }
  return next;
}
