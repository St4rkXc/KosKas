# API Reference

KosKas internal API — TypeScript modules, composables, store actions, and utility functions.

---

## Table of Contents

1. [Module: types](#module-types)
2. [Module: iconMap](#module-iconmap)
3. [Module: lib/supabase](#module-libsupabase)
4. [Module: services/sync](#module-servicessync)
5. [Module: composables/useAuth](#module-composablesuseauth)
6. [Module: store (Pinia)](#module-store-pinia)
7. [Module: main](#module-main)
8. [Components](#components)
9. [Type Definitions](#type-definitions)

---

## Module: types

**File:** `src/types.ts`

Core domain types, constants, and utility functions for the pocket-based budgeting system.

### Interfaces

#### `Pocket`

Represents a budget category ("pocket") that holds a monthly allocation.

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique identifier (e.g., `"pangan"`, `"pocket_x7k2"`) |
| `name` | `string` | Display name shown in the UI |
| `allocation` | `number` | Monthly budget allocation in Rupiah |
| `colorClass` | `string` | Tailwind CSS classes for styling |
| `icon` | `string` | Lucide icon name |
| `isSystem?` | `boolean` | Whether this pocket cannot be deleted |

#### `Transaction`

Represents a financial transaction (expense or inter-pocket transfer).

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique identifier |
| `type` | `'expense' \| 'transfer'` | Transaction type |
| `fromPocketId?` | `string` | Source pocket ID |
| `toPocketId?` | `string` | Destination pocket ID (transfers only) |
| `amount` | `number` | Amount in Rupiah (always positive) |
| `timestamp` | `number` | Unix timestamp in milliseconds |
| `note?` | `string` | Optional user note |
| `isRollover?` | `boolean` | Auto-generated Pangan-to-Leftover rollover |
| `rolloverDate?` | `string` | Date string `"YYYY-MM-DD"` for deduplication |

### Constants

#### `POCKET_IDS`

```typescript
const POCKET_IDS = {
    PANGAN: 'pangan',
    KOS: 'kos',
    TRANSPORTASI: 'transportasi',
    LIFESTYLE: 'lifestyle',
    DARURAT: 'darurat',
    SAVING: 'saving',
    LEFTOVER: 'leftover',
} as const;
```

#### `AVAILABLE_ICONS`

Array of 15 Lucide icon names available for custom pocket creation.

#### `AVAILABLE_COLORS`

Array of 9 color presets with `name` and `class` properties.

#### `DEFAULT_POCKETS`

Array of 7 system pockets initialized on first launch.

### Functions

#### `generateId(): string`

Generate a collision-resistant unique identifier. Uses `crypto.randomUUID()` with fallbacks.

**Returns:** A unique string ID.

---

#### `isValidPocket(p: unknown): p is Pocket`

Runtime type guard for Pocket validation. Used to sanitize localStorage/sync data.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `p` | `unknown` | Value to validate |

**Returns:** `true` if the value conforms to the Pocket interface.

---

#### `isValidTransaction(t: unknown): t is Transaction`

Runtime type guard for Transaction validation.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `t` | `unknown` | Value to validate |

**Returns:** `true` if the value conforms to the Transaction interface.

---

#### `parseAmount(str: string): number`

Parse a string into an integer. Returns 0 if parsing fails.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `str` | `string` | String to parse (keypad input) |

**Returns:** Parsed integer, or 0.

---

#### `vibrate(pattern: number | number[]): void`

Trigger haptic feedback. Silently fails on unsupported browsers.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `pattern` | `number \| number[]` | Vibration duration or on/off pattern |

---

#### `formatRupiah(amount: number): string`

Format a number as Indonesian Rupiah currency string.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `amount` | `number` | Numeric amount to format |

**Returns:** Formatted string (e.g., `"Rp 1.500.000"`).

---

#### `hexFromColorClass(colorClass: string): string`

Extract hex color from a Tailwind class string.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `colorClass` | `string` | Tailwind class string |

**Returns:** Hex color string (e.g., `"#10B981"`) or fallback `"#10B981"`.

---

## Module: iconMap

**File:** `src/iconMap.ts`

Maps Lucide icon name strings to Vue components for dynamic rendering.

### Exports

#### `iconMap: Record<string, Component>`

Lookup table of 27 Lucide icon name-to-component mappings.

#### `resolveIcon(name: string): Component`

Resolve an icon name to its Vue component. Falls back to `Sparkles` if not found.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | Lucide icon name |

**Returns:** Vue component.

---

## Module: lib/supabase

**File:** `src/lib/supabase.ts`

Initializes and exports the Supabase client singleton.

### Exports

#### `supabase: SupabaseClient`

The Supabase client instance. Reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from environment variables. Throws at startup if either is missing.

---

## Module: services/sync

**File:** `src/services/sync.ts`

Remote CRUD operations for Supabase cloud synchronization. Handles camelCase-to-snake_case conversion. Supports batch upserts (100 rows/batch).

### Functions

#### `fetchPockets(userId: string): Promise<Pocket[]>`

Fetch all pockets for a user from Supabase.

---

#### `fetchTransactions(userId: string, limit?: number): Promise<Transaction[]>`

Fetch transactions for a user, ordered by timestamp descending. Default limit: 1000.

---

#### `upsertPocket(userId: string, pocket: Pocket): Promise<void>`

Insert or update a single pocket.

---

#### `deletePocketRemote(userId: string, pocketId: string): Promise<void>`

Delete a pocket from Supabase.

---

#### `upsertTransaction(userId: string, tx: Transaction): Promise<void>`

Insert or update a single transaction.

---

#### `deleteTransactionRemote(userId: string, txId: string): Promise<void>`

Delete a single transaction.

---

#### `deleteAllTransactionsRemote(userId: string): Promise<void>`

Delete all transactions for a user (used during monthly reset).

---

#### `upsertAllPockets(userId: string, pockets: Pocket[]): Promise<void>`

Batch upsert all pockets in a single request.

---

#### `syncAllTransactions(userId: string, txs: Transaction[]): Promise<void>`

Batch upsert all transactions in chunks of 100 rows.

---

## Module: composables/useAuth

**File:** `src/composables/useAuth.ts`

Vue composable for Supabase authentication state management.

### Exports

#### `onUserChange(cb: (userId: string | null) => void): void`

Register a callback that fires when the authenticated user changes.

---

#### `useAuth()`

Returns auth state and operations:

| Return | Type | Description |
|--------|------|-------------|
| `user` | `Readonly<Ref<User \| null>>` | Current authenticated user |
| `session` | `Readonly<Ref<Session \| null>>` | Current Supabase session |
| `loading` | `Readonly<Ref<boolean>>` | True while initial session resolves |
| `initAuth()` | `() => Promise<void>` | Initialize auth and subscribe to changes |
| `signUp(email, password)` | `(string, string) => Promise<void>` | Register new user |
| `signIn(email, password)` | `(string, string) => Promise<void>` | Sign in existing user |
| `signInWithGoogle()` | `() => Promise<void>` | Google OAuth redirect |
| `signOut()` | `() => Promise<void>` | Clear session |

---

## Module: store (Pinia)

**File:** `src/store.ts`

Pinia composition store — single source of truth for all KosKas state.

### Usage

```typescript
import { useStore } from './store';
const store = useStore();
```

### State

| Ref | Type | Description |
|-----|------|-------------|
| `pockets` | `Ref<Pocket[]>` | All active pockets |
| `transactions` | `Ref<Transaction[]>` | All transactions (sorted desc) |
| `monthStart` | `Ref<number>` | Budget month start timestamp |
| `isLoaded` | `Ref<boolean>` | Data has loaded |
| `storageFailed` | `Ref<boolean>` | localStorage write failed |
| `syncEnabled` | `Ref<boolean>` | User authenticated |
| `userId` | `Ref<string \| null>` | Current user ID |
| `syncFailed` | `Ref<boolean>` | Supabase sync failed |
| `isSyncing` | `Ref<boolean>` | Sync in progress |

### Computed Properties

| Property | Return Type | Description |
|----------|-------------|-------------|
| `currentMonthTransactions` | `Transaction[]` | Transactions for current month |
| `pocketBalances` | `Record<string, number>` | Balance per pocket |
| `totalAllocation` | `number` | Sum of all allocations |
| `totalRemaining` | `number` | Sum of all balances |

### Actions

#### `loadFromStorage(): Promise<void>`

Load from Supabase (if authenticated) or localStorage fallback.

---

#### `addExpense(pocketId: string, amount: number, note?: string): void`

Record an expense against a pocket.

---

#### `addTransfer(fromPocketId: string, toPocketId: string, amount: number, note?: string): void`

Transfer funds between pockets.

---

#### `removeTransaction(id: string): void`

Delete a transaction by ID.

---

#### `addPocket(name: string, allocation: number, colorClass: string, icon: string): string`

Create a custom pocket. Returns the new pocket ID.

---

#### `deletePocket(id: string, transferBalanceToPocketId?: string): void`

Delete a custom pocket. System pockets cannot be deleted.

---

#### `updatePocketAllocation(pocketId: string, amount: number): void`

Update a single pocket's allocation.

---

#### `updateAllAllocations(newAllocations: Record<string, number>): void`

Batch-update all pocket allocations.

---

#### `updateRollovers(): void`

Recalculate automatic daily Pangan-to-Leftover rollover transfers.

---

#### `resetMonth(): Promise<void>`

Archive current month, clear transactions, reset monthStart.

---

#### `checkMonthTransition(): Promise<void>`

Auto-reset if stored month is older than current calendar month.

---

## Module: main

**File:** `src/main.ts`

Application entry point. Initializes auth before mounting Vue app.

---

## Components

### `App.vue`

Root component. Auth gate, dashboard, history, performance views, modal management.

### `KeypadModal.vue`

Expense entry modal with numeric keypad and pocket selector.

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `isOpen` | `boolean` | Controls visibility |

**Emits:**
| Event | Payload | Description |
|-------|---------|-------------|
| `close` | — | Dismiss modal |
| `save` | `(pocketId: string, amount: number)` | Submit expense |

### `PocketSettingsModal.vue`

Budget allocation modal. Edit monthly fund, per-pocket allocations, create/delete custom pockets.

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `isOpen` | `boolean` | Controls visibility |

**Emits:**
| Event | Payload | Description |
|-------|---------|-------------|
| `close` | — | Dismiss/save |

### `TransferModal.vue`

Inter-pocket transfer modal with source/destination selectors and keypad.

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `isOpen` | `boolean` | Controls visibility |

**Emits:**
| Event | Payload | Description |
|-------|---------|-------------|
| `close` | — | Dismiss modal |

---

## Type Definitions

### `Database` (src/types/supabase.ts)

Auto-generated Supabase schema types. Defines Row/Insert/Update for:
- `profiles` — User profile (id, month_start, monthly_fund)
- `pockets` — Budget pockets (id, user_id, name, allocation, color_class, icon, is_system)
- `transactions` — Financial records (id, user_id, type, from_pocket_id, to_pocket_id, amount, timestamp, note, is_rollover, rollover_date)
