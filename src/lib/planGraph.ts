import type { AppData, CalendarEntry, CalendarPlan } from '../types';
export const dayTypes = ['normal','bump','mock','review','recovery','exam','school','off','custom'] as const;
export const emptyDay = (date: string): CalendarEntry => ({date,study:'',minutes:0,exam:'',event:'',condition:3,reflection:'',plans:[]});
/** Additive, repeatable migration. Legacy records remain available in backups. */
export function migratePlans(data: AppData): AppData {
 const calendar = {...data.calendar};
 const migrated = new Set(data.migratedDailyDrillIds ?? []);
 for (const journal of Object.values(data.journals ?? {})) {
  const entry=calendar[journal.date] ?? emptyDay(journal.date);
  if(!entry.reflection) calendar[journal.date]={...entry,reflection:[journal.wins,journal.blocked,journal.cause,journal.hypothesis,journal.action].filter(Boolean).join('\n'),study:entry.study||journal.studied,event:entry.event||journal.event};
 }
 for (const drill of data.dailyDrills ?? []) {
  if(migrated.has(drill.id))continue;
  migrated.add(drill.id);
  const entry = calendar[drill.date] ?? emptyDay(drill.date);
  const id = `legacy-daily-${drill.id}`;
  if (!(entry.plans ?? []).some(p => p.id === id)) calendar[drill.date] = {...entry, plans:[...(entry.plans ?? []),{id,subject:drill.subject,inquiryTrack:drill.inquiryTrack,title:drill.title,detail:drill.action,quantity:`${drill.minutes}분`,done:drill.done,weeklyPlanId:drill.capabilityGoalId}]};
 }
 return {...data,calendar,migratedDailyDrillIds:[...migrated]};
}
export function bumpDrafts(data: AppData, date: string): CalendarPlan[] {
 const retries = data.wrongAnswerDrills.flatMap(d => (d.retries ?? []).filter(r => !r.completedDate && r.dueDate <= date).map(r => ({id:`bump-retry-${d.id}-${r.id}`,subject:d.subject,title:`재도전 · ${d.source} ${d.question}`,detail:d.transfer,quantity:'1문항',done:false,resourceId:d.resourceId})));
 const pending = Object.values(data.calendar).filter(e => e.date < date).sort((a,b)=>a.date.localeCompare(b.date)).flatMap(e => (e.plans ?? []).filter(p => !p.done).map(p => ({...p,id:`bump-plan-${p.id}`,title:`이월 · ${p.title}`,outcome:undefined,done:false})));
 const existing = new Set((data.calendar[date]?.plans ?? []).map(p=>p.id));
 return [...retries,...pending].filter(p=>!existing.has(p.id)).slice(0,10);
}
