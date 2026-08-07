# KosKas — Supabase Integration: Step-by-Step Instructions

Follow these instructions in order. Each step is self-contained and verifiable.

---

## Step 1: Create Supabase Project

1. Go to https://supabase.com and sign in (or create an account)
2. Click **New Project**
3. Set:
   - **Name:** `koskas`
   - **Database Password:** (save this somewhere safe)
   - **Region:** Choose closest to you (e.g., `Southeast Asia (Singapore)`)
   - **Pricing Plan:** Free tier is sufficient
4. Wait for project to be ready (~2 minutes)
5. Go to **Project Settings → API** and copy:
   - **Project URL** (e.g., `https://abcxyz.supabase.co`)
   - **anon public key** (starts with `eyJ...`)

### Save credentials

Add to your `.env.local` file:

```env
VITE_SUPABASE_URL="https://abcxyz.supabase.co"
VITE_SUPABASE_ANON_KEY="eyJ..."
```

Update `.env.example` to include these keys (with placeholder values):

```env
VITE_SUPABASE_URL="your-supabase-project-url"
VITE_SUPABASE_ANON_KEY="your-supabase-anon-key"
```

---

## Step 2: Create Database Tables

Go to **Supabase Dashboard → SQL Editor** and run the following SQL:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  monthly_fund BIGINT DEFAULT 0,
  month_start BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pockets table
CREATE TABLE pockets (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  allocation BIGINT NOT NULL DEFAULT 0,
  color_class TEXT NOT NULL,
  icon TEXT NOT NULL,
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

-- Transactions table
CREATE TABLE transactions (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('expense', 'transfer')),
  from_pocket_id TEXT,
  to_pocket_id TEXT,
  amount BIGINT NOT NULL CHECK (amount > 0),
  timestamp BIGINT NOT NULL,
  note TEXT,
  is_rollover BOOLEAN DEFAULT FALSE,
  rollover_date TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_pockets_user ON pockets(user_id);
CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_timestamp ON transactions(user_id, timestamp DESC);
CREATE INDEX idx_transactions_rollover ON transactions(user_id, rollover_date) WHERE is_rollover = true;

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pockets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Pockets policies
CREATE POLICY "pockets_select" ON pockets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "pockets_insert" ON pockets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pockets_update" ON pockets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "pockets_delete" ON pockets FOR DELETE USING (auth.uid() = user_id);

-- Transactions policies
CREATE POLICY "transactions_select" ON transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "transactions_insert" ON transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "transactions_update" ON transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "transactions_delete" ON transactions FOR DELETE USING (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, month_start)
  VALUES (NEW.id, EXTRACT(EPOCH FROM NOW()) * 1000);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### Verify

Run this query to confirm tables exist:

```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
```

You should see: `profiles`, `pockets`, `transactions`

---

## Step 3: Install Supabase Client

```bash
pnpm add @supabase/supabase-js
```

---

## Step 4: Create Supabase Client Module

Create `src/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check .env.local');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

---

## Step 5: Add Auth Composable

Create `src/composables/useAuth.ts`:

```typescript
import { ref, readonly } from 'vue';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

const user = ref<User | null>(null);
const session = ref<Session | null>(null);
const loading = ref(true);

export function useAuth() {
  async function initAuth() {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    session.value = currentSession;
    user.value = currentSession?.user ?? null;
    loading.value = false;

    supabase.auth.onAuthStateChange((_event, newSession) => {
      session.value = newSession;
      user.value = newSession?.user ?? null;
    });
  }

  async function signUp(email: string, password: string) {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  return {
    user: readonly(user),
    session: readonly(session),
    loading: readonly(loading),
    initAuth,
    signUp,
    signIn,
    signOut,
  };
}
```

---

## Step 6: Create Sync Service

Create `src/services/sync.ts`:

```typescript
import { supabase } from '@/lib/supabase';
import type { Pocket, Transaction } from '@/types';

export async function fetchPockets(userId: string): Promise<Pocket[]> {
  const { data, error } = await supabase
    .from('pockets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapRowToPocket);
}

export async function fetchTransactions(userId: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapRowToTransaction);
}

export async function upsertPocket(userId: string, pocket: Pocket) {
  const { error } = await supabase.from('pockets').upsert({
    id: pocket.id,
    user_id: userId,
    name: pocket.name,
    allocation: pocket.allocation,
    color_class: pocket.colorClass,
    icon: pocket.icon,
    is_system: pocket.isSystem ?? false,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function deletePocketRemote(userId: string, pocketId: string) {
  const { error } = await supabase
    .from('pockets')
    .delete()
    .eq('user_id', userId)
    .eq('id', pocketId);
  if (error) throw error;
}

export async function upsertTransaction(userId: string, tx: Transaction) {
  const { error } = await supabase.from('transactions').upsert({
    id: tx.id,
    user_id: userId,
    type: tx.type,
    from_pocket_id: tx.fromPocketId ?? null,
    to_pocket_id: tx.toPocketId ?? null,
    amount: tx.amount,
    timestamp: tx.timestamp,
    note: tx.note ?? null,
    is_rollover: tx.isRollover ?? false,
    rollover_date: tx.rolloverDate ?? null,
  });
  if (error) throw error;
}

export async function deleteTransactionRemote(userId: string, txId: string) {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('user_id', userId)
    .eq('id', txId);
  if (error) throw error;
}

export async function upsertAllPockets(userId: string, pockets: Pocket[]) {
  const rows = pockets.map(p => ({
    id: p.id,
    user_id: userId,
    name: p.name,
    allocation: p.allocation,
    color_class: p.colorClass,
    icon: p.icon,
    is_system: p.isSystem ?? false,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('pockets').upsert(rows);
  if (error) throw error;
}

export async function syncAllTransactions(userId: string, txs: Transaction[]) {
  const rows = txs.map(tx => ({
    id: tx.id,
    user_id: userId,
    type: tx.type,
    from_pocket_id: tx.fromPocketId ?? null,
    to_pocket_id: tx.toPocketId ?? null,
    amount: tx.amount,
    timestamp: tx.timestamp,
    note: tx.note ?? null,
    is_rollover: tx.isRollover ?? false,
    rollover_date: tx.rolloverDate ?? null,
  }));

  const BATCH_SIZE = 100;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('transactions').upsert(batch);
    if (error) throw error;
  }
}

function mapRowToPocket(row: any): Pocket {
  return {
    id: row.id,
    name: row.name,
    allocation: Number(row.allocation),
    colorClass: row.color_class,
    icon: row.icon,
    isSystem: row.is_system,
  };
}

function mapRowToTransaction(row: any): Transaction {
  return {
    id: row.id,
    type: row.type,
    fromPocketId: row.from_pocket_id ?? undefined,
    toPocketId: row.to_pocket_id ?? undefined,
    amount: Number(row.amount),
    timestamp: Number(row.timestamp),
    note: row.note ?? undefined,
    isRollover: row.is_rollover ?? undefined,
    rolloverDate: row.rollover_date ?? undefined,
  };
}
```

---

## Step 7: Modify `src/main.ts`

Initialize auth before mounting the app:

```typescript
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { useAuth } from './composables/useAuth';
import './index.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);

const { initAuth } = useAuth();
initAuth().then(() => {
  app.mount('#root');
});
```

---

## Step 8: Modify `src/store.ts`

### Key changes:

1. Add `syncEnabled` ref to track if Supabase is available
2. Replace `localStorage` reads with Supabase fetches in `loadFromStorage()`
3. Replace `localStorage` writes with Supabase upserts in the deep watcher
4. Keep localStorage as fallback cache

### Modified `loadFromStorage()`:

```typescript
// Add at top of store
import { supabase } from '@/lib/supabase';
import {
  fetchPockets,
  fetchTransactions,
  upsertPocket,
  upsertTransaction,
  deleteTransactionRemote,
  deletePocketRemote,
  upsertAllPockets,
  syncAllTransactions,
} from '@/services/sync';

const syncEnabled = ref(false);
const userId = ref<string | null>(null);

// In loadFromStorage, after getting user from auth:
async function loadFromStorage() {
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.user) {
    userId.value = session.user.id;
    syncEnabled.value = true;

    try {
      const [remotePockets, remoteTransactions] = await Promise.all([
        fetchPockets(session.user.id),
        fetchTransactions(session.user.id),
      ]);

      if (remotePockets.length > 0) {
        pockets.value = remotePockets;
      } else {
        pockets.value = [...DEFAULT_POCKETS];
        await upsertAllPockets(session.user.id, pockets.value);
      }

      if (remoteTransactions.length > 0) {
        transactions.value = remoteTransactions;
      } else {
        // Check localStorage for migration
        const localTxs = localStorage.getItem('koskas_transactions');
        if (localTxs) {
          transactions.value = JSON.parse(localTxs);
          await syncAllTransactions(session.user.id, transactions.value);
          localStorage.removeItem('koskas_transactions');
          localStorage.removeItem('koskas_pockets');
          localStorage.removeItem('koskas_month_start');
        } else {
          transactions.value = [];
        }
      }

      // Load month_start from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('month_start')
        .eq('id', session.user.id)
        .single();

      monthStart.value = profile?.month_start ?? Date.now();

    } catch (err) {
      console.error('Supabase fetch failed, falling back to localStorage:', err);
      loadFromLocalStorage();
    }
  } else {
    loadFromLocalStorage();
  }

  isLoaded.value = true;
  updateRollovers();
}
```

### Modified deep watcher:

```typescript
watch(
  [transactions, pockets, monthStart, isLoaded],
  async () => {
    if (!isLoaded.value) return;

    // Always cache locally as fallback
    try {
      localStorage.setItem('koskas_transactions', JSON.stringify(transactions.value));
      localStorage.setItem('koskas_pockets', JSON.stringify(pockets.value));
      localStorage.setItem('koskas_month_start', monthStart.value.toString());
    } catch {}

    // Sync to Supabase if enabled
    if (syncEnabled.value && userId.value) {
      try {
        await upsertAllPockets(userId.value, pockets.value);
        await syncAllTransactions(userId.value, transactions.value);
      } catch (err) {
        console.warn('Supabase sync failed (offline?):', err);
      }
    }
  },
  { deep: true }
);
```

---

## Step 9: Add Auth UI to App.vue

Add a login gate before the main dashboard:

```vue
<template>
  <!-- Show auth screen if not logged in -->
  <div v-if="!authUser && !authLoading" class="min-h-screen bg-bg-primary flex items-center justify-center p-4">
    <div class="bg-bg-surface p-8 rounded-sm w-full max-w-sm space-y-6">
      <h1 class="font-mono text-2xl text-text-primary font-bold text-center">KosKas</h1>
      <p class="text-text-muted text-sm text-center">Sign in to sync your data</p>

      <div class="space-y-3">
        <input
          v-model="email"
          type="email"
          placeholder="Email"
          class="w-full bg-bg-primary border border-[#2A2A2A] rounded-sm px-4 py-3 text-text-primary focus:outline-none focus:border-neon-safe"
        />
        <input
          v-model="password"
          type="password"
          placeholder="Password"
          class="w-full bg-bg-primary border border-[#2A2A2A] rounded-sm px-4 py-3 text-text-primary focus:outline-none focus:border-neon-safe"
        />
        <p v-if="authError" class="text-neon-danger text-xs">{{ authError }}</p>
      </div>

      <div class="flex gap-3">
        <button
          @click="handleSignIn"
          class="flex-1 bg-neon-safe text-bg-primary py-3 rounded-sm font-bold hover:opacity-90 transition-opacity"
        >
          Sign In
        </button>
        <button
          @click="handleSignUp"
          class="flex-1 bg-[#1E1E1E] text-text-primary py-3 rounded-sm font-bold hover:bg-[#2A2A2A] transition-colors"
        >
          Sign Up
        </button>
      </div>
    </div>
  </div>

  <!-- Existing app UI (shown when logged in or loading) -->
  <div v-else-if="authLoading" class="min-h-screen bg-bg-primary" />
  <div v-else>
    <!-- ... existing App.vue template ... -->
  </div>
</template>
```

In `<script setup>`:

```typescript
import { useAuth } from '@/composables/useAuth';
import { ref } from 'vue';

const { user: authUser, loading: authLoading, signIn, signUp, signOut } = useAuth();
const email = ref('');
const password = ref('');
const authError = ref('');

async function handleSignIn() {
  authError.value = '';
  try { await signIn(email.value, password.value); }
  catch (e: any) { authError.value = e.message; }
}

async function handleSignUp() {
  authError.value = '';
  try { await signUp(email.value, password.value); }
  catch (e: any) { authError.value = e.message; }
}
```

Add a sign-out button in the header area:

```vue
<button @click="signOut" class="text-text-muted hover:text-neon-danger text-xs">
  Sign Out
</button>
```

---

## Step 10: Test the Integration

### Local dev test:

```bash
pnpm dev
```

1. Open http://localhost:3000
2. You should see the login screen
3. Sign up with an email/password
4. Check Supabase Dashboard → Authentication → Users — user should appear
5. Check Supabase Dashboard → Table Editor → pockets — default pockets should appear
6. Add an expense, check transactions table in Supabase
7. Open the app in another browser/incognito — log in with same credentials — data should sync

### Offline test:

1. Disconnect from internet
2. Add an expense (should work via optimistic UI)
3. Reconnect — data should sync to Supabase

### Type check:

```bash
pnpm lint
```

---

## Step 11: Verify RLS Security

In Supabase SQL Editor, test that RLS blocks cross-user access:

```sql
-- This should return 0 rows (you're not authenticated in SQL editor by default)
SET ROLE anon;
SELECT * FROM pockets;
SELECT * FROM transactions;

-- Reset
RESET ROLE;
```

---

## Rollback Instructions

If anything goes wrong:

1. The app still works with localStorage when not logged in
2. To fully revert: remove Supabase imports from `store.ts`, restore original `loadFromStorage()` and deep watcher
3. Drop Supabase tables: `DROP TABLE transactions; DROP TABLE pockets; DROP TABLE profiles;`
4. Run `pnpm remove @supabase/supabase-js`
