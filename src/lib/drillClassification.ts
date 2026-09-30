import type { DrillBottleneck, Subject } from '../types';
import type { CoreRule } from './archiveApi';

export const DRILL_BOTTLENECKS: DrillBottleneck[]=['발문·해석','개념 공백','계산 실수','시간 관리','전략·판단','기타'];
type Input={subject:Subject;source:string;question:string;wrongJudgment:string;missedCue:string;correction:string;nextAction:string};
const terms:Record<Exclude<DrillBottleneck,'기타'>,string[]>={'발문·해석':['발문','오독','해석','질문'],'개념 공백':['개념','정의','공식','원리'],'계산 실수':['계산','부호','전개','연산'],'시간 관리':['시간','속도','서둘'],'전략·판단':['필요조건','충분조건','경계','끝점','판단','전략','경우']};
const text=(input:Input)=>`${input.wrongJudgment} ${input.missedCue} ${input.correction} ${input.nextAction}`.replace(/\s/g,'');
export const classifyWrongAnswer=(input:Input)=>{const all=text(input),scores=Object.fromEntries(Object.entries(terms).map(([key,words])=>[key,words.reduce((sum,word)=>sum+(all.includes(word)?1:0),0)])) as Partial<Record<DrillBottleneck,number>>;const primary=(Object.entries(scores).sort((a,b)=>b[1]-a[1])[0]?.[1]??0)>0?Object.entries(scores).sort((a,b)=>b[1]-a[1])[0]![0] as DrillBottleneck:'기타';return {primary,scores,rationale:primary==='기타'?'추천 근거가 충분하지 않습니다. 직접 병목을 선택하세요.':`입력한 판단·단서·교정 행동에서 ${primary} 관련 표현이 가장 많습니다.`};};
export const suggestCoreRules=(rules:CoreRule[],input:Input)=>{const query=text(input);const subject=input.subject==='국어'?'korean':input.subject==='수학'?'math':input.subject==='영어'?'english':'';return rules.filter(rule=>rule.subject===subject).map(rule=>({rule,score:[rule.title,rule.content,...rule.tags].filter(value=>query.includes(value.replace(/\s/g,''))&&value.length>1).length})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score).slice(0,3);};
