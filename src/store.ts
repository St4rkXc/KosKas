/**
 * @module store
 * @description Pinia composition store — the single source of truth for all KosKas state.
 * Manages pockets, transactions, monthly budget allocations, and Supabase cloud sync.
 * Implements the pocket-based budgeting domain logic including expense tracking,
 * inter-pocket transfers, automatic daily Pangan rollover, monthly reset,
 * and debounced Supabase synchronization.
 *
 * All data is persisted to Supabase only. No localStorage is used for authenticated users.
 * The store uses the Pinia composition API pattern (`defineStore("main", () => { ... })`).
 */
import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { Pocket, Transaction, DEFAULT_POCKETS, POCKET_IDS, generateId } from "./types";
import { supabase } from "./lib/supabase";
import {
    fetchPockets,
    fetchTransactions,
    upsertAllPockets,
    syncAllTransactions,
    deleteTransactionRemote,
    deleteAllTransactionsRemote,
} from "./services/sync";
import { onUserChange } from "./composables/useAuth";

/**
 * Main Pinia store for KosKas.
 * @returns Reactive state, computed properties, and action functions for the entire app.
 */
export const useStore = defineStore("main", () => {
    /** All active budget pockets (system + custom). */
    const pockets = ref<Pocket[]>([]);
    /** All transactions for the current month, sorted descending by timestamp. */
    const transactions = ref<Transaction[]>([]);
    /** Unix timestamp (ms) marking the start of the current budget month. */
    const monthStart = ref<number>(Date.now());
    /** True once initial data has been loaded from Supabase. Prevents premature persistence. */
    const isLoaded = ref(false);
    /** True when the user is authenticated and Supabase sync is active. */
    const syncEnabled = ref(false);
    /** Current authenticated user's Supabase UUID, or null. */
    const userId = ref<string | null>(null);
    /** True when the last Supabase sync attempt failed (shows error banner). */
    const syncFailed = ref(false);
    /** True while a Supabase sync operation is in progress. */
    const isSyncing = ref(false);
    /** True during rollover recalculation to prevent the deep watcher from triggering sync. */
    const suppressWatch = ref(false);

    /**
     * Load state from Supabase. Supabase is the single source of truth.
     * 
     * If Supabase fetch fails, sets syncFailed = true and does NOT load any data.
     * The UI will show an error screen with a retry button.
     * 
     * For new users (no pockets in Supabase), initializes with DEFAULT_POCKETS
     * and uploads them to Supabase.
     * 
     * Also fetches `month_start` from the profiles table.
     * Sets `isLoaded = true` when complete, then checks month transition and updates rollovers.
     */
    async function loadFromStorage() {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
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

            if (remotePockets.length > 0) {
                pockets.value = remotePockets;
            } else {
                pockets.value = structuredClone(DEFAULT_POCKETS);
                await upsertAllPockets(session.user.id, pockets.value);
            }

            transactions.value = remoteTransactions;

            const { data: profile } = await supabase
                .from('profiles')
                .select('month_start')
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
        }

        isLoaded.value = true;
        await checkMonthTransition();
        updateRollovers();
    }

    /**
     * Check if the stored month is older than the current calendar month.
     * If so, automatically triggers `resetMonth()` to clear data.
     */
    async function checkMonthTransition() {
        const now = new Date();
        const start = new Date(monthStart.value);
        const isMonthStartOld =
            now.getFullYear() > start.getFullYear() ||
            (now.getFullYear() === start.getFullYear() && now.getMonth() > start.getMonth());

        if (isMonthStartOld) {
            await resetMonth();
        }
    }

    /** Debounce timer handle for Supabase sync. */
    let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Debounced Supabase sync (300ms). Upserts pockets, transactions, and profile data.
     * 
     * Syncs the following to Supabase:
     * - All pockets (via `upsertAllPockets`)
     * - All transactions (via `syncAllTransactions`)
     * - Profile `month_start` (via direct upsert)
     * 
     * No-op if sync is disabled or no user is authenticated.
     * Sets `isSyncing` and `syncFailed` flags for UI status indicators.
     */
    function syncToSupabase() {
        if (!syncEnabled.value || !userId.value) return;
        if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
        syncDebounceTimer = setTimeout(async () => {
            if (!userId.value) return;
            isSyncing.value = true;
            try {
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
                syncFailed.value = false;
            } catch (err) {
                console.warn('Supabase sync failed (offline?):', err);
                syncFailed.value = true;
            } finally {
                isSyncing.value = false;
            }
        }, 300);
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('online', () => {
            if (syncEnabled.value && userId.value && syncFailed.value) {
                syncToSupabase();
            }
        });
        window.addEventListener('focus', () => {
            if (isLoaded.value) {
                checkMonthTransition();
            }
        });
    }

    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && isLoaded.value) {
                checkMonthTransition();
            }
        });
    }

    watch(
        [transactions, pockets, monthStart, isLoaded],
        () => {
            if (!isLoaded.value || suppressWatch.value) return;
            syncToSupabase();
        },
        { deep: true },
    );

    /** Transactions filtered to the current budget month (timestamp >= monthStart). */
    const currentMonthTransactions = computed(() => {
        const start = monthStart.value;
        return transactions.value.filter(t => t.timestamp >= start);
    });

    /**
     * Real-time balance per pocket: allocation + transfers in - transfers out - expenses.
     * Single-pass aggregation over current month transactions. O(P + T).
     */
    const pocketBalances = computed(() => {
        const balances: Record<string, number> = {};
        for (const p of pockets.value) balances[p.id] = p.allocation;

        for (const t of currentMonthTransactions.value) {
            if (t.type === "expense" && t.fromPocketId && t.fromPocketId in balances) {
                balances[t.fromPocketId] -= t.amount;
            } else if (t.type === "transfer") {
                if (t.fromPocketId && t.fromPocketId in balances) balances[t.fromPocketId] -= t.amount;
                if (t.toPocketId && t.toPocketId in balances) balances[t.toPocketId] += t.amount;
            }
        }
        return balances;
    });

    /** Sum of all pocket allocations for the current month. */
    const totalAllocation = computed(() => {
        return pockets.value.reduce((sum, p) => sum + p.allocation, 0);
    });

    /** Sum of all pocket balances (total remaining across all pockets). */
    const totalRemaining = computed(() => {
        return Object.values(pocketBalances.value).reduce((sum, bal) => sum + bal, 0);
    });

    /**
     * Insert a transaction into the sorted transactions array using binary search.
     * O(log n) find + O(n) splice. Maintains descending timestamp order.
     * @param tx - The transaction to insert.
     */
    function insertSorted(tx: Transaction) {
        const arr = transactions.value;
        let lo = 0;
        let hi = arr.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (arr[mid].timestamp > tx.timestamp) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        arr.splice(lo, 0, tx);
    }

    /**
     * Recalculate automatic daily Pangan-to-Leftover rollover transfers.
     * For each past day in the current month, computes leftover = dailyLimit - spentOnDay.
     * Creates, updates, or removes rollover transactions as needed.
     * Uses `suppressWatch` to prevent the deep watcher from triggering during recalculation.
     */
    function updateRollovers() {
        const now = new Date();
        const start = new Date(monthStart.value);
        const isMonthStartOld =
            now.getFullYear() > start.getFullYear() ||
            (now.getFullYear() === start.getFullYear() && now.getMonth() > start.getMonth());

        if (isMonthStartOld) {
            resetMonth();
            return;
        }

        suppressWatch.value = true;
        try {
            const year = now.getFullYear();
            const month = now.getMonth();
            const todayDate = now.getDate();

            const panganPocket = pockets.value.find((p) => p.id === POCKET_IDS.PANGAN);
            if (!panganPocket) return;

            const totalDays = new Date(year, month + 1, 0).getDate();
            const dailyLimit = Math.floor(panganPocket.allocation / totalDays);

            const startDate = new Date(monthStart.value);
            const startDay = startDate.getFullYear() === year && startDate.getMonth() === month ? startDate.getDate() : 1;

            const expensesByDate = new Map<string, number>();
            for (const t of transactions.value) {
                if (t.type !== "expense" || t.fromPocketId !== POCKET_IDS.PANGAN) continue;
                const d = new Date(t.timestamp);
                if (d.getFullYear() === year && d.getMonth() === month) {
                    const key = `${d.getDate()}`;
                    expensesByDate.set(key, (expensesByDate.get(key) ?? 0) + t.amount);
                }
            }

            for (let d = startDay; d < todayDate; d++) {
                const padDate = d.toString().padStart(2, "0");
                const padMonth = (month + 1).toString().padStart(2, "0");
                const dateString = `${year}-${padMonth}-${padDate}`;

                const spentOnDay = expensesByDate.get(`${d}`) ?? 0;
                const leftoverAmount = Math.max(0, dailyLimit - spentOnDay);

                const existingIndex = transactions.value.findIndex((t) => t.isRollover && t.rolloverDate === dateString);

                if (leftoverAmount > 0) {
                    if (existingIndex !== -1) {
                        transactions.value[existingIndex].amount = leftoverAmount;
                    } else {
                        const endOfDay = new Date(year, month, d, 23, 59, 59, 999).getTime();
                        const rolloverTx: Transaction = {
                            id: `rollover-${dateString}`,
                            type: "transfer",
                            fromPocketId: POCKET_IDS.PANGAN,
                            toPocketId: POCKET_IDS.LEFTOVER,
                            amount: leftoverAmount,
                            timestamp: endOfDay + 1,
                            isRollover: true,
                            rolloverDate: dateString,
                            note: `Sisa pangan harian (${d}/${month + 1})`,
                        };
                        insertSorted(rolloverTx);
                    }
                } else {
                    if (existingIndex !== -1) {
                        transactions.value.splice(existingIndex, 1);
                    }
                }
            }
        } finally {
            suppressWatch.value = false;
        }
    }

    /**
     * Record a new expense against a pocket. Validates pocket existence and amount.
     * Triggers rollover recalculation after insertion.
     * @param pocketId - The pocket to charge the expense to.
     * @param amount - The expense amount in Rupiah (must be > 0).
     * @param note - Optional note describing the expense.
     */
    function addExpense(pocketId: string, amount: number, note?: string) {
        if (!pockets.value.some((p) => p.id === pocketId)) {
            console.error(`Pocket ${pocketId} not found`);
            return;
        }
        if (amount <= 0 || !Number.isFinite(amount)) return;

        const newTransaction: Transaction = {
            id: generateId(),
            type: "expense",
            fromPocketId: pocketId,
            amount,
            timestamp: Date.now(),
            note: note || "",
        };
        transactions.value.unshift(newTransaction);
        updateRollovers();
    }

    /**
     * Transfer funds between two pockets. Validates both pockets exist and amount is positive.
     * Triggers rollover recalculation after insertion.
     * @param fromPocketId - Source pocket ID.
     * @param toPocketId - Destination pocket ID.
     * @param amount - Transfer amount in Rupiah (must be > 0).
     * @param note - Optional note describing the transfer.
     */
    function addTransfer(fromPocketId: string, toPocketId: string, amount: number, note?: string) {
        if (!pockets.value.some((p) => p.id === fromPocketId)) {
            console.error(`Source pocket ${fromPocketId} not found`);
            return;
        }
        if (!pockets.value.some((p) => p.id === toPocketId)) {
            console.error(`Destination pocket ${toPocketId} not found`);
            return;
        }
        if (amount <= 0 || !Number.isFinite(amount)) return;

        const newTransaction: Transaction = {
            id: generateId(),
            type: "transfer",
            fromPocketId,
            toPocketId,
            amount,
            timestamp: Date.now(),
            note: note || "",
        };
        transactions.value.unshift(newTransaction);
        updateRollovers();
    }

    /**
     * Remove a transaction by ID. Also deletes from Supabase if sync is enabled.
     * Triggers rollover recalculation after removal.
     * @param id - The transaction ID to remove.
     */
    function removeTransaction(id: string) {
        transactions.value = transactions.value.filter((t) => t.id !== id);
        if (syncEnabled.value && userId.value) {
            deleteTransactionRemote(userId.value, id).catch((err) => {
                console.warn("Failed to delete transaction remotely:", err);
            });
        }
        updateRollovers();
    }

    /**
     * Create a new custom pocket with the given properties.
     * @param name - Display name for the pocket.
     * @param allocation - Monthly budget allocation in Rupiah.
     * @param colorClass - Tailwind CSS classes for styling.
     * @param icon - Lucide icon name.
     * @returns The generated pocket ID (e.g., "pocket_a1b2c3d4").
     */
    function addPocket(name: string, allocation: number, colorClass: string, icon: string): string {
        const id = `pocket_${generateId().slice(0, 8)}`;
        const newPocket: Pocket = {
            id,
            name,
            allocation,
            colorClass,
            icon,
            isSystem: false,
        };
        pockets.value.push(newPocket);
        updateRollovers();
        return id;
    }

    /**
     * Delete a custom pocket. System pockets cannot be deleted.
     * If the pocket has a positive balance, creates a transfer to preserve funds.
     * Reassigns all historical transaction references to the Saving pocket.
     * @param id - The pocket ID to delete.
     * @param transferBalanceToPocketId - Optional destination for remaining balance (defaults to Saving).
     */
    function deletePocket(id: string, transferBalanceToPocketId?: string) {
        const pocketIndex = pockets.value.findIndex((p) => p.id === id);
        if (pocketIndex === -1) return;
        const pocket = pockets.value[pocketIndex];
        if (pocket.isSystem) return;

        const balance = pocketBalances.value[id] || 0;
        let preserveTransferId: string | null = null;

        if (balance > 0 && transferBalanceToPocketId) {
            const tx: Transaction = {
                id: generateId(),
                type: "transfer",
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

        transactions.value.forEach((t) => {
            if (t.id === preserveTransferId) return;
            if (t.fromPocketId === id) t.fromPocketId = POCKET_IDS.SAVING;
            if (t.toPocketId === id) t.toPocketId = POCKET_IDS.SAVING;
        });

        updateRollovers();
    }

    /**
     * Update the monthly allocation for a single pocket.
     * @param pocketId - The pocket to update.
     * @param amount - New allocation amount in Rupiah.
     */
    function updatePocketAllocation(pocketId: string, amount: number) {
        const pocket = pockets.value.find((p) => p.id === pocketId);
        if (pocket) {
            pocket.allocation = amount;
            updateRollovers();
        }
    }

    /**
     * Batch-update allocations for all pockets at once.
     * @param newAllocations - Map of pocket ID to new allocation amount.
     */
    function updateAllAllocations(newAllocations: Record<string, number>) {
        Object.entries(newAllocations).forEach(([id, amount]) => {
            const pocket = pockets.value.find((p) => p.id === id);
            if (pocket) {
                pocket.allocation = amount;
            }
        });
        updateRollovers();
    }

    /**
     * Clear all transactions, reset monthStart to now, and delete remote transactions
     * with retry (3 attempts with exponential backoff).
     * 
     * IMPORTANT: Pocket allocations are NOT reset to defaults. Custom allocations
     * are preserved across month boundaries to maintain user preferences.
     * Only transactions are cleared; the pocket structure remains unchanged.
     */
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

    /**
     * Reset all reactive state to defaults.
     * Used on user sign-out/sign-in to prepare for fresh data load.
     */
    function resetState() {
        pockets.value = [];
        transactions.value = [];
        monthStart.value = Date.now();
        isLoaded.value = false;
        syncEnabled.value = false;
        userId.value = null;
        syncFailed.value = false;
        isSyncing.value = false;
        suppressWatch.value = false;
    }

    onUserChange(async (newUserId) => {
        if (newUserId) {
            resetState();
            await loadFromStorage();
        } else {
            resetState();
            isLoaded.value = true;
        }
    });

    return {
        pockets,
        transactions,
        monthStart,
        isLoaded,
        syncFailed,
        isSyncing,
        syncEnabled,
        loadFromStorage,
        pocketBalances,
        currentMonthTransactions,
        totalAllocation,
        totalRemaining,
        updateRollovers,
        checkMonthTransition,
        addExpense,
        addTransfer,
        removeTransaction,
        addPocket,
        deletePocket,
        updatePocketAllocation,
        updateAllAllocations,
        resetMonth,
    };
});
