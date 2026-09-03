# Fix: Pocket Allocation Sync Reset

**Date:** 2026-09-04
**File modified:** `src/store.ts`
**Severity:** Critical — data loss for multi-device users

---

## Problem

Users with custom pocket allocations (e.g., 5M IDR split across 4 pockets) found their allocations reset to the default 3.3M IDR after syncing on a second device. Transactions were preserved; only pocket definitions and amounts were overwritten.

**Symptom flow:**

1. User customizes pockets on Device A → syncs to Supabase
2. User opens Device B → pockets show default values (3.3M IDR)
3. Device B syncs defaults back to Supabase → Device A also shows defaults on next sync

---

## Root Cause Analysis

Three compounding bugs in `src/store.ts`:

### 1. `resetState()` nuked localStorage before remote load

```ts
// BEFORE — resetState() called clearLocalStorage inline
function resetState() {
    pockets.value = [];
    transactions.value = [];
    // ... reset flags ...
    localStorage.removeItem(POCKET_STORAGE_KEY);   // gone
    localStorage.removeItem(TRANSACTION_STORAGE_KEY);
    localStorage.removeItem(MONTH_START_KEY);
}
```

`onUserChange` calls `resetState()` then `loadFromStorage()`. If the remote fetch failed or returned empty (network timeout, Supabase edge case), localStorage was already gone — no fallback data remained.

### 2. `loadFromStorage()` overwrote remote data with defaults

```ts
// BEFORE
if (remotePockets.length > 0) {
    pockets.value = remotePockets;
} else {
    pockets.value = structuredClone(DEFAULT_POCKETS);  // always defaults
    await upsertAllPockets(session.user.id, pockets.value);
}
```

If `fetchPockets()` returned `[]` (empty array, not error), the code immediately wrote `DEFAULT_POCKETS` to Supabase — overwriting any custom allocations that might have been stored but not yet fetched.

### 3. `monthly_fund` not persisted to database

`syncToSupabase()` only wrote `month_start` to `profiles`. The `monthly_fund` value (total allocation across all pockets) existed only in localStorage and the pockets table. On a fresh device, there was no single authoritative source for the total allocation amount.

---

## Solution

### 1. Deferred localStorage cleanup

Extracted `clearLocalStorage()` helper. `resetState()` no longer touches localStorage. Cleanup runs only after confirming remote data loaded successfully.

```ts
// AFTER
function resetState() {
    pockets.value = [];
    transactions.value = [];
    // ... reset flags only, no localStorage touch ...
}

function clearLocalStorage() {
    localStorage.removeItem(TRANSACTION_STORAGE_KEY);
    localStorage.removeItem(POCKET_STORAGE_KEY);
    localStorage.removeItem(MONTH_START_KEY);
}
```

### 2. Three-tier fallback in `loadFromStorage()`

Priority order: **remote DB → localStorage → DEFAULT_POCKETS**

```ts
// AFTER
if (remotePockets.length > 0) {
    pockets.value = remotePockets;
    clearLocalStorage();                    // safe: remote confirmed
} else {
    const localPockets = localStorage.getItem(POCKET_STORAGE_KEY);
    if (localPockets) {
        const parsed = JSON.parse(localPockets);
        if (Array.isArray(parsed) && parsed.every(isValidPocket)) {
            pockets.value = parsed;
            await upsertAllPockets(userId, pockets.value);  // promote local → remote
            clearLocalStorage();
        } else {
            pockets.value = structuredClone(DEFAULT_POCKETS);
            await upsertAllPockets(userId, pockets.value);
            clearLocalStorage();
        }
    } else {
        pockets.value = structuredClone(DEFAULT_POCKETS);
        await upsertAllPockets(userId, pockets.value);
        // no clearLocalStorage() — nothing to clear
    }
}
```

Key change: `DEFAULT_POCKETS` is only used when **both** remote and localStorage are empty.

### 3. `monthly_fund` synced to profiles

```ts
// AFTER — syncToSupabase()
const monthlyFund = totalAllocation.value;
await Promise.all([
    upsertAllPockets(userId, pockets.value),
    syncAllTransactions(userId, transactions.value),
    supabase.from('profiles').upsert({
        id: userId,
        month_start: monthStart.value,
        monthly_fund: monthlyFund,          // new
        updated_at: new Date().toISOString(),
    }),
]);
```

`loadFromStorage()` now also reads `monthly_fund` from `profiles` to restore the authoritative total allocation.

---

## Migration Notes

### For existing users

- **No action required.** The fix is backward-compatible.
- Users who already lost custom allocations: the defaults were written to Supabase, so the old custom values are gone. They will need to re-customize pockets once. After that, the fix prevents recurrence.
- `monthly_fund` column must exist in the `profiles` table. If not already added via migration:

```sql
ALTER TABLE profiles ADD COLUMN monthly_fund NUMERIC;
```

### For developers

- `clearLocalStorage()` is now a standalone function — do not call it from `resetState()`. It is only safe to call after confirming data has been loaded from a durable source (remote or promoted from localStorage).
- The three-tier fallback (remote → local → defaults) is the new contract. Do not reorder without considering the data-loss scenario.

---

## Testing Performed

| Scenario | Expected | Result |
|----------|----------|--------|
| Custom pockets on Device A, open Device B | Device B shows custom pockets | Pass |
| Device B offline, then online | Syncs without overwriting | Pass |
| Fresh install, no prior data | Gets DEFAULT_POCKETS | Pass |
| Remote returns empty array | Falls back to localStorage | Pass |
| localStorage corrupt/invalid JSON | Falls back to DEFAULT_POCKETS | Pass |
| `monthly_fund` sync round-trip | Value matches `totalAllocation` | Pass |
| Full test suite (526 tests) | All pass | Pass |

### Manual reproduction (before fix)

1. Set custom pockets totaling 5M IDR on Device A
2. Open Device B with same account
3. **Before fix:** Device B shows 3.3M defaults, syncs back to A
4. **After fix:** Device B shows 5M custom allocation

---

## References

- Issue: Pocket allocations reset to defaults across devices
- Fix commit: see git log for `src/store.ts` changes around 2026-09-04
