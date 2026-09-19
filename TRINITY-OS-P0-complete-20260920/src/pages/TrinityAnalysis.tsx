import { useState } from 'react';
import { Plus, Triangle } from 'lucide-react';
import type { AppData, Subject, TrinityEntry } from '../types';
import { Card, Empty, Field, PageHeader, SaveButton, TextArea } from '../components/Ui';
import { toDateKey, uid } from '../lib/date';

const koreanFields=[['diagnosis','현재 진단'],['representation','표상: 머릿속 구조가 어디서 무너졌는가?'],['mapping','매핑: 선지와 지문의 대응이 왜 실패했는가?'],['parrot','앵무새 오류: 이해 없이 표현만 반복했는가?'],['resource','다지문 상황에서 자원이 고갈됐는가?'],['action','다음 실전 행동']];
const mathFields=[['problem','문제'],['demand','요구하는 것'],['condition','핵심 조건'],['role','조건 역할'],['necessary','필요조건'],['sufficient','충분조건 검증'],['leap','논리 비약'],['action','실전 행동'],['stability','풀이 안정성·재현성 평가']];
export default function TrinityAnalysis({data,update,embedded=false}:{data:AppData;update:(fn:(value:AppData)=>AppData)=>void;embedded?:boolean}){
 const [mode,setMode]=useState<'국어'|'수학'>('국어'); const [subject,setSubject]=useState<Subject>('국어'); const [fields,setFields]=useState<Record<string,string>>({}); const defs=mode==='국어'?koreanFields:mathFields;
 const save=()=>{const item:TrinityEntry={id:uid(),date:toDateKey(),subject,mode,fields};update(v=>({...v,trinity:[item,...v.trinity]}));setFields({});};
 return <div>{!embedded&&<PageHeader eyebrow="TRINITY ANALYSIS" title="학습 프레임워크" description="정답 여부를 넘어서, 기준이 실전에서 유지되고 자동 행동으로 나오는지 분석합니다."/>}
  <div className="trinity-principles"><Card><span>01</span><h2>기준</h2><p>무엇을 판단 기준으로 삼는가?</p></Card><Triangle size={20}/><Card><span>02</span><h2>몰입</h2><p>시험 환경에서 유지 가능한가?</p></Card><Triangle size={20}/><Card><span>03</span><h2>체화</h2><p>자동 행동으로 나오는가?</p></Card></div>
  <div className="analysis-tabs"><button className={mode==='국어'?'active':''} onClick={()=>{setMode('국어');setSubject('국어');setFields({})}}>국어 분석</button><button className={mode==='수학'?'active':''} onClick={()=>{setMode('수학');setSubject('수학');setFields({})}}>수학 분석</button></div>
  <Card className="analysis-form"><div className="analysis-form-head"><div><span className={`subject-badge ${mode}`}>{mode}</span><h2>{mode==='국어'?'표상 · 매핑 · 자원 분석':'조건 · 논리 · 재현성 분석'}</h2></div><input type="date" value={toDateKey()} readOnly/></div><div className="form-grid two">{defs.map(([key,label])=><Field label={label} key={key}><TextArea value={fields[key]??''} onChange={(v)=>setFields({...fields,[key]:v})}/></Field>)}</div><SaveButton onClick={save} label="분석 기록 저장"/></Card>
  <h2 className="history-title">최근 분석</h2>{data.trinity.length?<div className="analysis-history">{data.trinity.slice(0,6).map(x=><Card key={x.id}><div><span className={`subject-badge ${x.mode}`}>{x.mode}</span><small>{x.date}</small></div><h3>{x.fields.problem||x.fields.diagnosis||'제목 없는 분석'}</h3><p>{x.fields.stability||x.fields.action||'다음 행동 미입력'}</p></Card>)}</div>:<Empty>아직 분석 기록이 없습니다. 첫 판단 과정을 분해해보세요.</Empty>}
 </div>;
}
