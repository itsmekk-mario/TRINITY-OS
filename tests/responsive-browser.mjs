// Optional visual/regression check, without changing application dependencies:
// npm install --prefix /tmp/trinity-browser-tools --no-save --package-lock=false playwright
// node tests/responsive-browser.mjs
// UI_CHECK_PRODUCTION=1 UI_CHECK_PORT=4177 node tests/responsive-browser.mjs tests the latest npm run build.
// All API traffic uses isolated Playwright fixtures; production data is never read or written.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer, preview } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/tmp/trinity-browser-tools/node_modules/playwright/index.mjs');
const output = process.env.UI_CHECK_OUTPUT || '/tmp/trinity-ui-check';
const port = Number(process.env.UI_CHECK_PORT || 4174);
const widths = (process.env.UI_CHECK_WIDTHS || '320,390,768,1024,1440').split(',').map(Number);
const today = new Date().toLocaleDateString('sv-SE');
const date = days => { const value = new Date(); value.setDate(value.getDate() + days); return value.toLocaleDateString('sv-SE'); };
const monday = new Date(`${today}T12:00:00`); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
const weekStart = monday.toLocaleDateString('sv-SE');
const fixture = {
  calendar: { [today]: { date: today, study: '조건 검증과 문학 지문 읽기', minutes: 150, exam: '', event: '', condition: 4, reflection: '조건을 끝까지 확인했습니다.', plans: [
    { id: 'p1', subject: '수학', title: '도함수의 부호 변화와 경계값을 모두 확인하기', detail: '필요조건과 충분조건을 구분합니다.', quantity: '45분', done: true, outcome: 'achieved' },
    { id: 'p2', subject: '영어', title: '독해 지문의 핵심 구조를 한 문장으로 요약하기', detail: '근거 문장을 찾아 표시합니다.', quantity: '30분', done: false },
  ] } },
  sessions: Array.from({ length: 16 }, (_, i) => ({ id: `session-${i}`, date: date(-i), subject: i % 2 ? '영어' : '수학', seconds: 3600 + i * 180, note: '집중 학습 기록' })),
  mockSchedule: [{ id: 'mock1', label: '국어 실전 모의고사', start: '08:40', end: '10:00', kind: 'exam', subject: '국어', questions: 45 }, { id: 'break1', label: '휴식', start: '10:00', end: '10:20', kind: 'break' }],
  journals: {},
  scores: [0, 7, 14].map((days, i) => ({ id: `score-${i}`, date: date(-days), name: '2027학년도 대학수학능력시험 실전 모의고사', subject: '수학', korean: 84 + i, math: 81 + i, english: 90, duration: 100, errorType: '전략·판단', cause: '충분조건 확인 누락', nextAction: '극값 조건을 검증합니다.' })),
  resources: ['국어', '수학', '영어', '통사', '통과'].flatMap((subject, i) => [
    { id: `resource-${i}`, subject, group: '수능 대비', name: `${subject} 2027학년도 실전 개념완성 및 심화 문제풀이 교재`, total: 100, done: 25, dueDate: date(10) },
    { id: `resource-extra-${i}`, subject, group: '기출 분석', name: `${subject} 평가원 기출문제 분석`, total: 50, done: 10 },
  ]),
  goals: [{ id: 'goal1', subject: '수학', text: '모든 조건을 검증하는 능력', done: false }],
  weeklyCapabilityGoals: [{ id: 'weekly1', weekStart, subject: '수학', ability: '필요조건과 충분조건을 구분하여 경계값을 모두 검증하기', successCriterion: '연속 3개 문항에서 조건 누락 0회', drillDesign: '매일 20분 조건 검증 Drill', evidence: '풀이에서 경계값 표시', done: false }],
  wrongAnswerDrills: [0, 1, 2].map(i => ({ id: `wrong-${i}`, date: date(-i), subject: '수학', source: '2027학년도 9월 평가원 모의고사', question: `${21 + i}번 극값 조건과 부호 변화`, wrongJudgment: '필요조건만 확인했습니다.', missedCue: '극값의 부호 변화', correction: '충분조건과 경계값을 모두 확인합니다.', transfer: '유사 문항에 적용합니다.', scoreId: 'score-0', bottleneck: '전략·판단', retries: [{ id: '3d', label: '3일 후 재도전', dueDate: today }] })),
  handwritingNotes: [],
  dailyDrills: [{ id: 'drill1', date: today, subject: '수학', title: '조건 검증 능력을 위한 경계값 확인 Drill', action: '필요조건과 충분조건을 표로 구분합니다.', successCriterion: '누락 0회', minutes: 20, done: false, reflection: '', capabilityGoalId: 'weekly1' }],
  monthlyPlans: [{ id: 'monthly1', month: today.slice(0, 7), subject: '수학', title: '수학 실전 판단력과 계산 정확도 개선', objective: '조건 누락을 줄입니다.', successCriterion: '전략 오류 50% 감소', strategy: '주간 재현과 전이', done: false }],
  notionPages: [{ id: 'note1', title: '이번 주 학습 일정과 해야 할 일', icon: '📚', createdAt: today, updatedAt: today, blocks: [{ id: 'b1', type: 'heading', content: '이번 주 우선순위' }, { id: 'b2', type: 'todo', content: '모의고사 오답에서 핵심 조건을 정리하고 재현하기', checked: false, date: today, status: 'open' }] }],
  routine: [{ id: 'routine1', time: '08:00', title: '아침 학습 준비', detail: '오늘 학습 목표와 전날 오답을 확인합니다.', subject: '생활' }, { id: 'routine2', time: '09:00', title: '수학 집중 학습', detail: '조건 검증 Drill', subject: '수학' }],
  quotes: ['매일의 작은 실행이 성장을 만듭니다.'], subjectColors: {}, examDate: '2026-11-19', googleClientId: '', plaire: {},
  trinity: [{ id: 'trinity1', date: today, subject: '수학', mode: '수학', fields: { '핵심 조건': '경계값과 도함수의 부호 변화를 함께 검증합니다.' } }],
};
const rule = { id: 'rule1', subject: 'math', title: '극값은 도함수의 부호 변화로 검증합니다.', content: '필요조건과 충분조건을 구분하여 모든 경계값을 확인합니다.', tags: ['극값', '조건 검증'], masteryStatus: 'understanding', usageCount: 2, wrongAnswerCount: 1 };
const archive = { id: 'archive1', subject: 'math', year: 2027, month: 9, institution: 'KICE', examName: '2027학년도 9월 평가원 모의고사', sourceName: '수학 기출문제', questionNumber: '21', category: '미분', subcategory: '극값', title: '극값 조건과 도함수의 부호 변화 검증', studiedAt: today, masteryStatus: 'understanding', memo: '조건을 분리하고 부호 변화 표를 작성합니다.', conditionSummary: '도함수의 부호 변화 확인', firstThought: '필요조건만 확인', representation: '부호 변화 표', solutionFlow: '필요조건 → 충분조건 → 경계값', bottleneck: '전략·판단', transfer: '유사 문항에 적용', reviewEnabled: true, images: [], nextReviewAt: today, reviewBucket: 'today', annotations: [{ id: 'a1', archiveEntryId: 'archive1', color: 'blue', type: 'note', text: '경계값을 항상 함께 확인합니다.', order: 0 }], coreRules: [rule] };
const feedback = [{ id: 'feedback1', type: 'subject', subject: '수학', title: '조건을 끝까지 검증하는 능력을 이번 주에 완성합니다.', categories: ['전략·판단'], status: 'needs_improvement', progress: 'active', observation: '필요조건만 확인하는 패턴이 반복됩니다.', action: '20분 조건 검증 Drill을 3회 실행합니다.', success_criterion: '연속 3문항에서 조건 누락 0회', comment: '경계값의 포함 여부도 확인하세요.', teacher_name: '수학 선생님', acknowledgedByStudent: false, created_at: today }];
const ranking = [{ rank: 1, userId: '1', nickname: 'UI 검증 학생', score: 620, growthRate: 12.5, targetUniversity: '서울대학교', targetDepartment: '전기정보공학부', isMe: true }, { rank: 2, userId: '2', nickname: '긴 닉네임과 목표를 가진 학생', score: 590, growthRate: 8.3, targetUniversity: '한국과학기술원', targetDepartment: '전기및전자공학부' }];
const arena = { profile: { nickname: 'UI 검증 학생', grade: '고3', targetUniversity: '서울대학교', targetDepartment: '전기정보공학부', targetAdmissionType: '정시', studyGoal: ['수학 조건 검증', '국어 독해'], achievementLevel: '수학 2등급' }, groups: [{ id: 'group1', name: '서울대학교 전기정보공학부 목표 그룹', type: 'university', targetUniversity: '서울대학교', targetDepartment: '전기정보공학부', memberCount: 25, visibility: 'public', joined: true, owner: true, inviteCode: 'UI1234' }], ranking, rivals: [{ ...ranking[1], comparison: [{ label: '학습 실행', mine: 100, rival: 120, unit: '분' }], insight: '조건 검증의 정확도를 높여보세요.' }], achievements: [], season: { id: 'season1', name: '함께 성장하는 14일 학습 시즌', startsAt: date(-5), endsAt: date(8), status: 'active' }, latestScore: null };
const stats = { evidenceCount: 3, archiveCount: 1, wrongAnswerCount: 1, drillCount: 1, derivedCount: 1, appliedCount: 1, failedCount: 1, reinforcedCount: 0, failures7d: 1, failures30d: 2, lastOccurrenceAt: today, lastFailureAt: today, reviewCount: 2, reviewSuccessCount: 1, reviewFailureCount: 1, masteryRate: 0.5 };
const routes = ['/today', '/plan?view=overview', '/plan?view=calendar', '/plan?view=weekly', '/plan?view=monthly', '/plan?view=routine', '/train?view=timer', '/train?view=drill', '/train?view=wrong', '/train?view=notes', '/train?view=resources', '/test', '/insights?view=overview', '/insights?view=performance', '/insights?view=bottlenecks', '/insights?view=review', '/workspace', '/study-room', '/coach', '/feedback', '/arena', '/archive'];
const errors = [], failures = [], metrics = [], statisticsMetrics = [], themeMetrics = [], unknownRequests = new Set();
const production = process.env.UI_CHECK_PRODUCTION === '1';
const vite = production ? await preview({ preview: { host: '127.0.0.1', port, strictPort: true } }) : await createServer({ server: { host: '127.0.0.1', port, strictPort: true } });
if (!production) await vite.listen();
await mkdir(output, { recursive: true });
let browser;
function slug(value) { return value.replace(/^\//, '').replace(/[^a-zA-Z0-9-]/g, '-'); }
async function measure(page, name, width) {
  const result = await page.evaluate(() => {
    const visible = el => { const closed = el.closest('details:not([open])'); if (closed && !closed.querySelector('summary')?.contains(el)) return false; const style = getComputedStyle(el), r = el.getBoundingClientRect(); return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0' && r.width > 0 && r.height > 0; };
    const scrollAncestor = el => { let p = el.parentElement; while (p && p !== document.body) { const style = getComputedStyle(p); if (['auto', 'scroll'].includes(style.overflowX) && p.scrollWidth > p.clientWidth + 2) return true; p = p.parentElement; } return false; };
    const escape = [...document.querySelectorAll('main h1, main h2, main h3, main button, main input, main select, main textarea, [role="dialog"] button, [role="dialog"] input')].filter(visible).filter(el => { const r = el.getBoundingClientRect(); return (r.left < -2 || r.right > innerWidth + 2) && !scrollAncestor(el); }).map(el => ({ tag: el.tagName, className: el.className, text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 90), left: Math.round(el.getBoundingClientRect().left), right: Math.round(el.getBoundingClientRect().right) })).slice(0, 15);
    const clipped = [...document.querySelectorAll('main button, [role="dialog"] button')].filter(visible).filter(el => el.scrollWidth > el.clientWidth + 3 && getComputedStyle(el).overflowX === 'hidden').map(el => ({ className: el.className, text: el.textContent.trim().slice(0, 90), width: el.clientWidth, needed: el.scrollWidth })).slice(0, 15);
    const dialogs = [...document.querySelectorAll('[role="dialog"], dialog[open], .detail-sheet')].filter(visible).map(el => ({ className: el.className, width: el.clientWidth, scrollWidth: el.scrollWidth, height: el.clientHeight, scrollHeight: el.scrollHeight, left: Math.round(el.getBoundingClientRect().left), right: Math.round(el.getBoundingClientRect().right) }));
    const dock = document.querySelector('.mobile-tab-bar');
    return { documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, escape, clipped, dialogs, mobileDockDisplay: dock ? getComputedStyle(dock).display : 'none' };
  });
  metrics.push({ route: name, width, ...result });
  if (result.documentWidth > width + 2 || result.escape.length || result.clipped.length || (width > 1024 && result.mobileDockDisplay !== 'none') || result.dialogs.some(dialog => dialog.scrollWidth > dialog.width + 3 || dialog.left < -2 || dialog.right > width + 2)) {
    failures.push({ route: name, width, ...result });
    console.log('FAIL', width, name, JSON.stringify(result));
    await page.screenshot({ path: resolve(output, `${width}-${slug(name)}.png`), fullPage: true, animations: 'disabled' });
  }
  return result;
}
async function inspectSheet(page, name, width, trigger, close) {
  await trigger.click();
  await page.locator('[role="dialog"], dialog[open], .detail-sheet').filter({ visible: true }).first().waitFor();
  await page.waitForTimeout(80);
  await measure(page, name, width);
  if (await close.count()) await close.click();
  else await page.getByRole('dialog').getByRole('button', { name: /닫기/ }).last().click();
}
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: widths[0], height: 900 }, reducedMotion: 'reduce', colorScheme: 'light' });
  let remote;
  await context.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    let payload;
    if (path === '/api/auth/me') payload = { username: 'UI 검증 학생', userId: 1, mustChangePassword: false };
    else if (path === '/api/sync') { if (request.method() === 'PUT') { remote = request.postDataJSON().data; payload = { ok: true, updatedAt: '2026-10-02T00:00:00.000Z' }; } else payload = { data: remote ?? null, updatedAt: remote ? '2026-10-02T00:00:00.000Z' : null }; }
    else if (path === '/api/sync/history') payload = { history: [] };
    else if (path === '/api/collab/student/feedback') payload = { feedback };
    else if (path === '/api/archive/entries' || path === '/api/archive/review') payload = { entries: [archive], hasMore: false, nextCursor: null };
    else if (path === '/api/archive/rules') payload = { rules: [rule] };
    else if (path === '/api/archive/annotation-colors') payload = { colors: ['blue', 'red'] };
    else if (path === '/api/library/catalog') payload = { resources: fixture.resources };
    else if (/^\/api\/learning-intelligence\/wrong-answers\/.+$/.test(path)) payload = { coreRules: [rule] };
    else if (path === '/api/learning-intelligence/active-rules') payload = { rules: [{ ...rule, priorityScore: 85, status: 'ACTIVE', stats }] };
    else if (/^\/api\/core-rules\/.+\/intelligence$/.test(path)) payload = { coreRule: rule, linkedItems: [archive], wrongAnswers: fixture.wrongAnswerDrills, drills: fixture.dailyDrills, reviews: [], evidence: [], stats, priorityScore: 85, status: 'ACTIVE' };
    else if (path === '/api/learning-intelligence/reviews') payload = { overdue: [], today: [{ id: 'review1', targetType: 'core_rule', subject: 'math', title: rule.title, reason: rule.content, scheduledAt: `${today}T06:00:00+09:00`, priority: 85, notes: '', detail: { content: rule.content } }], upcoming: [], counts: { overdue: 0, today: 1, upcoming: 0 } };
    else if (path === '/api/arena') payload = arena;
    else if (path === '/api/arena/ranking') payload = { ranking };
    else if (path === '/api/arena/recalculate') payload = { ok: true, score: null, achievements: [] };
    else if (path === '/api/study-rooms/media-status') payload = { available: false, configured: false, provider: 'livekit' };
    else if (path.startsWith('/api/ai/')) payload = { message: '오늘은 핵심 조건을 끝까지 확인하고 재현해 보세요.', cached: true };
    else { unknownRequests.add(`${request.method()} ${path}`); payload = { ok: true, entries: [], rules: [], reviews: [], items: [], feedback: [], colors: [] }; }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });
  await context.addInitScript(data => {
    const key = 'trinity-os:data:1:v1'; if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem('trinity-os:cloudflare-sync:v2', JSON.stringify({ url: 'http://127.0.0.1:8789', username: 'UI 검증 학생', userId: 1 }));
    localStorage.setItem('trinity-os:auth-session:v2', JSON.stringify({ token: 'isolated-ui-fixture' }));
    localStorage.setItem('trinity-os:theme-preference', 'light');
  }, fixture);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push({ route: page.url(), message: error.message }));
  page.on('console', message => { if (message.type() === 'error') errors.push({ route: page.url(), message: message.text() }); });
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'networkidle' });
      await page.locator('.page-wrap h1').first().waitFor({ timeout: 20000 });
      await page.locator('.page-loading').waitFor({ state: 'hidden' });
      await measure(page, route, width);
      if ([320, 390, 1440].includes(width) && ['/today', '/plan?view=calendar', '/plan?view=weekly', '/train?view=timer', '/arena'].includes(route)) await page.screenshot({ path: resolve(output, `${width}-${slug(route)}.png`), fullPage: true, animations: 'disabled' });
      if (route === '/plan?view=calendar') {
        await page.locator('.calendar-grid button.today').click();
        await page.getByRole('dialog').waitFor();
        await measure(page, '/calendar:daily-detail', width);
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        await page.locator('.calendar-grid button.today').click();
        await page.getByRole('button', { name: '일정 편집', exact: true }).click();
        await page.locator('.schedule-modal').waitFor();
        await measure(page, '/calendar:day-editor', width);
        await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click();
      }
      if (route === '/plan?view=weekly') {
        await inspectSheet(page, '/weekly:capability-goal-editor', width, page.locator('.weekly-add-button'), page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }));
        await inspectSheet(page, '/weekly:daily-plan-editor', width, page.locator('.add-day-plan').first(), page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }));
      }
      if (route === '/plan?view=monthly') {
        await page.getByRole('button', { name: '월간 목표', exact: true }).click();
        await measure(page, '/monthly:goal-editor', width);
        await page.locator('.monthly-form').getByRole('button', { name: '취소', exact: true }).click();
      }
      if (route === '/train?view=wrong') {
        for (const name of ['과목별', '출처별', '시간별', '전체']) { await page.locator('.wrong-view-toggle').getByRole('button', { name, exact: true }).click(); await measure(page, `/wrong:${name}`, width); }
        await inspectSheet(page, '/wrong:detail', width, page.locator('.wrong-answer-card').first(), page.getByRole('button', { name: '상세 닫기', exact: true }));
      }
      if (route === '/train?view=resources') {
        await inspectSheet(page, '/resources:add-sheet', width, page.locator('.library-command-actions').getByRole('button', { name: '자료', exact: true }), page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }));
        await page.locator('.library-mode').getByRole('tab', { name: /공용 기출/ }).click();
        await measure(page, '/resources:official', width);
      }
      if (route === '/test') await inspectSheet(page, '/test:score-editor', width, page.getByRole('button', { name: '실모 기록', exact: true }), page.getByRole('button', { name: '실모 기록 닫기', exact: true }));
      if (route === '/insights?view=performance') {
        await page.locator('.insight-tabs').getByRole('button', { name: '30일', exact: true }).click();
        await measure(page, '/performance:30-days', width);
        statisticsMetrics.push({ width, ...await page.evaluate(() => {
          const cell = document.querySelector('.insight-calendar button.has-study'), bar = document.querySelector('.insight-stack[style]:has(i)'), mock = document.querySelector('.mock-performance-table > button');
          const rect = cell?.getBoundingClientRect();
          return { cell: rect ? { width: rect.width, height: rect.height, background: getComputedStyle(cell).backgroundColor } : null, stackHeight: bar?.getBoundingClientRect().height ?? 0, mockDisplay: mock ? getComputedStyle(mock).display : null, mockColumns: mock ? getComputedStyle(mock).gridTemplateColumns : null };
        }) });
        await inspectSheet(page, '/performance:daily-detail', width, page.locator('.insight-calendar button.has-study').first(), page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }));
      }
      if (route === '/insights?view=review') await inspectSheet(page, '/review:detail', width, page.locator('.review-row').first(), page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }));
      if (route === '/coach') await inspectSheet(page, '/coach:chat', width, page.getByRole('button', { name: 'AI에게 상담하기', exact: true }), page.getByRole('button', { name: '상담 닫기', exact: true }));
      if (route === '/feedback') {
        await inspectSheet(page, '/feedback:weekly-draft', width, page.getByRole('button', { name: 'Weekly Goal 확인 · 생성', exact: true }), page.getByRole('dialog').getByRole('button', { name: '취소', exact: true }));
        await inspectSheet(page, '/feedback:daily-draft', width, page.getByRole('button', { name: 'Daily Drill 확인 · 생성', exact: true }), page.getByRole('dialog').getByRole('button', { name: '취소', exact: true }));
      }
      if (route === '/arena') {
        for (const name of ['목표 그룹', '랭킹', '라이벌', '시즌 · 배지', '프로필']) {
          await page.locator('.arena-tabs').getByText(name, { exact: true }).click();
          await measure(page, `${route}:${name}`, width);
        }
      }
      if (route === '/archive') {
        for (const name of ['Core Rules', 'Intelligence', 'Review']) {
          const tab = page.locator('.archive-tabs').getByText(name, { exact: true });
          if (await tab.count()) { await tab.click(); await page.waitForTimeout(100); await measure(page, `${route}:${name}`, width); }
        }
        await page.locator('.archive-tabs').getByText('Archive', { exact: true }).click();
        for (const name of ['시험별', '과목별', '최근 기록']) { await page.getByRole('tab', { name, exact: true }).click(); await measure(page, `/archive:browse-${name}`, width); }
        await inspectSheet(page, '/archive:entry-editor', width, page.getByRole('button', { name: 'Entry', exact: true }), page.locator('.archive-editor > header button'));
      }
    }
    await page.goto(`http://127.0.0.1:${port}/today`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '설정 열기', exact: true }).filter({ visible: true }).click();
    await page.getByRole('dialog', { name: '데이터 및 설정' }).waitFor();
    await measure(page, '/settings', width);
    await page.screenshot({ path: resolve(output, `${width}-settings.png`), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: '설정 닫기', exact: true }).click();
    if (width <= 1024 && await page.getByRole('button', { name: '메뉴 열기', exact: true }).isVisible()) {
      await page.getByRole('button', { name: '메뉴 열기', exact: true }).click();
      await measure(page, '/mobile-menu', width);
      await page.getByRole('button', { name: '메뉴 닫기', exact: true }).click();
    }
    console.log(`CHECKED ${width}px: all student routes, Arena tabs, settings, menu`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`http://127.0.0.1:${port}/today`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '설정 열기', exact: true }).filter({ visible: true }).click();
  await page.getByRole('button', { name: '다크', exact: true }).click();
  await page.getByRole('button', { name: '설정 닫기', exact: true }).click();
  await measure(page, '/today:dark', 390);
  themeMetrics.push(await page.evaluate(() => {
    const button = document.querySelector('.today-hero-actions .primary'), active = document.querySelector('.mobile-tab-bar .active');
    const style = button && getComputedStyle(button);
    return { theme: document.documentElement.dataset.theme, background: getComputedStyle(document.body).backgroundColor, primary: style ? { background: style.backgroundColor, color: style.color, textFillColor: style.webkitTextFillColor } : null, activeDockColor: active ? getComputedStyle(active).color : null };
  }));
  await page.screenshot({ path: resolve(output, '390-today-dark.png'), fullPage: true, animations: 'disabled' });
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ production, widths, routeCount: routes.length, checkCount: metrics.length, failures, errors, statisticsMetrics, themeMetrics, unknownRequests: [...unknownRequests], metrics }, null, 2));
  await browser?.close();
  if (typeof vite.close === 'function') await vite.close();
  else await new Promise(resolve => vite.httpServer.close(resolve));
}
console.log(`RESULT ${metrics.length} checks, ${failures.length} layout failures, ${errors.length} browser errors. ${output}/report.json`);
if (errors.length) console.log(JSON.stringify(errors, null, 2));
if (unknownRequests.size) console.log('Unhandled fixture endpoints:', [...unknownRequests].join(', '));
if (failures.length || errors.length) process.exitCode = 1;
