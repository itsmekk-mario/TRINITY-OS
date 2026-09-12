import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Render actual TSX primitives without introducing a test framework or browser dependency.
const modules = new Map();
async function componentUrl(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  let source = ts.transpileModule(await readFile(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  for (const match of [...source.matchAll(/from\s+["']([^"']+)["']/g)]) {
    const specifier = match[1];
    let resolved;
    if (!specifier.startsWith('.')) resolved = import.meta.resolve(specifier);
    else {
      let target = new URL(specifier, url);
      if (!/\.(tsx?|mjs|js)$/.test(target.pathname)) {
        for (const extension of ['.tsx', '.ts']) {
          const candidate = new URL(target.href + extension);
          try { await access(fileURLToPath(candidate)); target = candidate; break; } catch { /* Try the next source extension. */ }
        }
      }
      // Feedback is an external effect, intentionally not run during server rendering.
      resolved = target.pathname.endsWith('/feedback.ts') ? 'data:text/javascript,export const studentFeedback=async()=>({feedback:[]})' : target.pathname.endsWith('.tsx') ? await componentUrl(target) : target.href;
    }
    source = source.replace(match[0], `from ${JSON.stringify(resolved)}`);
  }
  const result = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  modules.set(url.href, result); return result;
}
const load = async (path) => import(await componentUrl(new URL(path, import.meta.url)));
const { default: Dashboard } = await load('../src/pages/Dashboard.tsx');
const { Empty, PageHeader } = await load('../src/components/Ui.tsx');
const { default: HubLayout } = await load('../src/components/navigation/HubLayout.tsx');
const { default: SegmentedControl } = await load('../src/components/navigation/SegmentedControl.tsx');
const today = new Date().toLocaleDateString('sv-SE');
const data = () => ({ calendar: {}, sessions: [], scores: [], wrongAnswerDrills: [], dailyDrills: [], weeklyCapabilityGoals: [], plaire: {}, trinity: [], examDate: '2028-11-16' });
const renderToday = (value) => renderToStaticMarkup(createElement(Dashboard, { data: value, update() {}, navigate() {} }));

test('Today empty state gives a next action without fabricated capability metrics', () => {
  const html = renderToday(data());
  assert.match(html, /첫 학습을 계획하세요/);
  assert.match(html, /일정 추가/);
  assert.match(html, /아직 병목 기록이 없습니다/);
  assert.ok(html.indexOf('next-action') < html.indexOf('execution-section'));
  assert.ok(html.indexOf('execution-section') < html.indexOf('today-focus'));
  assert.doesNotMatch(html, /LEARNING SIGNALS|최근 14일|today-hero/);
});
test('Today reuses plan, session and correction records without mutating AppData', () => {
  const value = data();
  value.calendar[today] = { date: today, plans: [{ id: 'p', title: '수열 Theme 12', subject: '수학', quantity: '31문제 · 40분', done: false }] };
  value.sessions = [{ date: today, seconds: 1200 }];
  value.wrongAnswerDrills = [{ id: 'w', date: today, bottleneck: '조건 누락', correction: '경계값을 재검사', wrongJudgment: '', missedCue: '', transfer: '', retries: [] }];
  const before = structuredClone(value); const html = renderToday(value);
  assert.match(html, /수열 Theme 12/); assert.match(html, /목표 40분/);
  assert.match(html, /공부 시작/); assert.match(html, /조건 누락/); assert.match(html, /경계값을 재검사/);
  assert.deepEqual(value, before);
});
test('Hub renders page identity before tabs and retains child editing actions with one h1', () => {
  const controls = createElement(SegmentedControl, { label: 'Plan', options: [{ id: 'overview', label: 'Overview' }, { id: 'weekly', label: 'Weekly' }], value: 'weekly', onChange() {} });
  const html = renderToStaticMarkup(createElement(HubLayout, { eyebrow: 'PLAN', title: '실행 설계', description: '주간 계획', controls }, createElement(PageHeader, { eyebrow: 'WEEKLY', title: '주간 편집', action: createElement('button', null, '저장') })));
  assert.ok(html.indexOf('<h1') < html.indexOf('role="tablist"'));
  assert.equal((html.match(/<h1/g) ?? []).length, 1);
  assert.match(html, /<h2>주간 편집/); assert.match(html, /<button>저장/);
  assert.match(html, /tabindex="-1" aria-selected="false"/); assert.match(html, /tabindex="0" aria-selected="true"/);
});
test('Empty accepts both legacy children and action-oriented props', () => {
  assert.match(renderToStaticMarkup(createElement(Empty, null, '기존 안내')), /기존 안내/);
  const html = renderToStaticMarkup(createElement(Empty, { title: '일정 없음', description: '첫 계획을 추가하세요', action: createElement('button', null, '일정 추가') }));
  assert.match(html, /일정 없음/); assert.match(html, /첫 계획/); assert.match(html, /<button>일정 추가/);
});
test('Static route entrypoints retain existing URLs and Arena alias', async () => {
  const script = await readFile(new URL('../scripts/create-spa-entrypoints.mjs', import.meta.url), 'utf8');
  for (const route of ['today', 'plan', 'train', 'test', 'insights', 'coach', 'feedback', 'workspace', 'profile', 'archive', 'arena']) assert.ok(script.includes(`'${route}'`));
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /path === '\/arena' \|\| path === '\/profile'/);
  assert.match(app, /popstate/); assert.doesNotMatch(app, /Profile · Arena|<Database/);
});
