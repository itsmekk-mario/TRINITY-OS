import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const changed = [];
const warnings = [];

function read(relative) {
  const target = path.join(root, relative);
  if (!fs.existsSync(target)) throw new Error(`${relative}: 파일을 찾을 수 없습니다. TRINITY-OS 저장소 루트에서 실행하세요.`);
  return fs.readFileSync(target, 'utf8');
}
function write(relative, source, before) {
  if (source === before) return;
  fs.writeFileSync(path.join(root, relative), source);
  changed.push(relative);
}
function replace(source, from, to, label, required = true) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) {
    const message = `${label}: 기준 코드를 찾지 못했습니다.`;
    if (required) throw new Error(message);
    warnings.push(message);
    return source;
  }
  return source.replace(from, to);
}
function replaceAll(source, from, to, label, required = false) {
  if (!source.includes(from)) {
    if (required) throw new Error(`${label}: 기준 코드를 찾지 못했습니다.`);
    warnings.push(`${label}: 적용할 대상이 없거나 이미 수정되었습니다.`);
    return source;
  }
  return source.split(from).join(to);
}
function patch(relative, fn) {
  const before = read(relative);
  const after = fn(before);
  write(relative, after, before);
}

// 1) 모든 공용 TextArea에 수식/함수 그래프 편집기를 연결한다.
patch('src/components/Ui.tsx', (input) => {
  let source = input;
  if (!source.includes("./MathRecord")) {
    source = replace(
      source,
      "import { Check, ChevronRight } from 'lucide-react';",
      "import { Check, ChevronRight } from 'lucide-react';\nimport { MathRecordEditor } from './MathRecord';\nexport { RichMathText } from './MathRecord';",
      'Ui MathRecord import',
    );
  }
  const oldTextArea = "export function TextArea({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (value: string) => void; placeholder?: string; rows?: number }) { return <textarea value={value} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />; }";
  const newTextArea = "export function TextArea({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (value: string) => void; placeholder?: string; rows?: number }) { return <MathRecordEditor value={value} rows={rows} placeholder={placeholder} onChange={onChange} />; }";
  source = replace(source, oldTextArea, newTextArea, '공용 TextArea 교체');
  return source;
});

patch('src/main.tsx', (input) => {
  if (input.includes("./math-record.css")) return input;
  return replace(input, "import './ui-system.css';", "import './ui-system.css';\nimport './math-record.css';", 'math-record.css import');
});

// 2) Quick Capture는 공용 TextArea를 쓰지 않던 경로라 직접 연결한다.
patch('src/components/learning/QuickCaptureSheet.tsx', (input) => {
  let source = input;
  if (!source.includes("import { TextArea } from '../Ui';")) {
    source = replace(source, "import { classifyWrongAnswer, suggestCoreRules } from '../../lib/drillClassification';", "import { classifyWrongAnswer, suggestCoreRules } from '../../lib/drillClassification';\nimport { TextArea } from '../Ui';", 'Quick Capture TextArea import');
  }
  source = replace(source, '<label>잘못된 판단<textarea value={wrongJudgment} onChange={event=>setWrongJudgment(event.target.value)}/></label>', '<label>잘못된 판단<TextArea value={wrongJudgment} onChange={setWrongJudgment}/></label>', 'Quick Capture 잘못된 판단');
  source = replace(source, '<label>놓친 단서<textarea value={missedCue} onChange={event=>setMissedCue(event.target.value)}/></label>', '<label>놓친 단서<TextArea value={missedCue} onChange={setMissedCue}/></label>', 'Quick Capture 놓친 단서');
  source = replace(source, '<label>다음 행동<textarea value={correction} onChange={event=>setCorrection(event.target.value)}/></label>', '<label>다음 행동<TextArea value={correction} onChange={setCorrection}/></label>', 'Quick Capture 다음 행동');
  return source;
});

// 3) 저장된 기록도 수식/그래프가 렌더링되도록 주요 기록 뷰를 연결한다.
patch('src/pages/DailyDrillPanel.tsx', (input) => {
  let source = input;
  source = replace(source, "import { Card, Empty, Field, SaveButton, TextArea } from '../components/Ui';", "import { Card, Empty, Field, RichMathText, SaveButton, TextArea } from '../components/Ui';", 'Daily Drill RichMathText import');
  source = replace(source, '<section><b>재현 행동</b><p>{item.action}</p></section>', '<section><b>재현 행동</b><div className="math-record-output"><RichMathText value={item.action}/></div></section>', 'Daily Drill 재현 행동');
  source = replace(source, '<section><b>성공 기준</b><p>{item.successCriterion}</p></section>', '<section><b>성공 기준</b><div className="math-record-output"><RichMathText value={item.successCriterion}/></div></section>', 'Daily Drill 성공 기준');
  return source;
});

patch('src/pages/WeeklyDrill.tsx', (input) => {
  let source = input;
  source = replace(source, "import { Card, Empty, Field, PageHeader, SaveButton, TextArea } from '../components/Ui';", "import { Card, Empty, Field, PageHeader, RichMathText, SaveButton, TextArea } from '../components/Ui';", 'Weekly Drill RichMathText import');
  source = replaceAll(source, '<p>{item.successCriterion}</p>', '<div className="math-record-output"><RichMathText value={item.successCriterion}/></div>', 'Weekly Drill 성공 기준');
  source = replaceAll(source, "<p>{item.drillDesign || '미설정'}</p>", "<div className=\"math-record-output\"><RichMathText value={item.drillDesign} fallback=\"미설정\"/></div>", 'Weekly Drill 훈련 설계');
  source = replaceAll(source, "<p>{item.evidence || '미설정'}</p>", "<div className=\"math-record-output\"><RichMathText value={item.evidence} fallback=\"미설정\"/></div>", 'Weekly Drill 증거');
  source = replaceAll(source, '<p>{item.wrongJudgment}</p>', '<div className="math-record-output"><RichMathText value={item.wrongJudgment}/></div>', 'Wrong Answer 틀린 판단');
  source = replaceAll(source, "<p>{item.missedCue || '미기록'}</p>", '<div className="math-record-output"><RichMathText value={item.missedCue} fallback="미기록"/></div>', 'Wrong Answer 놓친 단서');
  source = replaceAll(source, "<p>{item.correction || '미기록'}</p>", '<div className="math-record-output"><RichMathText value={item.correction} fallback="미기록"/></div>', 'Wrong Answer 교정 행동');
  source = replaceAll(source, "<p>{item.transfer || '미기록'}</p>", '<div className="math-record-output"><RichMathText value={item.transfer} fallback="미기록"/></div>', 'Wrong Answer 전이 Drill');
  return source;
});

patch('src/pages/TrainHub.tsx', (input) => {
  let source = input;
  source = replace(source, "import { Empty, PageHeader } from '../components/Ui';", "import { Empty, PageHeader, RichMathText } from '../components/Ui';", 'TrainHub RichMathText import');
  source = replace(source, "<p>{item.correction || item.missedCue || '교정 행동을 기록하세요.'}</p>", '<div className="math-record-output wrong-card-output"><RichMathText value={item.correction || item.missedCue} fallback="교정 행동을 기록하세요."/></div>', 'Wrong Answer 카드 미리보기');
  source = replace(source, "<section><b>잘못된 판단</b><p>{selected.wrongJudgment || '미기록'}</p></section>", '<section><b>잘못된 판단</b><div className="math-record-output"><RichMathText value={selected.wrongJudgment} fallback="미기록"/></div></section>', 'Wrong Answer 상세 판단');
  source = replace(source, "<section><b>놓친 단서</b><p>{selected.missedCue || '미기록'}</p></section>", '<section><b>놓친 단서</b><div className="math-record-output"><RichMathText value={selected.missedCue} fallback="미기록"/></div></section>', 'Wrong Answer 상세 단서');
  source = replace(source, "<section><b>교정 행동</b><p>{selected.correction || '미기록'}</p></section>", '<section><b>교정 행동</b><div className="math-record-output"><RichMathText value={selected.correction} fallback="미기록"/></div></section>', 'Wrong Answer 상세 교정');
  source = replace(source, "<section><b>전이 Drill</b><p>{selected.transfer || '미기록'}</p></section>", '<section><b>전이 Drill</b><div className="math-record-output"><RichMathText value={selected.transfer} fallback="미기록"/></div></section>', 'Wrong Answer 상세 전이');
  return source;
});

patch('src/pages/ScoreTracker.tsx', (input) => {
  let source = input;
  source = replace(source, "import { Card, Empty, Field, PageHeader, SaveButton, TextArea } from '../components/Ui';", "import { Card, Empty, Field, PageHeader, RichMathText, SaveButton, TextArea } from '../components/Ui';", 'ScoreTracker RichMathText import');
  source = replace(source, "<div><b>오답문항</b><p>{review.wrongQuestions || '기록 없음'}</p></div>", '<div><b>오답문항</b><div className="math-record-output"><RichMathText value={review.wrongQuestions} fallback="기록 없음"/></div></div>', '실모 오답문항');
  source = replace(source, "<div><b>객관화</b><p>{review.observation || '기록 없음'}</p></div>", '<div><b>객관화</b><div className="math-record-output"><RichMathText value={review.observation} fallback="기록 없음"/></div></div>', '실모 객관화');
  source = replace(source, "<div><b>개선방향</b><p>{review.improvement || '기록 없음'}</p></div>", '<div><b>개선방향</b><div className="math-record-output"><RichMathText value={review.improvement} fallback="기록 없음"/></div></div>', '실모 개선방향');
  source = replace(source, '<section className="mock-overall"><b>총평</b><p>{score.overallReview}</p></section>', '<section className="mock-overall"><b>총평</b><div className="math-record-output"><RichMathText value={score.overallReview}/></div></section>', '실모 총평');
  return source;
});

patch('src/pages/TrinityAnalysis.tsx', (input) => {
  let source = input;
  source = replace(source, "import { Card, Empty, Field, PageHeader, SaveButton, TextArea } from '../components/Ui';", "import { Card, Empty, Field, PageHeader, RichMathText, SaveButton, TextArea } from '../components/Ui';", 'TrinityAnalysis RichMathText import');
  source = replace(source, "<p>{x.fields.stability||x.fields.action||'다음 행동 미입력'}</p>", '<div className="math-record-output"><RichMathText value={x.fields.stability||x.fields.action} fallback="다음 행동 미입력"/></div>', 'Trinity 최근 분석');
  return source;
});

patch('src/pages/LearningArchive.tsx', (input) => {
  let source = input;
  source = replace(source, "import { Card,Empty,Field,PageHeader,TextArea } from '../components/Ui';", "import { Card,Empty,Field,PageHeader,RichMathText,TextArea } from '../components/Ui';", 'LearningArchive RichMathText import');
  source = replaceAll(source, '<p key={r.id}><b>{r.title}</b><br/>{r.content}</p>', '<div className="math-record-output" key={r.id}><b>{r.title}</b><RichMathText value={r.content}/></div>', 'Archive review Core Rule');
  source = replace(source, '<p className="document-lead">{selectedRule.content}</p>', '<div className="document-lead math-record-output"><RichMathText value={selectedRule.content}/></div>', 'Core Rule 상세 내용');
  source = replace(source, '<p className="document-lead">{selected.memo||\'기록된 메모가 없습니다.\'}</p>', '<div className="document-lead math-record-output"><RichMathText value={selected.memo} fallback="기록된 메모가 없습니다."/></div>', 'Archive 분석 메모');
  source = replace(source, "<div key={label}><b>{label}</b><p>{value||'—'}</p></div>", '<div key={label}><b>{label}</b><div className="math-record-output"><RichMathText value={String(value||\'\')} fallback="—"/></div></div>', 'Archive 과목 분석 필드');
  source = replace(source, '<p>{a.text}</p>', '<div className="math-record-output"><RichMathText value={a.text}/></div>', 'Archive Annotation');
  source = replaceAll(source, '<p>{rule.content}</p>', '<div className="math-record-output"><RichMathText value={rule.content}/></div>', 'Archive Core Rule 카드');
  return source;
});

patch('src/components/learning/CoreRuleIntelligencePanel.tsx', (input) => {
  let source = input;
  source = replace(source, "import { Card,Empty } from '../Ui';", "import { Card,Empty,RichMathText } from '../Ui';", 'Intelligence RichMathText import');
  source = replaceAll(source, '<p>{rule.content}</p>', '<div className="math-record-output compact"><RichMathText value={rule.content}/></div>', 'Intelligence Rule 카드');
  source = replace(source, '<p>{detail.coreRule.content}</p>', '<div className="math-record-output"><RichMathText value={detail.coreRule.content}/></div>', 'Intelligence Rule 상세');
  source = replaceAll(source, "<p><strong>잘못된 판단</strong> {item.wrongJudgment||'미기록'}</p>", '<div className="math-record-output linked"><strong>잘못된 판단</strong><RichMathText value={item.wrongJudgment} fallback="미기록"/></div>', 'Intelligence 잘못된 판단');
  source = replaceAll(source, "<p><strong>놓친 단서</strong> {item.missedCue||'미기록'}</p>", '<div className="math-record-output linked"><strong>놓친 단서</strong><RichMathText value={item.missedCue} fallback="미기록"/></div>', 'Intelligence 놓친 단서');
  source = replaceAll(source, "<p><strong>교정 행동</strong> {item.correction||'미기록'}</p>", '<div className="math-record-output linked"><strong>교정 행동</strong><RichMathText value={item.correction} fallback="미기록"/></div>', 'Intelligence 교정 행동');
  source = replaceAll(source, "<p><strong>교정 행동</strong> {item.action||'미기록'}</p>", '<div className="math-record-output linked"><strong>교정 행동</strong><RichMathText value={item.action} fallback="미기록"/></div>', 'Intelligence Drill 행동');
  source = replaceAll(source, "<p><strong>성공 기준</strong> {item.successCriterion||'미기록'}</p>", '<div className="math-record-output linked"><strong>성공 기준</strong><RichMathText value={item.successCriterion} fallback="미기록"/></div>', 'Intelligence Drill 성공 기준');
  return source;
});

patch('src/components/learning/UnifiedReviewQueue.tsx', (input) => {
  let source = input;
  if (!source.includes("from '../Ui'")) {
    source = replace(source, "import { archiveApi } from '../../lib/archiveApi';", "import { archiveApi } from '../../lib/archiveApi';\nimport { RichMathText, TextArea } from '../Ui';", 'Review Queue Ui import');
  }
  source = replace(source, "<section><b>교정 기준</b><p>{selected.reason||String(selected.detail.content??'기록 없음')}</p></section>", '<section><b>교정 기준</b><div className="math-record-output"><RichMathText value={selected.reason||String(selected.detail.content??\'\')} fallback="기록 없음"/></div></section>', 'Review Queue 교정 기준');
  source = replace(source, "<section><b>잘못된 판단</b><p>{String(selected.detail.wrongJudgment??'')}</p></section>", '<section><b>잘못된 판단</b><div className="math-record-output"><RichMathText value={String(selected.detail.wrongJudgment??\'\')} fallback="미기록"/></div></section>', 'Review Queue 잘못된 판단');
  source = replace(source, "<section><b>놓친 단서</b><p>{String(selected.detail.missedCue??'')}</p></section>", '<section><b>놓친 단서</b><div className="math-record-output"><RichMathText value={String(selected.detail.missedCue??\'\')} fallback="미기록"/></div></section>', 'Review Queue 놓친 단서');
  source = replace(source, "<section><b>성공 기준</b><p>{String(selected.detail.successCriterion??'')}</p></section>", '<section><b>성공 기준</b><div className="math-record-output"><RichMathText value={String(selected.detail.successCriterion??\'\')} fallback="미기록"/></div></section>', 'Review Queue Drill 성공 기준');
  source = replace(source, '<label>메모<textarea value={notes} onChange={event=>setNotes(event.target.value)} placeholder="이번 Review에서 확인한 점"/></label>', '<label>메모<TextArea value={notes} onChange={setNotes} placeholder="이번 Review에서 확인한 점"/></label>', 'Review Queue 메모');
  return source;
});

console.log('TRINITY OS math recording patch complete.');
if (changed.length) console.log(`Changed (${changed.length}):\n- ${changed.join('\n- ')}`);
else console.log('No source changes were necessary.');
if (warnings.length) console.log(`\nWarnings:\n- ${warnings.join('\n- ')}`);
console.log('\nNew math files should exist at: src/components/MathRecord.tsx, src/lib/mathExpression.ts, src/math-record.css');
