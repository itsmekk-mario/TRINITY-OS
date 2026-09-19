import type { Feedback } from "../../lib/feedback";
import type { DateRange, TeacherData } from "../../lib/teacherAnalytics";
import type { Subject } from "../../types";
import type { FeedbackDraft, FeedbackPatch } from "./shared";
export type TeacherDashboardProps = {
  data: TeacherData;
  range: DateRange;
  subject: Subject;
  feedback: Feedback[];
  busy: boolean;
  canFeedback: boolean;
  onFeedback: (draft: FeedbackDraft) => Promise<void>;
  onEditFeedback?: (item: Feedback, patch: FeedbackPatch) => Promise<void>;
  onDeleteFeedback?: (item: Feedback) => Promise<void>;
  onSignalAction: (
    item: Feedback,
    action: "weekly" | "daily" | "resolved" | "dismissed",
  ) => void;
};
