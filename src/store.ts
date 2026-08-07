import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { Pocket, Transaction, DEFAULT_POCKETS, POCKET_IDS, generateId, isValidPocket, isValidTransaction } from "./types";
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

const TRANSACTION_STORAGE_KEY = "koskas_transactions";
const POCKET_STORAGE_KEY = "koskas_pockets";
const MONTH_START_KEY = "koskas_month_start";
const ARCHIVE_STORAGE_KEY = "koskas_archives";

const LEGACY_EXPENSE_KEY = "koskas_expenses";
const LEGACY_BUDGETS_KEY = "koskas_budgets";

export const useStore = defineStore("main", () => {
    const pockets = ref<Pocket[]>([]);
    const transactions = ref<Transaction[]>([]);
    const monthStart = ref<number>(Date.now());
    const isLoaded = ref(false);
    const storageFailed = ref(false);
    const syncEnabled = ref(false);
    const userId = ref<string | null>(null);
    const syncFailed = ref(false);
    const isSyncing = ref(false);
    const suppressWatch = ref(false);

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

    function loadFromLocalStorage() {
        const storedTransactions = localStorage.getItem(TRANSACTION_STORAGE_KEY);
        const storedPockets = localStorage.getItem(POCKET_STORAGE_KEY);
        const storedMonthStart = localStorage.getItem(MONTH_START_KEY);

        if (storedPockets) {
            try {
                const parsed = JSON.parse(storedPockets);
                if (Array.isArray(parsed) && parsed.every(isValidPocket)) {
                    pockets.value = parsed;
                } else {
                    console.warn("Corrupt pockets data, using defaults");
                    pockets.value = structuredClone(DEFAULT_POCKETS);
                }
            } catch (e) {
                console.error("Failed to parse pockets", e);
                pockets.value = structuredClone(DEFAULT_POCKETS);
            }
        } else {
            const legacyBudgets = localStorage.getItem(LEGACY_BUDGETS_KEY);
            if (legacyBudgets) {
                try {
                    const parsedLegacy = JSON.parse(legacyBudgets);
                    if (parsedLegacy && typeof parsedLegacy === "object" && !Array.isArray(parsedLegacy)) {
                        pockets.value = structuredClone(DEFAULT_POCKETS).map((p: Pocket) => {
                            const val = parsedLegacy[p.id];
                            if (typeof val === "number" && Number.isFinite(val)) {
                                p.allocation = val;
                            }
                            return p;
                        });
                    } else {
                        pockets.value = structuredClone(DEFAULT_POCKETS);
                    }
                } catch (e) {
                    pockets.value = structuredClone(DEFAULT_POCKETS);
                }
            } else {
                pockets.value = structuredClone(DEFAULT_POCKETS);
            }
        }

        if (storedMonthStart) {
            const parsed = parseInt(storedMonthStart, 10);
            monthStart.value = Number.isFinite(parsed) ? parsed : Date.now();
        } else {
            monthStart.value = Date.now();
        }

        if (storedTransactions) {
            try {
                const parsed = JSON.parse(storedTransactions);
                if (Array.isArray(parsed) && parsed.every(isValidTransaction)) {
                    transactions.value = parsed;
                } else {
                    console.warn("Corrupt transactions data, using empty array");
                    transactions.value = [];
                }
            } catch (e) {
                console.error("Failed to parse transactions", e);
                transactions.value = [];
            }
        } else {
            const legacyExpenses = localStorage.getItem(LEGACY_EXPENSE_KEY);
            if (legacyExpenses) {
                try {
                    const parsedExpenses = JSON.parse(legacyExpenses);
                    transactions.value = parsedExpenses.map((exp: unknown) => {
                        const e = exp as Record<string, unknown>;
                        return {
                            id: typeof e.id === "string" ? e.id : generateId(),
                            type: "expense" as const,
                            fromPocketId: typeof e.categoryId === "string" ? e.categoryId : undefined,
                            amount: typeof e.amount === "number" && Number.isFinite(e.amount) ? e.amount : 0,
                            timestamp: typeof e.timestamp === "number" ? e.timestamp : Date.now(),
                            note: typeof e.note === "string" ? e.note : "",
                        };
                    }).filter(isValidTransaction);
                } catch (e) {
                    console.error("Failed to migrate legacy expenses");
                }
            }
        }
    }

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
                    pockets.value = structuredClone(DEFAULT_POCKETS);
                    await upsertAllPockets(session.user.id, pockets.value);
                }

                if (remoteTransactions.length > 0) {
                    transactions.value = remoteTransactions;
                } else {
                    const localTxs = localStorage.getItem(TRANSACTION_STORAGE_KEY);
                    if (localTxs) {
                        try {
                            const parsed = JSON.parse(localTxs);
                            if (Array.isArray(parsed) && parsed.every(isValidTransaction)) {
                                transactions.value = parsed;
                                await syncAllTransactions(session.user.id, transactions.value);
                            }
                        } catch {
                            transactions.value = [];
                        }
                    } else {
                        transactions.value = [];
                    }
                    localStorage.removeItem(TRANSACTION_STORAGE_KEY);
                    localStorage.removeItem(POCKET_STORAGE_KEY);
                    localStorage.removeItem(MONTH_START_KEY);
                }

                const { data: profile } = await supabase
                    .from('profiles')
                    .select('month_start')
                    .eq('id', session.user.id)
                    .single();

                monthStart.value = profile?.month_start ?? Date.now();
                syncFailed.value = false;
            } catch (err) {
                console.error('Supabase fetch failed, falling back to localStorage:', err);
                syncFailed.value = true;
                loadFromLocalStorage();
            }
        } else {
            loadFromLocalStorage();
        }

        isLoaded.value = true;
        updateRollovers();
    }

    let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

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
                        .upsert({ id: userId.value, month_start: monthStart.value, updated_at: new Date().toISOString() }),
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
    }

    watch(
        [transactions, pockets, monthStart, isLoaded],
        () => {
            if (!isLoaded.value || suppressWatch.value) return;
            persistToStorage();
            syncToSupabase();
        },
        { deep: true },
    );

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

    const totalAllocation = computed(() => {
        return pockets.value.reduce((sum, p) => sum + p.allocation, 0);
    });

    const totalRemaining = computed(() => {
        return Object.values(pocketBalances.value).reduce((sum, bal) => sum + bal, 0);
    });

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

    function updateRollovers() {
        suppressWatch.value = true;
        try {
            const now = new Date();
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
        persistToStorage();
    }

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

    function removeTransaction(id: string) {
        transactions.value = transactions.value.filter((t) => t.id !== id);
        if (syncEnabled.value && userId.value) {
            deleteTransactionRemote(userId.value, id).catch((err) => {
                console.warn("Failed to delete transaction remotely:", err);
            });
        }
        updateRollovers();
    }

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

    function updatePocketAllocation(pocketId: string, amount: number) {
        const pocket = pockets.value.find((p) => p.id === pocketId);
        if (pocket) {
            pocket.allocation = amount;
            updateRollovers();
        }
    }

    function updateAllAllocations(newAllocations: Record<string, number>) {
        Object.entries(newAllocations).forEach(([id, amount]) => {
            const pocket = pockets.value.find((p) => p.id === id);
            if (pocket) {
                pocket.allocation = amount;
            }
        });
        updateRollovers();
    }

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
            try {
                await deleteAllTransactionsRemote(userId.value);
            } catch (e) {
                console.warn("Failed to delete all transactions remotely:", e);
            }
        }
        updateRollovers();
    }

    function resetState() {
        pockets.value = [];
        transactions.value = [];
        monthStart.value = Date.now();
        isLoaded.value = false;
        storageFailed.value = false;
        syncEnabled.value = false;
        userId.value = null;
        syncFailed.value = false;
        isSyncing.value = false;
        suppressWatch.value = false;
        localStorage.removeItem(TRANSACTION_STORAGE_KEY);
        localStorage.removeItem(POCKET_STORAGE_KEY);
        localStorage.removeItem(MONTH_START_KEY);
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
        storageFailed,
        syncFailed,
        isSyncing,
        syncEnabled,
        loadFromStorage,
        pocketBalances,
        totalAllocation,
        totalRemaining,
        updateRollovers,
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
