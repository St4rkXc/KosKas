# Plan: Remove localStorage for Authenticated Users — Supabase as Single Source of Truth

## Overview

Migrate KosKas from a dual-persistence model (localStorage + Supabase) to a Supabase-only model for authenticated users. This eliminates sync conflicts where stale localStorage data overwrites Supabase changes, causing balance resets and allocation reverts.

**Decision:** All users must login. No offline support. Supabase = single source of truth.

---

## Problem Statement

### Bug Report (16 September 2026)

**Timeline:** Last opened 12 Sept → reopened 16 Sept (same month, no month boundary crossed)  
**Symptom:** Balance reset to Rp 3.7M (total allocation), no expense deductions visible. But transaction history still shows expenses.  
**Additional:** User changed `monthly_fund` to 3M directly in Supabase. Opened app, reloaded → Supabase reverted back to 3.7M.

### Root Cause Analysis

#### Bug 1: localStorage overwrites Supabase (data direction is WRONG)

The current `loadFromStorage()` flow for authenticated users:

```
1. Fetch Supabase → if SUCCESS → use remote data → clear localStorage
2. Fetch Supabase → if FAIL → fallback to localStorage → upload localStorage to Supabase
3. Deep watcher fires → persistToStorage() + syncToSupabase()
```

**The problem:** If Supabase fetch fails (network timeout, RLS issue, etc.), the app falls back to stale localStorage data, then immediately syncs that stale data BACK to Supabase, overwriting any manual changes made in the dashboard.

This is exactly what happened:
1. User changed allocations to 3M in Supabase
2. App opened → Supabase fetch may have had a transient issue OR localStorage was loaded first
3. localStorage had 3.7M (old data)
4. Deep watcher synced localStorage (3.7M) back to Supabase
5. Supabase now shows 3.7M again

#### Bug 2: Balance shows 3.7M but history shows expenses

This is caused by `currentMonthTransactions` filtering. The filter uses `timestamp >= monthStart`.

If `monthStart` got set to a date AFTER some transactions (e.g., during a month reset that happened on 12 Sept), transactions from earlier in September would be filtered out of balance calculations but still visible in the history view (which uses `getTransactionsForMonth()` with its own date range logic).

**The disconnect:** History view uses `getMonthStart()/getMonthEnd()` (calendar month boundaries), but `pocketBalances` uses `monthStart` (user-specific budget month start). If these diverge, history shows transactions that balances don't count.

#### Bug 3: `monthly_fund` in profiles is fetched but NEVER used

```typescript
// store.ts:252-256
const { data: profile } = await supabase
    .from('profiles')
    .select('month_start, monthly_fund')  // ← fetches monthly_fund
    .eq('id', session.user.id)
    .single();

if (profile?.month_start && Number.isFinite(profile.month_start)) {
    monthStart.value = profile.month_start;  // ← only uses month_start
    // monthly_fund is IGNORED
}
```

User changes `monthly_fund` in Supabase → app ignores it → allocations come from `pockets` table instead.

---

## Proposed Solution

### Architecture Change

**Before (dual persistence):**
```
User Action → Store → Deep Watcher → persistToStorage() + syncToSupabase()
                                         ↓                      ↓
                                    localStorage            Supabase
                                         ↓
                              (fallback source on load)
```

**After (Supabase-only):**
```
User Action → Store → Deep Watcher → syncToSupabase()
                                         ↓
                                      Supabase (single source of truth)
```

### Key Design Decisions

1. **All users must login** — No unauthenticated/guest mode
2. **Supabase = single source of truth** — All data comes from Supabase
3. **No localStorage for app data** — Remove all localStorage read/write for authenticated users
4. **No offline support** — App requires internet connection
5. **Error handling** — If Supabase fetch fails, show error + retry button, don't load stale data
6. **Loading state** — Show loading indicator while fetching from Supabase

---

## Implementation Plan

### Phase 1: Remove localStorage for Authenticated Users

#### Step 1.1: Update `loadFromStorage()` in `store.ts`

**Current code (lines 192-279):**
```typescript
async function loadFromStorage() {
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
        userId.value = session.user.id;
        syncEnabled.value = true;

        try {
            const [remotePockets, remoteTransactions] = await Promise.all([...]);

            if (remotePockets.length > 0) {
                pockets.value = remotePockets;
                clearLocalStorage();  // ← removes localStorage
            } else {
                // ← FALLBACK: reads from localStorage and uploads to Supabase
                const localPockets = localStorage.getItem(POCKET_STORAGE_KEY);
                if (localPockets) {
                    // parse and upload to Supabase
                } else {
                    pockets.value = structuredClone(DEFAULT_POCKETS);
                    await upsertAllPockets(session.user.id, pockets.value);
                }
            }
            // ... similar for transactions
        } catch (err) {
            console.error('Supabase fetch failed, falling back to localStorage:', err);
            syncFailed.value = true;
            loadFromLocalStorage();  // ← FALLBACK: loads from localStorage
        }
    } else {
        loadFromLocalStorage();  // ← FALLBACK: loads from localStorage
    }

    isLoaded.value = true;
    await checkMonthTransition();
    updateRollovers();
}
```

**New code:**
```typescript
async function loadFromStorage() {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
        // No session — should not happen since auth gate prevents this
        // But handle gracefully
        console.error('No authenticated session found');
        syncFailed.value = true;
        isLoaded.value = true;
        return;
    }

    userId.value = session.user.id;
    syncEnabled.value = true;

    try {
        const [remotePockets, remoteTransactions] = await Promise.all([
            fetchPockets(session.user.id),
            fetchTransactions(session.user.id),
        ]);

        // Use remote data directly — no localStorage fallback
        if (remotePockets.length > 0) {
            pockets.value = remotePockets;
        } else {
            // New user — initialize with default pockets
            pockets.value = structuredClone(DEFAULT_POCKETS);
            await upsertAllPockets(session.user.id, pockets.value);
        }

        transactions.value = remoteTransactions;

        // Fetch profile data
        const { data: profile } = await supabase
            .from('profiles')
            .select('month_start, monthly_fund')
            .eq('id', session.user.id)
            .single();

        if (profile?.month_start && Number.isFinite(profile.month_start)) {
            monthStart.value = profile.month_start;
        } else if (transactions.value.length > 0) {
            const oldestTimestamp = Math.min(...transactions.value.map((t) => t.timestamp));
            monthStart.value = Number.isFinite(oldestTimestamp) ? oldestTimestamp : Date.now();
        } else {
            monthStart.value = Date.now();
        }

        syncFailed.value = false;
    } catch (err) {
        console.error('Supabase fetch failed:', err);
        syncFailed.value = true;
        // Don't load from localStorage — show error instead
        // User can retry by reloading the page
    }

    isLoaded.value = true;
    await checkMonthTransition();
    updateRollovers();
}
```

**Changes:**
- Remove all localStorage fallback logic
- Remove `loadFromLocalStorage()` call in catch block
- Remove `else { loadFromLocalStorage(); }` for unauthenticated users
- If no session, show error (auth gate should prevent this anyway)
- If Supabase fetch fails, set `syncFailed = true` and don't load any data

#### Step 1.2: Remove `persistToStorage()` from deep watcher

**Current code (lines 362-370):**
```typescript
watch(
    [transactions, pockets, monthStart, isLoaded],
    () => {
        if (!isLoaded.value || suppressWatch.value) return;
        persistToStorage();  // ← REMOVE THIS
        syncToSupabase();
    },
    { deep: true },
);
```

**New code:**
```typescript
watch(
    [transactions, pockets, monthStart, isLoaded],
    () => {
        if (!isLoaded.value || suppressWatch.value) return;
        syncToSupabase();  // Only sync to Supabase
    },
    { deep: true },
);
```

#### Step 1.3: Remove `persistToStorage()` call from `updateRollovers()`

**Current code (line 507):**
```typescript
function updateRollovers() {
    // ... rollover logic ...
    persistToStorage();  // ← REMOVE THIS
}
```

**New code:**
```typescript
function updateRollovers() {
    // ... rollover logic ...
    // No persistToStorage() call — deep watcher will trigger syncToSupabase()
}
```

#### Step 1.4: Remove `loadFromLocalStorage()` function

**Current code (lines 86-172):**
```typescript
function loadFromLocalStorage() {
    // ... 86 lines of localStorage loading logic ...
}
```

**Action:** Delete entire function.

#### Step 1.5: Remove `persistToStorage()` function

**Current code (lines 69-79):**
```typescript
function persistToStorage() {
    try {
        localStorage.setItem(TRANSACTION_STORAGE_KEY, JSON.stringify(transactions.value));
        localStorage.setItem(POCKET_STORAGE_KEY, JSON.stringify(pockets.value));
        localStorage.setItem(MONTH_START_KEY, monthStart.value.toString());
        storageFailed.value = false;
    } catch (e) {
        console.warn("Failed to persist state to localStorage:", e);
        storageFailed.value = true;
    }
}
```

**Action:** Delete entire function.

#### Step 1.6: Remove `clearLocalStorage()` function

**Current code (lines 743-747):**
```typescript
function clearLocalStorage() {
    localStorage.removeItem(TRANSACTION_STORAGE_KEY);
    localStorage.removeItem(POCKET_STORAGE_KEY);
    localStorage.removeItem(MONTH_START_KEY);
}
```

**Action:** Delete entire function.

#### Step 1.7: Remove localStorage constants

**Current code (lines 25-32):**
```typescript
const TRANSACTION_STORAGE_KEY = "koskas_transactions";
const POCKET_STORAGE_KEY = "koskas_pockets";
const MONTH_START_KEY = "koskas_month_start";
const ARCHIVE_STORAGE_KEY = "koskas_archives";
```

**Action:** Delete all four constants.

#### Step 1.8: Remove legacy migration constants

**Current code (lines 34-37):**
```typescript
const LEGACY_EXPENSE_KEY = "koskas_expenses";
const LEGACY_BUDGETS_KEY = "koskas_budgets";
```

**Action:** Delete both constants.

#### Step 1.9: Update `onUserChange()` handler

**Current code (lines 749-759):**
```typescript
onUserChange(async (newUserId) => {
    if (newUserId) {
        resetState();
        await loadFromStorage();
    } else {
        resetState();
        loadFromLocalStorage();  // ← REMOVE THIS
        await checkMonthTransition();
        isLoaded.value = true;
    }
});
```

**New code:**
```typescript
onUserChange(async (newUserId) => {
    if (newUserId) {
        resetState();
        await loadFromStorage();
    } else {
        // User signed out — reset state
        // Auth gate will show login screen
        resetState();
        isLoaded.value = true;
    }
});
```

#### Step 1.10: Remove `storageFailed` state

Since we're not writing to localStorage anymore, the `storageFailed` state is no longer needed.

**Current code (line 53):**
```typescript
const storageFailed = ref(false);
```

**Action:** Delete this line.

**Also remove from return statement (line 766):**
```typescript
storageFailed,
```

**Also remove from `resetState()` (line 730):**
```typescript
storageFailed.value = false;
```

#### Step 1.11: Update `resetMonth()` — remove localStorage archive

**Current code (lines 683-717):**
```typescript
async function resetMonth() {
    if (transactions.value.length > 0) {
        const archive = {
            timestamp: Date.now(),
            transactions: JSON.parse(JSON.stringify(transactions.value)),
            pockets: JSON.parse(JSON.stringify(pockets.value)),
            monthStart: monthStart.value,
        };
        try {
            const archives = JSON.parse(localStorage.getItem(ARCHIVE_STORAGE_KEY) || "[]");
            archives.push(archive);
            if (archives.length > 6) archives.splice(0, archives.length - 6);
            localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(archives));
        } catch (e) {
            console.warn("Failed to archive month data:", e);
        }
    }
    transactions.value = [];
    monthStart.value = Date.now();
    if (syncEnabled.value && userId.value) {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await deleteAllTransactionsRemote(userId.value);
                break;
            } catch (e) {
                if (attempt === 2) {
                    console.error("Failed to delete all transactions remotely after 3 attempts:", e);
                } else {
                    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                }
            }
        }
    }
    updateRollovers();
}
```

**New code:**
```typescript
async function resetMonth() {
    transactions.value = [];
    monthStart.value = Date.now();
    
    if (syncEnabled.value && userId.value) {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await deleteAllTransactionsRemote(userId.value);
                break;
            } catch (e) {
                if (attempt === 2) {
                    console.error("Failed to delete all transactions remotely after 3 attempts:", e);
                } else {
                    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                }
            }
        }
    }
    updateRollovers();
}
```

**Changes:**
- Remove localStorage archive logic (lines 684-698)
- Keep the retry logic for `deleteAllTransactionsRemote()`

#### Step 1.12: Update App.vue — remove `storageFailed` banner

**Current code (App.vue lines 404-406):**
```vue
<div v-if="store.storageFailed" class="fixed top-0 left-0 right-0 z-50 bg-neon-danger/20 border-b border-neon-danger px-4 py-2 text-center">
    <span class="text-neon-danger text-xs font-mono">⚠ Storage unavailable — data will be lost when you close this tab</span>
</div>
```

**Action:** Remove this entire div.

**Also update the status bar (App.vue line 414):**
```vue
<span>DISK: 14%</span>
```

**Action:** Remove this line (no longer relevant).

#### Step 1.13: Update App.vue — remove archive reading from `getTransactionsForMonth()`

**Current code (App.vue lines 271-294):**
```typescript
function getTransactionsForMonth(date: Date) {
    const start = getMonthStart(date);
    const end = getMonthEnd(date);
    const active = store.transactions.filter((t) => t.timestamp >= start && t.timestamp <= end);
    if (active.length > 0 || isCurrentMonth(date)) {
        return active;
    }

    try {
        const archives = JSON.parse(localStorage.getItem("koskas_archives") || "[]");
        for (const arch of archives) {
            const archTxs = (arch.transactions || []).filter(
                (t: any) => t.timestamp >= start && t.timestamp <= end
            );
            if (archTxs.length > 0) {
                return archTxs;
            }
        }
    } catch (e) {
        console.warn("Failed to read archives:", e);
    }

    return [];
}
```

**New code:**
```typescript
function getTransactionsForMonth(date: Date) {
    const start = getMonthStart(date);
    const end = getMonthEnd(date);
    return store.transactions.filter((t) => t.timestamp >= start && t.timestamp <= end);
}
```

**Changes:**
- Remove localStorage archive reading logic
- Simplify to just filter transactions by date range

---

### Phase 2: Fix Balance/History Disconnect

#### Step 2.1: Align history view with balance calculation

**Problem:** History view uses calendar month boundaries (`getMonthStart()/getMonthEnd()`), but balance calculation uses `monthStart` (user-specific budget month start).

**Solution:** Use `currentMonthTransactions` from store for history view when showing current month.

**Current code (App.vue lines 271-294):**
```typescript
function getTransactionsForMonth(date: Date) {
    const start = getMonthStart(date);
    const end = getMonthEnd(date);
    return store.transactions.filter((t) => t.timestamp >= start && t.timestamp <= end);
}
```

**New code:**
```typescript
function getTransactionsForMonth(date: Date) {
    // For current month, use store's currentMonthTransactions (filtered by monthStart)
    if (isCurrentMonth(date)) {
        return store.currentMonthTransactions;
    }
    // For other months, use calendar month boundaries
    const start = getMonthStart(date);
    const end = getMonthEnd(date);
    return store.transactions.filter((t) => t.timestamp >= start && t.timestamp <= end);
}
```

**Changes:**
- For current month, use `store.currentMonthTransactions` (same filter as balance calculation)
- For other months, use calendar month boundaries (for performance dashboard navigation)

---

### Phase 3: Fix `monthly_fund` Usage

#### Step 3.1: Decide on `monthly_fund` semantics

**Option A:** Use `monthly_fund` to set total allocation
- When loading from Supabase, use `monthly_fund` to calculate per-pocket allocations
- This requires a mapping of how to distribute `monthly_fund` across pockets

**Option B:** Remove `monthly_fund` from schema
- `monthly_fund` is redundant — total allocation is sum of all pocket allocations
- Document that allocations come from `pockets` table only

**Recommendation:** Option B — remove `monthly_fund` from schema. It's redundant and causes confusion.

#### Step 3.2: Remove `monthly_fund` from `syncToSupabase()`

**Current code (store.ts lines 317-329):**
```typescript
function syncToSupabase() {
    // ...
    const monthlyFund = totalAllocation.value;
    await Promise.all([
        upsertAllPockets(userId.value, pockets.value),
        syncAllTransactions(userId.value, transactions.value),
        supabase
            .from('profiles')
            .upsert({ 
                id: userId.value, 
                month_start: monthStart.value,
                monthly_fund: monthlyFund,  // ← REMOVE THIS
                updated_at: new Date().toISOString() 
            }),
    ]);
}
```

**New code:**
```typescript
function syncToSupabase() {
    // ...
    await Promise.all([
        upsertAllPockets(userId.value, pockets.value),
        syncAllTransactions(userId.value, transactions.value),
        supabase
            .from('profiles')
            .upsert({ 
                id: userId.value, 
                month_start: monthStart.value,
                updated_at: new Date().toISOString() 
            }),
    ]);
}
```

#### Step 3.3: Remove `monthly_fund` from `loadFromStorage()`

**Current code (store.ts lines 252-256):**
```typescript
const { data: profile } = await supabase
    .from('profiles')
    .select('month_start, monthly_fund')  // ← remove monthly_fund
    .eq('id', session.user.id)
    .single();
```

**New code:**
```typescript
const { data: profile } = await supabase
    .from('profiles')
    .select('month_start')
    .eq('id', session.user.id)
    .single();
```

#### Step 3.4: (Optional) Remove `monthly_fund` column from Supabase schema

**SQL migration:**
```sql
ALTER TABLE profiles DROP COLUMN monthly_fund;
```

**Note:** This is a breaking change. If you want to keep the column for future use, skip this step and just don't use it in the app.

---

### Phase 4: Update Tests

#### Step 4.1: Update `store.test.ts`

**Tests that need updating:**

1. **`loadFromStorage` tests (lines 47-100):**
   - Remove tests that check localStorage loading
   - Add tests for Supabase-only loading
   - Add tests for Supabase fetch failure (should show error, not load from localStorage)

2. **`persistToStorage` tests:**
   - Remove all tests for `persistToStorage()`
   - Remove tests that check localStorage is written

3. **`resetMonth` tests:**
   - Remove tests that check localStorage archive is created
   - Keep tests for remote delete retry logic

4. **`storageFailed` tests:**
   - Remove all tests for `storageFailed` state

**Example test update:**

**Before:**
```typescript
it('should load pockets and transactions from localStorage', async () => {
    const testPockets = [...];
    const testTx = [...];
    mockLs.setItem('koskas_pockets', JSON.stringify(testPockets));
    mockLs.setItem('koskas_transactions', JSON.stringify(testTx));
    
    const store = useStore();
    await store.loadFromStorage();
    
    expect(store.pockets).toHaveLength(1);
    expect(store.transactions).toHaveLength(1);
});
```

**After:**
```typescript
it('should load pockets and transactions from Supabase', async () => {
    const testPockets = [...];
    const testTx = [...];
    
    // Mock Supabase responses
    (fetchPockets as any).mockResolvedValueOnce(testPockets);
    (fetchTransactions as any).mockResolvedValueOnce(testTx);
    (supabase.auth.getSession as any).mockResolvedValueOnce({
        data: { session: { user: { id: 'user-123' } } }
    });
    
    const store = useStore();
    await store.loadFromStorage();
    
    expect(store.pockets).toHaveLength(1);
    expect(store.transactions).toHaveLength(1);
});
```

#### Step 4.2: Update `test-setup.ts`

**Changes:**
- Remove localStorage mock (or keep it minimal for unauthenticated tests if we keep that feature)
- Add Supabase mock for authenticated user session

**Current code (lines 42-106):**
```typescript
// Plain localStorage mock (no vi.fn by default)
class MockStorage {
    // ...
}
```

**Action:** Remove entire localStorage mock setup.

#### Step 4.3: Update `components.dev.test.ts` and `components.ux.test.ts`

**Changes:**
- Remove tests that check localStorage behavior
- Remove tests that check `storageFailed` banner
- Update tests to mock Supabase responses instead of localStorage

---

### Phase 5: Update Documentation

#### Step 5.1: Update `ARCHITECTURE.md`

**Sections to update:**

1. **System Overview → Design Decisions table:**
   - Remove row: "Supabase + localStorage — Cloud sync with offline fallback"
   - Add row: "Supabase-only — Single source of truth, no offline support"

2. **Cloud Sync Architecture:**
   - Update "Overview" to reflect Supabase-only model
   - Remove "localStorage as fallback" references
   - Update sync flow diagram

3. **State Management → Persistence Strategy:**
   - Remove localStorage persistence section
   - Update to reflect Supabase-only sync

4. **LocalStorage Schema:**
   - Remove entire section (no longer applicable)

5. **Known Issues & Considerations:**
   - Add entry for this fix

#### Step 5.2: Update `README.md`

**Sections to update:**

1. **Persistent Storage section:**
   - Update to reflect Supabase-only model
   - Remove localStorage references

2. **Known Limitations:**
   - Remove "localStorage overwrite" issue (fixed)
   - Add note about requiring internet connection

3. **Tech Stack:**
   - Update to reflect Supabase-only architecture

---

### Phase 6: Error Handling & UX Improvements

#### Step 6.1: Add loading indicator during Supabase fetch

**Current behavior:** App shows blank screen while fetching from Supabase.

**New behavior:** Show loading spinner with message "Loading your data..."

**Implementation:**
```vue
<!-- App.vue -->
<div v-if="auth.loading || !store.isLoaded" class="min-h-screen flex items-center justify-center">
    <div class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-neon-safe mx-auto"></div>
        <p class="mt-4 text-text-muted font-mono text-sm">Loading your data...</p>
    </div>
</div>
```

#### Step 6.2: Add error UI for Supabase fetch failure

**Current behavior:** If Supabase fetch fails, app shows `syncFailed` banner but still loads (from localStorage).

**New behavior:** If Supabase fetch fails, show error screen with retry button.

**Implementation:**
```vue
<!-- App.vue -->
<div v-else-if="store.syncFailed" class="min-h-screen flex items-center justify-center">
    <div class="text-center max-w-md px-6">
        <div class="text-6xl mb-4">⚠️</div>
        <h2 class="text-text-primary text-xl font-bold mb-2">Failed to load data</h2>
        <p class="text-text-muted mb-6">Could not connect to Supabase. Please check your internet connection and try again.</p>
        <button 
            @click="location.reload()" 
            class="px-6 py-3 bg-neon-safe text-bg-primary font-bold rounded hover:bg-neon-safe/90 transition-colors"
        >
            Retry
        </button>
    </div>
</div>
```

#### Step 6.3: Update `syncFailed` banner

**Current behavior:** Shows amber banner "Supabase sync failed — changes saved locally, retrying automatically"

**New behavior:** Shows red banner "Supabase sync failed — please check your internet connection"

**Implementation:**
```vue
<!-- App.vue -->
<div v-else-if="store.syncFailed" class="fixed top-0 left-0 right-0 z-50 bg-neon-danger/20 border-b border-neon-danger px-4 py-2 text-center">
    <span class="text-neon-danger text-xs font-mono">⚠ Supabase sync failed — please check your internet connection</span>
</div>
```

---

## Edge Cases & Error Handling

### Edge Case 1: New user (no data in Supabase)

**Scenario:** User signs up for the first time. No pockets or transactions in Supabase.

**Handling:**
- `loadFromStorage()` fetches from Supabase → gets empty arrays
- Initializes with `DEFAULT_POCKETS`
- Uploads default pockets to Supabase via `upsertAllPockets()`
- Sets `monthStart = Date.now()`

### Edge Case 2: Supabase fetch fails on first load

**Scenario:** User opens app but Supabase is unreachable.

**Handling:**
- `loadFromStorage()` catches error
- Sets `syncFailed = true`
- Shows error screen with retry button
- User can reload page to retry

### Edge Case 3: Supabase fetch fails after successful load

**Scenario:** User is using app, then loses internet connection.

**Handling:**
- Deep watcher triggers `syncToSupabase()`
- `syncToSupabase()` catches error
- Sets `syncFailed = true`
- Shows red banner "Supabase sync failed"
- When internet reconnects, `online` event triggers retry
- If retry succeeds, clears `syncFailed` flag

### Edge Case 4: User changes data in Supabase dashboard while app is open

**Scenario:** User changes allocation to 3M in Supabase dashboard. App is open in another tab.

**Handling:**
- App doesn't automatically sync from Supabase (no realtime subscription)
- User must reload page to see changes
- On reload, `loadFromStorage()` fetches latest data from Supabase
- App shows updated allocations

**Future enhancement:** Add Supabase realtime subscription to auto-sync changes.

### Edge Case 5: Month boundary crossed while app is closed

**Scenario:** User last opened app on 12 Sept. Opens again on 1 Oct (new month).

**Handling:**
- `loadFromStorage()` fetches data from Supabase
- `checkMonthTransition()` detects old month
- Calls `resetMonth()` → clears transactions, resets `monthStart`
- Balances reset to allocations

**This is expected behavior.**

### Edge Case 6: Month boundary crossed while app is open

**Scenario:** User has app open at 11:59 PM on 30 Sept. Continues using at 12:00 AM on 1 Oct.

**Handling:**
- `visibilitychange` event triggers `checkMonthTransition()`
- Detects old month → calls `resetMonth()`
- Transactions cleared, balances reset

**This is expected behavior.**

---

## Testing Checklist

### Manual Testing

- [ ] Sign up new user → should initialize with default pockets
- [ ] Add expense → should sync to Supabase
- [ ] Change allocation in Supabase dashboard → reload app → should show new allocation
- [ ] Change allocation in app → check Supabase → should show new allocation
- [ ] Open app after month boundary → should reset transactions
- [ ] Lose internet connection → should show error banner
- [ ] Regain internet connection → should retry sync
- [ ] Sign out → should show login screen
- [ ] Sign in → should load data from Supabase

### Automated Testing

- [ ] `loadFromStorage()` with Supabase success → loads remote data
- [ ] `loadFromStorage()` with Supabase failure → sets `syncFailed = true`, doesn't load stale data
- [ ] `loadFromStorage()` with new user → initializes with default pockets
- [ ] Deep watcher triggers `syncToSupabase()` on state change
- [ ] `resetMonth()` clears transactions and deletes remote
- [ ] `resetMonth()` retries remote delete up to 3 times
- [ ] `checkMonthTransition()` triggers reset on month boundary
- [ ] `pocketBalances` filters by `currentMonthTransactions`
- [ ] `getTransactionsForMonth()` uses `currentMonthTransactions` for current month

---

## Migration Guide for Existing Users

### What happens to existing data?

**No migration needed.** Existing data is already in Supabase. The app will continue to use Supabase as the data source.

### What happens to localStorage data?

**It will be ignored.** The app will no longer read from or write to localStorage for authenticated users. Existing localStorage data will remain in the browser but won't be used.

### Can users clear localStorage?

**Yes.** Users can clear localStorage via browser settings. It won't affect the app since localStorage is no longer used.

---

## Rollback Plan

If this change causes issues, we can rollback by:

1. Revert the commit that removes localStorage
2. Redeploy previous version
3. Existing localStorage data will be used as fallback again

---

## Future Enhancements

1. **Supabase Realtime:** Add realtime subscription to auto-sync changes from Supabase dashboard
2. **Offline Support:** Add Service Worker to cache Supabase responses for offline access
3. **Conflict Resolution:** If we add offline support later, add conflict resolution for concurrent edits
4. **Archive Storage:** Move monthly archives to Supabase instead of localStorage

---

## Summary

This plan removes localStorage for authenticated users, making Supabase the single source of truth. This eliminates sync conflicts where stale localStorage data overwrites Supabase changes.

**Key changes:**
1. Remove localStorage read/write for authenticated users
2. Remove localStorage fallback on Supabase fetch failure
3. Remove localStorage archive logic
4. Fix balance/history disconnect by using `currentMonthTransactions` for history view
5. Remove unused `monthly_fund` column usage
6. Add error handling for Supabase fetch failures
7. Update tests and documentation

**Trade-offs:**
- **Pro:** Single source of truth, no sync conflicts, easier to debug
- **Con:** Requires internet connection, no offline support

**Implementation time:** ~2-3 hours
