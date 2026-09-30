# TRINITY OS sync conflict fix

- Auto-sync baseline is now tab-scoped (`sessionStorage`), so a stale tab cannot inherit another tab's latest revision.
- Auto PUT uses `expectedUpdatedAt` optimistic concurrency. Stale writes return HTTP 409 instead of replacing `learning_state`.
- If both local and remote changed, auto-sync stops instead of choosing a winner.
- Automatic server downloads save a local recovery copy before replacing visible state.
- Manual ‘device → server’ remains an explicit force operation after its confirmation prompt; D1 history still stores the previous state.
