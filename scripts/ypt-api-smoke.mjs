import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const BASE = 'https://pi.tgclab.com';
const SOURCE_COMMIT = 'bf05d2d10626f996a7e8f3eb3e7e85eb26bfdd0e';
const reloadBody = { pv: 0, cd: { su: null, sbu: null, cu: null, eu: null, du: null, tu: null } };
const deviceModel = 'SM-S921N';

export class ProbeError extends Error {
  constructor(code) { super(code); this.name = 'ProbeError'; }
}

// No upstream messages or credentials are included in errors or recorded evidence.
export function createApi(fetcher = fetch, now = Date.now) {
  let jwt;
  return {
    setToken(value) { jwt = value; },
    async post(path, body, authenticated = true) {
      const before = now();
      let response;
      try {
        response = await fetcher(`${BASE}${path}`, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'Dart/3.11 (dart:io)', ...(authenticated && jwt ? { Authorization: `JWT ${jwt}` } : {}) },
          body: JSON.stringify(body),
        });
      } catch { throw new ProbeError('NETWORK_OR_TIMEOUT_OUTCOME_UNKNOWN'); }
      // Read the body within the same timeout; never include it in exception output.
      let data;
      try { data = await response.json(); } catch { throw new ProbeError('INVALID_RESPONSE_OUTCOME_UNKNOWN'); }
      if (!response.ok) throw new ProbeError(`HTTP_${response.status}_OUTCOME_UNKNOWN`);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ProbeError('INVALID_RESPONSE_OUTCOME_UNKNOWN');
      if (data.s !== true) throw new ProbeError('API_REJECTED');
      return { data, elapsedMs: now() - before };
    },
  };
}

function dayLog(data) {
  const value = data?.dl;
  const total = value?.sm;
  const number = typeof total === 'number' ? total : typeof total === 'string' && total.trim() ? Number(total) : NaN;
  if (!Number.isFinite(number) || number < 0 || typeof value?.dt !== 'string' || !value.dt) throw new ProbeError('UNSUPPORTED_DAY_LOG');
  return { studyMs: number, date: value.dt };
}

function subjectTitle(subject) {
  return ['tt', 't', 'title', 'subject', 'subjectName', 'subjectTitle'].map(key => subject?.[key]).find(value => typeof value === 'string' && value.length) ?? '';
}

export async function runProbe(credentials, {
  api = createApi(), now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  persist = async () => {}, progress = () => {},
} = {}) {
  const report = { sourceCommit: SOURCE_COMMIT, startedAt: new Date(now()).toISOString(), passed: false, stage: 'input', segments: [], requests: [], activeStartedAt: null, stopConfirmed: true };
  async function save() { await persist(structuredClone(report)); }
  async function call(path, body, auth = true) {
    const result = await api.post(path, body, auth);
    report.requests.push({ path, elapsedMs: result.elapsedMs, success: true });
    return result.data;
  }
  try {
    if (!credentials.confirmedIdle || !credentials.email?.trim() || !credentials.password || !credentials.subject?.trim()) throw new ProbeError('INPUT_REQUIRED');
    report.stage = 'login'; await save();
    progress('Logging in (credentials and token are never recorded).');
    const login = await call('/user/sign-in-jwt', { email: credentials.email.trim(), password: credentials.password, loginProvider: 'Email', new: true, getx: true, language: 'en' }, false);
    credentials.password = undefined;
    if (typeof login.jwt !== 'string' || !login.jwt) throw new ProbeError('MISSING_JWT');
    api.setToken(login.jwt);
    report.stage = 'subjects';
    const info = await call('/user/v2/reload/info', reloadBody);
    const subjects = Array.isArray(info.ss) ? info.ss : [];
    if (!subjects.some(item => item.dl !== true && subjectTitle(item) === credentials.subject)) throw new ProbeError('SUBJECT_NOT_FOUND');
    const baseline = dayLog(info);
    report.baselineStudyMs = baseline.studyMs;
    report.logDate = baseline.date;
    report.subjectCount = subjects.length;
    // Field names help inspect possible recovery support, without retaining values or profile data.
    report.dayLogFields = Object.keys(info.dl).filter(key => /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(key));
    await save();
    for (let i = 0; i < 2; i++) {
      report.stage = `start_${i + 1}`;
      const startedAt = now();
      report.activeStartedAt = startedAt;
      report.stopConfirmed = false;
      // Preserve the exact stop parameter BEFORE sending any start request.
      await save();
      await call('/study/start', { subject: credentials.subject, deviceModel, taskId: null });
      report.stage = `study_${i + 1}`;
      progress(`Study segment ${i + 1}/2: 30 seconds. Keep this terminal open.`);
      // Always attempt one stop after a confirmed start, even if a local write/wait fails.
      let localFailure;
      try { await save(); await sleep(30_000); } catch { localFailure = true; }
      report.stage = `stop_${i + 1}`;
      const stopRequestedAt = now();
      const stopped = await call('/study/stop', { startedAt, deviceModel });
      report.stopConfirmed = true;
      report.activeStartedAt = null;
      const log = dayLog(stopped);
      if (log.date !== baseline.date) throw new ProbeError('DAY_CHANGED_RERUN_REQUIRED');
      report.segments.push({ measuredMs: stopRequestedAt - startedAt, totalAfterMs: log.studyMs });
      await save();
      if (localFailure) throw new ProbeError('LOCAL_FAILURE_TIMER_STOPPED');
      if (i === 0) {
        report.stage = 'break';
        progress('Break: 10 seconds (must not count as study).');
        await sleep(10_000);
        const afterBreak = dayLog(await call('/user/v2/reload/info', reloadBody));
        report.breakAddedMs = afterBreak.studyMs - log.studyMs;
        if (afterBreak.date !== baseline.date || report.breakAddedMs !== 0) throw new ProbeError('BREAK_OR_DAY_MISMATCH');
      }
    }
    report.stage = 'verify';
    const final = dayLog(await call('/user/v2/reload/info', reloadBody));
    report.recordedMs = final.studyMs - baseline.studyMs;
    report.measuredMs = report.segments.reduce((sum, item) => sum + item.measuredMs, 0);
    report.toleranceMs = 2_000 + report.requests.filter(item => item.path.startsWith('/study/')).reduce((sum, item) => sum + item.elapsedMs, 0);
    let previous = baseline.studyMs;
    const eachSegmentMatches = report.segments.every(item => {
      const delta = item.totalAfterMs - previous; previous = item.totalAfterMs;
      return delta > 0 && Math.abs(delta - item.measuredMs) <= report.toleranceMs;
    });
    report.passed = eachSegmentMatches && final.date === baseline.date && Math.abs(report.recordedMs - report.measuredMs) <= report.toleranceMs && report.breakAddedMs === 0;
    if (!report.passed) throw new ProbeError('RECORDED_TIME_MISMATCH');
    report.stage = 'complete';
    report.recoveryCapability = 'unverified';
  } catch (error) {
    report.error = error instanceof ProbeError ? error.message : 'LOCAL_ERROR';
    report.requiresAppCheck = !report.stopConfirmed;
    // Never retry an ambiguous start/stop automatically.
  } finally {
    credentials.password = undefined;
    api.setToken(undefined);
    await save();
  }
  return report;
}

async function main() {
  const directory = fileURLToPath(new URL('../.ypt-local/', import.meta.url));
  await mkdir(directory, { recursive: true });
  const reportFile = resolve(directory, 'api-probe.json');
  try {
    const previous = JSON.parse(await readFile(reportFile, 'utf8'));
    if (previous.stopConfirmed === false) {
      console.error('Previous probe has an unresolved timer. Check/stop it in the YPT app. Preserve and rename .ypt-local/api-probe.json after resolving it before running another probe.');
      process.exitCode = 1; return;
    }
  } catch (error) { if (error.code !== 'ENOENT') throw new ProbeError('EXISTING_REPORT_UNREADABLE'); }
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 16_384) throw new ProbeError('INPUT_TOO_LARGE');
  }
  let credentials;
  try { credentials = JSON.parse(input.replace(/^\uFEFF/, '')); } catch { throw new ProbeError('INVALID_INPUT'); }
  input = '';
  const report = await runProbe(credentials, {
    progress: message => console.log(message),
    persist: async value => {
      const temporary = `${reportFile}.tmp`;
      await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
      await rename(temporary, reportFile);
    },
  });
  console.log(`Probe ${report.passed ? 'PASSED' : 'FAILED'}; stage=${report.stage}; code=${report.error ?? 'OK'}`);
  console.log('Sanitized evidence: .ypt-local/api-probe.json');
  if (report.requiresAppCheck) console.error('Outcome uncertain. Check/stop the timer in the YPT app. Do not retry automatically.');
  process.exitCode = report.passed ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Probe stopped due to a local error. Check the YPT app and the local report before retrying.'); process.exitCode = 1; });
}
