# TRINITY OS V2 — Product / UI specification

## Product principle

TRINITY is not a dashboard of independent features. It is a learning operating system. The UI must answer four questions in order:

1. **What matters now?** — Today / Next Action
2. **What did I decide to do?** — Monthly / Weekly / Daily Plan
3. **What actually happened?** — Timer / Test / Wrong Answer
4. **What changes next?** — Review / Core Rule / Insights / next Plan

Anything that does not help one of those decisions should be visually subordinate.

## Information hierarchy

### Level A — persistent shell

- Today
- Plan
- Study
- Test
- Insights
- Archive

Secondary utilities:

- Study Room
- Feedback
- Arena
- Schedule
- Settings

### Level B — hubs

Plan: Overview / Monthly / Weekly / Daily / Routine

Study: Focus / Drill / Wrong Answers / Notes / Library

Insights: Overview / Performance / Bottlenecks / Review

### Level C — detail sheets

Editing should happen in a sheet/modal when the user needs context preserved: day edit, wrong-answer detail, resource add, settings, PDF viewer.

## Visual rules

- Background is quiet; primary surfaces are white/dark neutral.
- Accent is reserved for action/state, not decoration.
- Gold/warm is metadata/eyebrow, never body text.
- Borders define structure; shadows are reserved for overlays.
- Radius scale is consistent. No random pill cards.
- A page gets one dominant action, not five primary buttons.
- Metrics use tabular numerals.
- Dense information uses rows before cards.
- Empty states explain the next action.

## Responsive rules

Desktop is not scaled mobile. Mobile changes hierarchy:

- sticky 5-item dock
- sidebar remains available for secondary destinations
- Today hero removes decorative progress ring
- multi-column metrics collapse intentionally
- Weekly Plan becomes day blocks
- Calendar reduces preview density
- sheets become bottom sheets
- PDF viewer becomes edge-to-edge

## Accessibility

- visible focus state
- keyboard-operable segmented controls
- skip link
- semantic tab roles
- minimum 40–44px primary touch targets
- `prefers-reduced-motion`
- no color-only state for achieved/partial/failed

## Data invariants

The redesign must not create a second source of truth.

- Daily Plan = `calendar[date].plans`
- Weekly Plan distributes the same `CalendarPlan` objects across seven dates
- Today reads the same plans
- Library uses `AppData.resources`
- Wrong Answer remains `wrongAnswerDrills`
- Learning Archive / Core Rule remain server-backed canonical data
- legacy `dailyDrills` only migrate into plans
