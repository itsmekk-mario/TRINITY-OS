import { ChevronDown, FileText } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ArchiveEntry } from '../lib/archiveApi';

export type ArchiveBrowseMode = 'recent' | 'exam' | 'subject';
const colors = ['black', 'blue', 'green', 'red'] as const;
const colorNames: Record<string, string> = { black: '검정', blue: '파랑', green: '초록', red: '빨강' };
const subjectNames: Record<string, string> = { korean: '국어', math: '수학', english: '영어' };
const koreanArea = (entry: ArchiveEntry) => {
  const text = `${entry.category} ${entry.subcategory}`.replace(/\s+/g, ' ').trim();
  if (/비문학|독서/.test(text)) return '비문학';
  if (/문학/.test(text)) return '문학';
  if (/화법|작문|화작/.test(text)) return '화법과 작문';
  return text;
};

type Counts = Record<string, number>;
type Group = { id: string; label: string; entries: ArchiveEntry[]; children?: Group[] };

const annotations = (entries: ArchiveEntry[]): Counts => entries.reduce<Counts>((counts, entry) => {
  entry.annotations.forEach(({ color }) => { counts[color] = (counts[color] || 0) + 1; });
  return counts;
}, {});
const reviewLabel = (entry: ArchiveEntry) => {
  if (!entry.reviewEnabled && !entry.coreRules.length) return '';
  if (!entry.nextReviewAt) return 'Review 필요';
  const today = new Date().toISOString().slice(0, 10);
  if (entry.nextReviewAt < today) return 'Overdue';
  if (entry.nextReviewAt === today) return 'Review Today';
  const days = Math.max(0, Math.ceil((new Date(`${entry.nextReviewAt}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000));
  return `Review D+${days}`;
};
const exam = (entry: ArchiveEntry) => {
  const text = entry.examName.trim() || entry.sourceName.trim();
  const organization = entry.institutionCustomName || ({ KICE: '평가원', education_office: '교육청', EBS: 'EBS', private: '사설', textbook: '교재', custom: '기타' }[entry.institution] || entry.institution);
  const year = entry.year ? `${entry.year}학년도` : '';
  const month = entry.month ? `${entry.month}월` : '';
  // The tuple is stable for old free-text data too; display text remains untouched.
  const key = `${entry.year}-${String(entry.month).padStart(2, '0')}-${entry.institution}`;
  return { key, label: text || [year, month, organization].filter(Boolean).join(' ') || '시험 미지정' };
};
const groupBy = (entries: ArchiveEntry[], key: (entry: ArchiveEntry) => { id: string; label: string }) => {
  const map = new Map<string, Group>();
  entries.forEach(entry => { const value = key(entry), group = map.get(value.id) || { id: value.id, label: value.label, entries: [] }; group.entries.push(entry); map.set(value.id, group); });
  return [...map.values()];
};

function CountLine({ entries }: { entries: ArchiveEntry[] }) {
  const counts = annotations(entries);
  return <span className="archive-annotation-summary" aria-label="Annotation 색상 집계">{colors.filter(color => counts[color]).map(color => <span className={`annotation-dot ${color}`} key={color}>● {colorNames[color]} {counts[color]}</span>)}</span>;
}
function EntryCard({ entry, expanded, onToggle }: { entry: ArchiveEntry; expanded: boolean; onToggle: () => void }) {
  const counts = annotations([entry]);
  const segments = colors.filter(color => counts[color]);
  return <article className={`archive-compact-entry ${expanded ? 'expanded' : ''}`}>
    <button className="archive-compact-button" aria-expanded={expanded} onClick={onToggle}>
      <span className="archive-color-strip" aria-label={segments.length ? `Annotation 색상: ${segments.map(c => colorNames[c]).join(', ')}` : 'Annotation 없음'}>{segments.map(color => <i className={color} style={{ flex: counts[color] }} key={color} />)}</span>
      <span className="archive-compact-main"><span className="archive-entry-topline"><FileText size={16} />{exam(entry).label} · {subjectNames[entry.subject]}{entry.questionNumber && ` · ${entry.questionNumber}번`}</span><b>{entry.title}</b><CountLine entries={[entry]} /><small>{entry.coreRules.length ? `Core Rule ${entry.coreRules.length}` : ''}{entry.coreRules.length && (reviewLabel(entry) || entry.wrongAnswerId) ? ' · ' : ''}{reviewLabel(entry)}{(entry.coreRules.length || reviewLabel(entry)) && entry.wrongAnswerId ? ' · ' : ''}{entry.wrongAnswerId ? '오답 연결' : ''}</small></span>
      <ChevronDown className="archive-entry-chevron" size={18} />
    </button>
    {expanded && <div className="archive-entry-expanded-note">상세 분석, Annotation, Core Rule, 문항 정보와 Review를 열었습니다.</div>}
  </article>;
}
function GroupNode({ group, depth, openGroups, setOpenGroups, openEntry, setOpenEntry, onEntry }: { group: Group; depth: number; openGroups: Set<string>; setOpenGroups: (value: Set<string>) => void; openEntry?: string; setOpenEntry: (value?: string) => void; onEntry: (entry: ArchiveEntry) => void }) {
  const opened = openGroups.has(group.id), reviewCount = group.entries.filter(entry => reviewLabel(entry)).length;
  const toggle = () => { const next = new Set(openGroups); opened ? next.delete(group.id) : next.add(group.id); setOpenGroups(next); };
  return <section className={`archive-group depth-${depth}`}>
    <button className="archive-group-header" onClick={toggle} aria-expanded={opened}><ChevronDown size={17} /><span><b>{group.label}</b><small>{group.entries.length} Entries{reviewCount ? ` · Review ${reviewCount}` : ''}</small></span><CountLine entries={group.entries} /></button>
    {opened && <div className="archive-group-content">{group.children?.map(child => <GroupNode key={child.id} group={child} depth={depth + 1} openGroups={openGroups} setOpenGroups={setOpenGroups} openEntry={openEntry} setOpenEntry={setOpenEntry} onEntry={onEntry} />) || group.entries.map(entry => <EntryCard key={entry.id} entry={entry} expanded={openEntry === entry.id} onToggle={() => { const next = openEntry === entry.id ? undefined : entry.id; setOpenEntry(next); if (next) onEntry(entry); }} />)}</div>}
  </section>;
}
export function AnnotationLegend() { return <details className="archive-legend"><summary>색상 의미 ⓘ</summary><div>{colors.map(color => <span key={color}><i className={`annotation-dot ${color}`}>●</i> {colorNames[color]} — Annotation 색상</span>)}</div></details>; }
export default function ArchiveExplorer({ entries, mode, onEntry }: { entries: ArchiveEntry[]; mode: ArchiveBrowseMode; onEntry: (entry: ArchiveEntry) => void }) {
  const groups = useMemo(() => {
    if (mode === 'recent') return groupBy(entries, entry => ({ id: `date:${entry.studiedAt.slice(0, 10)}`, label: entry.studiedAt.slice(0, 10) }));
    if (mode === 'exam') return groupBy(entries, entry => ({ id: `exam:${exam(entry).key}`, label: exam(entry).label })).map(group => ({ ...group, children: groupBy(group.entries, entry => ({ id: `${group.id}:subject:${entry.subject}`, label: subjectNames[entry.subject] })) }));
    return groupBy(entries, entry => ({ id: `subject:${entry.subject}`, label: subjectNames[entry.subject] })).map(group => {
      const area = (entry: ArchiveEntry) => entry.subject === 'korean' ? koreanArea(entry) : entry.subcategory.trim();
      const direct = group.entries.filter(entry => !area(entry));
      const children = groupBy(group.entries.filter(entry => area(entry)), entry => ({ id: `${group.id}:subcategory:${area(entry)}`, label: area(entry) }));
      return children.length ? { ...group, children: direct.length ? [{ id: `${group.id}:direct`, label: '기타 기록', entries: direct }, ...children] : children } : group;
    });
  }, [entries, mode]);
  const [openGroups, setOpenGroups] = useState(() => new Set<string>()), [openEntry, setOpenEntry] = useState<string>();
  const defaultOpen = groups[0]?.id;
  const effectiveOpen = openGroups.size ? openGroups : new Set(defaultOpen ? [defaultOpen] : []);
  return <div className="archive-explorer">{groups.map(group => <GroupNode key={group.id} group={group} depth={0} openGroups={effectiveOpen} setOpenGroups={setOpenGroups} openEntry={openEntry} setOpenEntry={setOpenEntry} onEntry={onEntry} />)}</div>;
}
