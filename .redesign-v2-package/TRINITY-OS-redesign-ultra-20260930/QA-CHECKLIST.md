# TRINITY OS V2 — QA checklist

## Build gate

- [ ] `node scripts/validate-redesign-v2.mjs`
- [ ] `npm run build`
- [ ] no TypeScript errors
- [ ] no Vite warnings caused by the redesign
- [ ] inspect `git diff --stat`

## Desktop

- [ ] Sidebar active state is correct on every route
- [ ] desktop context bar stays readable while scrolling
- [ ] Today Next Action opens Timer or Plan correctly
- [ ] Today task toggle persists after reload/sync
- [ ] Plan Overview → Monthly/Weekly/Daily navigation works
- [ ] Weekly ✓/△/× still updates CalendarPlan outcome
- [ ] Calendar day modal saves and closes
- [ ] BUMP label/color remains visible after reload
- [ ] Study Notes tab opens HandwritingNotes
- [ ] Wrong Answer detail sheet opens/closes
- [ ] Library search/filter/selection works
- [ ] official resource can be added to My Library once
- [ ] PDF upload rejects >20MB
- [ ] PDF viewer opens/closes and object URL is released
- [ ] Library → Daily Plan creates a plan on selected date
- [ ] Library → Wrong Answer creates linked wrong answer
- [ ] Archive/Core Rule link action remains functional

## iPad / tablet

- [ ] 1024px landscape: no horizontal page overflow
- [ ] 820px portrait: Today columns collapse cleanly
- [ ] Calendar cells remain tappable
- [ ] Weekly Plan actions do not overlap text
- [ ] settings sheet fits viewport
- [ ] software keyboard does not cover active input where possible
- [ ] PDF viewer is usable in Safari

## Mobile

- [ ] bottom dock contains exactly five primary destinations
- [ ] side menu still exposes Archive and utilities
- [ ] no content hidden behind bottom dock
- [ ] segmented controls horizontally scroll if needed
- [ ] Today Next Action remains first-screen visible
- [ ] Weekly Plan is readable without horizontal scrolling
- [ ] Calendar preview density is reduced
- [ ] modal/sheet opens from bottom and can close
- [ ] Library list/detail are usable sequentially

## Themes

- [ ] Light mode: no navy legacy text on dark/neutral surfaces
- [ ] Dark mode: cards, inputs, sheets and calendar have correct contrast
- [ ] System theme follows OS change
- [ ] theme-color updates correctly

## Beginner Mode

- [ ] hidden destinations stay hidden
- [ ] switching on Beginner Mode redirects unsupported current page to Today
- [ ] Plan/Study/Insights default subviews reset correctly
- [ ] data remains unchanged when mode toggles

## Regression / data safety

- [ ] login still works
- [ ] auto-login/session validation still works
- [ ] Cloudflare sync still works
- [ ] backup export works
- [ ] backup restore preview works
- [ ] data survives hard reload
- [ ] Study Room still works
- [ ] Teacher Feedback still works
- [ ] Arena still works
- [ ] no worker deployment was required for UI-only patch
