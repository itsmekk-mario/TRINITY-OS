import type { ArchiveEntry } from './archiveApi';

export type NormalizedArchiveExam = { academicYear: number; month: number; institution: string; canonicalName: string; displayName: string; groupKey: string; priority: number };
const institutionLabels: Record<string, string> = { KICE: '평가원', education_office: '교육청', EBS: 'EBS', private: '사설', textbook: '교재', custom: '사용자 지정' };
const institutionPriorities: Record<string, number> = { KICE: 10, education_office: 20, EBS: 30, private: 40, textbook: 50, custom: 60 };
const namedInstitutions = new Set(['private', 'textbook', 'custom', 'EBS']);
const text = (value?: string) => value?.trim() ?? '';
const validMonth = (value: number) => Number.isInteger(value) && value >= 1 && value <= 12 ? value : 0;
const yearLabel = (year: number) => year ? `${year}학년도` : '';
const nameFor = (entry: Pick<ArchiveEntry, 'examName' | 'sourceName'>) => text(entry.examName) || text(entry.sourceName);
export const normalizeExamText = (value: string) => text(value).toLowerCase().replace(/(?:20)?\d{2}\s*\uD559\uB144\uB3C4/g, '').replace(/\s+/g, ' ').replace(/[\u00B7\u318D,._()\[\]{}]/g, '').replace(/(\d{1,2})\s*\uD3C9$/g, '$1\uC6D4 \uD3C9\uAC00\uC6D0').replace(/\uD3C9\uAC00\uC6D0|\uBAA8\uC758\uD3C9\uAC00|\uBAA8\uD3C9/g, '\uD3C9\uAC00\uC6D0').trim();
/** The sole source of Archive 수능 detection and November canonicalization. */
export const isCollegeScholasticAbilityTest = (entry: Pick<ArchiveEntry, 'examName' | 'sourceName'>) => /수능/.test(`${text(entry.examName)} ${text(entry.sourceName)}`);
export const normalizeArchiveExam = (entry: Pick<ArchiveEntry, 'year' | 'month' | 'institution' | 'institutionCustomName' | 'examName' | 'sourceName'>): NormalizedArchiveExam => {
  const academicYear = Number.isInteger(entry.year) && entry.year > 0 ? entry.year : 0;
  const collegeScholasticAbilityTest = isCollegeScholasticAbilityTest(entry);
  const month = collegeScholasticAbilityTest ? 11 : validMonth(entry.month);
  const institution = text(entry.institution) || 'unspecified', customInstitution = text(entry.institutionCustomName), normalizedName = normalizeExamText(nameFor(entry)), institutionLabel = customInstitution || institutionLabels[institution] || institution;
  const genericPrefix = [yearLabel(academicYear), month ? `${month}월` : ''].filter(Boolean).join(' ');
  if (!academicYear && !month && institution === 'unspecified' && !normalizedName) return { academicYear, month, institution, canonicalName: '시험 미지정', displayName: '시험 미지정', groupKey: 'exam:unspecified', priority: 999 };
  let canonicalName: string, displayName: string, groupKey: string;
  if (collegeScholasticAbilityTest) { canonicalName = '수능'; displayName = [yearLabel(academicYear), '수능'].filter(Boolean).join(' '); groupKey = `exam:${academicYear}:${month}:KICE:수능`; }
  else if (institution === 'KICE') { canonicalName = month ? `${month}월 평가원` : '평가원'; displayName = [yearLabel(academicYear), canonicalName].filter(Boolean).join(' '); groupKey = `exam:${academicYear}:${month}:KICE`; }
  else if (institution === 'education_office') { const officeName = customInstitution && normalizeExamText(customInstitution) !== '교육청' ? customInstitution : '교육청'; canonicalName = month ? `${month}월 ${officeName}` : officeName; displayName = [yearLabel(academicYear), canonicalName].filter(Boolean).join(' '); groupKey = `exam:${academicYear}:${month}:education_office:${normalizeExamText(officeName)}`; }
  else { canonicalName = normalizedName || institutionLabel || '시험 미지정'; displayName = [genericPrefix, normalizedName ? nameFor(entry) : institutionLabel].filter(Boolean).join(' ') || '시험 미지정'; groupKey = namedInstitutions.has(institution) ? `exam:${academicYear}:${month}:${institution}:${normalizedName || 'unnamed'}` : `exam:${academicYear}:${month}:${institution}:${normalizedName || normalizeExamText(customInstitution) || 'unnamed'}`; }
  return { academicYear, month, institution, canonicalName, displayName, groupKey, priority: collegeScholasticAbilityTest ? 0 : institutionPriorities[institution] ?? 80 };
};
/** Latest academic year and exam first; unspecified exams always remain last. */
export const compareArchiveExams = (left: NormalizedArchiveExam, right: NormalizedArchiveExam) => (right.academicYear - left.academicYear) || (right.month - left.month) || (left.priority - right.priority) || left.displayName.localeCompare(right.displayName, 'ko');

/**
 * Archive `year` is an academic year, so its examinations are administered in
 * the preceding calendar year. The stored schema has month precision only.
 */
export const archiveExamExecutionMonth = (entry: Pick<ArchiveEntry, 'year' | 'month' | 'institution' | 'institutionCustomName' | 'examName' | 'sourceName'>) => {
  const exam = normalizeArchiveExam(entry);
  return exam.academicYear && exam.month ? `${exam.academicYear - 1}-${String(exam.month).padStart(2, '0')}` : '';
};
const subjectOrder = ['korean', 'math', 'english'];
const questionOrder = (value: string) => { const match = text(value).match(/\d+/); return match ? Number(match[0]) : Number.POSITIVE_INFINITY; };
/** Within one exam: subject, numeric question number, then record time. */
export const compareArchiveEntries = (left: Pick<ArchiveEntry, 'subject' | 'questionNumber' | 'studiedAt' | 'id'>, right: Pick<ArchiveEntry, 'subject' | 'questionNumber' | 'studiedAt' | 'id'>) => ((subjectOrder.indexOf(left.subject) + 1 || 99) - (subjectOrder.indexOf(right.subject) + 1 || 99)) || (questionOrder(left.questionNumber) - questionOrder(right.questionNumber)) || left.questionNumber.localeCompare(right.questionNumber, 'ko', { numeric: true }) || left.studiedAt.localeCompare(right.studiedAt) || left.id.localeCompare(right.id);
