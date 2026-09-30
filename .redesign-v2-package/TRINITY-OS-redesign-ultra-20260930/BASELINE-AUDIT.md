# Baseline audit — main ee5259d

The redesign was prepared against the 2026-09-30 `main` snapshot, commit `ee5259df81553daf02e2a4e61cde71f8c28bbae3`.

## Existing architecture retained

- React + TypeScript + Vite.
- Student shell routes: Today, Plan, Train, Test, Insights, Learning Archive, Study Room, Feedback, Arena, Schedule.
- Theme preference: system / light / dark.
- Beginner Mode.
- account/session validation and auto sync.
- Cloudflare backup/restore.
- Learning Archive / Core Rule APIs.
- Study Room / LiveKit.
- Resource Library worker endpoints.
- problem image storage.

## Problems found in the current UI structure

1. `main.tsx` loads many independent CSS layers (`styles`, `ordering`, `auth`, `timer-enhanced`, `ui-polish`, `ui-system`, `math-record`, `teacher`, `homeroom`, `study-room`, `theme-dark`, `mobile`, `monthly-plan`, `plan-library`). This makes cross-page visual consistency fragile.
2. Plan already has Monthly / Weekly / Daily semantics, but those semantics are not visually obvious from the Overview.
3. `DailyDrillPanel` is functionally a thin CalendarPlan mirror, but its presentation looks like a separate feature. That increases source-of-truth confusion.
4. `TrainView` contains a `notes` route and renders `HandwritingNotes`, while the visible tab array omits Notes.
5. Resources currently renders `ResourceLibrary` and then a separate `RESOURCE DATABASE`, creating two overlapping resource-management experiences on one page.
6. Today is operationally important but mixes execution, personal schedule, resources, review and core rules without one sufficiently dominant next action hierarchy.
7. Calendar has Day Index data already, but the current editor is plain form controls rather than a fast visual classification interaction.
8. Mobile primary navigation can become too dense when every desktop primary route is mirrored into the bottom bar.

## Redesign response

The V2 package fixes those issues without replacing backend/auth/sync/storage logic. It uses one final design-system override layer plus targeted component replacement where information architecture, not just color, needed to change.
