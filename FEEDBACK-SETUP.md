# Teacher feedback collaboration setup

The feedback MVP uses the existing Cloudflare Worker and D1 database. Student learning data remains in the existing `learning_state` payload; teachers receive a permission-filtered projection only.

## Apply the D1 migration

Run this once before deploying the Worker:

```powershell
npx wrangler d1 execute trinity-os-db --remote --config worker/wrangler.toml --file worker/migrations/0002_feedback_collaboration.sql
npx wrangler d1 execute trinity-os-db --remote --config worker/wrangler.toml --file worker/migrations/0003_feedback_context.sql
npx wrangler deploy --config worker/wrangler.toml
```

## Admin workflow

1. Sign in as the student/owner.
2. Open `?portal=owner` and create a shared account with the `subject_teacher` or `academic_manager` role.
3. Open `?portal=admin` and assign that teacher to the student. Subject teachers require a subject; academic managers are all-subject.
4. Teachers use `?portal=teacher` or `?portal=manager` to view their assigned dashboard and send structured feedback.

## Privacy and permission model

- Student owns the primary account and can only read/acknowledge/apply their feedback.
- Subject teachers need an assignment and can only access the assigned subject. Each data group is checked against assignment permissions on the Worker.
- Academic managers need an assignment and receive cross-subject operational summaries.
- The owner acts as the initial admin for account and assignment management.
- `teacher_feedback_audit` retains a snapshot whenever an author edits their own feedback.

Feedback can be applied to the existing `dailyDrills` and `weeklyCapabilityGoals` data structures. The student browser then writes the updated learning state through the existing automatic D1 sync.

`0003_feedback_context.sql` adds an optional context reference (`general`, `mock_exam`, `wrong_answer`, `weekly_goal`, or `subject_progress`). It links a teacher's observation to the viewed record without granting any ability to change that record.
