# TRINITY OS — Monthly Plan UI patch

Baseline checked from GitHub `main`: `85313ed55bfd29955260100a5b2669bb369e4fa9` (2026-09-30).

## Changed files

- `src/main.tsx`
  - imports `./monthly-plan.css` after the existing global/mobile/theme styles.
- `src/monthly-plan.css`
  - changes the monthly goal area from a fixed 3-column grid to an adaptive 1–2 column layout;
  - lets a single goal use the available content width;
  - restructures each goal visually into objective / success criterion / full-width operating strategy;
  - aligns edit / completion / delete controls in one toolbar;
  - improves Monthly Direction and Weekly Load spacing;
  - includes tablet, mobile, and dark-mode-compatible variable-based styling.

No data model, sync, worker, API, or Learning Graph code is changed.
