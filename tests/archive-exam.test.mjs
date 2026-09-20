import assert from 'node:assert/strict';
import test from 'node:test';
import { compareArchiveEntries, compareArchiveExams, normalizeArchiveExam, normalizeExamText } from '../src/lib/archiveExam.ts';

const entry = (overrides = {}) => ({ id: 'id', subject: 'math', year: 2027, month: 9, institution: 'KICE', institutionCustomName: '', examName: '', sourceName: '', questionNumber: '', studiedAt: '2026-09-01T00:00:00.000Z', ...overrides });

test('KICE aliases with matching structured metadata share one canonical exam group', () => {
  const aliases = ['2027학년도 9월 평가원', '2027 9월 평가원', '27학년도 9평', '9월 모평'].map(examName => normalizeArchiveExam(entry({ examName })));
  assert.equal(new Set(aliases.map(exam => exam.groupKey)).size, 1);
  assert.deepEqual(new Set(aliases.map(exam => exam.displayName)), new Set(['2027학년도 9월 평가원']));
  assert.equal(normalizeExamText('27학년도 9평'), '9월 평가원');
});

test('exam groups use academic-year and exam chronology rather than study time', () => {
  const exams = [
    entry({ year: 2027, month: 3, institution: 'education_office', examName: '3월 교육청' }),
    entry({ year: 2026, month: 11, examName: '수능', studiedAt: '2030-01-01T00:00:00.000Z' }),
    entry({ year: 2027, month: 6, examName: '6월 평가원' }),
    entry({ year: 2027, month: 9, examName: '9월 평가원' }),
    entry({ year: 2027, month: 1, examName: '수능' }),
  ].map(normalizeArchiveExam).sort(compareArchiveExams);
  assert.deepEqual(exams.map(exam => exam.displayName), ['2027학년도 수능', '2027학년도 9월 평가원', '2027학년도 6월 평가원', '2027학년도 3월 교육청', '2026학년도 수능']);
});

test('private exams remain distinct, KICE does not merge with private, and 수능 is November', () => {
  const kice = normalizeArchiveExam(entry({ examName: '9월 평가원' }));
  const kangK = normalizeArchiveExam(entry({ institution: 'private', examName: '강K' }));
  const survival = normalizeArchiveExam(entry({ institution: 'private', examName: '서바이벌' }));
  const suneung = normalizeArchiveExam(entry({ month: 6, examName: '2027 수능' }));
  assert.notEqual(kice.groupKey, kangK.groupKey);
  assert.notEqual(kangK.groupKey, survival.groupKey);
  assert.equal(suneung.month, 11);
  assert.equal(suneung.displayName, '2027학년도 수능');
});

test('entries sort by subject, numeric question number, then study time and unspecified exams are last', () => {
  const questions = ['10', '2', '21', '9'].map(questionNumber => entry({ questionNumber }));
  assert.deepEqual(questions.sort(compareArchiveEntries).map(item => item.questionNumber), ['2', '9', '10', '21']);
  const unspecified = normalizeArchiveExam(entry({ year: 0, month: 0, institution: '', examName: '', sourceName: '' }));
  assert.equal(unspecified.displayName, '시험 미지정');
  assert(compareArchiveExams(normalizeArchiveExam(entry()), unspecified) < 0);
});