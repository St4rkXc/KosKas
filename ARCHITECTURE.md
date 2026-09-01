# KosKas — Technical Architecture

This document explains the internal architecture of KosKas for developers who want to understand, modify, or extend the codebase. It covers the domain model, authentication, cloud sync, state management, business logic, data flow, testing, design system, and build configuration.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [File Structure](#file-structure)
3. [Domain Model](#domain-model)
4. [Authentication](#authentication)
5. [Cloud Sync Architecture](#cloud-sync-architecture)
6. [State Management](#state-management)
7. [Component Architecture](#component-architecture)
8. [Business Logic Deep-Dive](#business-logic-deep-dive)
9. [Data Flow](#data-flow)
10. [Performance Dashboard](#performance-dashboard)
11. [Testing Infrastructure](#testing-infrastructure)
12. [Design System](#design-system)
13. [LocalStorage Schema](#localstorage-schema)
14. [Build Configuration](#build-configuration)
15. [Known Issues & Considerations](#known-issues--considerations)
16. [Future Improvement Suggestions](#future-improvement-suggestions)

---

## System Overview

KosKas is a single-page application (SPA) that uses Supabase for cloud synchronization with localStorage as a fallback. It adopts a **pocket-based budgeting** approach, where users allocate monthly income into named categories called "pockets," then record expenses or transfers between pockets. The app requires authentication (email/password or Google OAuth) to enable cloud sync; unauthenticated users can still use the app with localStorage-only persistence.

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Vue 3 + Composition API** | Declarative reactivity, type-safe with `<script setup>` |
| **Pinia (composition pattern)** | Modern state management with superior TypeScript support |
| **Supabase + localStorage** | Cloud sync with offline fallback; data survives page reload and device switches |
| **Supabase Auth** | Email/password + Google OAuth; session managed before app mount |
| **Tailwind CSS v4** | Utility-first, custom theme via `@theme` directive, fast iteration |
| **No router** | Single-view app with tab-based view switching; no multi-page navigation needed |
| **Custom breakpoints** | Mobile-first with finer granularity than Tailwind defaults |
| **Keypad-based input** | Optimized for mobile; faster than physical keyboard |
| **System pockets** | Data integrity; core pockets cannot be deleted by users |
| **Auto rollover** | Reduces manual work; leftover food budget is auto-tracked |
| **Vitest + happy-dom** | Fast unit testing with DOM simulation; `@pinia/testing` for store isolation |
| **Binary search insertion** | O(log n) find + O(n) splice for sorted transaction insertion |
| **Data validation on load** | Runtime type guards prevent corrupted localStorage from crashing the app |
| **Batch upsert (100 rows)** | Efficient Supabase writes; avoids hitting row limits on large datasets |
| **Content Security Policy** | CSP meta tag in `index.html` restricts script/style/font/connect sources |
| **Console stripping** | `esbuild.drop: ['console', 'debugger']` removes logs from production builds |
| **Email validation** | Client-side regex validation before auth submission prevents unnecessary API calls |
| **Generic error messages** | Unknown auth errors show user-friendly fallback, not raw Supabase error details |
| **Auth autocomplete** | `autocomplete="email"` / `autocomplete="current-password"` for password manager support |
| **localhost-only dev server** | Dev server binds to localhost only; no `--host=0.0.0.0` exposure |

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            index.html                                    │
│                       (mounts #root)                                      │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────────┐
│                             main.ts                                      │
│  initAuth() → createApp(App) + createPinia() + error/warn handlers      │
│  + mount('#root')                                                        │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────────┐
│                            App.vue                                       │
│                                                                          │
│  ┌─ Auth Gate ──────────────────────────────────────────────────────┐   │
│  │  Loading → Login Screen (no user) → App (authenticated)          │   │
│  │  ┌──────────────────┐  ┌──────────────────┐                      │   │
│  │  │ Email/Password   │  │ Google OAuth     │                      │   │
│  │  │ Sign In / Up     │  │ "Continue w/ G"  │                      │   │
│  │  └──────────────────┘  └──────────────────┘                      │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─ App Views (authenticated) ──────────────────────────────────────┐   │
│  │  ┌──────────┐  ┌───────────────┐  ┌──────────────┐  ┌─────────┐│   │
│  │  │ Dashboard │  │  Transaction  │  │ Performance  │  │ Modals  ││   │
│  │  │  (cards)  │  │   History     │  │  Dashboard   │  │         ││   │
│  │  │           │  │               │  │              │  │ Keypad  ││   │
│  │  │           │  │               │  │              │  │ Settings││   │
│  │  │           │  │               │  │              │  │ Transfer││   │
│  │  └─────┬────┘  └───────┬───────┘  └──────┬───────┘  └────┬────┘│   │
│  └────────┼────────────────┼─────────────────┼───────────────┼─────┘   │
│           │               │                 │               │          │
│  ┌────────▼───────────────▼─────────────────▼───────────────▼────────┐ │
│  │                    Pinia Store (store.ts)                          │ │
│  │  ┌──────────┐  ┌───────────────┐  ┌────────────────────────────┐ │ │
│  │  │  State:  │  │   Computed:   │  │       Actions:             │ │ │
│  │  │ pockets  │  │ pocketBalances│  │ addExpense, addTransfer    │ │ │
│  │  │ transact.│  │ totalAllocat. │  │ removeTransaction          │ │ │
│  │  │ monthStrt│  │ totalRemain.  │  │ addPocket, deletePocket    │ │ │
│  │  │ sync/auth│  │ monthlyPerf.  │  │ updateAllAllocations       │ │ │
│  │  │ flags    │  │               │  │ updateRollovers, resetMonth│ │ │
│  │  └──────────┘  └───────────────┘  └────────────────────────────┘ │ │
│  └────────────────────────┬──────────────────────────────────────────┘ │
└───────────────────────────┼────────────────────────────────────────────┘
                            │ deep watch (debounced 300ms)
              ┌─────────────┴──────────────┐
              │                            │
┌─────────────▼──────────────┐  ┌──────────▼────────────────────────────┐
│       localStorage          │  │          Supabase (via sync.ts)        │
│  koskas_transactions        │  │  pockets table  │ transactions table   │
│  koskas_pockets             │  │  profiles table │ batch upsert (100/b) │
│  koskas_month_start         │  │  (user-scoped)  │ snake_case mapping   │
│  koskas_archives            │  └────────────────────────────────────────┘
└─────────────────────────────┘
```

---

## File Structure

```
koskas/
├── index.html                  # Entry HTML; loads fonts, mounts #root
├── package.json                # Package metadata, scripts, dependencies
├── pnpm-lock.yaml              # Lock file for deterministic installs
├── tsconfig.json               # TypeScript configuration (strict, ES2022)
├── env.d.ts                    # Type declarations for Vite & .vue modules
├── vite.config.ts              # Vite config: Vue + Tailwind plugins, @/ alias
├── vitest.config.ts            # Vitest config: happy-dom, @/ alias, setup file
├── AGENT.md                    # Subagent configuration for AI coding assistants
├── .env.example                # Environment variable template (Supabase keys)
├── metadata.json               # AI Studio metadata (name, capabilities)
├── .gitignore                  # Git ignore rules
├── .prettierrc                 # Prettier formatting configuration
├── assets/                     # Static assets (images, fonts, etc.)
├── dist/                       # Production build output
├── src/
│   ├── main.ts                 # App entry: initAuth + createApp + error handlers + mount
│   ├── store.ts                # Pinia store: state, computed, actions, persistence + sync
│   ├── types.ts                # Types, constants (POCKET_IDS), utilities, type guards
│   ├── index.css               # Tailwind v4 entry + @theme custom variables
│   ├── App.vue                 # Root component: auth gate, dashboard, history, performance
│   ├── iconMap.ts              # Lucide icon name → Vue component mapping (27 icons)
│   ├── test-setup.ts           # Vitest setup: mocks for Supabase, sync, localStorage
│   ├── store.test.ts           # Store unit tests (1383 lines)
│   ├── types.test.ts           # Utility function tests (446 lines)
│   ├── iconMap.test.ts         # Icon mapping tests (96 lines)
│   ├── lib/
│   │   └── supabase.ts         # Supabase client initialization (env vars)
│   ├── services/
│   │   └── sync.ts             # Remote CRUD: fetch/upsert/delete with batch upsert
│   ├── composables/
│   │   └── useAuth.ts          # Auth composable: signUp, signIn, Google OAuth, signOut
│   └── components/
│       ├── KeypadModal.vue     # Expense entry: numeric keypad + pocket selector
│       ├── PocketSettingsModal.vue # Budget allocation: CRUD pockets, set allocations
│       ├── TransferModal.vue   # Inter-pocket transfer: balance validation
│       └── __tests__/
│           ├── components.dev.test.ts  # Developer-focused component tests (860 lines)
│           └── components.ux.test.ts   # UX-focused component tests (1125 lines)
```

### Per-File Purpose

| File | Responsibility |
|------|----------------|
| `main.ts` | App bootstrap; `initAuth()` before mount; error/warn handlers; Vue + Pinia init |
| `store.ts` | Single source of truth; state, computed, actions; localStorage + Supabase sync |
| `types.ts` | Interfaces (`Pocket`, `Transaction`), constants (`POCKET_IDS`, `DEFAULT_POCKETS`), type guards, utilities |
| `iconMap.ts` | Maps Lucide icon names to Vue components; `resolveIcon()` fallback utility |
| `index.css` | Global styles; Tailwind v4 `@theme` directive for custom colors and fonts |
| `App.vue` | Root view; auth gate, dashboard, history, performance dashboard, modal management |
| `lib/supabase.ts` | Supabase client singleton; reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` |
| `services/sync.ts` | Remote CRUD operations; batch upsert (100 rows/batch); camelCase ↔ snake_case mapping |
| `composables/useAuth.ts` | Auth state management; singleton refs; `onAuthStateChange` subscription |
| `test-setup.ts` | Vitest global setup; mocks Supabase, sync service, structuredClone, localStorage |
| `KeypadModal.vue` | Expense input; numeric keypad with pocket selector |
| `PocketSettingsModal.vue` | Pocket configuration; CRUD custom pockets, set allocations |
| `TransferModal.vue` | Inter-pocket transfer; sender balance validation |

---

## Domain Model

### Interface: `Pocket`

```typescript
interface Pocket {
    id: string;           // Unique identifier (e.g., "pangan", "kos", "pocket_x7k2")
    name: string;         // Display name (e.g., "Pangan", "Fixed / Kos")
    allocation: number;   // Monthly budget allocation in Rupiah
    colorClass: string;   // Tailwind classes for styling (e.g., "bg-[#10B981] text-black")
    icon: string;         // Lucide icon name (e.g., "Utensils", "Home")
    isSystem?: boolean;   // True if system pocket (cannot be deleted)
}
```

**Concepts:**
- `allocation` is the monthly budget set by the user, not the current balance
- `colorClass` stores full Tailwind classes (not just colors) for styling flexibility
- `isSystem` marks pockets that are hardcoded and cannot be deleted by users
- System pocket `id`s use `POCKET_IDS` constants for consistent references

### Interface: `Transaction`

```typescript
interface Transaction {
    id: string;              // Unique ID (generateId() or "rollover-YYYY-MM-DD")
    type: "expense" | "transfer";
    fromPocketId?: string;   // Source pocket (expense: pocket being reduced)
    toPocketId?: string;     // Destination pocket (transfer only)
    amount: number;          // Amount in Rupiah
    timestamp: number;       // Unix timestamp in milliseconds
    note?: string;           // Optional note
    isRollover?: boolean;    // True if auto-generated Pangan → Leftover rollover
    rolloverDate?: string;   // "YYYY-MM-DD" format (rollover only)
}
```

**Concepts:**
- **Expense:** `fromPocketId` + `amount` → reduces source pocket balance
- **Transfer:** `fromPocketId` + `toPocketId` + `amount` → reduces source, increases destination
- **Rollover:** Special transfer from `"pangan"` to `"leftover"` auto-generated by the system
- `timestamp` is used for sorting (descending) and daily grouping
- `rolloverDate` is used for deduplication — only one rollover per date
- IDs are generated via `generateId()` which uses `crypto.randomUUID()` when available

### POCKET_IDS Constants

```typescript
export const POCKET_IDS = {
    PANGAN: 'pangan',
    KOS: 'kos',
    TRANSPORTASI: 'transportasi',
    LIFESTYLE: 'lifestyle',
    DARURAT: 'darurat',
    SAVING: 'saving',
    LEFTOVER: 'leftover',
} as const;
```

All magic string references to pocket IDs in the store use `POCKET_IDS.*` constants, eliminating stringly-typed bugs.

### generateId() Utility

```typescript
export function generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 15)}`;
}
```

Replaces the previous `Math.random().toString(36).slice(2, 11)` for transaction and pocket IDs. Provides collision-resistant UUIDs with a `crypto.getRandomValues()` fallback before resorting to `Math.random()`.

### Default Pockets

```typescript
const DEFAULT_POCKETS: Pocket[] = [
    { id: POCKET_IDS.PANGAN, name: 'Pangan', allocation: 1500000,
      colorClass: 'bg-[#10B981] text-black', icon: 'Utensils', isSystem: true },
    { id: POCKET_IDS.KOS, name: 'Fixed / Kos', allocation: 1000000,
      colorClass: 'bg-[#3B82F6] text-white', icon: 'Home', isSystem: true },
    { id: POCKET_IDS.TRANSPORTASI, name: 'Transportasi', allocation: 300000,
      colorClass: 'bg-[#F59E0B] text-black', icon: 'Fuel', isSystem: true },
    { id: POCKET_IDS.LIFESTYLE, name: 'Lifestyle', allocation: 300000,
      colorClass: 'bg-[#EF4444] text-white', icon: 'Coffee', isSystem: true },
    { id: POCKET_IDS.DARURAT, name: 'Dana Darurat', allocation: 200000,
      colorClass: 'bg-[#8B5CF6] text-white', icon: 'ShieldAlert', isSystem: true },
    { id: POCKET_IDS.SAVING, name: 'Tabungan', allocation: 0,
      colorClass: 'bg-[#EC4899] text-white', icon: 'PiggyBank', isSystem: true },
    { id: POCKET_IDS.LEFTOVER, name: 'Sisa Pangan', allocation: 0,
      colorClass: 'bg-[#14B8A6] text-white', icon: 'Coins', isSystem: true },
];
```

**System Pocket Characteristics:**
- `POCKET_IDS.PANGAN` — Hardcoded reference in `updateRollovers()`; id must not be changed
- `POCKET_IDS.SAVING` — Default target when `deletePocket()` is called
- `POCKET_IDS.LEFTOVER` — Dedicated target for auto rollovers; `allocation` is always 0
- `isSystem: true` prevents user deletion via the UI
- All system pockets now have explicit `colorClass` and `icon` properties

### Utility Functions (types.ts)

| Function | Signature | Purpose |
|----------|-----------|---------|
| `formatRupiah` | `(amount: number): string` | Format number as Rp currency; handles negative amounts |
| `vibrate` | `(pattern: number \| number[]): void` | Trigger haptic feedback; wrapped in try/catch for error handling |
| `parseAmount` | `(str: string): number` | Safe parseInt wrapper for keypad input |
| `hexFromColorClass` | `(colorClass: string): string` | Extracts hex color from Tailwind class string (e.g., `"bg-[#10B981] text-black"` → `"#10B981"`) |
| `generateId` | `(): string` | Collision-resistant ID generation (see above) |
| `isValidPocket` | `(p: unknown): p is Pocket` | Runtime type guard for pocket data validation |
| `isValidTransaction` | `(t: unknown): t is Transaction` | Runtime type guard for transaction data validation |

### Available Customization Constants

```typescript
// Icons available for custom pockets (Lucide icon names)
const AVAILABLE_ICONS = [
    "Utensils", "Home", "Fuel", "Coffee", "ShieldAlert",
    "PiggyBank", "Coins", "ShoppingBag", "Gamepad2", "Heart",
    "BookOpen", "Plane", "Car", "Gift", "Sparkles"
];

// Colors available for custom pockets
const AVAILABLE_COLORS = [
    { name: "Emerald", class: "bg-[#10B981] text-black" },
    { name: "Blue",    class: "bg-[#3B82F6] text-white" },
    { name: "Amber",   class: "bg-[#F59E0B] text-black" },
    { name: "Red",     class: "bg-[#EF4444] text-white" },
    { name: "Purple",  class: "bg-[#8B5CF6] text-white" },
    { name: "Pink",    class: "bg-[#EC4899] text-white" },
    { name: "Teal",    class: "bg-[#14B8A6] text-white" },
    { name: "Indigo",  class: "bg-[#6366F1] text-white" },
    { name: "Orange",  class: "bg-[#F97316] text-black" },
];
```

---

## Authentication

### Overview

The app now requires authentication for cloud sync. Authentication is resolved **before** any UI renders — `main.ts` calls `initAuth()` and waits for the session to resolve before mounting the Vue app.

### Auth Composable (`useAuth.ts`)

```typescript
// Module-level singleton refs (shared across all composable consumers)
const user = ref<User | null>(null);
const session = ref<Session | null>(null);
const loading = ref(true);

export function useAuth() {
    async function initAuth()       // Initialize auth; listen for state changes
    async function signUp(email, password)  // Email/password registration
    async function signIn(email, password)  // Email/password login
    async function signInWithGoogle()       // Google OAuth redirect
    async function signOut()               // Clear session

    return { user, session, loading, initAuth, signUp, signIn, signInWithGoogle, signOut };
}
```

**Key Design:**
- Module-level singleton refs ensure all components share the same auth state
- `onAuthStateChange` subscription keeps refs in sync with Supabase session events
- `initAuth()` calls `getSession()` to restore existing sessions on page load

### App.vue Auth Gate

```
App.vue Render States:
┌─────────────────────────────────────────────────────────────┐
│  1. Auth Loading (loading = true)                            │
│     → Blank/loading screen                                   │
│                                                              │
│  2. No User (loading = false, user = null)                   │
│     → Login Screen:                                          │
│       ├─ Email input field                                   │
│       ├─ Password input field                                │
│       ├─ Sign In / Sign Up toggle                            │
│       └─ "Continue with Google" button                       │
│                                                              │
│  3. Authenticated (user != null)                             │
│     → Full app: Dashboard, History, Performance, Modals      │
│       └─ Sign out button in status bar                       │
└─────────────────────────────────────────────────────────────┘
```

### Startup Sequence

```
main.ts
  │
  ├─ await initAuth()          ← resolves Supabase session
  │
  ├─ createApp(App)
  ├─ app.config.errorHandler   ← global Vue error handler
  ├─ app.config.warnHandler    ← global Vue warning handler
  ├─ createPinia()
  └─ mount('#root')
       │
       └─ App.vue renders based on auth state
```

---

## Cloud Sync Architecture

### Overview

KosKas uses Supabase as its cloud sync backend. The sync layer is **additive** — localStorage remains the primary persistence, and Supabase syncs on top of it. The app works fully offline; sync is a convenience feature for authenticated users.

### Supabase Client (`lib/supabase.ts`)

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Throws if env vars are missing — app won't start without configuration
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

### Sync Service (`services/sync.ts`)

| Function | Purpose |
|----------|---------|
| `fetchPockets(userId)` | Fetch all pockets for user from Supabase |
| `fetchTransactions(userId)` | Fetch all transactions for user from Supabase |
| `upsertPocket(pocket, userId)` | Insert or update a single pocket |
| `upsertTransaction(tx, userId)` | Insert or update a single transaction |
| `upsertAllPockets(pockets, userId)` | Batch upsert all pockets (100 rows/batch) |
| `syncAllTransactions(transactions, userId)` | Batch upsert all transactions (100 rows/batch) |
| `deletePocketRemote(pocketId, userId)` | Delete a pocket from Supabase |
| `deleteTransactionRemote(txId, userId)` | Delete a transaction from Supabase |
| `deleteAllTransactionsRemote(userId)` | Delete all transactions (used during month reset) |

**Key Design:**
- **Batch upsert:** Splits arrays into chunks of 100 rows to stay within Supabase's per-request limits
- **Convention mapping:** Converts between camelCase (app) and snake_case (DB) automatically
- **User-scoped:** All queries include `user_id` filter for data isolation

### Supabase Database Schema

> **Project:** `zwnribcrhhxfzqbpvfet` · **Region:** `ap-southeast-1` · **Engine:** PostgreSQL 17

#### Schema Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Supabase Tables                                 │
│                                                                         │
│  profiles                                                               │
│  ├─ id: uuid              PK, FK → auth.users.id                       │
│  ├─ display_name: text    nullable                                      │
│  ├─ monthly_fund: bigint  nullable, default 0                           │
│  ├─ month_start: bigint   NOT NULL                                     │
│  ├─ created_at: timestamptz  default now()                             │
│  └─ updated_at: timestamptz  default now()                             │
│                                                                         │
│  pockets                                                                │
│  ├─ id: text              NOT NULL ─┐                                  │
│  ├─ user_id: uuid         NOT NULL ─┤ PK (composite), FK → profiles.id │
│  ├─ name: text            NOT NULL  │                                  │
│  ├─ allocation: bigint    NOT NULL, default 0                          │
│  ├─ color_class: text     NOT NULL                                     │
│  ├─ icon: text            NOT NULL                                     │
│  ├─ is_system: boolean    nullable, default false                      │
│  ├─ created_at: timestamptz  default now()                             │
│  └─ updated_at: timestamptz  default now()                             │
│                                                                         │
│  transactions                                                           │
│  ├─ id: text              NOT NULL                                     │
│  ├─ user_id: uuid         NOT NULL  FK → profiles.id                   │
│  ├─ type: text            NOT NULL  CHECK ('expense'|'transfer')       │
│  ├─ from_pocket_id: text  nullable                                     │
│  ├─ to_pocket_id: text    nullable                                     │
│  ├─ amount: bigint        NOT NULL  CHECK (> 0)                        │
│  ├─ timestamp: bigint     NOT NULL                                     │
│  ├─ note: text            nullable                                     │
│  ├─ is_rollover: boolean  nullable, default false                      │
│  ├─ rollover_date: text   nullable                                     │
│  └─ created_at: timestamptz  default now()                             │
│                                                                         │
│  Relationships:                                                         │
│    profiles.id ──1:N──▶ pockets.user_id                                │
│    profiles.id ──1:N──▶ transactions.user_id                            │
│    auth.users.id ──1:1──▶ profiles.id                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Table Definitions

**`public.profiles`** — One row per authenticated user. Auto-created by `handle_new_user()` trigger on signup.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | — | Primary key, mirrors `auth.users.id` |
| `display_name` | `text` | nullable | — | User display name (reserved, not yet used by app) |
| `monthly_fund` | `bigint` | nullable | `0` | Monthly fund amount (reserved, not yet used by app) |
| `month_start` | `bigint` | NOT NULL | — | Unix timestamp (ms) of when the current budget month started |
| `created_at` | `timestamptz` | nullable | `now()` | Row creation timestamp |
| `updated_at` | `timestamptz` | nullable | `now()` | Row last-update timestamp |

**`public.pockets`** — Budget allocation pockets. Each user can have N pockets.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `text` | NOT NULL | — | Client-generated pocket identifier |
| `user_id` | `uuid` | NOT NULL | — | Owner user ID (FK → `profiles.id`) |
| `name` | `text` | NOT NULL | — | Display name of the pocket |
| `allocation` | `bigint` | NOT NULL | `0` | Monthly allocation amount in cents |
| `color_class` | `text` | NOT NULL | — | CSS color class for UI rendering |
| `icon` | `text` | NOT NULL | — | Icon identifier for UI rendering |
| `is_system` | `boolean` | nullable | `false` | Whether this is a system-managed pocket (e.g., rollover) |
| `created_at` | `timestamptz` | nullable | `now()` | Row creation timestamp |
| `updated_at` | `timestamptz` | nullable | `now()` | Row last-update timestamp |

**`public.transactions`** — Expense and transfer records.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `text` | NOT NULL | — | Client-generated transaction identifier |
| `user_id` | `uuid` | NOT NULL | — | Owner user ID (FK → `profiles.id`) |
| `type` | `text` | NOT NULL | — | Transaction type: `'expense'` or `'transfer'` |
| `from_pocket_id` | `text` | nullable | — | Source pocket ID (for expenses and transfers) |
| `to_pocket_id` | `text` | nullable | — | Destination pocket ID (for transfers only) |
| `amount` | `bigint` | NOT NULL | — | Amount in cents (must be > 0) |
| `timestamp` | `bigint` | NOT NULL | — | Unix timestamp (ms) of the transaction |
| `note` | `text` | nullable | — | Optional user note |
| `is_rollover` | `boolean` | nullable | `false` | Whether this is a month-end rollover transaction |
| `rollover_date` | `text` | nullable | — | Target month string for rollover (e.g., `'2026-08'`) |
| `created_at` | `timestamptz` | nullable | `now()` | Row creation timestamp |

#### Primary Keys & Foreign Keys

| Table | Constraint | Type | Columns | References |
|-------|-----------|------|---------|------------|
| `profiles` | `profiles_pkey` | PRIMARY KEY | `id` | — |
| `profiles` | `profiles_id_fkey` | FOREIGN KEY | `id` | `auth.users.id` |
| `pockets` | `pockets_pkey` | PRIMARY KEY | `(id, user_id)` — composite | — |
| `pockets` | `pockets_user_id_fkey` | FOREIGN KEY | `user_id` | `profiles.id` |
| `transactions` | *(none)* | — | — | — |
| `transactions` | `transactions_user_id_fkey` | FOREIGN KEY | `user_id` | `profiles.id` |

> **Note:** The `transactions` table has **no primary key**. Rows are uniquely identified by the combination of `id` + `user_id` at the application level, but this is not enforced by a database constraint.

#### CHECK Constraints

| Table | Constraint | Expression |
|-------|-----------|------------|
| `transactions` | `transactions_type_check` | `type = ANY (ARRAY['expense'::text, 'transfer'::text])` |
| `transactions` | `transactions_amount_check` | `amount > 0` |

#### Indexes

| Index Name | Table | Type | Columns / Expression |
|------------|-------|------|----------------------|
| `profiles_pkey` | `profiles` | UNIQUE btree | `(id)` |
| `pockets_pkey` | `pockets` | UNIQUE btree | `(user_id, id)` |
| `idx_pockets_user` | `pockets` | btree | `(user_id)` |
| `idx_transactions_user` | `transactions` | btree | `(user_id)` |
| `idx_transactions_timestamp` | `transactions` | btree | `(user_id, timestamp DESC)` |
| `idx_transactions_rollover` | `transactions` | btree (partial) | `(user_id, rollover_date)` WHERE `is_rollover = true` |

#### Row Level Security (RLS) Policies

All three tables have RLS enabled. Every policy restricts access to the authenticated user's own rows via `auth.uid()`.

**`profiles`**

| Policy | Command | Condition |
|--------|---------|-----------|
| `profiles_select` | SELECT | `auth.uid() = id` |
| `profiles_insert` | INSERT | WITH CHECK: `auth.uid() = id` |
| `profiles_update` | UPDATE | `auth.uid() = id` |
| `profiles_delete` | DELETE | `auth.uid() = id` |

**`pockets`**

| Policy | Command | Condition |
|--------|---------|-----------|
| `pockets_select` | SELECT | `auth.uid() = user_id` |
| `pockets_insert` | INSERT | WITH CHECK: `auth.uid() = user_id` |
| `pockets_update` | UPDATE | `auth.uid() = user_id` |
| `pockets_delete` | DELETE | `auth.uid() = user_id` |

**`transactions`**

| Policy | Command | Condition |
|--------|---------|-----------|
| `transactions_select` | SELECT | `auth.uid() = user_id` |
| `transactions_insert` | INSERT | WITH CHECK: `auth.uid() = user_id` |
| `transactions_update` | UPDATE | `auth.uid() = user_id` |
| `transactions_delete` | DELETE | `auth.uid() = user_id` |

#### Database Functions

**`handle_new_user()`** — Automatically creates a `profiles` row when a new user signs up.

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER          -- ⚠️ see Security Considerations
SET search_path = ''      -- Fix: prevents search_path hijacking
AS $$
BEGIN
  INSERT INTO public.profiles (id, month_start)
  VALUES (NEW.id, EXTRACT(EPOCH FROM NOW()) * 1000);
  RETURN NEW;
END;
$$;
```

- **Trigger:** Attached to `auth.users` (INSERT event). Fires after each new user registration.
- **Behavior:** Sets `month_start` to the current Unix timestamp in milliseconds, establishing the user's initial budget month.
- **Security:** Runs as `SECURITY DEFINER`, meaning it executes with the privileges of the function owner (typically `postgres`), bypassing RLS. `SET search_path = ''` prevents search_path hijacking attacks.

#### Security Considerations

The following warnings were flagged by the Supabase Security Advisor:

| Level | Issue | Detail |
|-------|-------|--------|
| ⚠️ WARN | Function Search Path Mutable | `handle_new_user()` has a mutable `search_path`, which can be exploited via search_path hijacking | ✅ Fixed: `SET search_path = ''` |
| ⚠️ WARN | Public Can Execute SECURITY DEFINER | `handle_new_user()` is executable by the `anon` role | ⏳ Fix: `REVOKE ALL ON FUNCTION handle_new_user() FROM public, anon, authenticated;` |
| ⚠️ WARN | Signed-In Users Can Execute SECURITY DEFINER | `handle_new_user()` is executable by the `authenticated` role | ⏳ Fix: (same REVOKE as above) |
| ⚠️ WARN | Leaked Password Protection Disabled | Auth setting for leaked password protection is not enabled | ⏳ Fix: Enable in Supabase Dashboard → Authentication → Settings → Security |

**Recommended mitigations:**
1. ✅ Set `search_path` to an empty string in the function definition: `SET search_path = '';`
2. ⏳ Revoke public execute permission: `REVOKE ALL ON FUNCTION handle_new_user() FROM public, anon, authenticated;`
3. ⏳ Enable leaked password protection in Supabase Auth settings
4. ✅ Add Content Security Policy meta tag in `index.html`
5. ✅ Strip console/debugger statements in production builds via `esbuild.drop`
6. ✅ Add client-side email validation before auth submission
7. ✅ Use generic error messages for unknown auth errors (no raw error leakage)
8. ✅ Add `autocomplete` attributes on auth inputs for password manager compatibility
9. ✅ Dev server binds to `localhost` only (no `--host=0.0.0.0`)

#### Installed Extensions

| Extension | Version | Purpose |
|-----------|---------|---------|
| `pgcrypto` | 1.3 | Cryptographic functions (hashing, encryption) |
| `uuid-ossp` | 1.1 | UUID generation utilities |
| `pg_stat_statements` | 1.11 | Query performance statistics tracking |
| `supabase_vault` | 0.3.1 | Secret management for Supabase Edge Functions |
| `pgsodium` | 3.1.8 | libsodium cryptographic operations |

### Sync Flow

```
State Change (any mutation)
  │
  ├─ Deep watcher triggered
  │
  ├─ persistToStorage()          ← immediate localStorage write
  │
  └─ debounced sync (300ms)      ← Supabase sync
       │
       ├─ IF syncEnabled && userId:
       │   ├─ syncAllTransactions()
       │   └─ upsertAllPockets()
       │
       ├─ isSyncing = true       ← shows "SYNCING..." in status bar
       │
       └─ On complete/error:
           ├─ isSyncing = false
           ├─ syncFailed = true/false
           └─ Status bar updates: "SYNC: OK" / "SYNC: OFFLINE"
```

### Initial Load with Sync

```
loadFromStorage() [async]
  │
  ├─ Check Supabase session
  │
  ├─ IF authenticated:
  │   ├─ TRY: fetchPockets() + fetchTransactions()
  │   │
  │   ├─ IF remote data exists:
  │   │   └─ Load remote data into store refs
  │   │       (Note: may include stale transactions from previous months
  │   │        if remote delete failed during a prior month reset — these
  │   │        are safely excluded from balance calculations by the
  │   │        currentMonthTransactions filter on monthStart)
  │   │
  │   └─ IF no remote data but localStorage has data:
  │       ├─ Upload local data to Supabase
  │       └─ Clear local localStorage keys (now synced)
  │
  ├─ IF not authenticated OR fetch fails:
  │   └─ Fall back to localStorage
  │
  ├─ Validate loaded data with type guards
  │
  ├─ checkMonthTransition()
  │   └─ IF loaded month_start < current month:
  │       └─ resetMonth() (with retry on remote delete)
  │
  ├─ isLoaded = true
  └─ updateRollovers()
```

### Environment Variables

```
# .env.example
VITE_SUPABASE_URL="your-supabase-project-url"
VITE_SUPABASE_ANON_KEY="your-supabase-anon-key"
```

---

## State Management

### Pinia Store Structure

The store uses the **composition API pattern** (not options pattern) via `defineStore("main", () => { ... })`.

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Pinia Store ("main")                           │
│                                                                      │
│  ┌─ State (Reactive Refs) ──────────────────────────────────────┐  │
│  │  pockets: Ref<Pocket[]>           // List of all pockets      │  │
│  │  transactions: Ref<Transaction[]> // All transactions         │  │
│  │  monthStart: Ref<number>          // Month start timestamp    │  │
│  │  isLoaded: Ref<boolean>           // Data has loaded          │  │
│  │  storageFailed: Ref<boolean>      // localStorage write fail  │  │
│  │  syncEnabled: Ref<boolean>        // User is authenticated    │  │
│  │  userId: Ref<string | null>       // Current user ID          │  │
│  │  syncFailed: Ref<boolean>         // Supabase sync fail       │  │
│  │  isSyncing: Ref<boolean>          // Active sync in progress  │  │
│  │  suppressWatch: Ref<boolean>      // Prevent watch during     │  │
│  │                                   // rollover recalculation    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌─ Computed Properties ────────────────────────────────────────┐  │
│  │  currentMonthTransactions: ComputedRef<Transaction[]>         │ │
│  │  pocketBalances: Record<string, number>    // Balance per pocket│ │
│  │  totalAllocation: number                   // Total allocation  │ │
│  │  totalRemaining: number                    // Total remaining   │ │
│  │  monthlyPerformance: ComputedRef<...>      // Month comparison  │ │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌─ Actions ────────────────────────────────────────────────────┐  │
│  │  loadFromStorage()                       // Async load + sync │  │
│  │  addExpense(pocketId, amount, note?)     // Record expense    │  │
│  │  addTransfer(from, to, amount, note?)    // Transfer pocket   │  │
│  │  removeTransaction(id)                   // Remove transaction│  │
│  │  addPocket(name, allocation, color, icon)// Create pocket    │  │
│  │  deletePocket(id, transferTo?)           // Delete pocket     │  │
│  │  updatePocketAllocation(id, amount)      // Update 1 pocket   │  │
│  │  updateAllAllocations(newAllocs)         // Update all        │  │
│  │  updateRollovers()                       // Recalc rollovers  │  │
│  │  resetMonth()                            // Archive + reset   │  │
│  │  persistToStorage()                      // Write localStorage │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### State: Reactive Refs

| Ref | Type | Default | Purpose |
|-----|------|---------|---------|
| `pockets` | `Ref<Pocket[]>` | `[]` (loaded from storage) | List of all active pockets |
| `transactions` | `Ref<Transaction[]>` | `[]` (loaded from storage) | All transactions, sorted desc by timestamp |
| `monthStart` | `Ref<number>` | `Date.now()` | Start timestamp of the monthly period |
| `isLoaded` | `Ref<boolean>` | `false` | Guard to prevent persistence before data is loaded |
| `storageFailed` | `Ref<boolean>` | `false` | True when localStorage write fails (shows red banner) |
| `syncEnabled` | `Ref<boolean>` | `false` | True when user is authenticated |
| `userId` | `Ref<string \| null>` | `null` | Current user's Supabase ID |
| `syncFailed` | `Ref<boolean>` | `false` | True when Supabase sync fails (shows amber banner) |
| `isSyncing` | `Ref<boolean>` | `false` | True during active sync operation |
| `suppressWatch` | `Ref<boolean>` | `false` | Prevents watcher during `updateRollovers()` |

### Computed Properties

#### `currentMonthTransactions`

Filters `transactions.value` to include only transactions where `timestamp >= monthStart`. This ensures that stale transactions from previous months (e.g., leaked due to a failed remote delete during month reset) never affect current-month balance calculations.

```typescript
const currentMonthTransactions = computed(() =>
    transactions.value.filter(t => t.timestamp >= monthStart.value)
);
```

**Exported** from the store for reuse in components (e.g., `App.vue`'s `pocketStats`).

#### `pocketBalances`

Calculates each pocket's balance in real-time using `currentMonthTransactions` (filtered by `monthStart`).

```
balance(pocket) = allocation
                + Σ(transfers TO pocket)    // current month only
                - Σ(transfers FROM pocket)  // current month only
                - Σ(expenses FROM pocket)   // current month only
```

**Implementation detail:**
- Single-pass aggregation over `currentMonthTransactions` (filtered by `monthStart`)
- Return type: `Record<string, number>` — keyed by `pocket.id`
- **Performance:** O(P + T_current) where P = pocket count, T_current = current-month transaction count
- **Resilience:** Even if stale transactions from a previous month exist in `transactions.value` (e.g., remote delete failed during month reset), they are excluded from balance calculations by the `monthStart` filter

#### `totalAllocation`

```
totalAllocation = Σ(pocket.allocation) for all pockets
```

#### `totalRemaining`

```
totalRemaining = Σ(pocketBalances[pocket.id]) for all pockets
```

#### `monthlyPerformance`

Complex aggregation comparing current vs previous month spending per pocket. Used by the Performance Dashboard view. Returns per-pocket allocation, spent, remaining, utilization %, and comparison vs previous month.

### Persistence Strategy

The deep watcher now performs **dual persistence** — localStorage and Supabase sync:

```typescript
watch(
    [transactions, pockets, monthStart, isLoaded],
    () => {
        if (!isLoaded.value) return;      // Guard: don't persist before load
        if (suppressWatch.value) return;   // Guard: don't sync during rollover recalc

        persistToStorage();                // Immediate localStorage write
        debouncedSync();                   // 300ms debounced Supabase sync
    },
    { deep: true }
);
```

**Characteristics:**
- **Deep watcher:** Detects changes on nested objects/arrays (e.g., `pockets[0].allocation = 500000`)
- **`isLoaded` guard:** Prevents writing empty data during initialization
- **`suppressWatch` guard:** Prevents sync during `updateRollovers()` — rollovers are local-only calculations
- **`persistToStorage()`:** Extracted as a separate function with `storageFailed` error tracking
- **Debounced sync:** 300ms debounce prevents excessive Supabase API calls on rapid mutations
- **Dual write:** localStorage is synchronous and immediate; Supabase is async and debounced

### Rollover Persistence

`updateRollovers()` wraps its work in `suppressWatch = true/false` to prevent the deep watcher from triggering during rollover recalculation. After rollovers are updated, it calls `persistToStorage()` directly to save the final state:

```
updateRollovers():
    suppressWatch.value = true
    // ... recalculate rollovers, modify transactions array ...
    suppressWatch.value = false
    persistToStorage()    // Direct save, bypassing the watcher
```

---

## Component Architecture

### App.vue (Root Component)

**Responsibilities:**
- Auth gate: renders login screen or app based on auth state
- Main layout orchestration: header, dashboard grid, transaction history, performance dashboard, FABs
- State management for 3 modal visibility (`isKeypadOpen`, `isPocketSettingsOpen`, `isTransferOpen`)
- View switching: Dashboard, History, Performance
- Computed properties for display: `daysRemaining`, `pocketStats`, `dailyPanganStats`, `currentDateStr`
- Icon resolution: delegates to `iconMap.ts` via `resolveIcon()`
- Pocket lookup memoization: `pocketMap` computed to avoid O(N×M) lookups
- Status banners: storage failure (red), sync failure (amber), sync status indicator
- Month navigation for performance dashboard

**Template Structure:**

```
App.vue
├── Auth Loading Guard (v-if="auth.loading")
├── Login Screen (v-else-if="!auth.user")
│   ├── Email/Password fields
│   ├── Sign In / Sign Up toggle
│   └── "Continue with Google" button
├── App Container (v-else)
│   ├── Status Banners
│   │   ├── Storage Failed Banner (red): "Storage unavailable..."
│   │   └── Sync Failed Banner (amber): "Supabase sync failed..."
│   ├── Status Bar ("V3.2-TACTICAL • date • SYNC: OK/SYNCING/OFFLINE")
│   ├── Header
│   │   ├── Total Remaining (big number)
│   │   ├── Status Badge (Aman / Warning / Danger)
│   │   ├── Days until reset counter
│   │   └── Sign Out button
│   ├── View Toggle (Dashboard / History / Performance tabs)
│   ├── Content Area (Transition: fade)
│   │   ├── Dashboard View
│   │   │   ├── Daily Pangan Target Card
│   │   │   └── Pocket Cards Grid (v-for pocket)
│   │   ├── History View
│   │   │   ├── Action Bar (Transfer, Alokasi, Reset buttons)
│   │   │   └── Transaction List (TransitionGroup, v-for transaction)
│   │   └── Performance View
│   │       ├── Month Navigation (prev/next, "Bulan Ini" button)
│   │       ├── Overall Spending Comparison Card
│   │       ├── Summary Cards (allocation, spent, utilization)
│   │       ├── Per-Pocket Analysis (utilization bars, badges)
│   │       ├── Per-Pocket Detail Table
│   │       └── Monthly Transaction History Table
│   ├── Floating Action Buttons
│   │   ├── Transfer Button
│   │   ├── Alokasi Button
│   │   └── Add Expense FAB (green + button)
│   └── Modals
│       ├── KeypadModal
│       ├── PocketSettingsModal
│       └── TransferModal
```

**Key Computed Properties:**

| Property | Return Type | Purpose |
|----------|-------------|---------|
| `pocketMap` | `Record<string, Pocket>` | Memoized lookup map, avoids `.find()` inside loops |
| `daysRemaining` | `number` | Days left until end of month |
| `pocketStats` | `Record<string, { spent, remaining, percentage, isOver }>` | Per-pocket stats for progress bars |
| `dailyPanganStats` | `{ dailyTarget, remainingToday, spentToday }` | Today's food budget stats |
| `currentDateStr` | `string` | Format: "Day, Date Month Year" (Indonesian) |
| `monthlyPerformance` | `object` | Aggregated month-over-month spending comparison |
| `selectedMonthTransactions` | `Transaction[]` | Transactions for selected performance month |
| `previousMonthTransactions` | `Transaction[]` | Transactions for previous month (comparison) |
| `selectedMonthName` | `string` | Indonesian month name for selected period |

### iconMap.ts

Extracted from App.vue into its own module for testability and separation of concerns:

```typescript
import { Utensils, Home, Fuel, Coffee, ... } from 'lucide-vue-next';

export const iconMap: Record<string, Component> = {
    'Utensils': Utensils,
    'Home': Home,
    'Fuel': Fuel,
    'Coffee': Coffee,
    'ShieldAlert': ShieldAlert,
    'PiggyBank': PiggyBank,
    'Coins': Coins,
    'ShoppingBag': ShoppingBag,
    'Gamepad2': Gamepad2,
    'Heart': Heart,
    'BookOpen': BookOpen,
    'Plane': Plane,
    'Car': Car,
    'Gift': Gift,
    'Sparkles': Sparkles,
    // Utility icons
    'Trash2': Trash2,
    'Plus': Plus,
    'X': X,
    // ... 27 icons total
};

export const resolveIcon = (name: string): Component =>
    iconMap[name] || icons.Sparkles;  // Fallback to Sparkles
```

### KeypadModal.vue

**Responsibilities:**
- Expense input via numeric keypad
- Pocket selector (horizontal scroll)
- Real-time amount display in Rupiah format

**Props & Events:**

```typescript
// Props
{ isOpen: boolean }

// Events
"close"                    // User closed modal
"save" (pocketId, amount)  // User saved expense
```

**State:**

| Ref | Type | Default | Purpose |
|-----|------|---------|---------|
| `amountStr` | `string` | `"0"` | Keypad input string |
| `selectedPocketId` | `string` | `"pangan"` | Selected pocket for expense |

**Keypad Layout:**

```
┌─────┬─────┬─────┐
│  1  │  2  │  3  │
├─────┼─────┼─────┤
│  4  │  5  │  6  │
├─────┼─────┼─────┤
│  7  │  8  │  9  │
├─────┼─────┼─────┤
│ 000 │  0  │ DEL │
└─────┴─────┴─────┘
```

**Pocket Filtering:** "saving" and "leftover" pockets are filtered from the selector since they are not relevant for direct expenses.

**Haptic Feedback:** `vibrate(10)` on key press, `vibrate([30, 50, 30])` on save.

### PocketSettingsModal.vue

**Responsibilities:**
- Monthly budget allocation per pocket
- Custom pocket CRUD (create, delete)
- Inline numeric keypad for editing allocations
- Total allocation vs monthly fund validation
- Automatic saving calculation (remainder = monthly fund - sum allocations)

**Props & Events:**

```typescript
// Props
{ isOpen: boolean }

// Events
"close"  // User closed modal (after save or cancel)
```

**State:**

| Ref | Type | Default | Purpose |
|-----|------|---------|---------|
| `monthlyFund` | `number` | `store.totalAllocation` | Total monthly income |
| `localAllocations` | `Record<string, number>` | Copy from store | Local draft before save |
| `editingId` | `string \| null` | `null` | Pocket ID being edited (shows keypad) |
| `editValueStr` | `string` | `"0"` | Value string while editing |
| `showAddForm` | `boolean` | `false` | Toggle new pocket form |
| `newPocketName` | `string` | `""` | New pocket name |
| `newPocketIcon` | `string` | `"Sparkles"` | New pocket icon |
| `newPocketColor` | `string` | First color | New pocket color |
| `newPocketAllocation` | `number` | `0` | New pocket allocation |

**Computed Properties:**

| Property | Formula | Purpose |
|----------|---------|---------|
| `totalAllocatedExceptSaving` | `Σ(allocations)` excluding `saving` & `leftover` | Total already allocated |
| `calculatedSavingAllocation` | `max(0, monthlyFund - totalAllocatedExceptSaving)` | Automatic remainder to Savings |
| `isAllocationValid` | `monthlyFund >= totalAllocatedExceptSaving` | Guard: cannot over-budget |

**Save Flow:**
```
handleSaveAll()
  ├─ Validate: isAllocationValid
  ├─ Build finalAllocations = { ...localAllocations }
  ├─ Set saving = calculatedSavingAllocation
  ├─ Set leftover = 0 (always)
  ├─ store.updateAllAllocations(finalAllocations)
  └─ emit("close")
```

### TransferModal.vue

**Responsibilities:**
- Transfer balance between pockets
- Validation: amount must not exceed sender balance
- Auto-avoid: `toPocketId` auto-adjusts if equal to `fromPocketId`

**Props & Events:**

```typescript
// Props
{ isOpen: boolean }

// Events
"close"  // User closed modal
```

**State:**

| Ref | Type | Default | Purpose |
|-----|------|---------|---------|
| `fromPocketId` | `string` | First pocket | Source pocket |
| `toPocketId` | `string` | Second pocket | Destination pocket |
| `amountStr` | `string` | `"0"` | Transfer amount |
| `transferNote` | `string` | `""` | Optional note |

**Validation Logic:**

```typescript
const isTransferValid = computed(() => {
    return fromPocketId.value
        && toPocketId.value
        && fromPocketId.value !== toPocketId.value  // Cannot self-transfer
        && amount.value > 0                           // Must be positive
        && amount.value <= fromPocketBalance.value;   // Must not exceed balance
});
```

---

## Business Logic Deep-Dive

### 1. Balance Calculation

**Location:** `store.ts` → `pocketBalances` computed

```
┌────────────────────────────────────────────────────────────────────┐
│                   Balance Calculation Formula                       │
│                                                                     │
│   balance(pocket) = allocation(pocket)                              │
│                   + Σ transfer.amount WHERE toPocketId = pocket.id  │
│                   - Σ transfer.amount WHERE fromPocketId = pocket.id│
│                   - Σ expense.amount  WHERE fromPocketId = pocket.id│
└────────────────────────────────────────────────────────────────────┘
```

**Implementation:**

```typescript
const pocketBalances = computed(() => {
    const balances: Record<string, number> = {};
    for (const p of pockets.value) balances[p.id] = p.allocation;

    for (const t of transactions.value) {
        if (t.type === 'expense' && t.fromPocketId && t.fromPocketId in balances) {
            balances[t.fromPocketId] -= t.amount;
        } else if (t.type === 'transfer') {
            if (t.fromPocketId && t.fromPocketId in balances) balances[t.fromPocketId] -= t.amount;
            if (t.toPocketId && t.toPocketId in balances) balances[t.toPocketId] += t.amount;
        }
    }
    return balances;
});
```

**Performance Characteristics:**
- Single pass through all transactions
- Total: `P + T` operations where P = pockets count, T = transactions count
- Vue recomputes only when `transactions` or `pockets` refs change

### 2. Daily Pangan Rollover Algorithm

**Location:** `store.ts` → `updateRollovers()`

**Purpose:** Calculate and record leftover daily food budget into the "Sisa Pangan" pocket.

**Algorithm:**

```
updateRollovers():
    suppressWatch = true

    1. Get current date info:
       - year, month, todayDate
       - totalDays = days in current month

    2. Get pangan pocket allocation
       dailyLimit = floor(panganAllocation / totalDays)

    3. Determine evaluation range:
       - startDay = max(1, monthStart day if same month, else 1)
       - endDay = todayDate - 1 (yesterday)

    4. Pre-index pangan expenses by date (single pass):
       FOR each transaction t in transactions:
         IF t.type = "expense" AND t.fromPocketId = POCKET_IDS.PANGAN:
           d = new Date(t.timestamp)
           IF d.year = year AND d.month = month:
             key = d.day
             expensesByDate[key] += t.amount

    5. For each day d in [startDay, yesterday]:
       a. Calculate dateString = "YYYY-MM-DD"

       b. Get pre-indexed expense sum:
          spentOnDay = expensesByDate[d] || 0

       c. Calculate leftover:
          leftoverAmount = max(0, dailyLimit - spentOnDay)

       d. Find existing rollover for this date:
          existingIndex = findIndex(tx WHERE tx.isRollover AND tx.rolloverDate = dateString)

       e. Update or create rollover:
          IF leftoverAmount > 0:
            IF existing rollover found:
              UPDATE existing.amount = leftoverAmount
            ELSE:
              CREATE new transfer:
                id: "rollover-{dateString}"
                type: "transfer"
                fromPocketId: POCKET_IDS.PANGAN
                toPocketId: POCKET_IDS.LEFTOVER
                amount: leftoverAmount
                timestamp: endOfDay + 1  // ensures correct sort order
                isRollover: true
                rolloverDate: dateString
                note: "Sisa pangan harian ({d}/{month+1})"
          ELSE (no leftover):
            IF existing rollover found:
              DELETE it (splice from array)

    6. Insert rollover transactions using binary search (insertSorted)
       instead of sort-after-insert

    suppressWatch = false
    persistToStorage()
```

**Binary Search Insertion (`insertSorted`):**

```typescript
function insertSorted(tx: Transaction): void {
    let lo = 0, hi = transactions.value.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (transactions.value[mid].timestamp > tx.timestamp) lo = mid + 1;
        else hi = mid;
    }
    transactions.value.splice(lo, 0, tx);
}
```

Replaces the previous sort-after-insert pattern. O(log n) find + O(n) splice, avoiding a full O(n log n) sort on every insertion.

**When `updateRollovers()` runs:**
- On `loadFromStorage()` completion
- After every `addExpense()`, `addTransfer()`, `removeTransaction()`
- After `addPocket()`, `deletePocket()`, `updatePocketAllocation()`, `updateAllAllocations()`
- After `resetMonth()`

**Edge Cases:**
- Today is not evaluated — only past days
- If `monthStart` is not the 1st, evaluation starts from `monthStart.day`
- Rollover transactions use `endOfDay + 1` as timestamp to sort after same-day expenses
- Rollover ID is deterministic: `"rollover-YYYY-MM-DD"` — ensures one rollover per date
- `suppressWatch` prevents the deep watcher from triggering sync during recalculation

**Performance:** O(T + D) where T = total transactions, D = days evaluated (max 31), instead of original O(D × T).

### 3. Pocket Deletion Flow

**Location:** `store.ts` → `deletePocket()`

**Algorithm:**

```
deletePocket(id, transferBalanceToPocketId?):
    1. Find pocket by id
       IF not found: return
       IF pocket.isSystem: return (cannot delete system pockets)

    2. Calculate remaining balance
       balance = pocketBalances[id]

    3. IF balance > 0 AND transferBalanceToPocketId provided:
       CREATE transfer: fromPocketId=id, toPocketId=transferBalanceToPocketId,
                        amount=balance, note="Remaining balance from deleted pocket {name}"
       Store the transfer ID for protection

    4. Remove pocket from pockets array
       pockets.splice(pocketIndex, 1)

    5. Rewrite historical transaction references (skip preservation transfer):
       FOR EACH transaction in transactions:
         IF tx.id === preservationTransferId: SKIP
         IF tx.fromPocketId = id: tx.fromPocketId = POCKET_IDS.SAVING
         IF tx.toPocketId = id:   tx.toPocketId = POCKET_IDS.SAVING

    6. Recalculate rollovers
       updateRollovers()
```

### 4. Month Archive & Reset

**Location:** `store.ts` → `resetMonth()`

`resetMonth()` now archives the current month's data before clearing:

```
resetMonth():
    1. Build archive entry:
       {
         timestamp: Date.now(),
         transactions: [...transactions.value],
         pockets: [...pockets.value],
         monthStart: monthStart.value
       }

    2. Load existing archives from localStorage ("koskas_archives")
       Keep maximum 6 archives (FIFO — oldest dropped)

    3. Save archives back to localStorage

    4. IF syncEnabled:
       deleteAllTransactionsRemote(userId) with retry logic:
         - Up to 3 attempts with exponential backoff
         - Delays: 1s, 2s, 3s between retries
         - Failures after all retries are logged but do not block reset
         (Resilience: even if remote delete ultimately fails, stale
          transactions are excluded from balances via monthStart filter
          in currentMonthTransactions / pocketBalances)

    5. Reset store state:
       transactions.value = []
       pockets.value = DEFAULT_POCKETS (with original allocations)
       monthStart.value = Date.now()

    6. updateRollovers()
```

### 5. Data Validation on Load

**Location:** `store.ts` → `loadFromStorage()` / `loadFromLocalStorage()`

All data loaded from localStorage is validated with runtime type guards:

```
loadFromLocalStorage():
    ├─ Parse JSON from localStorage
    ├─ IF parsed data is array:
    │   ├─ Validate each pocket with isValidPocket(p)
    │   ├─ Validate each transaction with isValidTransaction(t)
    │   └─ Filter out invalid entries
    ├─ IF validation fails entirely:
    │   └─ Fall back to DEFAULT_POCKETS / empty transactions
    └─ Legacy migration also filters through isValidTransaction
```

### 6. Legacy Data Migration

**Location:** `store.ts` → `loadFromStorage()`

```
loadFromStorage():
    ┌─ POCKETS ─────────────────────────────────────────────────────────┐
    │ IF localStorage has "koskas_pockets":                             │
    │   TRY: parse JSON → validate with isValidPocket → pockets.value   │
    │   CATCH: use DEFAULT_POCKETS                                      │
    │ ELSE IF localStorage has "koskas_budgets" (legacy):               │
    │   TRY: parse JSON → map DEFAULT_POCKETS with legacy allocations   │
    │   CATCH: use DEFAULT_POCKETS                                      │
    │ ELSE:                                                             │
    │   use DEFAULT_POCKETS                                             │
    └───────────────────────────────────────────────────────────────────┘

    ┌─ TRANSACTIONS ───────────────────────────────────────────────────┐
    │ IF localStorage has "koskas_transactions":                        │
    │   TRY: parse JSON → validate with isValidTransaction → tx.value   │
    │   CATCH: empty array                                              │
    │ ELSE IF localStorage has "koskas_expenses" (legacy):              │
    │   TRY: parse JSON → map to new Transaction format + validate      │
    │   CATCH: empty array                                              │
    │ ELSE:                                                             │
    │   empty array                                                     │
    └───────────────────────────────────────────────────────────────────┘

    ┌─ MONTH START ─────────────────────────────────────────────────────┐
    │ IF localStorage has "koskas_month_start":                         │
    │   parse int → monthStart.value (or Date.now() if invalid)         │
    │ ELSE:                                                             │
    │   Date.now()                                                      │
    └───────────────────────────────────────────────────────────────────┘

    isLoaded = true
    updateRollovers()  // Auto-trigger on load
```

---

## Data Flow

### App Startup (with Auth + Sync)

```
main.ts
  │
  ├─ await initAuth()
  │   ├─ supabase.auth.getSession()
  │   └─ onAuthStateChange subscription
  │
  ├─ createApp(App)
  ├─ app.config.errorHandler / warnHandler
  ├─ app.use(createPinia())
  └─ app.mount('#root')
       │
       └─ App.vue
           │
           ├─ IF loading → show loading screen
           ├─ IF no user → show login screen
           └─ IF user → mount app, call store.loadFromStorage()
               │
               ├─ IF syncEnabled:
               │   ├─ TRY: fetchPockets() + fetchTransactions()
               │   ├─ IF remote data → load into store
               │   └─ IF no remote data + local data exists:
               │       ├─ Upload local → Supabase
               │       └─ Clear localStorage keys
               │
               ├─ IF not authenticated OR fetch fails:
               │   └─ Load from localStorage (validated)
               │
               ├─ isLoaded = true
               └─ updateRollovers()
```

### User Action: Add Expense

```
User clicks FAB (+)
  │
  ▼
KeypadModal opens
  │  (isKeypadOpen = true)
  ▼
User selects pocket, enters amount
  │
  ▼
User clicks "Simpan"
  │
  ├─ emit("save", pocketId, amount)
  ├─ emit("close")
  │
  ▼
App.vue: handleAddExpense(pocketId, amount)
  │
  ▼
store.addExpense(pocketId, amount)
  │
  ├─ Create Transaction object:
  │    { id: generateId(), type: "expense", fromPocketId, amount, timestamp: Date.now() }
  │
  ├─ transactions.value.unshift(newTransaction)  ← reactive mutation
  │
  └─ updateRollovers()
       │
       ├─ suppressWatch = true
       ├─ Recalculate daily pangan rollovers for past days
       ├─ May add/modify/remove rollover transactions
       ├─ insertSorted() via binary search
       ├─ suppressWatch = false
       └─ persistToStorage()

  ┌─── Deep Watcher Triggered ───┐
  │                               │
  │  persistToStorage():          │
  │  ├─ koskas_transactions       │
  │  └─ koskas_month_start        │
  │                               │
  │  debouncedSync() (300ms):     │
  │  ├─ upsertTransaction(new)    │
  │  └─ syncAllTransactions()     │
  └───────────────────────────────┘

  ┌─── Computed Properties Recalculated ───┐
  │                                         │
  │  pocketBalances → recomputed            │
  │  totalRemaining → recomputed            │
  │  pocketStats → recomputed (App.vue)     │
  │  dailyPanganStats → recomputed (App.vue)│
  └─────────────────────────────────────────┘

  ┌─── UI Re-renders ──────────────────────┐
  │                                         │
  │  Dashboard cards update balances        │
  │  Progress bars animate                  │
  │  Status badges may change               │
  │  Sync status updates (OK → SYNCING → OK)│
  └─────────────────────────────────────────┘
```

### User Action: Pocket Settings Save

```
User opens PocketSettingsModal
  │
  ├─ Watch triggers: copy store data to local state
  │   monthlyFund = store.totalAllocation
  │   localAllocations = { ...store pocket allocations }
  │
  ▼
User edits allocations (monthly fund, per-pocket amounts)
  │  (all changes go to local refs, not store yet)
  │
  ▼
User clicks "Simpan Alokasi"
  │
  ▼
handleSaveAll()
  │
  ├─ Validate: isAllocationValid
  │
  ├─ Build finalAllocations:
  │   { ...localAllocations, saving: calculatedSavingAllocation, leftover: 0 }
  │
  ├─ store.updateAllAllocations(finalAllocations)
  │   │
  │   ├─ FOR EACH [id, amount] in finalAllocations:
  │   │   pocket.allocation = amount
  │   │
  │   └─ updateRollovers()  ← daily limit changes affect rollovers
  │
  └─ emit("close")

  ┌─── Deep Watcher Triggered ───┐
  │  persistToStorage()           │
  │  debouncedSync()              │
  └───────────────────────────────┘

  ┌─── Computed Recalculated ────┐
  │  pocketBalances (allocations  │
  │  changed → all balances shift)│
  └───────────────────────────────┘
```

### User Action: Reset Month

```
User clicks "Reset" button in History view
  │
  ▼
store.resetMonth()
  │
  ├─ Archive current data:
  │   ├─ Build archive entry { timestamp, transactions, pockets, monthStart }
  │   ├─ Load existing archives from "koskas_archives"
  │   ├─ Keep max 6 archives (drop oldest)
  │   └─ Save to localStorage
  │
  ├─ IF syncEnabled:
  │   └─ deleteAllTransactionsRemote(userId)
  │
  ├─ Reset state:
  │   ├─ transactions.value = []
  │   ├─ pockets.value = DEFAULT_POCKETS
  │   └─ monthStart.value = Date.now()
  │
  └─ updateRollovers()

  ┌─── Deep Watcher Triggered ───┐
  │  persistToStorage()           │
  │  debouncedSync()              │
  └───────────────────────────────┘
```

---

## Performance Dashboard

### Overview

App.vue includes a `showPerformance` view (toggled via a BarChart3 icon button) that provides a monthly spending analysis with month-over-month comparison.

### Features

- **Month Navigation:** Previous/next month buttons + "Bulan Ini" (This Month) quick jump
- **Overall Spending Comparison:** Card showing "Lebih Boros" (more spending) or "Hemat" (less spending) percentage vs previous month
- **Summary Cards:**
  - Total Alokasi (total allocation for the month)
  - Total Terpakai (total spent)
  - Utilisasi Keseluruhan (overall utilization %)
- **Per-Pocket Analysis:**
  - Utilization progress bars
  - Boros/Hemat badges per pocket
- **Per-Pocket Detail Table:**
  - Allocation, spent, remaining, utilization %
  - Comparison vs last month
  - Transaction count
- **Monthly Transaction History Table:** All transactions for the selected month

### Computed Properties

| Property | Purpose |
|----------|---------|
| `monthlyPerformance` | Complex aggregation: per-pocket spending, allocation, utilization, vs previous month |
| `selectedMonthTransactions` | Transactions filtered to the selected month |
| `previousMonthTransactions` | Transactions filtered to the month before selected |
| `selectedMonthName` | Indonesian locale month name for display |

---

## Testing Infrastructure

### Configuration

**`vitest.config.ts`:**
```typescript
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: { '@': path.resolve(__dirname, 'src') }
    },
    test: {
        environment: 'happy-dom',
        setupFiles: ['./src/test-setup.ts'],
        globals: true
    }
});
```

### Test Setup (`test-setup.ts`)

Mocks the following for isolated testing:
- **Supabase client** — prevents real API calls during tests
- **Sync service** — stubs all remote CRUD operations
- **structuredClone** — polyfill for test environment
- **localStorage** — controlled mock for persistence tests

### Test Files

| File | Lines | Coverage |
|------|-------|----------|
| `src/store.test.ts` | 1383 | Store actions, computed properties, rollover logic, persistence, sync, validation |
| `src/types.test.ts` | 446 | Utility functions: `formatRupiah`, `parseAmount`, `vibrate`, `hexFromColorClass`, `generateId`, type guards |
| `src/iconMap.test.ts` | 96 | Icon mapping: `resolveIcon`, fallback behavior, completeness |
| `src/components/__tests__/components.dev.test.ts` | 860 | Developer-focused: props, events, state management, edge cases |
| `src/components/__tests__/components.ux.test.ts` | 1125 | UX-focused: user flows, accessibility, visual states, interactions |

### Package Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `test` | `vitest run` | Run all tests once |
| `test:watch` | `vitest` | Run tests in watch mode |

### Dev Dependencies

| Package | Purpose |
|---------|---------|
| `vitest` | Test runner with Vite integration |
| `@pinia/testing` | Pinia store testing utilities |
| `@vue/test-utils` | Vue component testing utilities |
| `happy-dom` | Lightweight DOM implementation for tests |
| `jsdom` | Alternative DOM implementation |
| `vue-tsc` | Vue TypeScript type checking |

---

## Design System

### Color Palette

```
┌─────────────────────────────────────────────────────────────────┐
│                      COLOR SYSTEM                                │
│                                                                   │
│  Background Colors:                                               │
│  ┌──────────┐  ┌──────────┐                                      │
│  │#050505   │  │#121212   │                                      │
│  │bg-primary│  │bg-surface│                                      │
│  │(page bg) │  │(card bg) │                                      │
│  └──────────┘  └──────────┘                                      │
│                                                                   │
│  Text Colors:                                                     │
│  ┌──────────┐  ┌──────────┐                                      │
│  │#FAFAFA   │  │#71717A   │                                      │
│  │text-     │  │text-     │                                      │
│  │primary   │  │muted     │                                      │
│  └──────────┘  └──────────┘                                      │
│                                                                   │
│  Neon Accent Colors:                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │#10B981   │  │#F59E0B   │  │#EF4444   │  │#8B5CF6   │        │
│  │neon-safe │  │neon-warn │  │neon-danger│ │neon-vault│        │
│  │(success) │  │(warning) │  │(error)   │  │(savings) │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

**Semantic Usage:**
- `bg-bg-primary` — Page background, modal overlays
- `bg-bg-surface` — Cards, modals, elevated elements
- `text-text-primary` — Main body text, headings
- `text-text-muted` — Labels, secondary info, timestamps
- `bg-neon-safe` / `text-neon-safe` — Positive states, available balance, save buttons
- `bg-neon-warn` / `text-neon-warn` — Warning states, transfer actions
- `bg-neon-danger` / `text-neon-danger` — Error states, over-budget, delete actions
- `text-neon-vault` — Savings-specific elements

### Typography

| Role | Font Family | Weights | Usage |
|------|-------------|---------|-------|
| **Sans** | Inter | 400, 500, 600 | Body text, labels, buttons |
| **Mono** | JetBrains Mono | 600, 700, 800 | Numbers, amounts, technical info, status bar |

**Font Loading:** Preconnected via Google Fonts in `index.html`:
```
Inter: 400;500;600
JetBrains Mono: 600;700;800
```

### Custom Breakpoints

KosKas **does not use** default Tailwind breakpoints (sm, md, lg, xl). Instead, it uses custom breakpoints:

```css
/* Defined in AGENT.md, referenced in components */
mobile-sm:  480px   /* Small phones */
mobile:     640px   /* Standard phones (≈ Tailwind sm) */
tablet:     768px   /* Tablets (≈ Tailwind md) */
laptop-sm:  1024px  /* Small laptops (≈ Tailwind lg) */
laptop:     1280px  /* Standard laptops (≈ Tailwind xl) */
desktop:    1440px  /* Desktops */
desktop-lg: 1600px  /* Large desktops */
```

**Note:** These breakpoints are defined in `AGENT.md` as guidelines for AI coding assistants. The actual implementation in `index.css` uses Tailwind v4 default breakpoints (`sm:` = 640px) in some places, meaning custom breakpoints are not yet fully configured in the Tailwind config.

### UI Patterns

#### Card Design
```html
<div class="bg-bg-surface p-5 rounded-sm border-l-4 flex flex-col justify-between">
  <!-- Content with left border accent -->
</div>
```

#### Status Badge
```html
<div class="px-3 py-1 text-bg-primary text-[10px] font-bold uppercase rounded-sm
            bg-neon-safe / bg-neon-warn / bg-neon-danger">
  Aman / Warning / Danger
</div>
```

#### Progress Bar
```html
<div class="w-full h-2 bg-[#1E1E1E] rounded-xs overflow-hidden">
  <div class="h-full transition-all duration-300 ease-out bg-neon-safe"
       style="width: {percentage}%"></div>
</div>
```

#### Floating Action Button (FAB)
```html
<button class="w-16 h-16 sm:w-20 sm:h-20 bg-neon-safe text-bg-primary rounded-full
               flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.3)]
               hover:scale-95 active:scale-90 transition-transform">
  <Plus :size="36" />
</button>
```

#### Modal Slide-Up
```css
/* All modals use slide-up transition from bottom */
.slide-up-enter-active { transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.slide-up-enter-from   { transform: translateY(100%); }
```

#### Tactical Status Bar
```html
<div class="font-mono text-[10px] text-text-muted">
  V3.2-TACTICAL • {currentDateStr} • SYNC: OK
</div>
```

#### Status Banners
```html
<!-- Storage failure (red) -->
<div class="bg-neon-danger/10 text-neon-danger px-4 py-2 text-xs">
  Storage unavailable — data will be lost when you close this tab
</div>

<!-- Sync failure (amber) -->
<div class="bg-neon-warn/10 text-neon-warn px-4 py-2 text-xs">
  Supabase sync failed — changes saved locally, retrying automatically
</div>
```

---

## LocalStorage Schema

### Keys

| Key | Type | Purpose |
|-----|------|---------|
| `koskas_transactions` | JSON string | Array of `Transaction` objects (validated on load) |
| `koskas_pockets` | JSON string | Array of `Pocket` objects (validated on load) |
| `koskas_month_start` | String (number) | Unix timestamp (ms) of month start |
| `koskas_archives` | JSON string | Array of monthly archive objects (max 6) |

### Data Shapes

#### `koskas_transactions`

```json
[
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "type": "expense",
    "fromPocketId": "pangan",
    "amount": 25000,
    "timestamp": 1719856800000,
    "note": "Makan siang"
  },
  {
    "id": "rollover-2024-07-01",
    "type": "transfer",
    "fromPocketId": "pangan",
    "toPocketId": "leftover",
    "amount": 15000,
    "timestamp": 1719878399999,
    "isRollover": true,
    "rolloverDate": "2024-07-01",
    "note": "Sisa pangan harian (1/7)"
  }
]
```

#### `koskas_pockets`

```json
[
  {
    "id": "pangan",
    "name": "Pangan",
    "allocation": 1500000,
    "colorClass": "bg-[#10B981] text-black",
    "icon": "Utensils",
    "isSystem": true
  },
  {
    "id": "pocket_x7k2m9",
    "name": "Belanja",
    "allocation": 200000,
    "colorClass": "bg-[#F97316] text-black",
    "icon": "ShoppingBag",
    "isSystem": false
  }
]
```

#### `koskas_month_start`

```
"1719792000000"
```

String representation of Unix timestamp in milliseconds.

#### `koskas_archives`

```json
[
  {
    "timestamp": 1719792000000,
    "transactions": [ ... ],
    "pockets": [ ... ],
    "monthStart": 1719792000000
  }
]
```

Array of archived monthly data. Maximum 6 entries; oldest is dropped when a new archive is added during `resetMonth()`.

### Data Validation

All data loaded from localStorage is validated with runtime type guards:

- `isValidPocket(p: unknown): p is Pocket` — checks required fields and types
- `isValidTransaction(t: unknown): t is Transaction` — checks required fields and types
- Invalid entries are silently filtered out; if all entries are invalid, defaults are used
- Legacy migration data is also validated through these guards

### Legacy Migration

| Old Key | New Mapping | Notes |
|---------|-------------|-------|
| `koskas_expenses` | → `koskas_transactions` | Mapped: `categoryId` → `fromPocketId`, forced `type: "expense"`, validated |
| `koskas_budgets` | → `koskas_pockets` | Mapped: `{ [pocketId]: allocation }` → `Pocket.allocation` |

Migration only occurs if the new key does not exist. After migration, new data is written to the new keys and old keys remain (not deleted).

### Storage Limits

- **localStorage quota:** ~5-10MB depending on browser
- **Estimated data per transaction:** ~150 bytes
- **Max transactions:** ~35,000-65,000 before quota exceeded
- **Archives:** Up to 6 monthly archives; each archive contains full transaction + pocket snapshots
- **Sync reduces local pressure:** Authenticated users have data in Supabase; localStorage acts as cache

---

## Build Configuration

### Vite (`vite.config.ts`)

```typescript
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
    plugins: [vue(), tailwindcss()],
    resolve: {
        alias: { '@': path.resolve(__dirname, 'src') }
    },
    esbuild: {
        drop: ['console', 'debugger'],
    },
    server: {
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {}
    }
}));
```

**Configuration:**
- **Plugins:** Vue SFC support + Tailwind CSS v4 integration
- **Path alias:** `@/` maps to `src/` directory
- **Console stripping:** `esbuild.drop` removes `console.*` and `debugger` from production builds
- **HMR:** Conditional — disabled when `DISABLE_HMR=true` (for AI Studio compatibility)
- **File watching:** Disabled when `DISABLE_HMR=true` to save CPU

### Vitest (`vitest.config.ts`)

```typescript
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: { '@': path.resolve(__dirname, 'src') }
    },
    test: {
        environment: 'happy-dom',
        setupFiles: ['./src/test-setup.ts'],
        globals: true
    }
});
```

**Configuration:**
- **Environment:** happy-dom — lightweight DOM simulation for component tests
- **Setup file:** Mocks Supabase, sync service, structuredClone, localStorage
- **Path alias:** `@/` maps to `src/` (shared with Vite config)

### TypeScript (`tsconfig.json`)

```json
{
    "compilerOptions": {
        "target": "ES2022",
        "module": "ESNext",
        "lib": ["ES2022", "DOM", "DOM.Iterable"],
        "strict": true,
        "moduleResolution": "bundler",
        "allowImportingTsExtensions": true,
        "noEmit": true,
        "jsx": "preserve",
        "jsxImportSource": "vue",
        "isolatedModules": true,
        "skipLibCheck": true,
        "resolveJsonModule": true,
        "paths": { "@/*": ["./src/*"] }
    }
}
```

**Configuration:**
- **Strict mode:** Enabled — all type checking is strict
- **Target:** ES2022 — modern JavaScript features
- **Module resolution:** `bundler` — optimized for Vite/esbuild
- **No emit:** Type checking only (`tsc --noEmit` for lint)
- **Path alias:** `@/*` maps to `src/`

### Tailwind CSS v4 (`index.css`)

```css
@import "tailwindcss";

@theme {
    --color-bg-primary: #050505;
    --color-bg-surface: #121212;
    --color-text-primary: #FAFAFA;
    --color-text-muted: #71717A;
    --color-neon-safe: #10B981;
    --color-neon-warn: #F59E0B;
    --color-neon-danger: #EF4444;
    --color-neon-vault: #8B5CF6;
    --font-mono: 'JetBrains Mono', monospace;
    --font-sans: 'Inter', sans-serif;
}
```

**Tailwind v4 Changes:**
- `@import "tailwindcss"` replaces `@tailwind base/components/utilities`
- `@theme` directive for custom design tokens
- Custom colors automatically available as utility classes (e.g., `bg-bg-primary`, `text-neon-safe`)
- No `tailwind.config.js` — configuration via CSS

### Package Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `vite --port=3000` | Development server (localhost only) |
| `build` | `vite build` | Production build |
| `preview` | `vite preview` | Preview production build |
| `clean` | Node.js fs-based cleanup | Clean build artifacts (cross-platform) |
| `lint` | `tsc --noEmit` | TypeScript type checking |
| `test` | `vitest run` | Run all tests once |
| `test:watch` | `vitest` | Run tests in watch mode |

### Dependencies

| Package | Type | Purpose |
|---------|------|---------|
| `vue` | production | UI framework |
| `pinia` | production | State management |
| `@supabase/supabase-js` | production | Supabase client for cloud sync |
| `lucide-vue-next` | production | Icon library |
| `vitest` | dev | Test runner |
| `@pinia/testing` | dev | Pinia store testing utilities |
| `@vue/test-utils` | dev | Vue component testing |
| `happy-dom` | dev | Lightweight DOM for tests |
| `jsdom` | dev | Alternative DOM for tests |
| `vue-tsc` | dev | Vue TypeScript checking |

---

## Known Issues & Considerations

### Previously Fixed Issues (Historical)

The following issues were identified and fixed in earlier versions:

| # | Issue | Status |
|---|-------|--------|
| 1 | `deletePocket` balance corruption — preservation transfer was rewritten | ✅ Fixed |
| 2 | `updateRollovers` O(D×T) performance — pre-indexed daily sums | ✅ Fixed |
| 3 | `pocketBalances` triple scan — single-pass aggregation | ✅ Fixed |
| 4 | Keypad input overflow — capped at 15 digits | ✅ Fixed |
| 5 | Rollover timestamp ambiguity — `endOfDay + 1` | ✅ Fixed |
| 6 | Duplicate `vite` in dependencies | ✅ Fixed |
| 7 | Windows-incompatible `clean` script | ✅ Fixed |
| 8 | Package name "react-example" | ✅ Fixed |
| 9 | Unused dependencies | ✅ Fixed |
| 10 | Unused `totalSpent` computed | ✅ Fixed |
| 11 | Dev server exposed to all network interfaces (`--host=0.0.0.0`) | ✅ Fixed |
| 12 | No Content Security Policy (CSP) headers | ✅ Fixed |
| 13 | Raw Supabase error messages displayed to users | ✅ Fixed |
| 14 | No client-side email validation before auth submission | ✅ Fixed |
| 15 | `Math.random()` fallback in `generateId()` — replaced with `crypto.getRandomValues()` | ✅ Fixed |
| 16 | Missing `autocomplete` attributes on auth inputs | ✅ Fixed |
| 17 | Console logs not stripped in production builds | ✅ Fixed |
| 18 | Vulnerable `nanoid` / `postcss` dependencies | ✅ Fixed |
| 19 | `handle_new_user()` search_path hijacking — `SET search_path = ''` documented | ✅ Fixed |
| 20 | Month-reset stale data leak — `pocketBalances` showed previous-month balances when `deleteAllTransactionsRemote()` failed silently during month transition | ✅ Fixed (Sep 2026) |

**Fix for #20:** `pocketBalances` and `pocketStats` now filter transactions by `monthStart` via the `currentMonthTransactions` computed property, so stale transactions from previous months are always excluded regardless of remote delete success. Additionally, `resetMonth()` now retries `deleteAllTransactionsRemote()` up to 3 times with exponential backoff (1s, 2s, 3s) instead of failing silently on the first attempt.

### Current Considerations

#### 1. Supabase Environment Variables Required

The app **throws on startup** if `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are not defined. This means:
- Developers must create a `.env` file before running `dev` or `build`
- The `.env.example` file documents required variables
- CI/CD pipelines must inject these variables

#### 2. Sync Debounce Data Loss Window

The 300ms debounce on Supabase sync means:
- If the tab is closed within 300ms of a mutation, the last change may not reach Supabase
- localStorage is written immediately (no debounce), so local data is always safe
- This is an acceptable trade-off for most use cases; critical data is persisted locally first

#### 3. Archive Storage Growth

The `koskas_archives` key stores up to 6 monthly snapshots:
- Each archive contains full transaction + pocket arrays
- With heavy usage, archives could consume significant localStorage space
- No automatic cleanup beyond the 6-archive cap

#### 4. Custom Breakpoints Not Fully Configured

Custom breakpoints are defined in `AGENT.md` as guidelines but not fully wired into the Tailwind v4 theme. Some components use default Tailwind breakpoints (`sm:`, `md:`, etc.) instead of custom ones.

---

## Future Improvement Suggestions

### High Priority (Stability & Performance)

1. **Implement undo/redo** — Track last N actions, allow user to undo mistakes
2. **IndexedDB migration** — Move beyond localStorage 5MB limit for long-term data growth
3. **Sync conflict resolution** — Handle cases where local and remote data diverge

### Medium Priority (Features)

4. **Data export/import** — JSON backup and restore for cross-device migration (beyond Supabase)
5. **Recurring transactions** — Auto-repeating expenses (e.g., monthly subscriptions)
6. **Budget alerts** — Push notifications or visual warnings when a pocket nears its limit
7. **Charts & graphs** — Spending visualization: pie chart per pocket, daily line chart
8. **Custom pocket ordering** — Drag & drop to change pocket order on dashboard
9. **Search/filter transactions** — Filter by pocket, date range, amount range
10. **Weekly/monthly reports** — Summary of spending patterns (beyond current performance dashboard)

### Low Priority (Polish & Extensions)

11. **PWA support** — Service worker, offline capability, installable app
12. **Dark/Light theme toggle** — Add light mode option
13. **Multi-currency support** — Beyond IDR (USD, MYR, SGD, etc.)
14. **Categories per pocket** — Sub-categorization for more granular tracking
15. **Savings goals** — Set target amounts for saving pocket with progress tracking
16. **Pin protection** — Optional PIN lock for the app (beyond Supabase auth)
17. **Accessibility audit** — ARIA labels, keyboard navigation, screen reader support
18. **Internationalization** — English and other language support via i18n framework
19. **Cross-platform** — React Native or Capacitor for mobile app

### Architecture Improvements

20. **Custom breakpoint config** — Fully configure custom breakpoints in Tailwind v4 theme
21. **Selective sync** — Sync only changed records instead of full batch upsert
22. **Optimistic UI updates** — Update UI before sync completes, rollback on failure
23. **Archive compression** — Compress or summarize old archives to reduce localStorage usage

---

**Documentation last updated: September 2026**
**KosKas Version: 3.2-TACTICAL**
