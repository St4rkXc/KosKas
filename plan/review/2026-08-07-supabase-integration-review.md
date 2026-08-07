# KosKas Supabase Integration - Code Review

**Review Date:** 2026-08-07  
**Reviewer:** Senior Software Engineer  
**Scope:** Migration from localStorage-only to cloud-synced with Supabase backend  
**Status:** 149/149 tests passing, typecheck clean

---

## Executive Summary

The Supabase integration is **functionally complete** with solid test coverage and a clean migration path from localStorage. However, there are several **critical issues** around memory leaks, performance, and data integrity that must be addressed before production deployment. The implementation follows the plan closely but lacks some error recovery mechanisms mentioned in the architecture.

**Overall Assessment:** ⚠️ **Needs fixes before production** - Critical memory leak and performance issues identified.

---

## 1. Security Review

### ✅ Strengths

1. **Environment Variables Properly Handled**
   - Supabase credentials loaded from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   - `.gitignore` correctly excludes `.env*` files except `.env.example`
   - Validation in `supabase.ts` throws early if credentials are missing

2. **RLS Policies Correctly Configured**
   - All three tables (`profiles`, `pockets`, `transactions`) have RLS enabled
   - Policies enforce `auth.uid() = user_id` for all operations
   - Composite primary keys `(user_id, id)` prevent cross-user ID collisions
   - Default-deny posture: no policies = no access

3. **No Auth Bypass Risks**
   - App gates behind `authUser` check in `App.vue` (line 302)
   - Store checks `session?.user` before enabling sync (line 130)
   - All Supabase queries include `.eq('user_id', userId)` filter

### ⚠️ Issues

#### [WARNING] Anon Key Exposure in Client Bundle

**Location:** `src/lib/supabase.ts:5`

```typescript
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
```

**Issue:** The anon key is embedded in the client-side JavaScript bundle. While this is **by design** in Supabase (the anon key is meant to be public), it means:
- Anyone can inspect the key from browser dev tools
- Rate limiting and abuse protection must rely on Supabase project settings
- No additional client-side secret validation is possible

**Recommendation:** This is acceptable for Supabase's security model, but ensure:
- Rate limiting is configured in Supabase dashboard (Authentication → Rate Limits)
- Consider adding Supabase's "Email Confirmations" to prevent spam signups
- Monitor usage in Supabase dashboard for unusual patterns

**Severity:** [INFO] - Expected behavior, not a vulnerability

---

#### [WARNING] No Password Strength Validation

**Location:** `src/composables/useAuth.ts:22-25`

```typescript
async function signUp(email: string, password: string) {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
}
```

**Issue:** No client-side password validation before sending to Supabase. Users can submit weak passwords like "123" or "password".

**Recommendation:** Add client-side validation:

```typescript
async function signUp(email: string, password: string) {
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('Password must contain uppercase, lowercase, and number');
  }
  
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
}
```

**Severity:** [WARNING] - Should fix for better UX and security hygiene

---

#### [SUGGESTION] Consider Adding MFA Support

**Location:** Future enhancement

**Issue:** No multi-factor authentication support. For a personal finance app, MFA would add significant security.

**Recommendation:** Consider adding TOTP-based MFA in a future iteration:

```typescript
async function enableMFA() {
  const { data } = await supabase.auth.mfa.factorEnroll({
    factorType: 'totp',
  });
  // Show QR code to user
}
```

**Severity:** [SUGGESTION] - Nice to have for a finance app

---

## 2. Data Integrity Review

### ✅ Strengths

1. **Optimistic UI Pattern Correctly Implemented**
   - Pinia state updates immediately, sync happens in background
   - User perceives instant response
   - localStorage serves as offline cache

2. **Batch Operations for Efficiency**
   - `syncAllTransactions` batches in groups of 100 (line 103-108)
   - Prevents Supabase payload size limits
   - Sequential error handling per batch

3. **Migration Logic Preserves Data**
   - localStorage data migrated to Supabase on first login (line 150-166)
   - Only clears localStorage after successful sync
   - Validates data with `isValidTransaction` before migration

### 🚨 Critical Issues

#### [CRITICAL] Memory Leak: Duplicate Auth State Listeners

**Location:** `src/composables/useAuth.ts:16-19`

```typescript
async function initAuth() {
  const { data: { session: currentSession } } = await supabase.auth.getSession();
  session.value = currentSession;
  user.value = currentSession?.user ?? null;
  loading.value = false;

  supabase.auth.onAuthStateChange((_event, newSession) => {  // ← Called every time!
    session.value = newSession;
    user.value = newSession?.user ?? null;
  });
}
```

**Issue:** Every call to `initAuth()` registers a **new** `onAuthStateChange` listener. If `initAuth()` is called multiple times (e.g., during HMR, testing, or app remounting), listeners accumulate and never get cleaned up. Each listener updates the same refs, causing:
- Memory leak (listeners never garbage collected)
- Duplicate state updates (performance degradation)
- Potential race conditions

**Fix:** Store the listener subscription and clean it up:

```typescript
import { ref, readonly, onUnmounted } from 'vue';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

const user = ref<User | null>(null);
const session = ref<Session | null>(null);
const loading = ref(true);
let authListener: { data: { subscription: { unsubscribe: () => void } } } | null = null;

export function useAuth() {
  async function initAuth() {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    session.value = currentSession;
    user.value = currentSession?.user ?? null;
    loading.value = false;

    // Clean up previous listener if exists
    if (authListener) {
      authListener.data.subscription.unsubscribe();
    }

    // Register new listener
    authListener = supabase.auth.onAuthStateChange((_event, newSession) => {
      session.value = newSession;
      user.value = newSession?.user ?? null;
    });
  }

  // Cleanup on component unmount (if used in setup)
  onUnmounted(() => {
    if (authListener) {
      authListener.data.subscription.unsubscribe();
      authListener = null;
    }
  });

  // ... rest of the code
}
```

**Severity:** [CRITICAL] - Must fix before production

---

#### [CRITICAL] Aggressive Deep Watcher Causes Excessive Sync Calls

**Location:** `src/store.ts:188-204`

```typescript
watch(
  [transactions, pockets, monthStart, isLoaded],
  async () => {
    if (!isLoaded.value || suppressWatch) return;
    persistToStorage();

    if (syncEnabled.value && userId.value) {
      try {
        await upsertAllPockets(userId.value, pockets.value);
        await syncAllTransactions(userId.value, transactions.value);
      } catch (err) {
        console.warn('Supabase sync failed (offline?):', err);
      }
    }
  },
  { deep: true },  // ← This is the problem
);
```

**Issue:** The `{ deep: true }` option triggers the watcher on **any nested property change**. This means:
- Adding a single expense triggers a full sync of **all pockets** and **all transactions**
- Updating one pocket's allocation syncs everything again
- Rapid user actions (e.g., adjusting allocations) cause sync storms
- Each sync is a network round-trip to Supabase

**Example scenario:**
1. User adds expense → watcher fires → sync all pockets + all transactions
2. Rollover calculation updates a transaction → watcher fires again → sync everything
3. User adjusts pocket allocation → watcher fires → sync everything

For a user with 100 transactions, adding one expense triggers 3 syncs of 100+ records each.

**Fix:** Use specific watchers or debounce:

```typescript
// Option 1: Debounced sync (recommended)
import { watchDebounced } from '@vueuse/core';

watchDebounced(
  [transactions, pockets],
  async () => {
    if (!isLoaded.value || suppressWatch) return;
    persistToStorage();

    if (syncEnabled.value && userId.value) {
      try {
        await Promise.all([
          upsertAllPockets(userId.value, pockets.value),
          syncAllTransactions(userId.value, transactions.value),
        ]);
      } catch (err) {
        console.warn('Supabase sync failed:', err);
      }
    }
  },
  { deep: true, debounce: 1000, maxWait: 5000 }
);

// Separate watcher for monthStart (less frequent changes)
watch(monthStart, async (newMonthStart) => {
  if (!isLoaded.value || !syncEnabled.value || !userId.value) return;
  
  try {
    await supabase
      .from('profiles')
      .update({ month_start: newMonthStart })
      .eq('id', userId.value);
  } catch (err) {
    console.warn('Failed to sync monthStart:', err);
  }
});
```

**Option 2: Granular sync (more complex but more efficient)**

```typescript
// Track what changed and sync only that
watch(transactions, (newTxs, oldTxs) => {
  if (!isLoaded.value || suppressWatch) return;
  
  const added = newTxs.filter(tx => !oldTxs?.some(old => old.id === tx.id));
  const removed = oldTxs?.filter(tx => !newTxs.some(newTx => newTx.id === tx.id)) || [];
  
  // Sync only changes
  Promise.all([
    ...added.map(tx => upsertTransaction(userId.value!, tx)),
    ...removed.map(tx => deleteTransactionRemote(userId.value!, tx.id)),
  ]).catch(err => console.warn('Transaction sync failed:', err));
}, { deep: true });
```

**Severity:** [CRITICAL] - Must fix to prevent excessive API usage and potential rate limiting

---

#### [CRITICAL] suppressWatch Flag Not Reactive and Error-Prone

**Location:** `src/store.ts:28, 245-307`

```typescript
let suppressWatch = false;  // ← Not reactive, module-level variable

function updateRollovers() {
  suppressWatch = true;
  try {
    // ... rollover logic that modifies transactions
  } finally {
    suppressWatch = false;
  }
  persistToStorage();
}
```

**Issue:** 
1. `suppressWatch` is a plain variable, not a Vue ref. If an error occurs during `updateRollovers()` and the `finally` block doesn't execute (e.g., async error, component unmount), the flag stays `true` forever, breaking the watcher.
2. The flag is shared across all store instances (if multiple exist), causing cross-contamination.
3. No protection against re-entrant calls.

**Fix:** Use a reactive ref with proper error handling:

```typescript
const suppressWatch = ref(false);

function updateRollovers() {
  if (suppressWatch.value) return; // Prevent re-entrant calls
  
  suppressWatch.value = true;
  try {
    // ... rollover logic
  } catch (err) {
    console.error('Rollover update failed:', err);
    // Don't re-throw, just log
  } finally {
    // Always reset, even on error
    setTimeout(() => {
      suppressWatch.value = false;
    }, 0);
  }
  persistToStorage();
}
```

**Severity:** [CRITICAL] - Can cause silent data sync failures

---

#### [WARNING] No Validation Before Syncing localStorage Data

**Location:** `src/store.ts:150-156`

```typescript
const localTxs = localStorage.getItem(TRANSACTION_STORAGE_KEY);
if (localTxs) {
  try {
    const parsed = JSON.parse(localTxs);
    if (Array.isArray(parsed) && parsed.every(isValidTransaction)) {
      transactions.value = parsed;
      await syncAllTransactions(session.user.id, transactions.value);  // ← Syncs without validation
    }
  } catch {
    transactions.value = [];
  }
}
```

**Issue:** The code validates with `isValidTransaction` but then syncs to Supabase without checking if the data is **safe** to sync. For example:
- Transactions with `fromPocketId` referencing non-existent pockets
- Transactions with negative amounts (though `isValidTransaction` checks `Number.isFinite`)
- Rollover transactions with invalid dates

**Recommendation:** Add a sanitization step before sync:

```typescript
if (Array.isArray(parsed) && parsed.every(isValidTransaction)) {
  // Sanitize before sync
  const sanitized = parsed.map(tx => ({
    ...tx,
    amount: Math.abs(tx.amount), // Ensure positive
    timestamp: Math.floor(tx.timestamp), // Ensure integer
  }));
  transactions.value = sanitized;
  await syncAllTransactions(session.user.id, transactions.value);
}
```

**Severity:** [WARNING] - Should fix to prevent data corruption

---

### ⚠️ Warnings

#### [WARNING] No Retry Mechanism for Failed Syncs

**Location:** `src/store.ts:195-200`

```typescript
if (syncEnabled.value && userId.value) {
  try {
    await upsertAllPockets(userId.value, pockets.value);
    await syncAllTransactions(userId.value, transactions.value);
  } catch (err) {
    console.warn('Supabase sync failed (offline?):', err);  // ← Just logs, no retry
  }
}
```

**Issue:** The plan mentions an "offline queue" for failed writes (Phase 4, line 188), but it's not implemented. If sync fails:
- Data is lost (not persisted to cloud)
- User is not notified
- No automatic retry when connection restores

**Recommendation:** Implement a simple retry queue:

```typescript
const syncQueue = ref<Array<{ type: 'pockets' | 'transactions', data: unknown }>>([]);

async function syncWithRetry() {
  if (!syncEnabled.value || !userId.value) return;
  
  try {
    await Promise.all([
      upsertAllPockets(userId.value, pockets.value),
      syncAllTransactions(userId.value, transactions.value),
    ]);
    syncQueue.value = []; // Clear queue on success
  } catch (err) {
    console.warn('Sync failed, queueing for retry:', err);
    syncQueue.value.push({
      type: 'pockets',
      data: pockets.value,
    });
    syncQueue.value.push({
      type: 'transactions',
      data: transactions.value,
    });
    
    // Retry after 5 seconds
    setTimeout(syncWithRetry, 5000);
  }
}

// Retry on reconnect
window.addEventListener('online', syncWithRetry);
```

**Severity:** [WARNING] - Should fix for data durability

---

#### [WARNING] Sequential Sync Operations

**Location:** `src/store.ts:196-197`

```typescript
await upsertAllPockets(userId.value, pockets.value);
await syncAllTransactions(userId.value, transactions.value);
```

**Issue:** Pockets and transactions are synced sequentially. If pockets sync takes 500ms and transactions takes 1000ms, total time is 1500ms. These operations are independent and can run in parallel.

**Fix:**

```typescript
await Promise.all([
  upsertAllPockets(userId.value, pockets.value),
  syncAllTransactions(userId.value, transactions.value),
]);
```

**Severity:** [WARNING] - Performance improvement

---

#### [WARNING] monthStart Not Synced to Supabase

**Location:** `src/store.ts:175, 188-204`

```typescript
// Load from Supabase
monthStart.value = profile?.month_start ?? Date.now();

// Watcher syncs pockets and transactions, but NOT monthStart
watch(
  [transactions, pockets, monthStart, isLoaded],  // ← monthStart is watched
  async () => {
    // ... syncs pockets and transactions
    // But doesn't sync monthStart!
  }
);
```

**Issue:** `monthStart` is loaded from the `profiles` table but never synced back. When the user resets the month (line 444: `monthStart.value = Date.now()`), the change is not persisted to Supabase.

**Fix:** Add monthStart sync to the watcher:

```typescript
watch(
  [transactions, pockets, monthStart, isLoaded],
  async () => {
    if (!isLoaded.value || suppressWatch) return;
    persistToStorage();

    if (syncEnabled.value && userId.value) {
      try {
        await Promise.all([
          upsertAllPockets(userId.value, pockets.value),
          syncAllTransactions(userId.value, transactions.value),
          supabase
            .from('profiles')
            .update({ month_start: monthStart.value })
            .eq('id', userId.value),
        ]);
      } catch (err) {
        console.warn('Sync failed:', err);
      }
    }
  },
  { deep: true }
);
```

**Severity:** [WARNING] - Data loss for monthStart

---

## 3. Error Handling Review

### ✅ Strengths

1. **Graceful Fallback to localStorage**
   - If Supabase fetch fails, falls back to localStorage (line 176-178)
   - User can still use app offline

2. **Error Logging**
   - All errors are logged with `console.error` or `console.warn`
   - Helps with debugging

3. **Auth Error Surfacing**
   - Auth errors displayed to user in `App.vue` (line 321)

### ⚠️ Issues

#### [WARNING] No User Feedback on Sync Failure

**Location:** `src/store.ts:199`

```typescript
} catch (err) {
  console.warn('Supabase sync failed (offline?):', err);  // ← Only console warning
}
```

**Issue:** When sync fails, the user sees no indication. They might think their data is synced when it's not.

**Recommendation:** Add a UI indicator:

```typescript
const syncFailed = ref(false);

// In watcher
if (syncEnabled.value && userId.value) {
  try {
    await Promise.all([...]);
    syncFailed.value = false;
  } catch (err) {
    console.warn('Sync failed:', err);
    syncFailed.value = true;
  }
}

// Expose from store
return {
  // ...
  syncFailed,
};
```

Then in `App.vue`:

```vue
<div v-if="store.syncFailed" class="fixed top-0 left-0 right-0 z-50 bg-neon-warn/20 border-b border-neon-warn px-4 py-2 text-center">
  <span class="text-neon-warn text-xs font-mono">⚠ Sync failed — data saved locally, will retry when online</span>
</div>
```

**Severity:** [WARNING] - Should fix for user awareness

---

#### [WARNING] Generic Auth Error Messages

**Location:** `src/App.vue:48-50`

```typescript
} catch (e: unknown) {
  authError.value = e instanceof Error ? e.message : 'Auth failed';
}
```

**Issue:** Supabase auth errors are not always `Error` instances. They can be plain objects with a `message` property. Also, error messages like "Invalid login credentials" are not user-friendly.

**Fix:**

```typescript
} catch (e: any) {
  const message = e?.message || 'Authentication failed';
  
  // Map to user-friendly messages
  if (message.includes('Invalid login credentials')) {
    authError.value = 'Invalid email or password';
  } else if (message.includes('Email not confirmed')) {
    authError.value = 'Please confirm your email address';
  } else if (message.includes('User already registered')) {
    authError.value = 'An account with this email already exists';
  } else {
    authError.value = message;
  }
}
```

**Severity:** [WARNING] - UX improvement

---

#### [SUGGESTION] No Loading State During Sync

**Location:** `src/App.vue:363`

```vue
<div v-else-if="!store.isLoaded" class="min-h-screen bg-bg-primary text-text-primary"></div>
```

**Issue:** After initial load, there's no loading indicator during sync operations. If sync is slow (e.g., large dataset), user might think app is frozen.

**Recommendation:** Add a sync loading indicator:

```typescript
// In store
const isSyncing = ref(false);

// In watcher
if (syncEnabled.value && userId.value) {
  isSyncing.value = true;
  try {
    await Promise.all([...]);
  } finally {
    isSyncing.value = false;
  }
}
```

```vue
<!-- In App.vue header -->
<div v-if="store.isSyncing" class="text-neon-safe text-xs animate-pulse">
  Syncing...
</div>
```

**Severity:** [SUGGESTION] - Nice to have

---

## 4. Performance Review

### ✅ Strengths

1. **Batch Sync for Large Datasets**
   - `syncAllTransactions` batches in groups of 100
   - Prevents Supabase payload limits

2. **Optimistic UI**
   - User sees instant feedback
   - Sync happens in background

3. **Computed Properties for Derived State**
   - `pocketBalances`, `totalAllocation`, `totalRemaining` are computed
   - Automatic caching and reactivity

### 🚨 Critical Issues

#### [CRITICAL] Deep Watcher on Large Arrays

**Location:** `src/store.ts:188-204`

**Issue:** As mentioned in Section 2, the deep watcher on `transactions` and `pockets` arrays triggers on **any nested property change**. For a user with:
- 500 transactions
- 10 pockets

Every expense addition triggers:
1. Deep comparison of 500 transactions (O(n) complexity)
2. Full sync of 500 transactions to Supabase
3. localStorage serialization of 500 transactions

This is extremely inefficient.

**Fix:** See Section 2 for debouncing or granular sync solutions.

**Severity:** [CRITICAL] - Performance bottleneck

---

#### [WARNING] No Pagination for Initial Load

**Location:** `src/services/sync.ts:15-24`

```typescript
export async function fetchTransactions(userId: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapRowToTransaction);
}
```

**Issue:** Fetches **all** transactions for the user. For a long-time user with thousands of transactions, this is slow and memory-intensive.

**Recommendation:** Paginate or limit to recent transactions:

```typescript
export async function fetchTransactions(userId: string, limit = 1000): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(mapRowToTransaction);
}
```

Or implement pagination with lazy loading:

```typescript
export async function fetchTransactionsPage(
  userId: string,
  page: number,
  pageSize = 100
): Promise<{ data: Transaction[], hasMore: boolean }> {
  const from = page * pageSize;
  const to = from + pageSize - 1;
  
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .range(from, to);

  if (error) throw error;
  
  return {
    data: (data ?? []).map(mapRowToTransaction),
    hasMore: (data?.length ?? 0) === pageSize,
  };
}
```

**Severity:** [WARNING] - Performance degradation for long-time users

---

#### [WARNING] Redundant localStorage Writes

**Location:** `src/store.ts:192, 308`

```typescript
// In watcher
persistToStorage();

// In updateRollovers
persistToStorage();
```

**Issue:** `persistToStorage()` is called in both the watcher and at the end of `updateRollovers()`. Since `updateRollovers()` modifies `transactions`, it triggers the watcher, which calls `persistToStorage()` again. This results in duplicate writes.

**Fix:** Remove the explicit call in `updateRollovers()`:

```typescript
function updateRollovers() {
  suppressWatch.value = true;
  try {
    // ... rollover logic
  } finally {
    suppressWatch.value = false;
  }
  // Remove: persistToStorage(); // Watcher will handle it
}
```

Wait, but `suppressWatch` prevents the watcher from firing. So the explicit call is necessary. But we can optimize:

```typescript
function updateRollovers() {
  suppressWatch.value = true;
  try {
    // ... rollover logic
  } finally {
    suppressWatch.value = false;
  }
  persistToStorage(); // Only write once, not via watcher
}
```

Actually, the current code is correct. The issue is that `suppressWatch` prevents the watcher, so we need the explicit call. No change needed.

**Severity:** [INFO] - Not an issue after analysis

---

### ⚠️ Warnings

#### [WARNING] Inefficient Balance Calculation

**Location:** `src/store.ts:206-219`

```typescript
const pocketBalances = computed(() => {
  const balances: Record<string, number> = {};
  for (const p of pockets.value) balances[p.id] = p.allocation;

  for (const t of transactions.value) {
    if (t.type === "expense" && t.fromPocketId && t.fromPocketId in balances) {
      balances[t.fromPocketId] -= t.amount;
    } else if (t.type === "transfer") {
      if (t.fromPocketId && t.fromPocketId in balances) balances[t.fromPocketId] -= t.amount;
      if (t.toPocketId && t.toPocketId in balances) balances[t.toPocketId] += t.amount;
    }
  }
  return balances;
});
```

**Issue:** Recalculates all balances on every transaction change. For 500 transactions, this is O(n) on every change.

**Recommendation:** This is acceptable for now (500 iterations is fast), but if performance becomes an issue, consider:
- Maintaining a running balance map
- Only recalculating affected pockets

**Severity:** [SUGGESTION] - Optimize only if needed

---

## 5. Code Quality Review

### ✅ Strengths

1. **Clean Separation of Concerns**
   - `supabase.ts` - Client initialization
   - `useAuth.ts` - Auth logic
   - `sync.ts` - Data sync
   - `store.ts` - State management

2. **TypeScript Types**
   - Proper use of `Pocket`, `Transaction` types
   - Type-safe Supabase queries

3. **Vue Reactivity Patterns**
   - Correct use of `ref`, `computed`, `watch`
   - Readonly refs for auth state

4. **Test Coverage**
   - 149 tests passing
   - Comprehensive coverage of edge cases

### ⚠️ Issues

#### [WARNING] Type Safety in sync.ts

**Location:** `src/services/sync.ts:111-134`

```typescript
function mapRowToPocket(row: Record<string, unknown>): Pocket {
  return {
    id: row.id as string,
    name: row.name as string,
    allocation: Number(row.allocation),
    colorClass: row.color_class as string,
    icon: row.icon as string,
    isSystem: row.is_system as boolean,
  };
}
```

**Issue:** Using `Record<string, unknown>` and type assertions (`as string`) is less safe than using Supabase's generated types. If the database schema changes, TypeScript won't catch it.

**Recommendation:** Use Supabase's type generation:

```bash
npx supabase gen types typescript --project-id your-project-id > src/types/supabase.ts
```

Then:

```typescript
import type { Database } from '@/types/supabase';

type PocketRow = Database['public']['Tables']['pockets']['Row'];

function mapRowToPocket(row: PocketRow): Pocket {
  return {
    id: row.id,
    name: row.name,
    allocation: Number(row.allocation),
    colorClass: row.color_class,
    icon: row.icon,
    isSystem: row.is_system ?? false,
  };
}
```

**Severity:** [WARNING] - Type safety improvement

---

#### [WARNING] Hardcoded Batch Size

**Location:** `src/services/sync.ts:103`

```typescript
const BATCH_SIZE = 100;
```

**Issue:** Batch size is hardcoded. Different environments might need different sizes (e.g., testing might want smaller batches).

**Recommendation:** Make it configurable:

```typescript
export async function syncAllTransactions(
  userId: string,
  txs: Transaction[],
  batchSize = 100
): Promise<void> {
  const rows = txs.map(tx => ({ /* ... */ }));

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from('transactions').upsert(batch);
    if (error) throw error;
  }
}
```

**Severity:** [SUGGESTION] - Flexibility improvement

---

#### [SUGGESTION] Missing Error Context in Logs

**Location:** `src/store.ts:177, 199`

```typescript
console.error('Supabase fetch failed, falling back to localStorage:', err);
console.warn('Supabase sync failed (offline?):', err);
```

**Issue:** Error logs don't include context like `userId`, operation type, or data size. Makes debugging harder.

**Recommendation:**

```typescript
console.error('Supabase fetch failed', {
  userId: session.user.id,
  operation: 'loadFromStorage',
  error: err,
});
```

**Severity:** [SUGGESTION] - Debugging improvement

---

## 6. Testing Review

### ✅ Strengths

1. **Comprehensive Test Coverage**
   - 149 tests covering all major functionality
   - Edge cases tested (corrupt data, missing fields, etc.)

2. **Proper Mocking**
   - Supabase client mocked in `test-setup.ts`
   - localStorage mocked with `MockStorage` class

3. **Async Flow Tested**
   - Tests await `loadFromStorage()` correctly
   - Watcher behavior tested

### ⚠️ Issues

#### [WARNING] Mock Doesn't Test Real Supabase Behavior

**Location:** `src/test-setup.ts:3-17`

```typescript
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null }),
        }),
      }),
    }),
  },
}));
```

**Issue:** The mock always returns `session: null`, so the Supabase code path in `loadFromStorage()` is never tested. Tests only cover the localStorage fallback.

**Recommendation:** Add tests for the authenticated path:

```typescript
it('should load from Supabase when authenticated', async () => {
  // Override mock for this test
  const mockSession = { user: { id: 'test-user-id' } };
  vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
    data: { session: mockSession },
  });
  
  vi.mocked(fetchPockets).mockResolvedValueOnce([/* mock pockets */]);
  vi.mocked(fetchTransactions).mockResolvedValueOnce([/* mock transactions */]);
  
  const store = useStore();
  await store.loadFromStorage();
  
  expect(fetchPockets).toHaveBeenCalledWith('test-user-id');
  expect(store.syncEnabled).toBe(true);
});
```

**Severity:** [WARNING] - Test coverage gap

---

#### [WARNING] No Integration Tests

**Issue:** All tests are unit tests with mocks. No integration tests verify:
- Real Supabase queries work
- RLS policies are correct
- Auth flow works end-to-end

**Recommendation:** Add integration tests (can be manual or automated):

```typescript
// integration/supabase.test.ts
import { createClient } from '@supabase/supabase-js';

describe('Supabase Integration', () => {
  it('should enforce RLS policies', async () => {
    const supabase = createClient(url, anonKey);
    
    // Try to query without auth - should fail
    const { data, error } = await supabase.from('pockets').select('*');
    expect(error).toBeDefined();
    expect(data).toBeNull();
  });
});
```

**Severity:** [WARNING] - Test coverage gap

---

#### [SUGGESTION] Test Memory Leak Fix

**Location:** `src/composables/useAuth.ts`

**Issue:** After fixing the memory leak (Section 2), add a test to verify:

```typescript
it('should not register duplicate auth listeners', async () => {
  const { initAuth } = useAuth();
  
  await initAuth();
  await initAuth(); // Call twice
  
  // Should only have one listener registered
  expect(supabase.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
});
```

**Severity:** [SUGGESTION] - Regression test

---

## 7. Architecture Review

### ✅ Strengths

1. **Follows Plan Closely**
   - All phases implemented as described
   - Schema matches plan

2. **Backward Compatible**
   - localStorage fallback preserves existing functionality
   - Migration path for existing users

3. **Offline-First**
   - App works without internet
   - localStorage serves as cache

### ⚠️ Issues

#### [WARNING] Missing Offline Queue (Mentioned in Plan)

**Location:** Plan Phase 4, line 188

**Issue:** Plan mentions "Offline queue: Failed writes are queued in localStorage and retried on reconnect" but this is not implemented.

**Recommendation:** Implement as described in Section 2.

**Severity:** [WARNING] - Incomplete feature

---

#### [SUGGESTION] No Realtime Sync (Mentioned as Future Work)

**Location:** Plan Phase 6, line 199-203

**Issue:** Plan mentions realtime sync as optional future work. This would enable live multi-device sync.

**Recommendation:** Consider implementing in a future iteration:

```typescript
supabase
  .channel('pockets')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'pockets' }, (payload) => {
    // Update local state
  })
  .subscribe();
```

**Severity:** [SUGGESTION] - Future enhancement

---

## 8. Summary of Issues

### Critical (Must Fix)

1. **Memory leak in `useAuth.ts`** - Duplicate auth state listeners
2. **Aggressive deep watcher** - Causes excessive sync calls
3. **Non-reactive `suppressWatch` flag** - Can break watcher silently

### Warning (Should Fix)

1. No password strength validation
2. No retry mechanism for failed syncs
3. Sequential sync operations (should be parallel)
4. `monthStart` not synced to Supabase
5. No user feedback on sync failure
6. Generic auth error messages
7. No pagination for initial load
8. Type safety in `sync.ts`
9. Mock doesn't test authenticated path
10. No integration tests
11. Missing offline queue (mentioned in plan)

### Suggestion (Nice to Have)

1. Add MFA support
2. Loading state during sync
3. Configurable batch size
4. Error context in logs
5. Realtime sync (future work)

---

## 9. Recommended Action Plan

### Phase 1: Critical Fixes (1-2 hours)

1. Fix memory leak in `useAuth.ts`
2. Debounce or optimize deep watcher
3. Make `suppressWatch` reactive

### Phase 2: Data Integrity (2-3 hours)

1. Sync `monthStart` to Supabase
2. Add retry mechanism for failed syncs
3. Parallelize sync operations
4. Add user feedback on sync failure

### Phase 3: UX Improvements (1-2 hours)

1. Password strength validation
2. User-friendly auth error messages
3. Loading state during sync

### Phase 4: Performance (1-2 hours)

1. Add pagination for initial load
2. Optimize balance calculation (if needed)

### Phase 5: Testing (2-3 hours)

1. Add tests for authenticated path
2. Add integration tests
3. Add regression test for memory leak

**Total estimated effort:** 7-12 hours

---

## 10. Conclusion

The Supabase integration is **well-structured** and **functionally complete**, with solid test coverage and a clean migration path. However, the **critical memory leak** and **performance issues** must be addressed before production deployment.

The implementation follows the plan closely but lacks some error recovery mechanisms (offline queue, retry logic) that were mentioned in the architecture. These should be added for robustness.

**Recommendation:** Fix critical issues (Phase 1) before deploying to production. Address warnings (Phase 2-3) in the next sprint.

**Overall Grade:** B- (Good foundation, needs refinement)
