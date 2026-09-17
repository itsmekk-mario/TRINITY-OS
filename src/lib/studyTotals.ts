import type { TimerSession } from '../types';
import { toDateKey } from './date';
export function studyTotals(sessions: TimerSession[]): Record<string, number> {
 const totals:Record<string,number>={};
 for(const s of sessions){
  if(!s.segments?.length){totals[s.date]=(totals[s.date]??0)+s.seconds;continue;}
  for(const part of s.segments){
   if(part.kind!=='focus')continue;
   let start=Date.parse(part.start);const end=Date.parse(part.end);
   if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)continue;
   while(start<end){
    const date=toDateKey(new Date(start));
    const seoulNoon=new Date(`${date}T12:00:00+09:00`); seoulNoon.setUTCDate(seoulNoon.getUTCDate()+1);
    const nextDate=toDateKey(seoulNoon); const midnight=Date.parse(`${nextDate}T00:00:00+09:00`);
    const until=Math.min(midnight,end);
    totals[date]=(totals[date]??0)+(until-start)/1000;start=until;
   }
  }
 }
 return totals;
}
