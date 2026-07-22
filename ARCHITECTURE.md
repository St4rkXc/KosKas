# KosKas — Technical Architecture

This document explains the internal architecture of KosKas for developers who want to understand, modify, or extend the codebase. It covers the domain model, state management, business logic, data flow, design system, and build configuration.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [File Structure](#file-structure)
3. [Domain Model](#domain-model)
4. [State Management](#state-management)
5. [Component Architecture](#component-architecture)
6. [Business Logic Deep-Dive](#business-logic-deep-dive)
7. [Data Flow](#data-flow)
8. [Design System](#design-system)
9. [LocalStorage Schema](#localstorage-schema)
10. [Build Configuration](#build-configuration)
11. [Known Issues & Recommended Fixes](#known-issues--recommended-fixes)
12. [Future Improvement Suggestions](#future-improvement-suggestions)

---

## System Overview

KosKas is a client-side single-page application (SPA) that runs entirely without a backend. It adopts a **pocket-based budgeting** approach, where users allocate monthly income into named categories called "pockets," then record expenses or transfers between pockets.

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Vue 3 + Composition API** | Declarative reactivity, type-safe with `<script setup>` |
| **Pinia (composition pattern)** | Modern state management with superior TypeScript support |
| **localStorage** | Persistence without a backend; data survives page reload |
| **Tailwind CSS v4** | Utility-first, custom theme via `@theme` directive, fast iteration |
| **No router** | Single-view app; no multi-page navigation needed |
| **No backend** | User data privacy; all data stored locally |
| **Custom breakpoints** | Mobile-first with finer granularity than Tailwind defaults |
| **Keypad-based input** | Optimized for mobile; faster than physical keyboard |
| **System pockets** | Data integrity; core pockets cannot be deleted by users |
| **Auto rollover** | Reduces manual work; leftover food budget is auto-tracked |

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          index.html                                  │
│                     (mounts #root)                                    │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│                         main.ts                                      │
│          createApp(App) + createPinia() + mount('#root')             │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│                         App.vue                                      │
│  ┌──────────┐  ┌───────────────┐  ┌──────────────┐  ┌────────────┐│
│  │ Dashboard │  │  Transaction  │  │   Keypad     │  │  Pocket    ││
│  │  (cards)  │  │   History     │  │   Modal      │  │  Settings  ││
│  │           │  │               │  │              │  │  Modal     ││
│  └─────┬────┘  └───────┬───────┘  └──────┬───────┘  └──────┬─────┘│
│        │               │                  │                  │      │
│  ┌─────▼───────────────▼──────────────────▼──────────────────▼────┐│
│  │                    Pinia Store (store.ts)                        ││
│  │  ┌──────────┐  ┌───────────────┐  ┌───────────────────────────┐││
│  │  │  State:  │  │   Computed:   │  │       Actions:            │││
│  │  │ pockets  │  │ pocketBalances│  │ addExpense, addTransfer   │││
│  │  │ transact.│  │ totalAllocat. │  │ removeTransaction         │││
│  │  │ monthStrt│  │ totalRemain.  │  │ addPocket, deletePocket   │││
│  │  │          │  │               │  │ updateAllAllocations      │││
│  │  │          │  │               │  │ updateRollovers, resetMnth│││
│  │  └──────────┘  └───────────────┘  └───────────────────────────┘││
│  └─────────────────────────┬────────────────────────────────────────┘│
└────────────────────────────┼─────────────────────────────────────────┘
                             │ deep watch
┌────────────────────────────▼─────────────────────────────────────────┐
│                       localStorage                                    │
│  koskas_transactions | koskas_pockets | koskas_month_start           │
└───────────────────────────────────────────────────────────────────────┘
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
├── AGENT.md                    # Subagent configuration for AI coding assistants
├── .env.example                # Environment variable template
├── metadata.json               # AI Studio metadata (name, capabilities)
├── .gitignore                  # Git ignore rules
├── .prettierrc                 # Prettier formatting configuration
├── assets/                     # Static assets (images, fonts, etc.)
├── dist/                       # Production build output
├── src/
│   ├── main.ts                 # App entry point: createApp + createPinia + mount
│   ├── store.ts                # Pinia store: state, computed, actions, persistence
│   ├── types.ts                # Type definitions, constants, utility functions
│   ├── index.css               # Tailwind v4 entry + @theme custom variables
│   ├── App.vue                 # Root component: dashboard, history, modal orchestration
│   └── components/
│       ├── KeypadModal.vue     # Expense entry: numeric keypad + pocket selector
│       ├── PocketSettingsModal.vue # Budget allocation: CRUD pockets, set allocations
│       └── TransferModal.vue   # Inter-pocket transfer: balance validation
```

### Per-File Purpose

| File | Responsibility |
|------|----------------|
| `main.ts` | App bootstrap; initializes Vue app, Pinia instance, mounts to DOM |
| `store.ts` | Single source of truth; all state, computed properties, and mutations |
| `types.ts` | Interface definitions (`Pocket`, `Transaction`), constants (`DEFAULT_POCKETS`), utilities (`formatRupiah`, `vibrate`) |
| `index.css` | Global styles; Tailwind v4 `@theme` directive for custom colors and fonts |
| `App.vue` | Root view; orchestrates dashboard cards, transaction history, and modal management |
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
- System pocket `id`s use fixed strings (`"pangan"`, `"kos"`, etc.) for consistent references

### Interface: `Transaction`

```typescript
interface Transaction {
    id: string;              // Unique ID (random string or "rollover-YYYY-MM-DD")
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

### Default Pockets

```typescript
const DEFAULT_POCKETS: Pocket[] = [
    { id: "pangan",       name: "Pangan",         allocation: 1500000, isSystem: true },
    { id: "kos",          name: "Fixed / Kos",    allocation: 1000000, isSystem: true },
    { id: "transportasi", name: "Transportasi",   allocation: 300000,  isSystem: true },
    { id: "lifestyle",    name: "Lifestyle",       allocation: 300000,  isSystem: true },
    { id: "darurat",      name: "Dana Darurat",    allocation: 200000,  isSystem: true },
    { id: "saving",       name: "Tabungan",        allocation: 0,       isSystem: true },
    { id: "leftover",     name: "Sisa Pangan",     allocation: 0,       isSystem: true },
];
```

**System Pocket Characteristics:**
- `"pangan"` — Hardcoded reference in `updateRollovers()`; id must not be changed
- `"saving"` — Default target when `deletePocket()` is called
- `"leftover"` — Dedicated target for auto rollovers; `allocation` is always 0
- `isSystem: true` prevents user deletion via the UI

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

## State Management

### Pinia Store Structure

The store uses the **composition API pattern** (not options pattern) via `defineStore("main", () => { ... })`.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Pinia Store ("main")                          │
│                                                                  │
│  ┌─ State (Reactive Refs) ────────────────────────────────────┐ │
│  │  pockets: Ref<Pocket[]>          // List of all pockets     │ │
│  │  transactions: Ref<Transaction[]> // List of all transactions│ │
│  │  monthStart: Ref<number>         // Month start timestamp   │ │
│  │  isLoaded: Ref<boolean>          // Flag: data has loaded   │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ Computed Properties ──────────────────────────────────────┐ │
│  │  pocketBalances: Record<string, number>  // Balance per pocket│ │
│  │  totalAllocation: number                 // Total allocation │ │
│  │  totalRemaining: number                  // Total remaining  │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ Actions ──────────────────────────────────────────────────┐ │
│  │  loadFromStorage()                      // Load + migrate   │ │
│  │  addExpense(pocketId, amount, note?)    // Record expense   │ │
│  │  addTransfer(from, to, amount, note?)   // Transfer pocket  │ │
│  │  removeTransaction(id)                  // Remove transaction│ │
│  │  addPocket(name, allocation, color, icon) // Create pocket  │ │
│  │  deletePocket(id, transferTo?)          // Delete pocket    │ │
│  │  updatePocketAllocation(id, amount)     // Update 1 pocket  │ │
│  │  updateAllAllocations(newAllocs)        // Update all       │ │
│  │  updateRollovers()                      // Recalculate rollovers│
│  │  resetMonth()                           // Reset month      │ │
│  └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### State: Reactive Refs

| Ref | Type | Default | Purpose |
|-----|------|---------|---------|
| `pockets` | `Ref<Pocket[]>` | `[]` (loaded from storage) | List of all active pockets |
| `transactions` | `Ref<Transaction[]>` | `[]` (loaded from storage) | All transactions, sorted desc by timestamp |
| `monthStart` | `Ref<number>` | `Date.now()` | Start timestamp of the monthly period |
| `isLoaded` | `Ref<boolean>` | `false` | Guard to prevent persistence before data is loaded |

### Computed Properties

#### `pocketBalances`

Calculates each pocket's balance in real-time.

```
balance(pocket) = allocation
                + Σ(transfers TO pocket)
                - Σ(transfers FROM pocket)
                - Σ(expenses FROM pocket)
```

**Implementation detail:**
- Single-pass aggregation over all transactions (optimized from original 3 scans per pocket)
- Return type: `Record<string, number>` — keyed by `pocket.id`
- **Performance:** O(P + T) where P = pocket count, T = transaction count

#### `totalAllocation`

```
totalAllocation = Σ(pocket.allocation) for all pockets
```

#### `totalRemaining`

```
totalRemaining = Σ(pocketBalances[pocket.id]) for all pockets
```

### Persistence Strategy

```typescript
watch(
    [transactions, pockets, monthStart, isLoaded],
    () => {
        if (!isLoaded.value) return;  // Guard: don't persist before load completes
        localStorage.setItem("koskas_transactions", JSON.stringify(transactions.value));
        localStorage.setItem("koskas_pockets", JSON.stringify(pockets.value));
        localStorage.setItem("koskas_month_start", monthStart.value.toString());
    },
    { deep: true }  // Deep watch: triggers on nested property changes
);
```

**Characteristics:**
- **Deep watcher:** Detects changes on nested objects/arrays (e.g., `pockets[0].allocation = 500000`)
- **`isLoaded` guard:** Prevents writing empty data to localStorage during initialization
- **Error handling:** `try/catch` for localStorage that may be unavailable (private browsing, quota exceeded)
- **No debouncing:** Every change is persisted immediately; can cause frequent writes on rapid mutations

---

## Component Architecture

### App.vue (Root Component)

**Responsibilities:**
- Main layout orchestration: header, dashboard grid, transaction history, FABs
- State management for 3 modal visibility (`isKeypadOpen`, `isPocketSettingsOpen`, `isTransferOpen`)
- Computed properties for display: `daysRemaining`, `pocketStats`, `dailyPanganStats`, `currentDateStr`
- Icon resolution: mapping string names to Lucide components
- Pocket lookup memoization: `pocketMap` computed to avoid O(N×M) lookups

**Template Structure:**

```
App.vue
├── Loading Guard (v-if="!store.isLoaded")
├── Status Bar (visual hack: "V3.2-TACTICAL • date")
├── Header
│   ├── Total Remaining (big number)
│   ├── Status Badge (Aman / Warning / Danger)
│   └── Days until reset counter
├── Content Area (Transition: fade)
│   ├── Dashboard View (v-if="!showHistory")
│   │   ├── Daily Pangan Target Card
│   │   └── Pocket Cards Grid (v-for pocket)
│   └── History View (v-if="showHistory")
│       ├── Action Bar (Transfer, Alokasi, Reset buttons)
│       └── Transaction List (TransitionGroup, v-for transaction)
├── Floating Action Buttons
│   ├── Transfer Button
│   ├── Alokasi Button
│   └── Add Expense FAB (green + button)
└── Modals
    ├── KeypadModal
    ├── PocketSettingsModal
    └── TransferModal
```

**Key Computed Properties:**

| Property | Return Type | Purpose |
|----------|-------------|---------|
| `pocketMap` | `Record<string, Pocket>` | Memoized lookup map, avoids `.find()` inside loops |
| `daysRemaining` | `number` | Days left until end of month |
| `pocketStats` | `Record<string, { spent, remaining, percentage, isOver }>` | Per-pocket stats for progress bars |
| `dailyPanganStats` | `{ dailyTarget, remainingToday, spentToday }` | Today's food budget stats |
| `currentDateStr` | `string` | Format: "Day, Date Month Year" (Indonesian) |

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
- Example: 7 pockets + 100 transactions = 107 iterations (vs. original 2,100)
- Vue recomputes only when `transactions` or `pockets` refs change

### 2. Daily Pangan Rollover Algorithm

**Location:** `store.ts` → `updateRollovers()`

**Purpose:** Calculate and record leftover daily food budget into the "Sisa Pangan" pocket.

**Algorithm:**

```
updateRollovers():
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
         IF t.type = "expense" AND t.fromPocketId = "pangan":
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
                fromPocketId: "pangan"
                toPocketId: "leftover"
                amount: leftoverAmount
                timestamp: endOfDay + 1  // ensures correct sort order
                isRollover: true
                rolloverDate: dateString
                note: "Sisa pangan harian ({d}/{month+1})"
          ELSE (no leftover):
            IF existing rollover found:
              DELETE it (splice from array)

    6. Sort all transactions by timestamp DESC
```

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
         IF tx.fromPocketId = id: tx.fromPocketId = "saving"
         IF tx.toPocketId = id:   tx.toPocketId = "saving"

    6. Recalculate rollovers
       updateRollovers()
```

**Critical Bug (Fixed):**
The original implementation created a balance preservation transfer, then immediately corrupted it by rewriting its `fromPocketId` from the deleted pocket's ID to `"saving"`. The fix guards the preservation transfer by tracking its ID and skipping it during the historical rewrite step.

### 4. Legacy Data Migration

**Location:** `store.ts` → `loadFromStorage()`

```
loadFromStorage():
    ┌─ POCKETS ─────────────────────────────────────────────────────────┐
    │ IF localStorage has "koskas_pockets":                             │
    │   TRY: parse JSON → pockets.value                                 │
    │   CATCH: use DEFAULT_POCKETS                                      │
    │ ELSE IF localStorage has "koskas_budgets" (legacy):               │
    │   TRY: parse JSON → map DEFAULT_POCKETS with legacy allocations   │
    │   CATCH: use DEFAULT_POCKETS                                      │
    │ ELSE:                                                             │
    │   use DEFAULT_POCKETS                                             │
    └───────────────────────────────────────────────────────────────────┘

    ┌─ TRANSACTIONS ───────────────────────────────────────────────────┐
    │ IF localStorage has "koskas_transactions":                        │
    │   TRY: parse JSON → transactions.value                            │
    │   CATCH: empty array                                              │
    │ ELSE IF localStorage has "koskas_expenses" (legacy):              │
    │   TRY: parse JSON → map to new Transaction format:                │
    │     {                                                             │
    │       id: exp.id || random(),                                     │
    │       type: "expense",                                            │
    │       fromPocketId: exp.categoryId,                                │
    │       amount: exp.amount,                                         │
    │       timestamp: exp.timestamp,                                   │
    │       note: exp.note || ""                                        │
    │     }                                                             │
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
  │    { id: random(), type: "expense", fromPocketId, amount, timestamp: Date.now() }
  │
  ├─ transactions.value.unshift(newTransaction)  ← reactive mutation
  │
  └─ updateRollovers()
       │
       ├─ Recalculate daily pangan rollovers for past days
       ├─ May add/modify/remove rollover transactions
       └─ Sort transactions by timestamp DESC

  ┌─── Deep Watcher Triggered ───┐
  │                               │
  │  Persist to localStorage:     │
  │  ├─ koskas_transactions       │
  │  └─ koskas_month_start        │
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
  │  Persist koskas_pockets       │
  └───────────────────────────────┘

  ┌─── Computed Recalculated ────┐
  │  pocketBalances (allocations  │
  │  changed → all balances shift)│
  └───────────────────────────────┘
```

### Data Load Sequence

```
App.vue: onMounted()
  │
  ▼
store.loadFromStorage()
  │
  ├─ Read localStorage keys
  ├─ Parse or migrate data
  ├─ Set reactive refs
  │
  ├─ isLoaded = true  ← removes loading blank screen
  │
  └─ updateRollovers()
       │
       ├─ Recalculate all daily rollovers
       ├─ Add/modify/remove rollover transactions
       └─ Sort transactions

  ┌─── Deep Watcher Triggered ───┐
  │  Persist (write current state │
  │  back to localStorage)        │
  └───────────────────────────────┘

  ┌─── Initial Render ───────────┐
  │  Dashboard shows all pockets  │
  │  with current balances        │
  └───────────────────────────────┘
```

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
  V3.2-TACTICAL • {currentDateStr}
</div>
```

---

## LocalStorage Schema

### Keys

| Key | Type | Purpose |
|-----|------|---------|
| `koskas_transactions` | JSON string | Array of `Transaction` objects |
| `koskas_pockets` | JSON string | Array of `Pocket` objects |
| `koskas_month_start` | String (number) | Unix timestamp (ms) of month start |

### Data Shapes

#### `koskas_transactions`

```json
[
  {
    "id": "abc123xyz",
    "type": "expense",
    "fromPocketId": "pangan",
    "amount": 25000,
    "timestamp": 1719856800000,
    "note": "Makan siang"
  },
  {
    "id": "def456uvw",
    "type": "transfer",
    "fromPocketId": "pangan",
    "toPocketId": "leftover",
    "amount": 15000,
    "timestamp": 1719878399999,
    "isRollover": true,
    "rolloverDate": "2024-07-01",
    "note": "Sisa pangan harian (1/7)"
  },
  {
    "id": "ghi789rst",
    "type": "transfer",
    "fromPocketId": "lifestyle",
    "toPocketId": "pangan",
    "amount": 50000,
    "timestamp": 1719770400000,
    "note": "Alokasi lebih lifestyle"
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

### Legacy Migration

| Old Key | New Mapping | Notes |
|---------|-------------|-------|
| `koskas_expenses` | → `koskas_transactions` | Mapped: `categoryId` → `fromPocketId`, forced `type: "expense"` |
| `koskas_budgets` | → `koskas_pockets` | Mapped: `{ [pocketId]: allocation }` → `Pocket.allocation` |

Migration only occurs if the new key does not exist. After migration, new data is written to the new keys and old keys remain (not deleted).

### Storage Limits

- **localStorage quota:** ~5-10MB depending on browser
- **Estimated data per transaction:** ~150 bytes
- **Max transactions:** ~35,000-65,000 before quota exceeded
- **No automatic cleanup:** Old data is not deleted or archived

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
    server: {
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {}
    }
}));
```

**Configuration:**
- **Plugins:** Vue SFC support + Tailwind CSS v4 integration
- **Path alias:** `@/` maps to `src/` directory
- **HMR:** Conditional — disabled when `DISABLE_HMR=true` (for AI Studio compatibility)
- **File watching:** Disabled when `DISABLE_HMR=true` to save CPU

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
| `dev` | `vite --port=3000 --host=0.0.0.0` | Development server |
| `build` | `vite build` | Production build |
| `preview` | `vite preview` | Preview production build |
| `clean` | Node.js fs-based cleanup | Clean build artifacts (cross-platform) |
| `lint` | `tsc --noEmit` | TypeScript type checking |

---

## Known Issues & Recommended Fixes

### 1. 🔴 `deletePocket` Balance Corruption (Fixed)

**Problem:** When deleting a pocket, the balance preservation transfer was corrupted because the historical rewrite step also rewrote the newly created transfer's `fromPocketId`.

**Root Cause:**
```typescript
// Step 3: Create transfer (fromPocketId = deletedPocketId)
addTransfer(id, transferBalanceToPocketId, balance, "...");

// Step 5: Rewrite ALL transactions referencing deleted pocket
transactions.forEach(t => {
    if (t.fromPocketId === id) t.fromPocketId = "saving";  // ← Corrupted the new transfer!
});
```

**Fix Applied:** Track the preservation transfer's ID and skip it during the historical rewrite:
```typescript
function deletePocket(id: string, transferBalanceToPocketId?: string) {
    const pocketIndex = pockets.value.findIndex(p => p.id === id);
    if (pocketIndex === -1) return;
    const pocket = pockets.value[pocketIndex];
    if (pocket.isSystem) return;

    const balance = pocketBalances.value[id] || 0;
    let preserveTransferId: string | null = null;

    if (balance > 0 && transferBalanceToPocketId) {
        const tx: Transaction = {
            id: Math.random().toString(36).slice(2, 11),
            type: 'transfer',
            fromPocketId: id,
            toPocketId: transferBalanceToPocketId,
            amount: balance,
            timestamp: Date.now(),
            note: `Sisa saldo dari pocket ${pocket.name} yang dihapus`,
        };
        preserveTransferId = tx.id;
        transactions.value.unshift(tx);
    }

    pockets.value.splice(pocketIndex, 1);

    // Rewrite historical transactions ONLY — skip the preservation transfer
    transactions.value.forEach(t => {
        if (t.id === preserveTransferId) return;
        if (t.fromPocketId === id) t.fromPocketId = 'saving';
        if (t.toPocketId === id) t.toPocketId = 'saving';
    });

    updateRollovers();
}
```

### 2. 🟢 `updateRollovers` Performance (Fixed)

**Problem:** O(days × transactions) complexity, ran on every mutation.

**Fix Applied:** Pre-index daily expense sums using a `Map<string, number>` for O(T + D) complexity:
```typescript
// Pre-index pangan expenses by date to avoid repeated full scans
const expensesByDate = new Map<string, number>();
for (const t of transactions.value) {
    if (t.type !== 'expense' || t.fromPocketId !== 'pangan') continue;
    const d = new Date(t.timestamp);
    if (d.getFullYear() === year && d.getMonth() === month) {
        const key = `${d.getDate()}`;
        expensesByDate.set(key, (expensesByDate.get(key) ?? 0) + t.amount);
    }
}
```

### 3. 🟢 `pocketBalances` Triple Scan (Fixed)

**Problem:** 3 full array scans per pocket per evaluation.

**Fix Applied:** Single-pass aggregation:
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

### 4. 🟢 Keypad Input Overflow (Fixed)

**Problem:** No length limit on `amountStr` → potential `parseInt` overflow.

**Fix Applied:** Cap input at 15 digits in all three modal components:
```typescript
function handleKeyPress(key: string) {
    vibrate(10);
    if (key === "DEL") {
        amountStr.value = amountStr.value.length > 1 ? amountStr.value.slice(0, -1) : "0";
    } else if (key === "000") {
        if (amountStr.value === "0") return;
        if (amountStr.value.length + 3 > 15) return;
        amountStr.value += "000";
    } else {
        if (amountStr.value.length >= 15) return;
        amountStr.value = amountStr.value === "0" ? key : amountStr.value + key;
    }
}
```

### 5. 🟢 Rollover Timestamp Ambiguity (Fixed)

**Problem:** Rollover timestamps (`endOfDay = 23:59:59.999`) could collide with same-day expenses at `23:59:59.xxx`.

**Fix Applied:** Use `endOfDay + 1` for rollover timestamps to ensure they always sort after same-day expenses.

### 6. 🟢 Duplicate `vite` in Dependencies (Fixed)

**Fix Applied:** Removed `vite` from `dependencies`, kept only in `devDependencies`.

### 7. 🟢 Windows-Incompatible `clean` Script (Fixed)

**Fix Applied:** Replaced Unix-only `rm -rf` with cross-platform Node.js `fs.rmSync`/`fs.unlinkSync`.

### 8. 🟢 Package Name "react-example" (Fixed)

**Fix Applied:** Updated `package.json` name to `"koskas"`.

### 9. 🟢 Unused Dependencies (Fixed)

**Fix Applied:** Removed from `dependencies`: `@google/genai`, `dotenv`, `express`, `@vueuse/core`. Removed `autoprefixer` from `devDependencies`.

### 10. 🟢 Unused `totalSpent` Computed (Fixed)

**Fix Applied:** Removed the unused `totalSpent` computed property and its export from the store.

---

## Future Improvement Suggestions

### High Priority (Stability & Performance)

1. **Add data validation** — Validate localStorage data on load (schema check, corruption detection)
2. **Implement undo/redo** — Track last N actions, allow user to undo mistakes
3. **Debounced persistence** — Batch localStorage writes for frequent mutations to reduce I/O
4. **IndexedDB migration** — Move beyond localStorage 5MB limit for long-term data growth
5. **Error boundary** — Vue error handler to catch runtime errors gracefully

### Medium Priority (Features)

6. **Data export/import** — JSON backup and restore for cross-device migration
7. **Recurring transactions** — Auto-repeating expenses (e.g., monthly subscriptions)
8. **Budget alerts** — Push notifications or visual warnings when a pocket nears its limit
9. **Charts & graphs** — Spending visualization: pie chart per pocket, daily line chart
10. **Multi-month view** — Compare spending across months
11. **Custom pocket ordering** — Drag & drop to change pocket order on dashboard
12. **Search/filter transactions** — Filter by pocket, date range, amount range
13. **Weekly/monthly reports** — Summary of spending patterns
14. **State normalization** — Use Map or ID-keyed Record for O(1) pocket lookups

### Low Priority (Polish & Extensions)

15. **PWA support** — Service worker, offline capability, installable app
16. **Cloud sync** — Optional backend sync (Firebase, Supabase, or custom API)
17. **Dark/Light theme toggle** — Add light mode option
18. **Multi-currency support** — Beyond IDR (USD, MYR, SGD, etc.)
19. **Categories per pocket** — Sub-categorization for more granular tracking
20. **Savings goals** — Set target amounts for saving pocket with progress tracking
21. **Pin protection** — Optional PIN lock for the app
22. **Accessibility audit** — ARIA labels, keyboard navigation, screen reader support
23. **Internationalization** — English and other language support via i18n framework
24. **Cross-platform** — React Native or Capacitor for mobile app

### Architecture Improvements

25. **Composable extraction** — Extract `useRollovers`, `usePersistence` composables from store
26. **Test coverage** — Unit tests for store actions, computed properties, rollover logic
27. **Custom breakpoint config** — Fully configure custom breakpoints in Tailwind v4 theme instead of relying on defaults

---

**Documentation last updated: July 2026**
**KosKas Version: 3.2-TACTICAL**
