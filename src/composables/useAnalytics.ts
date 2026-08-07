import { computed, type Ref } from "vue";
import { useStore } from "../store";
import { formatRupiah, POCKET_IDS } from "../types";

export function useAnalytics(selectedMonth: Ref<Date>) {
    const store = useStore();

    const pocketStats = computed(() => {
        const spent: Record<string, number> = {};
        for (const p of store.pockets) spent[p.id] = 0;

        for (const t of store.transactions) {
            if (t.type === "expense" && t.fromPocketId && t.fromPocketId in spent) {
                spent[t.fromPocketId] += t.amount;
            }
        }

        const stats: Record<string, { spent: number; remaining: number; percentage: number; isOver: boolean }> = {};
        for (const pocket of store.pockets) {
            const s = spent[pocket.id];
            const remaining = store.pocketBalances[pocket.id] || 0;
            stats[pocket.id] = {
                spent: s,
                remaining,
                percentage: pocket.allocation > 0 ? Math.min((s / pocket.allocation) * 100, 100) : 0,
                isOver: remaining < 0,
            };
        }
        return stats;
    });

    const monthlyPerformance = computed(() => {
        const txs = selectedMonthTransactions.value;
        const prevTxs = previousMonthTransactions.value;

        const spentMap: Record<string, number> = {};
        const prevSpentMap: Record<string, number> = {};
        const countMap: Record<string, number> = {};
        const prevCountMap: Record<string, number> = {};

        for (const p of store.pockets) {
            spentMap[p.id] = 0;
            prevSpentMap[p.id] = 0;
            countMap[p.id] = 0;
            prevCountMap[p.id] = 0;
        }

        for (const t of txs) {
            if (t.type === "expense" && t.fromPocketId && t.fromPocketId in spentMap) {
                spentMap[t.fromPocketId] += t.amount;
                countMap[t.fromPocketId]++;
            }
        }
        for (const t of prevTxs) {
            if (t.type === "expense" && t.fromPocketId && t.fromPocketId in prevSpentMap) {
                prevSpentMap[t.fromPocketId] += t.amount;
                prevCountMap[t.fromPocketId]++;
            }
        }

        const performance = store.pockets.map((pocket) => {
            const spent = spentMap[pocket.id];
            const transactionCount = countMap[pocket.id];
            const remaining = pocket.allocation - spent;
            const utilization = pocket.allocation > 0 ? (spent / pocket.allocation) * 100 : 0;
            const isOver = remaining < 0;

            const prevSpent = prevSpentMap[pocket.id];
            const spendingChange = prevSpent > 0 ? ((spent - prevSpent) / prevSpent) * 100 : spent > 0 ? 100 : 0;
            const isBoros = spent > prevSpent;

            return {
                id: pocket.id,
                name: pocket.name,
                icon: pocket.icon,
                colorClass: pocket.colorClass,
                allocation: pocket.allocation,
                spent,
                prevSpent,
                remaining,
                utilization,
                isOver,
                transactionCount,
                spendingChange: Math.abs(spendingChange),
                isBoros,
            };
        });

        performance.sort((a, b) => b.utilization - a.utilization);

        const totalSpent = performance.reduce((sum, p) => sum + p.spent, 0);
        const totalAllocation = performance.reduce((sum, p) => sum + p.allocation, 0);
        const overallUtilization = totalAllocation > 0 ? (totalSpent / totalAllocation) * 100 : 0;
        const mostUsedPocket = performance[0] || null;
        const leastUsedPocket = performance[performance.length - 1] || null;

        const prevTotalSpent = performance.reduce((sum, p) => sum + p.prevSpent, 0);
        const totalSpendingChange = prevTotalSpent > 0 ? ((totalSpent - prevTotalSpent) / prevTotalSpent) * 100 : totalSpent > 0 ? 100 : 0;
        const isOverallBoros = totalSpent > prevTotalSpent;

        return {
            pockets: performance,
            totalSpent,
            prevTotalSpent,
            totalAllocation,
            overallUtilization,
            mostUsedPocket,
            leastUsedPocket,
            totalSpendingChange: Math.abs(totalSpendingChange),
            isOverallBoros,
        };
    });

    const dailyPanganStats = computed(() => {
        const panganPocket = store.pockets.find((p) => p.id === POCKET_IDS.PANGAN);
        const panganAllocation = panganPocket ? panganPocket.allocation : 1500000;

        const now = new Date();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

        const dailyTarget = Math.floor(panganAllocation / daysInMonth);

        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        let spentToday = 0;
        for (const t of store.transactions) {
            if (t.type === "expense" && t.fromPocketId === POCKET_IDS.PANGAN && t.timestamp >= todayStart) {
                spentToday += t.amount;
            }
        }

        return {
            dailyTarget,
            remainingToday: dailyTarget - spentToday,
            spentToday,
        };
    });

    const daysRemaining = computed(() => {
        const now = new Date();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        return daysInMonth - now.getDate() + 1;
    });

    function getMonthStart(date: Date): number {
        return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
    }

    function getMonthEnd(date: Date): number {
        return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    }

    function getTransactionsForMonth(date: Date) {
        const start = getMonthStart(date);
        const end = getMonthEnd(date);
        return store.transactions.filter((t) => t.timestamp >= start && t.timestamp <= end);
    }

    function getPreviousMonth(date: Date): Date {
        return new Date(date.getFullYear(), date.getMonth() - 1, 1);
    }

    function getNextMonth(date: Date): Date {
        return new Date(date.getFullYear(), date.getMonth() + 1, 1);
    }

    function isCurrentMonth(date: Date): boolean {
        const now = new Date();
        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }

    const selectedMonthName = computed(() => {
        const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
        return `${months[selectedMonth.value.getMonth()]} ${selectedMonth.value.getFullYear()}`;
    });

    const selectedMonthTransactions = computed(() => getTransactionsForMonth(selectedMonth.value));
    const previousMonthTransactions = computed(() => getTransactionsForMonth(getPreviousMonth(selectedMonth.value)));

    return {
        pocketStats,
        monthlyPerformance,
        dailyPanganStats,
        daysRemaining,
        selectedMonthName,
        selectedMonthTransactions,
        previousMonthTransactions,
        getPreviousMonth,
        getNextMonth,
        isCurrentMonth,
        formatRupiah,
    };
}
