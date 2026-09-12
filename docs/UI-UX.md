# Learning OS presentation system

## Information architecture

- Today: next planned action → actual execution → one corrective behavior → schedule → optional teacher signal → compact Coach entry.
- Plan / Train / Insights: page identity → segmented navigation → subview. `HubLayout` makes nested `PageHeader` an h2 without removing editing actions.
- Primary navigation stays Today / Plan / Train / Test / Insights.
- Utility navigation is AI Coach / Teacher Feedback / Arena / Workspace. Account settings live with the username/avatar. `/profile` remains an Arena alias; `/arena` is canonical.
- Existing history/query routes and static entrypoints remain supported. Tab selections and per-view scroll positions are retained across utility navigation; back/forward parses the destination view.

## CSS ownership

- `ui-system.css`: shared design tokens, compatibility aliases, shell, hub, Today, motion and responsive rules. Light/dark tokens and Arena's intentional light scope are defined here.
- `ui-polish.css`: legacy feature/component rules; competing root token definitions were removed.
- `styles.css`, `ordering.css`, `timer-enhanced.css`, `team.css`, `auth.css`, `arena.css`: existing base and feature-specific styles. Further selector consolidation remains incremental work.
- Sections are borderless; independent surfaces have subtle borders with no default shadow. Actual clickable feedback and wrong-answer items have explicit button semantics and restrained hover feedback.
- Motion is state-driven. Native Web Animations restart page entry without remounting children; CSS tokens supply duration/easing. View Transitions are progressive enhancement. Reduced motion disables both paths.

## Compatibility and automated validation

No AppData schema, LocalStorage key, backup format, D1 migration, backend API, authentication or learning algorithm changed. Today reuses existing derived analytics and explicit time parsing. Weekly Plan's date range is now bounded to the current week.

`npm test` covers existing security/authentication/authorization/Arena/Coach/study-time behavior, plus actual server-rendered Today empty/populated states, immutability, hub heading order/edit actions, Empty compatibility and static route preservation.

## Manual release checks still required

This environment has no connected browser, so automated server rendering is not visual or interactive browser QA. Before release:

- [ ] Desktop 1440px: all primary/utility screens, density and long titles.
- [ ] Tablet 768 / 1024 / 1180px: narrower sidebar, grids and long segmented labels.
- [ ] Mobile 320 / 390 / 430px: menu, bottom tabs, safe-area content clearance and sheet scrolling.
- [ ] iOS Safari / Android Chrome: dynamic viewport, safe areas and back/forward scroll.
- [ ] Keyboard: arrows/Home/End on segments, focus trap/return and Escape on menu/settings/Coach/optional password dialog.
- [ ] Light / dark / reduced motion: contrast, Arena light scope and instant navigation.
- [ ] Real authenticated sync, JSON backup/restore and all student/teacher/parent portals.

Page-local draft/filter persistence across completely different pages remains the existing behavior; this work does not add a global draft store. WCAG compliance still needs browser-based auditing beyond the improved shared text tokens and focus handling.
