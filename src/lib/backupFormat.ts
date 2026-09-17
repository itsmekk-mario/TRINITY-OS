import type {AppData} from '../types';
import type {LearningArchiveBackup} from './archiveApi';

export type BackupV1={version:1;exportedAt?:string;data:AppData};
export type BackupV2={version:2;exportedAt:string;app:AppData;learningArchive:LearningArchiveBackup;metadata:{appVersion:string;archiveSchemaVersion:1|2}};
export type ParsedBackup={version:1|2;app:AppData;learningArchive?:LearningArchiveBackup};

export function parseBackupValue(parsed:unknown,defaults:AppData):ParsedBackup{
 const value=parsed as Record<string,unknown>|null;
 if(value?.version===2){
  const candidate=value.app as Partial<AppData>|undefined,archive=value.learningArchive as LearningArchiveBackup|undefined;
  if(!candidate||!Array.isArray(candidate.sessions)||!Array.isArray(candidate.scores)||!archive||!Array.isArray(archive.entries)||!Array.isArray(archive.coreRules))throw new Error('올바른 TRINITY OS Backup v2가 아닙니다.');
  return {version:2,app:{...defaults,...candidate},learningArchive:archive};
 }
 const candidate=(value?.version===1?value.data:value?.data??value) as Partial<AppData>|undefined;
 if(!candidate||!Array.isArray(candidate.sessions)||!Array.isArray(candidate.scores))throw new Error('올바른 TRINITY OS 백업이 아닙니다.');
 return {version:1,app:{...defaults,...candidate}};
}
