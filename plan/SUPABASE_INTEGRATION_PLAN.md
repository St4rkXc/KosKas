# KosKas — Supabase Integration Plan

## Overview

Migrate KosKas from a localStorage-only SPA to a cloud-synced application using Supabase as the backend. This enables multi-device sync, user authentication, and data persistence across browsers while preserving the existing offline-first UX.

---

## Goals

1. Add user authentication (email/password + OAuth)
2. Sync pockets, transactions, and settings to Supabase Postgres
3. Preserve offline functionality with background sync
4. Enable multi-device data access
5. Maintain backward compatibility for existing localStorage users (one-time migration)

---

## Database Schema

### Table: `profiles`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, references auth.users | One-to-one with Supabase auth user |
| display_name | text | nullable | Optional user display name |
| monthly_fund | bigint | default 0 | Total monthly income |
| month_start | bigint | not null | Unix timestamp (ms) of current month start |
| created_at | timestamptz | default now() | |
| updated_at | timestamptz | default now() | |

### Table: `pockets`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK | e.g. "pangan", "pocket_x7k2" |
| user_id | uuid | FK → profiles.id, not null | Owner |
| name | text | not null | Display name |
| allocation | bigint | not null, default 0 | Monthly budget in Rupiah |
| color_class | text | not null | Tailwind classes |
| icon | text | not null | Lucide icon name |
| is_system | boolean | default false | System pockets cannot be deleted |
| created_at | timestamptz | default now() | |
| updated_at | timestamptz | default now() | |

**Composite PK:** `(user_id, id)` — each user has their own pocket namespace.

### Table: `transactions`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | text | PK | e.g. "abc123", "rollover-2024-07-01" |
| user_id | uuid | FK → profiles.id, not null | Owner |
| type | text | not null, check (type in ('expense','transfer')) | |
| from_pocket_id | text | nullable, FK → pockets.id | Source pocket |
| to_pocket_id | text | nullable, FK → pockets.id | Destination pocket (transfer only) |
| amount | bigint | not null, check (amount > 0) | Amount in Rupiah |
| timestamp | bigint | not null | Unix timestamp (ms) |
| note | text | nullable | Optional note |
| is_rollover | boolean | default false | Auto-generated rollover flag |
| rollover_date | text | nullable | "YYYY-MM-DD" for deduplication |
| created_at | timestamptz | default now() | |

**Composite PK:** `(user_id, id)`

### Indexes

```sql
CREATE INDEX idx_pockets_user ON pockets(user_id);
CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_timestamp ON transactions(user_id, timestamp DESC);
CREATE INDEX idx_transactions_rollover ON transactions(user_id, rollover_date) WHERE is_rollover = true;
```

### Row Level Security (RLS) Policies

```sql
-- Profiles: users can only read/write their own profile
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Pockets: users can only access their own pockets
CREATE POLICY "Users can view own pockets" ON pockets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own pockets" ON pockets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own pockets" ON pockets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own pockets" ON pockets FOR DELETE USING (auth.uid() = user_id);

-- Transactions: users can only access their own transactions
CREATE POLICY "Users can view own transactions" ON transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transactions" ON transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own transactions" ON transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own transactions" ON transactions FOR DELETE USING (auth.uid() = user_id);
```

---

## Architecture Changes

### Before (Current)

```
Vue App → Pinia Store → localStorage
```

### After (Target)

```
Vue App → Pinia Store → Supabase Client → Supabase Postgres
                    ↘ localStorage (cache/offline fallback)
```

### Sync Strategy: Optimistic UI with Background Sync

1. **Write path:** Update Pinia state immediately (optimistic), then sync to Supabase in background
2. **Read path (initial load):** Fetch from Supabase, fall back to localStorage if offline
3. **Read path (subsequent):** Use Pinia state (already loaded)
4. **Conflict resolution:** Last-write-wins based on `updated_at` timestamp
5. **Offline queue:** Failed writes are queued in localStorage and retried on reconnect

---

## New Dependencies

| Package | Purpose |
|---------|---------|
| `@supabase/supabase-js` | Supabase client SDK |

No other new dependencies required. Supabase JS client handles auth, database, and realtime.

---

## New Files

| File | Purpose |
|------|---------|
| `src/lib/supabase.ts` | Supabase client initialization |
| `src/services/auth.ts` | Auth service (login, signup, logout, session) |
| `src/services/sync.ts` | Data sync service (CRUD operations to Supabase) |
| `src/composables/useAuth.ts` | Vue composable for auth state |

## Modified Files

| File | Changes |
|------|---------|
| `src/store.ts` | Replace localStorage persistence with Supabase sync calls; add online/offline state |
| `src/main.ts` | Initialize Supabase client and restore auth session on boot |
| `src/App.vue` | Add login gate (show auth UI when not authenticated) |
| `src/types.ts` | Add `UserProfile` interface |
| `.env.example` | Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` |
| `package.json` | Add `@supabase/supabase-js` dependency |
| `src/components/` | Add `AuthModal.vue` or `AuthView.vue` for login/signup UI |

---

## Migration Path

### Phase 1: Supabase Project Setup (Manual)

1. Create Supabase project at https://supabase.com
2. Run SQL migration to create tables, indexes, and RLS policies
3. Copy project URL and anon key to `.env.local`

### Phase 2: Auth Integration

1. Install `@supabase/supabase-js`
2. Create Supabase client in `src/lib/supabase.ts`
3. Implement auth composable (`useAuth`)
4. Add login/signup UI component
5. Gate the app behind authentication
6. Restore session on page reload via `supabase.auth.getSession()`

### Phase 3: Data Sync Layer

1. Create `src/services/sync.ts` with CRUD functions:
   - `syncPockets(userId)` — fetch all pockets from Supabase
   - `syncTransactions(userId)` — fetch all transactions
   - `upsertPocket(pocket)` — insert/update a pocket
   - `upsertTransaction(tx)` — insert/update a transaction
   - `deleteTransaction(id)` — delete a transaction
   - `deletePocket(id)` — delete a pocket
2. Use Supabase `upsert` (INSERT ON CONFLICT UPDATE) for idempotent writes

### Phase 4: Store Refactoring

1. Replace `localStorage` reads in `loadFromStorage()` with Supabase fetches
2. Replace `localStorage` writes in the deep watcher with Supabase upserts
3. Add offline fallback: if Supabase call fails, write to localStorage and queue retry
4. Keep `updateRollovers()` logic local (compute rollovers client-side, then sync result)

### Phase 5: localStorage Migration

1. On first login, detect existing localStorage data
2. Prompt user: "Migrate your existing data to cloud?"
3. If yes: read localStorage → upsert all pockets and transactions to Supabase
4. Clear localStorage keys after successful migration
5. Set flag `koskas_migrated=true` to prevent re-migration

### Phase 6: Realtime Sync (Optional, Future)

1. Subscribe to Supabase realtime channels for `pockets` and `transactions`
2. On remote change → update Pinia state
3. Enables live multi-device sync

---

## Environment Variables

```env
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key"
```

These are safe to expose in the frontend — RLS policies enforce data isolation.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Offline users lose data | Optimistic UI + localStorage fallback + retry queue |
| Supabase free tier limits (500MB, 50K MAU) | Sufficient for personal finance data; upgrade path available |
| RLS misconfiguration exposes data | Test policies thoroughly; default deny-all |
| Migration fails mid-way | Atomic migration: only clear localStorage after full success |
| Rollover sync conflicts | Rollovers are deterministic; recompute on conflict |
| Large transaction history slows initial load | Paginate or limit to current month; lazy-load history |

---

## Timeline Estimate

| Phase | Effort |
|-------|--------|
| Phase 1: Supabase setup | 1 hour (manual) |
| Phase 2: Auth integration | 2-3 hours |
| Phase 3: Data sync layer | 3-4 hours |
| Phase 4: Store refactoring | 4-5 hours |
| Phase 5: localStorage migration | 1-2 hours |
| Phase 6: Realtime (optional) | 2-3 hours |
| **Total** | **13-18 hours** |

---

## Success Criteria

- [ ] User can sign up and log in with email/password
- [ ] All pockets and transactions sync to Supabase
- [ ] App works offline with cached data
- [ ] Existing localStorage data can be migrated to cloud
- [ ] Multi-device access works (same account, different browser)
- [ ] RLS policies prevent cross-user data access
- [ ] No regression in existing UX (optimistic updates feel instant)
