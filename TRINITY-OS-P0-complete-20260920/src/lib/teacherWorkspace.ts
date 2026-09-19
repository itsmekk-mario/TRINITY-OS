import type { ActiveCoreRule, ArchiveEntry, MasteryStatus } from './archiveApi';

export type TeacherArchiveSort='newest'|'oldest'|'mastery'|'source'|'category';
export type TeacherCoreRuleSort='priority'|'recent_failure'|'failures'|'recent_use'|'lowest_mastery'|'title';

const text=(value:unknown)=>String(value??'').toLocaleLowerCase();
const date=(value:string|null|undefined)=>Date.parse(value??'')||0;
const masteryOrder:Record<MasteryStatus,number>={input:0,understanding:1,reproduction:2,automated:3};

export function filterAndSortTeacherArchive(entries:ArchiveEntry[],options:{query:string;source:string;category:string;mastery:string;from:string;to:string;sort:TeacherArchiveSort}){
  const query=text(options.query);
  return entries.filter(entry=>{
    const searchable=[entry.title,entry.examName,entry.sourceName,entry.questionNumber,entry.category,entry.subcategory,entry.memo].map(text).join(' ');
    return (!query||searchable.includes(query))&&(!options.source||`${entry.examName} ${entry.sourceName}`===options.source)&&(!options.category||entry.category===options.category)&&(!options.mastery||entry.masteryStatus===options.mastery)&&(!options.from||entry.studiedAt>=options.from)&&(!options.to||entry.studiedAt<=options.to);
  }).slice().sort((a,b)=>options.sort==='oldest'?date(a.studiedAt)-date(b.studiedAt):options.sort==='mastery'?masteryOrder[a.masteryStatus]-masteryOrder[b.masteryStatus]||date(b.studiedAt)-date(a.studiedAt):options.sort==='source'?`${a.examName} ${a.sourceName}`.localeCompare(`${b.examName} ${b.sourceName}`):options.sort==='category'?`${a.category} ${a.subcategory}`.localeCompare(`${b.category} ${b.subcategory}`):date(b.studiedAt)-date(a.studiedAt));
}

export function filterAndSortTeacherCoreRules(rules:ActiveCoreRule[],options:{query:string;status:string;mastery:string;sort:TeacherCoreRuleSort}){
  const query=text(options.query);
  return rules.filter(rule=>(!options.status||rule.status===options.status)&&(!options.mastery||rule.masteryStatus===options.mastery)&&(!query||[rule.title,rule.content,...rule.tags].map(text).join(' ').includes(query))).slice().sort((a,b)=>options.sort==='recent_failure'?date(b.stats.lastFailureAt)-date(a.stats.lastFailureAt)||b.priorityScore-a.priorityScore:options.sort==='failures'?b.stats.failures30d-a.stats.failures30d||b.stats.failures7d-a.stats.failures7d||b.priorityScore-a.priorityScore:options.sort==='recent_use'?date(b.stats.lastOccurrenceAt)-date(a.stats.lastOccurrenceAt):options.sort==='lowest_mastery'?(a.stats.masteryRate??-1)-(b.stats.masteryRate??-1):options.sort==='title'?a.title.localeCompare(b.title):b.priorityScore-a.priorityScore);
}
