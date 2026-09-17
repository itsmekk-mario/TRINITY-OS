import type { TimerSession } from '../types';
import { getStudyDayKey, getStudyDayRange } from './date.ts';
export type StudyDaySegment = { date:string; subject:TimerSession['subject']; seconds:number };
/** Derives virtual focus segments at the fixed 06:00 KST Study Day boundary. */
export function splitSessionByStudyDay(s: TimerSession): StudyDaySegment[] {
 const parts:StudyDaySegment[]=[];
 if(!s.segments?.length)return s.seconds>0?[{date:s.date,subject:s.subject,seconds:s.seconds}]:parts;
 for(const part of s.segments){
  if(part.kind!=='focus')continue;
  let start=Date.parse(part.start);const end=Date.parse(part.end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)continue;
  while(start<end){
   const date=getStudyDayKey(new Date(start));
   const until=Math.min(getStudyDayRange(date).end.getTime(),end);
   parts.push({date,subject:s.subject,seconds:(until-start)/1000});start=until;
  }
 }
 return parts;
}
export function studyTotals(sessions: TimerSession[]): Record<string, number> {
 const totals:Record<string,number>={};
 for(const s of sessions){
  for(const part of splitSessionByStudyDay(s))totals[part.date]=(totals[part.date]??0)+part.seconds;
 }
 return totals;
}
export function studyTotalsBySubject(sessions: TimerSession[]): Record<string, Partial<Record<TimerSession['subject'], number>>> {
 const totals:Record<string,Partial<Record<TimerSession['subject'],number>>>={};
 for(const session of sessions)for(const part of splitSessionByStudyDay(session)){const day=totals[part.date]??{};day[part.subject]=(day[part.subject]??0)+part.seconds;totals[part.date]=day;}
 return totals;
}
