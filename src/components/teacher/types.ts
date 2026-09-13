import type { Feedback } from '../../lib/feedback';
import type { DateRange, TeacherData } from '../../lib/teacherAnalytics';
import type { Subject } from '../../types';
import type { FeedbackDraft } from './shared';
export type TeacherDashboardProps={data:TeacherData;range:DateRange;subject:Subject;feedback:Feedback[];busy:boolean;canFeedback:boolean;onFeedback:(draft:FeedbackDraft)=>Promise<void>;onSignalAction:(item:Feedback,action:'weekly'|'daily'|'resolved'|'dismissed')=>void};
