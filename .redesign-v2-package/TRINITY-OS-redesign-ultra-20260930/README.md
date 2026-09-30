# TRINITY OS — System Redesign V2

Baseline audited: `main @ ee5259df81553daf02e2a4e61cde71f8c28bbae3` (2026-09-30).

This is **not** a small CSS patch. It is an information-architecture + interaction + visual-system pass that keeps the existing storage/API model intact while rebuilding the surfaces students touch most often.

## What changed

### 1. One learning flow instead of a feature pile

The UI now treats TRINITY as one loop:

`Plan → Study → Wrong Answer → Review → Core Rule → next Plan`

The shell, Today, Plan and Study surfaces all reinforce this sequence. Existing routes and data are preserved.

### 2. Today rebuilt as a command center

`Dashboard.tsx` is replaced, not merely restyled.

- One dominant **Next Action** instead of many equally loud cards.
- Today completion ring.
- Four operational metrics: study time, plan execution, review due, current bottleneck.
- Execution Queue that directly toggles the same CalendarPlan data used by Weekly/Daily Plan.
- Personal schedule and resource deadlines are secondary, not competing with study execution.
- Review + Core Rule are shown as the loop that must be closed after execution.
- Mobile hierarchy is intentionally different from desktop rather than being a shrunk desktop grid.

### 3. Plan rebuilt around Monthly → Weekly → Daily

`PlanHub.tsx` is replaced.

- Overview shows the three planning levels as an explicit hierarchy.
- Monthly = direction.
- Weekly = capability + seven-day execution design.
- Daily = date placement and execution detail.
- Weekly outcome semantics remain `✓ achieved / △ partial / × failed`.
- Existing PlanningPage and CalendarPage business logic remain intact.

### 4. Daily Drill ambiguity removed

`DailyDrillPanel.tsx` is replaced.

The panel explicitly states that the daily execution list is the **same CalendarPlan data** as Weekly Plan. Legacy `dailyDrills` are migrated by the existing `migratePlans` logic, but no second competing planning model is introduced.

### 5. Library is one workspace

`Resources.tsx` and `ResourceLibrary.tsx` are replaced.

Instead of rendering a PDF library and a second resource database below it, the Library workspace owns:

- My Library / Official Past Papers
- search and filters
- PDF upload and viewer
- external source link
- progress and study status
- Timer history
- Wrong Answer count
- Learning Archive / Core Rule links
- Daily Plan insertion
- Wrong Answer creation
- official resource → personal resource import

The data model remains `AppData.resources`.

### 6. Day Index is a real interaction

`DayLabelEditor.tsx` is replaced.

Day type is now a chip control instead of three plain form fields. BUMP / Mock / Review / Recovery / Exam / School / Off / Custom can be read at a glance. The custom label and color remain stored in the existing CalendarEntry fields.

### 7. Learning Graph links are explicit

`PlanLinks.tsx` is replaced.

Weekly capability goal and Resource connections are grouped under a single Learning Graph panel so they no longer look like unrelated select boxes.

### 8. Shell + mobile navigation

`App.tsx` is patched conservatively rather than overwritten.

- Train label → Study.
- Learning Archive → Archive.
- desktop context bar with current section/date and Start Study action.
- sidebar section label.
- skip link and `main-content` landmark.
- mobile bottom dock is capped at five primary actions; Archive remains available in the side menu.
- Beginner Mode behavior remains intact.
- Authentication, sync, backup, settings and CamStudy logic are not replaced.

### 9. Notes is no longer hidden

`TrainHub.tsx` is patched so the already-existing `notes` route / HandwritingNotes screen is visible in the Study segmented navigation.

### 10. Full design system layer

`src/trinity-redesign-v2.css` is intentionally loaded last. It is ~65 KiB and covers:

- shell/sidebar/top context bar
- typography and spacing rhythm
- cards/surfaces/buttons/forms
- Today
- Plan hierarchy
- Daily Plan execution
- Weekly/Monthly plan normalization
- Calendar
- day index
- plan graph links
- Drill/Wrong Answer
- Insights
- Library/PDF viewer
- Learning Archive generic normalization
- Timer
- Login/Auth
- Settings
- tablet / iPad / mobile / 420px layouts
- reduced motion
- print behavior
- focus-visible accessibility

The older CSS files remain in place as compatibility fallback; V2 overrides them last. This is safer than deleting legacy page CSS in one pass.

## Apply in Codespaces

Unzip this package anywhere in the Codespace. Then from the **TRINITY-OS repository root**:

```bash
bash /path/to/TRINITY-OS-redesign-ultra-20260930/apply-build.sh /path/to/TRINITY-OS-redesign-ultra-20260930
```

That command does:

1. `git fetch origin main`
2. `git pull --ff-only origin main`
3. safety backup under `.trinity-redesign-backup/<timestamp>/`
4. apply full redesign
5. static validation
6. `npm ci`
7. `npm run build`
8. print `git diff --stat`

It deliberately does **not** auto-commit or auto-push.

## Deploy

After visually checking the production build:

```bash
bash /path/to/TRINITY-OS-redesign-ultra-20260930/deploy.sh
```

This deploys the root Cloudflare app using the repository's `wrangler.jsonc`. The API worker is unchanged by this UI package and is therefore skipped by default.

Only if worker code was separately changed:

```bash
bash /path/to/TRINITY-OS-redesign-ultra-20260930/deploy.sh --with-worker
```

## Roll back

```bash
bash /path/to/TRINITY-OS-redesign-ultra-20260930/restore-last-redesign-backup.sh
```

Then inspect `git diff`.

## Files intentionally replaced

- `src/pages/Dashboard.tsx`
- `src/pages/PlanHub.tsx`
- `src/pages/DailyDrillPanel.tsx`
- `src/pages/Resources.tsx`
- `src/pages/ResourceLibrary.tsx`
- `src/components/DayLabelEditor.tsx`
- `src/components/PlanLinks.tsx`
- `src/components/navigation/HubLayout.tsx`
- `src/components/navigation/SegmentedControl.tsx`

## Files patched, not replaced

- `src/App.tsx`
- `src/main.tsx`
- `src/pages/TrainHub.tsx`

## Files deliberately not rewritten

Business-critical code such as authentication, Cloudflare sync, storage, Learning Archive API, worker endpoints, LiveKit, problem-image storage, teacher/parent flows and Arena scoring is not rewritten by this package. A UI redesign should not silently mutate those systems.

## Definition of done

Do not call this complete just because `npm run build` passes. Complete the QA checklist in `QA-CHECKLIST.md`, especially iPad Safari, mobile bottom navigation, Calendar modal, PDF upload/view, Wrong Answer, dark mode, Beginner Mode and data persistence after reload.
