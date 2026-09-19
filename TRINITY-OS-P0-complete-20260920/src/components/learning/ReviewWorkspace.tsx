import { useState } from 'react';
import type { AppData } from '../../types';
import UnifiedReviewQueue from './UnifiedReviewQueue';
import PlaireReview from '../../pages/PlaireReview';

export default function ReviewWorkspace({data,update}:{data:AppData;update:(fn:(value:AppData)=>AppData)=>void}){
  const [mode,setMode]=useState<'queue'|'reflection'>('queue');
  return <div className="review-workspace"><div className="review-workspace-switch" role="tablist" aria-label="Review 모드"><button role="tab" aria-selected={mode==='queue'} className={mode==='queue'?'active':''} onClick={()=>setMode('queue')}>Review Queue</button><button role="tab" aria-selected={mode==='reflection'} className={mode==='reflection'?'active':''} onClick={()=>setMode('reflection')}>Journal · PLAiRE</button></div>{mode==='queue'?<UnifiedReviewQueue/>:<PlaireReview data={data} update={update}/>}</div>;
}
