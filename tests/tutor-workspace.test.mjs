import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const tutor=readFileSync(new URL('../src/components/teacher/TutorWorkspace.tsx',import.meta.url),'utf8');
const portal=readFileSync(new URL('../src/pages/CollaborativePortal.tsx',import.meta.url),'utf8');

test('Tutor workspace is intentionally limited to four surfaces',()=>{
  for(const label of ['오답','Core Rule','Learning Archive','Feedback']) assert.match(tutor,new RegExp(label));
  assert.match(tutor,/useState<Tab>\('feedback'\)/);
});
test('Tutor feedback focuses on lesson attitude',()=>{
  for(const label of ['오늘 관찰한 태도','잘하고 있는 점','다음 수업까지 가져갈 태도','피드백 발송']) assert.match(tutor,new RegExp(label));
});
test('Subject teacher uses the lightweight tutor workspace',()=>{
  assert.match(portal,/role==='subject_teacher'/);
  assert.match(portal,/TutorWorkspace/);
});
test('Tutor archive subject mapping preserves math and never falls back to all subjects',()=>{
  assert.match(tutor,/subject==='국어'\?'korean':subject==='수학'\?'math':subject==='영어'\?'english':null/);
  assert.match(tutor,/filterTutorArchive=.*archiveSubject\?archive\.filter.*:\[\]/);
  assert.match(tutor,/filterTutorArchive\(archive,subject\)/);
});
