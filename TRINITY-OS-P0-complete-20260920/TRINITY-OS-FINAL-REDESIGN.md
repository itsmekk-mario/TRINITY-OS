# TRINITY OS — Final Learning OS Redesign

## Information Architecture

1. HOME — today's action and focus start
2. PLAN — monthly goal → weekly capability → today's action
3. STUDY — focused timer + practice mode
4. REVIEW — Journal + Plaire + Trinity + Daily/Weekly Drill + mock review in one flow
5. DATA — growth analysis + mock exam analytics

## Preserved data

No existing AppData fields are removed or reset. Existing LocalStorage / Cloudflare sync data remains compatible. Notion, Calendar, Resource Database and legacy pages remain in the codebase but are no longer exposed as primary navigation items.

## Apply

```bash
cd /workspaces/TRINITY-OS
git stash push -u -m "before-final-learning-os"
git fetch origin main
git switch main
git pull --rebase origin main
unzip -o TRINITY-OS-final-learning-os.zip
npm run build
git add src
git commit -m "Redesign TRINITY OS into five learning OS areas"
git push origin main
```

If the ZIP was uploaded through GitHub and is already committed to `main`, the `git pull --rebase origin main` step is what brings it into the existing Codespace.

## Important

- Worker redeploy is not required for this UI-only redesign.
- Do not delete LocalStorage or the Cloudflare D1 database.
- Do not replace `wrangler.toml` or `SYNC_TOKEN`.
