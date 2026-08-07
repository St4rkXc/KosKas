# KosKas — Supabase Database Design & Security Report

**Date:** 2026-08-07  
**Project ID:** zwnribcrhhxfzqbpvfet  
**Region:** ap-southeast-1  
**PostgreSQL Version:** 17  
**Report Author:** Automated Analysis  
**Classification:** Internal — Engineering

---

## 1. Executive Summary

KosKas is a personal budget-envelope application built on Supabase (PostgreSQL 17). The database consists of three core tables — `profiles`, `pockets`, and `transactions` — with Row Level Security (RLS) enabled on all tables. The schema is well-structured for its use case, with appropriate foreign key relationships, indexes for common query patterns, and comprehensive RLS policies ensuring user data isolation.

**Key Findings:**

| Category | Status | Count |
|----------|--------|-------|
| Critical Security Issues | ⚠️ Action Required | 4 |
| Data Integrity Concerns | ⚡ High Priority | 2 |
| Performance Recommendations | 📊 Medium Priority | 3 |
| Maintenance Items | 🔧 Low Priority | 2 |

**Overall Assessment:** The database design is sound for a single-tenant-per-user budgeting app. RLS policies correctly enforce user isolation at the database layer. The primary concerns are around the `handle_new_user()` function's security configuration (SECURITY DEFINER with mutable search path) and a missing primary key on the `transactions` table.

---

## 2. Database Schema Overview

### 2.1 Entity Relationship Diagram (ASCII)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          KOSKAS DATABASE SCHEMA                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────┐       ┌─────────────────────────────────┐     │
│  │   auth.users        │       │       public.profiles           │     │
│  │   (Supabase Auth)   │ 1──1  │                                 │     │
│  │                     ├──────►│  PK:    id (uuid)               │     │
│  │  id (uuid)          │       │  FK:    id → auth.users.id      │     │
│  │  email              │       │  display_name (text, nullable)  │     │
│  │  ...                │       │  monthly_fund (bigint, default 0)│    │
│  └─────────────────────┘       │  month_start (bigint)           │     │
│                                │  created_at (timestamptz)       │     │
│                                │  updated_at (timestamptz)       │     │
│                                │  RLS: ENABLED                   │     │
│                                └──────────┬──────────────────────┘     │
│                                           │ 1                          │
│                                           │                            │
│                    ┌──────────────────────┼──────────────────────┐     │
│                    │                      │                      │     │
│                    ▼ *                    │                      ▼ *    │
│  ┌──────────────────────────┐            │   ┌──────────────────────────────────┐
│  │     public.pockets       │            │   │     public.transactions          │
│  │                          │            │   │                                  │
│  │  CPK: (id, user_id)      │            │   │  PK: NONE ⚠️                    │
│  │  FK:  user_id → profiles │            │   │  FK:  user_id → profiles        │
│  │  id (text)               │            │   │  id (text)                      │
│  │  user_id (uuid)          │◄───────────┘   │  user_id (uuid)                 │
│  │  name (text)             │                │  type (text, CHECK constraint)   │
│  │  allocation (bigint)     │                │  from_pocket_id (text, nullable) │
│  │  color_class (text)      │                │  to_pocket_id (text, nullable)   │
│  │  icon (text)             │                │  amount (bigint, CHECK > 0)      │
│  │  is_system (boolean)     │                │  timestamp (bigint)              │
│  │  created_at (timestamptz)│                │  note (text, nullable)           │
│  │  updated_at (timestamptz)│                │  is_rollover (boolean)           │
│  │  RLS: ENABLED            │                │  rollover_date (text, nullable)  │
│  └──────────────────────────┘                │  created_at (timestamptz)        │
│                                              │  RLS: ENABLED                    │
│                                              └──────────────────────────────────┘
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Relationships:**
- `auth.users` 1:1 `profiles` — One profile per authenticated user
- `profiles` 1:N `pockets` — Each user has multiple budget pockets
- `profiles` 1:N `transactions` — Each user has multiple transactions
- `pockets` ←── `transactions.from_pocket_id` — Logical reference (no FK constraint)
- `pockets` ←── `transactions.to_pocket_id` — Logical reference (no FK constraint)

### 2.2 Table Definitions

#### `public.profiles`
| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | — | PK, FK → auth.users.id |
| `display_name` | text | YES | — | User's display name |
| `monthly_fund` | bigint | YES | 0 | Total monthly income allocation |
| `month_start` | bigint | NO | — | Epoch ms of month start (set by trigger) |
| `created_at` | timestamptz | NO | now() | Row creation timestamp |
| `updated_at` | timestamptz | NO | now() | Row update timestamp |

**Row count:** 2  
**RLS:** Enabled

#### `public.pockets`
| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | text | NO | — | Part of composite PK |
| `user_id` | uuid | NO | — | Part of composite PK, FK → profiles |
| `name` | text | NO | — | Display name |
| `allocation` | bigint | NO | 0 | Budget allocation in smallest currency unit |
| `color_class` | text | NO | — | Tailwind CSS class for color |
| `icon` | text | NO | — | Icon identifier (Lucide icon name) |
| `is_system` | boolean | NO | false | Whether pocket is system-defined |
| `created_at` | timestamptz | NO | now() | Row creation timestamp |
| `updated_at` | timestamptz | NO | now() | Row update timestamp |

**Row count:** 14  
**RLS:** Enabled

#### `public.transactions`
| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | text | NO | — | No PK ⚠️ |
| `user_id` | uuid | NO | — | FK → profiles |
| `type` | text | NO | — | CHECK: 'expense' or 'transfer' |
| `from_pocket_id` | text | YES | — | Source pocket (logical ref) |
| `to_pocket_id` | text | YES | — | Destination pocket (logical ref) |
| `amount` | bigint | NO | — | CHECK: amount > 0 |
| `timestamp` | bigint | NO | — | Epoch ms of transaction |
| `note` | text | YES | — | Optional note |
| `is_rollover` | boolean | NO | false | Whether this is a rollover transaction |
| `rollover_date` | text | YES | — | Target month for rollover |
| `created_at` | timestamptz | NO | now() | Row creation timestamp |

**Row count:** 0  
**RLS:** Enabled

### 2.3 Data Types & Constraints

**CHECK Constraints:**
- `transactions.type` ∈ `{'expense', 'transfer'}` — Enforces valid transaction types
- `transactions.amount > 0` — Prevents zero or negative amounts

**Foreign Key Constraints:**
- `pockets.user_id` → `profiles.id` — Cascade behavior: default (no action)
- `transactions.user_id` → `profiles.id` — Cascade behavior: default (no action)

**Notable Design Decisions:**
1. **Composite PK on pockets `(id, user_id)`:** Allows the same pocket ID to exist for different users (e.g., system pockets like "pangan" shared across users). This is correct for the use case.
2. **No PK on transactions:** ⚠️ The `transactions` table lacks a primary key. While `id` is unique in practice (generated client-side via `crypto.randomUUID()`), there is no database-level enforcement.
3. **No FK from transactions to pockets:** The `from_pocket_id` and `to_pocket_id` columns are logical references without FK constraints. This is intentional — pockets can be deleted while retaining transaction history.
4. **BigInt for monetary values:** All amounts stored in smallest currency unit (IDR has no decimals), avoiding floating-point precision issues.
5. **BigInt for timestamps:** Epoch milliseconds stored as bigint rather than native timestamp type — facilitates client-side arithmetic.

---

## 3. Index Analysis

### 3.1 Current Indexes

| Index Name | Table | Columns | Type | Unique | Partial |
|------------|-------|---------|------|--------|---------|
| `profiles_pkey` | profiles | `(id)` | btree | YES | — |
| `pockets_pkey` | pockets | `(user_id, id)` | btree | YES | — |
| `idx_pockets_user` | pockets | `(user_id)` | btree | NO | — |
| `idx_transactions_user` | transactions | `(user_id)` | btree | NO | — |
| `idx_transactions_timestamp` | transactions | `(user_id, timestamp DESC)` | btree | NO | — |
| `idx_transactions_rollover` | transactions | `(user_id, rollover_date)` | btree | NO | `WHERE is_rollover = true` |

### 3.2 Index Coverage Assessment

| Query Pattern | Index Used | Efficiency |
|---------------|-----------|------------|
| `SELECT * FROM pockets WHERE user_id = ?` | `idx_pockets_user` or `pockets_pkey` | ✅ Optimal |
| `SELECT * FROM transactions WHERE user_id = ?` | `idx_transactions_user` | ✅ Optimal |
| `SELECT * FROM transactions WHERE user_id = ? ORDER BY timestamp DESC` | `idx_transactions_timestamp` | ✅ Optimal — covers both filter and sort |
| `SELECT * FROM transactions WHERE user_id = ? AND is_rollover = true` | `idx_transactions_rollover` | ✅ Optimal — partial index reduces scan |
| `DELETE FROM pockets WHERE user_id = ? AND id = ?` | `pockets_pkey` | ✅ Optimal — composite PK lookup |
| `DELETE FROM transactions WHERE user_id = ? AND id = ?` | `idx_transactions_user` | ⚠️ Suboptimal — requires heap scan for `id` |
| `UPSERT INTO pockets (single row)` | `pockets_pkey` | ✅ Optimal — unique constraint enables conflict detection |
| `UPSERT INTO transactions (batch)` | None | ⚠️ No unique constraint for conflict detection |

### 3.3 Missing Index Recommendations

**Recommendation 1: Add unique index on `transactions.id` + `user_id`**
```sql
-- CRITICAL: Enables upsert conflict resolution and efficient single-row lookups
CREATE UNIQUE INDEX idx_transactions_user_id 
  ON transactions (user_id, id);
```
**Rationale:** The application performs `upsert` operations on transactions, which require a unique constraint for PostgreSQL's `ON CONFLICT` clause. Without this, upserts may fail or behave unpredictably. This also enables efficient `DELETE ... WHERE user_id = ? AND id = ?` operations.

**Recommendation 2: Consider index on `transactions.from_pocket_id`**
```sql
-- MEDIUM: Useful if querying transactions by pocket
CREATE INDEX idx_transactions_from_pocket 
  ON transactions (user_id, from_pocket_id) 
  WHERE from_pocket_id IS NOT NULL;
```
**Rationale:** If the application ever needs to show "all transactions for a specific pocket," this index would be beneficial. Currently not critical as the app fetches all transactions per user.

**Recommendation 3: Redundancy check on `idx_pockets_user`**
```sql
-- LOW: idx_pockets_user may be redundant given pockets_pkey starts with user_id
-- pockets_pkey (user_id, id) already covers queries filtering by user_id alone
-- DROP INDEX idx_pockets_user; -- Only if confirmed redundant via EXPLAIN ANALYZE
```
**Rationale:** Since `pockets_pkey` is `(user_id, id)`, queries filtering only on `user_id` can use the leading column of the composite index. The separate `idx_pockets_user` index may be redundant, saving write overhead and storage.

---

## 4. Row Level Security (RLS) Analysis

### 4.1 Policy Inventory

#### `public.profiles` — 4 policies
| Policy | Command | Expression | Role |
|--------|---------|-----------|------|
| profiles SELECT | SELECT | `auth.uid() = id` | public |
| profiles INSERT | INSERT | `auth.uid() = id` (WITH CHECK) | public |
| profiles UPDATE | UPDATE | `auth.uid() = id` | public |
| profiles DELETE | DELETE | `auth.uid() = id` | public |

#### `public.pockets` — 4 policies
| Policy | Command | Expression | Role |
|--------|---------|-----------|------|
| pockets SELECT | SELECT | `auth.uid() = user_id` | public |
| pockets INSERT | INSERT | `auth.uid() = user_id` (WITH CHECK) | public |
| pockets UPDATE | UPDATE | `auth.uid() = user_id` | public |
| pockets DELETE | DELETE | `auth.uid() = user_id` | public |

#### `public.transactions` — 4 policies
| Policy | Command | Expression | Role |
|--------|---------|-----------|------|
| transactions SELECT | SELECT | `auth.uid() = user_id` | public |
| transactions INSERT | INSERT | `auth.uid() = user_id` (WITH CHECK) | public |
| transactions UPDATE | UPDATE | `auth.uid() = user_id` | public |
| transactions DELETE | DELETE | `auth.uid() = user_id` | public |

**Total: 12 RLS policies across 3 tables**

### 4.2 Data Isolation Verification

✅ **All tables have RLS enabled** — No table is accessible without authentication.

✅ **All policies use `auth.uid()`** — The canonical Supabase function for retrieving the authenticated user's ID. This is the correct approach.

✅ **Policy coverage is complete** — SELECT, INSERT, UPDATE, and DELETE are all covered for every table.

✅ **INSERT policies use WITH CHECK** — Ensures new rows must belong to the inserting user.

✅ **UPDATE/DELETE policies use USING (implicit)** — The `USING` expression defaults to the policy expression, correctly filtering rows by user ownership.

**Data Isolation Matrix:**

| Operation | profiles | pockets | transactions |
|-----------|----------|---------|-------------|
| Read own data | ✅ | ✅ | ✅ |
| Read other user's data | ❌ Blocked | ❌ Blocked | ❌ Blocked |
| Write own data | ✅ | ✅ | ✅ |
| Write to other user's data | ❌ Blocked | ❌ Blocked | ❌ Blocked |
| Delete own data | ✅ | ✅ | ✅ |
| Delete other user's data | ❌ Blocked | ❌ Blocked | ❌ Blocked |

### 4.3 RLS Gap Analysis

**Gap 1: No policy for `auth.uid() IS NULL` (anonymous access)**
- All policies require `auth.uid() = user_id/id`, which means unauthenticated users cannot access any data.
- **Assessment:** This is correct behavior for KosKas. No gap — anonymous access is intentionally blocked.

**Gap 2: `profiles` DELETE policy**
- The DELETE policy allows users to delete their own profile.
- **Risk:** If a user deletes their profile, their pockets and transactions become orphaned (FK constraints don't have ON DELETE CASCADE).
- **Recommendation:** Either add `ON DELETE CASCADE` to the FK constraints, or remove the DELETE policy from profiles if profile deletion is not a supported feature.

**Gap 3: No per-row security on `updated_at`**
- UPDATE policies allow users to modify any column in their own rows.
- **Assessment:** Acceptable for this application. There are no sensitive columns that should be read-only.

---

## 5. Security Assessment

### 5.1 Security Advisor Findings

| # | Severity | Finding | Affected Object |
|---|----------|---------|----------------|
| 1 | ⚠️ WARN | Function Search Path Mutable | `handle_new_user()` |
| 2 | ⚠️ WARN | Public Can Execute SECURITY DEFINER | `handle_new_user()` (anon role) |
| 3 | ⚠️ WARN | Signed-In Users Can Execute SECURITY DEFINER | `handle_new_user()` (authenticated role) |
| 4 | ⚠️ WARN | Leaked Password Protection Disabled | Project-level setting |

### 5.2 Function Security (`handle_new_user`)

**Current Definition:**
```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, month_start)
  VALUES (NEW.id, EXTRACT(EPOCH FROM NOW()) * 1000);
  RETURN NEW;
END;
$$;
```

**Issue 1: Mutable `search_path`**
- `SECURITY DEFINER` functions execute with the privileges of the function owner (typically `postgres` or `service_role`).
- If `search_path` is not explicitly set, an attacker who controls a schema in the search path could inject malicious functions that get called by this SECURITY DEFINER function.
- **Fix:**
```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''  -- Explicitly empty search path
AS $$
BEGIN
  INSERT INTO public.profiles (id, month_start)
  VALUES (NEW.id, EXTRACT(EPOCH FROM NOW()) * 1000);
  RETURN NEW;
END;
$$;
```

**Issue 2: Executable by `anon` and `authenticated` roles**
- As a trigger function, `handle_new_user()` should only be invoked by the PostgreSQL trigger mechanism, not directly by any user.
- However, since it's `SECURITY DEFINER` and grantable, any user could theoretically call it directly.
- **Fix:**
```sql
-- Revoke direct execution from all roles
REVOKE ALL ON FUNCTION handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION handle_new_user() FROM authenticated;

-- Only the trigger should invoke this function
-- (PostgreSQL trigger execution bypasses function-level grants)
```

**Issue 3: No input validation**
- The function inserts `NEW.id` directly without validation.
- **Assessment:** Low risk since `NEW.id` comes from `auth.users` which is managed by Supabase Auth. The UUID type provides inherent validation.

### 5.3 Authentication Flow Review

**Current Flow:**
1. Client calls `supabase.auth.signUp()` or `supabase.auth.signInWithPassword()`
2. Supabase Auth creates/validates user in `auth.users`
3. Trigger `handle_new_user()` creates profile in `public.profiles`
4. Client receives JWT session
5. All subsequent requests include JWT, RLS policies validate `auth.uid()`

**Assessment:** ✅ Standard Supabase auth flow. No custom authentication logic that could introduce vulnerabilities.

**Google OAuth:**
- Client uses `signInWithOAuth({ provider: 'google' })` with `redirectTo: window.location.origin`
- **Note:** Ensure the redirect URL is registered in Supabase Auth configuration (Authentication → URL Configuration → Site URL and Redirect URLs).

### 5.4 Client-Side Security Considerations

| Concern | Status | Notes |
|---------|--------|-------|
| Supabase anon key exposure | ✅ Expected | Anon key is designed to be public; RLS provides security |
| Service role key | ✅ N/A | Not present in client code (correct) |
| JWT storage | ✅ Default | Supabase stores JWT in localStorage by default |
| XSS risk | ⚠️ Monitor | localStorage JWT could be stolen via XSS |
| CSRF | ✅ Mitigated | JWT-based auth is not vulnerable to CSRF |

---

## 6. Data Privacy Analysis

### 6.1 User Data Isolation (Application Layer)

The application layer (sync service) enforces user scoping by passing `userId` to every database operation:

| Function | User Scoping Method | Verified |
|----------|-------------------|----------|
| `fetchPockets(userId)` | `.eq('user_id', userId)` | ✅ |
| `fetchTransactions(userId)` | `.eq('user_id', userId)` | ✅ |
| `upsertPocket(userId, pocket)` | `user_id: userId` in upsert payload | ✅ |
| `upsertTransaction(userId, tx)` | `user_id: userId` in upsert payload | ✅ |
| `deletePocketRemote(userId, pocketId)` | `.eq('user_id', userId).eq('id', pocketId)` | ✅ |
| `deleteTransactionRemote(userId, txId)` | `.eq('user_id', userId).eq('id', txId)` | ✅ |
| `deleteAllTransactionsRemote(userId)` | `.eq('user_id', userId)` | ✅ |
| `upsertAllPockets(userId, pockets)` | `user_id: userId` in every row | ✅ |
| `syncAllTransactions(userId, txs)` | `user_id: userId` in every row | ✅ |

**Defense in Depth:** Even if the application layer fails to scope a query, RLS policies at the database layer will block unauthorized access. This is the correct approach.

### 6.2 User Data Isolation (Database Layer)

**RLS provides the authoritative enforcement:**
- All 3 tables have RLS enabled
- All policies check `auth.uid()` against the row's user identifier
- No `SUPERUSER` or `BYPASSRLS` roles are used by the application

**JWT claims validation:**
- `auth.uid()` extracts the user ID from the JWT's `sub` claim
- Supabase Auth controls JWT issuance — users cannot forge their user ID
- JWT expiration is handled by Supabase (default: 1 hour, refreshable)

### 6.3 Cross-User Data Access Vectors

| Vector | Risk | Mitigation |
|--------|------|-----------|
| Direct SQL injection | Low | Supabase client uses parameterized queries |
| RLS bypass via function | Medium | Fix `handle_new_user` search_path (see §5.2) |
| Shared device / session hijack | Medium | Standard web security (HTTPS, secure cookies) |
| FK reference to other user's pocket | Low | No FK from transactions → pockets (logical ref only) |
| Bulk data export | Low | RLS prevents cross-user reads |
| Orphaned data after profile delete | Medium | Add CASCADE or prevent profile deletion |

---

## 7. Performance Considerations

### 7.1 Query Patterns

**Expected query volume (per active user per session):**
- `fetchPockets`: 1 query (7-20 rows typical)
- `fetchTransactions`: 1 query (0-500 rows per month)
- `upsertPocket`: 1-7 queries (on settings save)
- `upsertTransaction`: 1 query (per expense/transfer)
- `deleteTransactionRemote`: 1 query (per deletion)

**Total per session:** ~5-20 queries (light workload)

### 7.2 Batch Operations

**`syncAllTransactions` batching:**
- Batch size: 100 rows per upsert call
- For 500 transactions: 5 batch calls
- For 1000 transactions: 10 batch calls

**Assessment:** ✅ Appropriate batch size. Supabase PostgREST handles batch upserts efficiently. Consider monitoring if users regularly exceed 1000 transactions per sync.

**`upsertAllPockets` batching:**
- No batching — all pockets sent in a single call
- Typical pocket count: 7-20
- **Assessment:** ✅ Fine for expected data volumes.

### 7.3 Storage Growth Projections

| Table | Row Size (est.) | Growth Rate | 1 Year (100 users) | 1 Year (1000 users) |
|-------|-----------------|-------------|-------------------|--------------------|
| profiles | ~200 bytes | 1 row/user | 20 KB | 200 KB |
| pockets | ~300 bytes | ~10 rows/user | 300 KB | 3 MB |
| transactions | ~400 bytes | ~30 rows/user/month | 14.4 MB | 144 MB |

**Total estimated storage (1 year, 1000 users):** ~150 MB  
**Assessment:** ✅ Well within Supabase free tier (500 MB) and pro tier limits.

**Index overhead:** ~30% of table size  
**Total with indexes:** ~195 MB

---

## 8. Recommendations

### 8.1 Critical (Security)

#### C1: Fix `handle_new_user()` search_path
```sql
ALTER FUNCTION handle_new_user() SET search_path = '';
```
**Impact:** Prevents potential search_path injection attacks via SECURITY DEFINER.  
**Risk if not fixed:** An attacker who can create schemas could potentially escalate privileges.

#### C2: Revoke direct execution of `handle_new_user()`
```sql
REVOKE ALL ON FUNCTION handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION handle_new_user() FROM authenticated;
```
**Impact:** Prevents direct invocation of the trigger function by any user role.  
**Risk if not fixed:** Theoretical privilege escalation via direct function call.

#### C3: Enable Leaked Password Protection
- Navigate to Supabase Dashboard → Authentication → Settings
- Enable "Leaked Password Protection"
- **Impact:** Prevents users from using passwords found in data breach databases.

#### C4: Add primary key to `transactions` table
```sql
-- Add a unique constraint to enable upsert conflict resolution
ALTER TABLE transactions 
  ADD CONSTRAINT transactions_pkey PRIMARY KEY (user_id, id);
```
**Impact:** Enables proper upsert behavior and prevents duplicate transaction IDs per user.  
**Risk if not fixed:** Upsert operations may create duplicates or fail silently.

### 8.2 High Priority (Data Integrity)

#### H1: Add `ON DELETE CASCADE` or remove profile DELETE policy
```sql
-- Option A: Cascade deletes (if profile deletion is supported)
ALTER TABLE pockets 
  DROP CONSTRAINT pockets_user_id_fkey,
  ADD CONSTRAINT pockets_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE transactions 
  DROP CONSTRAINT transactions_user_id_fkey,
  ADD CONSTRAINT transactions_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Option B: Remove DELETE policy (if profile deletion is NOT supported)
DROP POLICY "profiles DELETE" ON profiles;
```
**Impact:** Prevents orphaned data if a profile is deleted.

#### H2: Add `updated_at` trigger for automatic timestamp updates
```sql
-- Ensure updated_at is automatically set on row updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_pockets_updated_at
  BEFORE UPDATE ON pockets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```
**Impact:** Ensures `updated_at` is always current without relying on client-side timestamps.

### 8.3 Medium Priority (Performance)

#### M1: Evaluate `idx_pockets_user` redundancy
```sql
-- Check if idx_pockets_user is used by any queries
-- pockets_pkey (user_id, id) already covers user_id-only filters
EXPLAIN ANALYZE SELECT * FROM pockets WHERE user_id = 'test-uuid';

-- If the plan uses pockets_pkey, idx_pockets_user is redundant:
DROP INDEX IF EXISTS idx_pockets_user;
```
**Impact:** Reduces write overhead and storage by removing an unused index.

#### M2: Add connection pooling configuration
- Ensure Supabase connection pooler (PgBouncer) is configured for the project.
- **Impact:** Improves performance under concurrent load by reusing connections.

#### M3: Monitor query performance with `pg_stat_statements`
- The `pg_stat_statements` extension is already installed.
- Set up periodic review of slow queries via Supabase Dashboard → Database → Queries.

### 8.4 Low Priority (Maintenance)

#### L1: Add database comments for documentation
```sql
COMMENT ON TABLE profiles IS 'User profile settings and monthly budget configuration';
COMMENT ON TABLE pockets IS 'Budget envelope categories per user';
COMMENT ON TABLE transactions IS 'Expense and transfer records per user';
COMMENT ON COLUMN transactions.type IS 'Must be expense or transfer (CHECK constraint)';
COMMENT ON COLUMN transactions.amount IS 'Amount in smallest currency unit (IDR sen)';
```

#### L2: Set up automated backups verification
- Verify Supabase's automated daily backups are functioning.
- Test point-in-time recovery quarterly.

---

## 9. Appendix

### 9.1 Full DDL Reference

```sql
-- ============================================================
-- PROFILES TABLE
-- ============================================================
CREATE TABLE public.profiles (
  id           uuid        PRIMARY KEY REFERENCES auth.users(id),
  display_name text,
  monthly_fund bigint      DEFAULT 0,
  month_start  bigint      NOT NULL,
  created_at   timestamptz DEFAULT now() NOT NULL,
  updated_at   timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- POCKETS TABLE
-- ============================================================
CREATE TABLE public.pockets (
  id          text        NOT NULL,
  user_id     uuid        NOT NULL REFERENCES public.profiles(id),
  name        text        NOT NULL,
  allocation  bigint      DEFAULT 0 NOT NULL,
  color_class text        NOT NULL,
  icon        text        NOT NULL,
  is_system   boolean     DEFAULT false NOT NULL,
  created_at  timestamptz DEFAULT now() NOT NULL,
  updated_at  timestamptz DEFAULT now() NOT NULL,
  
  PRIMARY KEY (user_id, id)
);

CREATE INDEX idx_pockets_user ON public.pockets (user_id);

ALTER TABLE public.pockets ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TRANSACTIONS TABLE
-- ============================================================
CREATE TABLE public.transactions (
  id              text        NOT NULL,
  user_id         uuid        NOT NULL REFERENCES public.profiles(id),
  type            text        NOT NULL CHECK (type = ANY (ARRAY['expense', 'transfer'])),
  from_pocket_id  text,
  to_pocket_id    text,
  amount          bigint      NOT NULL CHECK (amount > 0),
  timestamp       bigint      NOT NULL,
  note            text,
  is_rollover     boolean     DEFAULT false NOT NULL,
  rollover_date   text,
  created_at      timestamptz DEFAULT now() NOT NULL
  
  -- ⚠️ NO PRIMARY KEY
);

CREATE INDEX idx_transactions_user      ON public.transactions (user_id);
CREATE INDEX idx_transactions_timestamp ON public.transactions (user_id, timestamp DESC);
CREATE INDEX idx_transactions_rollover  ON public.transactions (user_id, rollover_date) 
  WHERE is_rollover = true;

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
-- ⚠️ Missing: SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, month_start)
  VALUES (NEW.id, EXTRACT(EPOCH FROM NOW()) * 1000);
  RETURN NEW;
END;
$$;

-- Trigger registration (assumed)
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

### 9.2 RLS Policy Definitions

```sql
-- ============================================================
-- PROFILES POLICIES
-- ============================================================

-- SELECT: Users can only read their own profile
CREATE POLICY "profiles SELECT" ON profiles
  FOR SELECT TO public
  USING (auth.uid() = id);

-- INSERT: Users can only create their own profile
CREATE POLICY "profiles INSERT" ON profiles
  FOR INSERT TO public
  WITH CHECK (auth.uid() = id);

-- UPDATE: Users can only update their own profile
CREATE POLICY "profiles UPDATE" ON profiles
  FOR UPDATE TO public
  USING (auth.uid() = id);

-- DELETE: Users can only delete their own profile
CREATE POLICY "profiles DELETE" ON profiles
  FOR DELETE TO public
  USING (auth.uid() = id);

-- ============================================================
-- POCKETS POLICIES
-- ============================================================

-- SELECT: Users can only read their own pockets
CREATE POLICY "pockets SELECT" ON pockets
  FOR SELECT TO public
  USING (auth.uid() = user_id);

-- INSERT: Users can only create pockets for themselves
CREATE POLICY "pockets INSERT" ON pockets
  FOR INSERT TO public
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: Users can only update their own pockets
CREATE POLICY "pockets UPDATE" ON pockets
  FOR UPDATE TO public
  USING (auth.uid() = user_id);

-- DELETE: Users can only delete their own pockets
CREATE POLICY "pockets DELETE" ON pockets
  FOR DELETE TO public
  USING (auth.uid() = user_id);

-- ============================================================
-- TRANSACTIONS POLICIES
-- ============================================================

-- SELECT: Users can only read their own transactions
CREATE POLICY "transactions SELECT" ON transactions
  FOR SELECT TO public
  USING (auth.uid() = user_id);

-- INSERT: Users can only create transactions for themselves
CREATE POLICY "transactions INSERT" ON transactions
  FOR INSERT TO public
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: Users can only update their own transactions
CREATE POLICY "transactions UPDATE" ON transactions
  FOR UPDATE TO public
  USING (auth.uid() = user_id);

-- DELETE: Users can only delete their own transactions
CREATE POLICY "transactions DELETE" ON transactions
  FOR DELETE TO public
  USING (auth.uid() = user_id);
```

### 9.3 Installed Extensions

| Extension | Version | Purpose |
|-----------|---------|---------|
| pgcrypto | 1.3 | Cryptographic functions (gen_random_uuid) |
| uuid-ossp | 1.1 | UUID generation functions |
| pg_stat_statements | 1.11 | Query performance monitoring |
| supabase_vault | 0.3.1 | Secret management (Supabase) |
| pgsodium | 3.1.8 | Encryption/decryption (Supabase) |

### 9.4 Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-08-07 | Initial report generated | Automated Analysis |

---

*End of Report*
