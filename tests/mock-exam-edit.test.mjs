import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/pages/ScoreTracker.tsx', import.meta.url), 'utf8');

test('mock exam records expose an edit action', () => {
  assert.match(source, /Pencil/);
  assert.match(source, /aria-label="실모 분석 수정"/);
  assert.match(source, /startEdit\(score\)/);
});

test('editing a mock exam preserves the existing score id', () => {
  assert.match(source, /id:\s*draft\.id\s*\|\|\s*uid\(\)/);
  assert.match(source, /value\.scores\.map\(\(entry\)\s*=>\s*entry\.id\s*===\s*draft\.id\s*\?\s*normalized\s*:\s*entry\)/);
});

test('edit modal loads all existing subject reviews and overall review', () => {
  assert.match(source, /editableScore/);
  assert.match(source, /reviewOf\(entry, '국어'\)/);
  assert.match(source, /reviewOf\(entry, '수학'\)/);
  assert.match(source, /reviewOf\(entry, '영어'\)/);
  assert.match(source, /실모 분석 수정/);
  assert.match(source, /수정 내용 저장/);
});
