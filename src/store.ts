import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { Pocket, Transaction, DEFAULT_POCKETS } from "./types";

const TRANSACTION_STORAGE_KEY = "koskas_transactions";
const POCKET_STORAGE_KEY = "koskas_pockets";
const MONTH_START_KEY = "koskas_month_start";

// Legacy keys for migration
const LEGACY_EXPENSE_KEY = "koskas_expenses";
const LEGACY_BUDGETS_KEY = "koskas_budgets";

export const useStore = defineStore("main", () => {
    const pockets = ref<Pocket[]>([]);
    const transactions = ref<Transaction[]>([]);
    const monthStart = ref<number>(Date.now());
    const isLoaded = ref(false);

    function loadFromStorage() {
        const storedTransactions = localStorage.getItem(TRANSACTION_STORAGE_KEY);
        const storedPockets = localStorage.getItem(POCKET_STORAGE_KEY);
        const storedMonthStart = localStorage.getItem(MONTH_START_KEY);

        // 1. Load or migrate pockets
        if (storedPockets) {
            try {
                pockets.value = JSON.parse(storedPockets);
            } catch (e) {
                console.error("Failed to parse pockets");
                pockets.value = JSON.parse(JSON.stringify(DEFAULT_POCKETS));
            }
        } else {
            // Check legacy budget settings
            const legacyBudgets = localStorage.getItem(LEGACY_BUDGETS_KEY);
            if (legacyBudgets) {
                try {
                    const parsedLegacy = JSON.parse(legacyBudgets);
                    if (parsedLegacy && typeof parsedLegacy === "object" && !Array.isArray(parsedLegacy)) {
                        pockets.value = JSON.parse(JSON.stringify(DEFAULT_POCKETS)).map((p: Pocket) => {
                            const val = parsedLegacy[p.id];
                            if (typeof val === "number" && Number.isFinite(val)) {
                                p.allocation = val;
                            }
                            return p;
                        });
                    } else {
                        pockets.value = JSON.parse(JSON.stringify(DEFAULT_POCKETS));
                    }
                } catch (e) {
                    pockets.value = JSON.parse(JSON.stringify(DEFAULT_POCKETS));
                }
            } else {
                pockets.value = JSON.parse(JSON.stringify(DEFAULT_POCKETS));
            }
        }

        // 2. Load monthStart
        if (storedMonthStart) {
            const parsed = parseInt(storedMonthStart, 10);
            monthStart.value = Number.isFinite(parsed) ? parsed : Date.now();
        } else {
            monthStart.value = Date.now();
        }

        // 3. Load or migrate transactions
        if (storedTransactions) {
            try {
                transactions.value = JSON.parse(storedTransactions);
            } catch (e) {
                console.error("Failed to parse transactions");
            }
        } else {
            // Check legacy expenses
            const legacyExpenses = localStorage.getItem(LEGACY_EXPENSE_KEY);
            if (legacyExpenses) {
                try {
                    const parsedExpenses = JSON.parse(legacyExpenses);
                    // Map to new transaction structure
                    transactions.value = parsedExpenses.map((exp: any) => ({
                        id: exp.id || Math.random().toString(36).slice(2, 11),
                        type: "expense" as const,
                        fromPocketId: exp.categoryId,
                        amount: exp.amount,
                        timestamp: exp.timestamp,
                        note: exp.note || "",
                    }));
                } catch (e) {
                    console.error("Failed to migrate legacy expenses");
                }
            }
        }

        isLoaded.value = true;

        // Automatically trigger daily pangan rollover calculation on load
        updateRollovers();
    }

    // Persist state to localStorage on changes
    watch(
        [transactions, pockets, monthStart, isLoaded],
        () => {
            if (!isLoaded.value) return;
            try {
                localStorage.setItem(TRANSACTION_STORAGE_KEY, JSON.stringify(transactions.value));
                localStorage.setItem(POCKET_STORAGE_KEY, JSON.stringify(pockets.value));
                localStorage.setItem(MONTH_START_KEY, monthStart.value.toString());
            } catch (e) {
                // Storage may be unavailable (private mode, quota exceeded). Swallow silently
                // to keep app responsive; data stays in memory for the session.
                console.warn("Failed to persist state to localStorage:", e);
            }
        },
        { deep: true },
    );

    // Calculate current balances of pockets
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

    // Calculate & Update Daily Pangan Rollover
    function updateRollovers() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const todayDate = now.getDate();

        const panganPocket = pockets.value.find((p) => p.id === "pangan");
        if (!panganPocket) return;

        const totalDays = new Date(year, month + 1, 0).getDate();
        const dailyLimit = Math.floor(panganPocket.allocation / totalDays);

        const startDate = new Date(monthStart.value);
        const startDay = startDate.getFullYear() === year && startDate.getMonth() === month ? startDate.getDate() : 1;

        // Pre-index pangan expenses by date to avoid repeated full scans
        const expensesByDate = new Map<string, number>();
        for (const t of transactions.value) {
            if (t.type !== "expense" || t.fromPocketId !== "pangan") continue;
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
                    transactions.value.push({
                        id: `rollover-${dateString}`,
                        type: "transfer",
                        fromPocketId: "pangan",
                        toPocketId: "leftover",
                        amount: leftoverAmount,
                        timestamp: endOfDay + 1, // ensures rollover sorts after same-day expenses
                        isRollover: true,
                        rolloverDate: dateString,
                        note: `Sisa pangan harian (${d}/${month + 1})`,
                    });
                }
            } else {
                if (existingIndex !== -1) {
                    transactions.value.splice(existingIndex, 1);
                }
            }
        }

        // Sort descending by timestamp
        transactions.value.sort((a, b) => b.timestamp - a.timestamp);
    }

    // Actions
    function addExpense(pocketId: string, amount: number, note?: string) {
        const newTransaction: Transaction = {
            id: Math.random().toString(36).slice(2, 11),
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
        const newTransaction: Transaction = {
            id: Math.random().toString(36).slice(2, 11),
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
        updateRollovers();
    }

    function addPocket(name: string, allocation: number, colorClass: string, icon: string) {
        const newPocket: Pocket = {
            id: `pocket_${Math.random().toString(36).slice(2, 11)}`,
            name,
            allocation,
            colorClass,
            icon,
            isSystem: false,
        };
        pockets.value.push(newPocket);
        updateRollovers();
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
                id: Math.random().toString(36).slice(2, 11),
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

        // Rewrite historical transactions ONLY — skip the preservation transfer
        transactions.value.forEach((t) => {
            if (t.id === preserveTransferId) return;
            if (t.fromPocketId === id) t.fromPocketId = "saving";
            if (t.toPocketId === id) t.toPocketId = "saving";
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

    function resetMonth() {
        transactions.value = [];
        monthStart.value = Date.now();
        updateRollovers();
    }

    return {
        pockets,
        transactions,
        monthStart,
        isLoaded,
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
