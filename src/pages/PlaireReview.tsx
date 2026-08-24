import { useEffect, useState } from 'react';
import { Clipboard, Gauge, Layers3, Zap } from 'lucide-react';
import type { AppData, PlaireEntry } from '../types';
import { Card, Field, PageHeader, SaveButton, TextArea } from '../components/Ui';
import { toDateKey } from '../lib/date';

const blank = (date: string): PlaireEntry => ({ date, record: '', criterion: '', wrongJudgment: '', lens: '', focus: '', simulation: '', workingMemory: '', automatic: '', conscious: '', transfer: '', bottleneck: '', nextAction: '', levels: { criterion: 5, immersion: 5, embodiment: 5 } });
export default function PlaireReview({ data, update }: { data: AppData; update: (fn: (value: AppData) => AppData) => void }) {
  const [date,setDate]=useState(toDateKey()); const [entry,setEntry]=useState(data.plaire[date]??blank(date)); const [copied,setCopied]=useState(false);
  useEffect(()=>setEntry(data.plaire[date]??blank(date)),[date,data.plaire]);
  const set=(key:keyof PlaireEntry,value:string)=>setEntry({...entry,[key]:value});
  const save=()=>update((value)=>({...value,plaire:{...value.plaire,[date]:entry}}));
  const template=`오늘 학습 기록:\n${entry.record}\n\n================\n\n## 4-1 기준 / 메타인지\n오늘 새롭게 정립한 기준:\n${entry.criterion}\n\n내가 틀린 판단:\n${entry.wrongJudgment}\n\n문제를 바라보는 기준:\n${entry.lens}\n\n================\n\n## 4-2 몰입\n집중 유지 여부:\n${entry.focus}\n\n시험 상황 재현:\n${entry.simulation}\n\n작업기억 문제:\n${entry.workingMemory}\n\n================\n\n## 4-3 체화\n자동으로 나온 행동:\n${entry.automatic}\n\n아직 의식적으로 해야 하는 행동:\n${entry.conscious}\n\n다음 문제 적용 가능성:\n${entry.transfer}\n\n================\n\n현재 병목:\n${entry.bottleneck}\n\n다음 행동:\n${entry.nextAction}`;
  const copy=async()=>{await navigator.clipboard.writeText(template);setCopied(true);setTimeout(()=>setCopied(false),1600)};
  const section=(title:string,icon:React.ReactNode,fields:[keyof PlaireEntry,string,string][])=><Card className="plaire-section"><div className="plaire-title"><span>{icon}</span><div><p className="eyebrow">PLAiRE FRAME</p><h2>{title}</h2></div></div>{fields.map(([key,label,placeholder])=><Field label={label} key={key}><TextArea value={entry[key] as string} onChange={(v)=>set(key,v)} placeholder={placeholder}/></Field>)}</Card>;
  return <div><PageHeader eyebrow="PLAIRE REVIEW" title="기준 · 몰입 · 체화 리뷰" description="자동 평가는 없습니다. 자신의 언어로 작성하고 필요할 때 전체 템플릿을 복사합니다." action={<input className="date-input" type="date" value={date} onChange={(e)=>setDate(e.target.value)}/>} />
    <Card className="plaire-record"><Field label="오늘 학습 기록"><TextArea value={entry.record} onChange={(v)=>set('record',v)} placeholder="과목, 범위, 수행량, 실전 조건"/></Field></Card>
    <div className="plaire-grid">{section('4-1 기준 / 메타인지',<Gauge/>,[['criterion','오늘 새롭게 정립한 기준','어떤 조건에서 무엇을 판단할 것인가'],['wrongJudgment','내가 틀린 판단','결과가 아니라 판단 과정'],['lens','문제를 바라보는 기준','다음 문제에서 먼저 볼 것']])}{section('4-2 몰입',<Zap/>,[['focus','집중 유지 여부','흐트러진 시점과 복귀 행동'],['simulation','시험 상황 재현','시간·환경·압박의 재현 정도'],['workingMemory','작업기억 문제','동시에 붙잡다 놓친 정보']])}{section('4-3 체화',<Layers3/>,[['automatic','자동으로 나온 행동','의식하지 않아도 수행된 것'],['conscious','아직 의식적으로 해야 하는 행동','체크리스트가 필요한 것'],['transfer','다음 문제 적용 가능성','다른 형태에서도 재현 가능한가']])}</div>
    <Card className="bottleneck-card"><Field label="현재 병목"><TextArea value={entry.bottleneck} onChange={(v)=>set('bottleneck',v)} placeholder="현재 성장을 가장 크게 제한하는 한 지점"/></Field><Field label="다음 행동"><TextArea value={entry.nextAction} onChange={(v)=>set('nextAction',v)} placeholder="내일 검증할 최소 행동"/></Field><div className="level-sliders">{([['criterion','기준'],['immersion','몰입'],['embodiment','체화']] as const).map(([key,label])=><Field key={key} label={`${label} 체감 단계 · ${entry.levels[key]}/10`}><input type="range" min="1" max="10" value={entry.levels[key]} onChange={(e)=>setEntry({...entry,levels:{...entry.levels,[key]:Number(e.target.value)}})}/></Field>)}</div><div className="split-actions"><SaveButton onClick={save} label="리뷰 저장"/><button className="button" onClick={copy}><Clipboard size={17}/>{copied?'복사 완료':'ChatGPT용 전체 복사'}</button></div></Card>
  </div>;
}
