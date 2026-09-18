import { loadCloudflareConfig } from './cloudflare';
export type ArchiveSubject='korean'|'math'|'english';
export type MasteryStatus='input'|'understanding'|'reproduction'|'automated';
export type Annotation={id:string;archiveEntryId:string;color:string;type:string;text:string;order:number};
export type RuleRelation='derived'|'applied'|'failed'|'reinforced';
export type CoreRule={id:string;subject:ArchiveSubject;title:string;content:string;tags:string[];masteryStatus:MasteryStatus;usageCount:number;wrongAnswerCount?:number;relationType?:RuleRelation};
export type RuleLink={archiveEntryId:string;coreRuleId:string;relationType?:RuleRelation;createdAt?:string};
export type Review={id:string;archiveEntryId:string;reviewedAt:string;success:boolean;coreRuleRevealed:boolean;nextDueAt?:string|null;createdAt:string};
export type WrongAnswerLink={archiveEntryId:string;wrongAnswerId:string;createdAt?:string};
export type CoreRuleWrongAnswerLink={coreRuleId:string;wrongAnswerId:string;relationType:RuleRelation;createdAt?:string};
export type ArchiveEntry={id:string;subject:ArchiveSubject;year:number;month:number;institution:string;institutionCustomName?:string;examName:string;sourceName:string;questionNumber:string;category:string;subcategory:string;title:string;studiedAt:string;masteryStatus:MasteryStatus;memo:string;conditionSummary?:string;firstThought?:string;representation?:string;solutionFlow?:string;bottleneck?:string;transfer?:string;mainIdea?:string;structureSummary?:string;keyExpression?:string;reviewEnabled:boolean;wrongAnswerId?:string|null;nextReviewAt?:string;reviewBucket?:'today'|'overdue'|'upcoming';annotations:Annotation[];coreRules:CoreRule[]};
export type ArchivePage={entries:ArchiveEntry[];nextCursor:string|null;hasMore:boolean};
export type LearningReview={id:string;targetType:'wrong_answer'|'core_rule'|'drill'|'learning_item';targetId:string;reviewType:string;scheduledAt?:string|null;reviewedAt?:string|null;result:'pending'|'success'|'fail';notes:string;createdAt:string;updatedAt:string};
export type LearningArchiveBackup={entries:ArchiveEntry[];annotations:Annotation[];coreRules:CoreRule[];ruleLinks:RuleLink[];reviews:Review[];wrongAnswerLinks:WrongAnswerLink[];coreRuleWrongAnswerLinks?:CoreRuleWrongAnswerLink[];coreRuleDrillLinks?:{coreRuleId:string;drillId:string;createdAt?:string}[];learningReviews?:LearningReview[];reviewSettings:{intervals:number[]}};
export async function archiveApi<T>(path:string,method='GET',body?:unknown):Promise<T>{const config=loadCloudflareConfig();if(!config.url||!config.token)throw new Error('다시 로그인해 주세요.');const response=await fetch(`${config.url.replace(/\/+$/,'')}${path}`,{method,headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await response.json() as T&{error?:string};if(!response.ok)throw new Error(value.error||`요청 실패 (${response.status})`);return value;}

export async function archiveAllEntries(path='/api/archive/entries',params=new URLSearchParams()):Promise<ArchiveEntry[]>{
 const all:ArchiveEntry[]=[];let cursor:string|undefined;
 for(let page=0;page<100;page++){
  const query=new URLSearchParams(params);query.set('limit','200');if(cursor)query.set('cursor',cursor);
  const response=await archiveApi<ArchivePage>(`${path}?${query.toString()}`);
  all.push(...response.entries);
  if(!response.hasMore||!response.nextCursor)return all;
  cursor=response.nextCursor;
 }
 throw new Error('Archive pagination exceeded the safety limit.');
}
