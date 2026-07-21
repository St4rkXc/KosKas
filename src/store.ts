import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { Pocket, Transaction, DEFAULT_POCKETS } from './types';

const TRANSACTION_STORAGE_KEY = 'koskas_transactions';
const POCKET_STORAGE_KEY = 'koskas_pockets';
const MONTH_START_KEY = 'koskas_month_start';

// Legacy keys for migration
const LEGACY_EXPENSE_KEY = 'koskas_expenses';
const LEGACY_BUDGETS_KEY = 'koskas_budgets';

export const useStore = defineStore('main', () => {
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
        console.error('Failed to parse pockets');
        pockets.value = JSON.parse(JSON.stringify(DEFAULT_POCKETS));
      }
    } else {
      // Check legacy budget settings
      const legacyBudgets = localStorage.getItem(LEGACY_BUDGETS_KEY);
      if (legacyBudgets) {
        try {
          const parsedLegacy = JSON.parse(legacyBudgets);
          pockets.value = JSON.parse(JSON.stringify(DEFAULT_POCKETS)).map((p: Pocket) => {
            if (p.id in parsedLegacy) {
              p.allocation = parsedLegacy[p.id];
            }
            return p;
          });
        } catch (e) {
          pockets.value = JSON.parse(JSON.stringify(DEFAULT_POCKETS));
        }
      } else {
        pockets.value = JSON.parse(JSON.stringify(DEFAULT_POCKETS));
      }
    }

    // 2. Load monthStart
    if (storedMonthStart) {
      monthStart.value = parseInt(storedMonthStart, 10);
    } else {
      monthStart.value = Date.now();
    }

    // 3. Load or migrate transactions
    if (storedTransactions) {
      try {
        transactions.value = JSON.parse(storedTransactions);
      } catch (e) {
        console.error('Failed to parse transactions');
      }
    } else {
      // Check legacy expenses
      const legacyExpenses = localStorage.getItem(LEGACY_EXPENSE_KEY);
      if (legacyExpenses) {
        try {
          const parsedExpenses = JSON.parse(legacyExpenses);
          // Map to new transaction structure
          transactions.value = parsedExpenses.map((exp: any) => ({
            id: exp.id || Math.random().toString(36).substr(2, 9),
            type: 'expense' as const,
            fromPocketId: exp.categoryId,
            amount: exp.amount,
            timestamp: exp.timestamp,
            note: exp.note || ''
          }));
        } catch (e) {
          console.error('Failed to migrate legacy expenses');
        }
      }
    }

    isLoaded.value = true;
    
    // Automatically trigger daily pangan rollover calculation on load
    updateRollovers();
  }

  // Persist state to localStorage on changes
  watch([transactions, pockets, monthStart, isLoaded], () => {
    if (isLoaded.value) {
      localStorage.setItem(TRANSACTION_STORAGE_KEY, JSON.stringify(transactions.value));
      localStorage.setItem(POCKET_STORAGE_KEY, JSON.stringify(pockets.value));
      localStorage.setItem(MONTH_START_KEY, monthStart.value.toString());
    }
  }, { deep: true });

  // Calculate current balances of pockets
  const pocketBalances = computed(() => {
    const balances: Record<string, number> = {};
    pockets.value.forEach(pocket => {
      let bal = pocket.allocation;

      // Add all transfers TO this pocket
      const transfersIn = transactions.value
        .filter(t => t.type === 'transfer' && t.toPocketId === pocket.id)
        .reduce((sum, t) => sum + t.amount, 0);

      // Subtract all transfers FROM this pocket
      const transfersOut = transactions.value
        .filter(t => t.type === 'transfer' && t.fromPocketId === pocket.id)
        .reduce((sum, t) => sum + t.amount, 0);

      // Subtract all expenses FROM this pocket
      const expenses = transactions.value
        .filter(t => t.type === 'expense' && t.fromPocketId === pocket.id)
        .reduce((sum, t) => sum + t.amount, 0);

      balances[pocket.id] = bal + transfersIn - transfersOut - expenses;
    });
    return balances;
  });

  const totalAllocation = computed(() => {
    return pockets.value.reduce((sum, p) => sum + p.allocation, 0);
  });

  const totalRemaining = computed(() => {
    return Object.values(pocketBalances.value).reduce((sum, bal) => sum + bal, 0);
  });

  const totalSpent = computed(() => {
    return transactions.value
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
  });

  // Calculate & Update Daily Pangan Rollover
  function updateRollovers() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const todayDate = now.getDate();

    const panganPocket = pockets.value.find(p => p.id === 'pangan');
    if (!panganPocket) return;

    const totalDays = new Date(year, month + 1, 0).getDate();
    // Daily limit based on starting allocation
    const dailyLimit = Math.floor(panganPocket.allocation / totalDays);

    const startDate = new Date(monthStart.value);
    const startDay = (startDate.getFullYear() === year && startDate.getMonth() === month) ? startDate.getDate() : 1;

    // Evaluate each day from startDay up to yesterday
    for (let d = startDay; d < todayDate; d++) {
      const padDate = d.toString().padStart(2, '0');
      const padMonth = (month + 1).toString().padStart(2, '0');
      const dateString = `${year}-${padMonth}-${padDate}`;

      const startOfDay = new Date(year, month, d, 0, 0, 0, 0).getTime();
      const endOfDay = new Date(year, month, d, 23, 59, 59, 999).getTime();

      // Spent amount from pangan pocket (excluding transfers/rollovers)
      const spentOnDay = transactions.value
        .filter(t => t.type === 'expense' && t.fromPocketId === 'pangan' && t.timestamp >= startOfDay && t.timestamp <= endOfDay)
        .reduce((sum, t) => sum + t.amount, 0);

      const leftoverAmount = Math.max(0, dailyLimit - spentOnDay);

      // Find if we have a rollover transaction for this date
      const existingIndex = transactions.value.findIndex(t => t.isRollover && t.rolloverDate === dateString);

      if (leftoverAmount > 0) {
        if (existingIndex !== -1) {
          transactions.value[existingIndex].amount = leftoverAmount;
        } else {
          transactions.value.push({
            id: `rollover-${dateString}`,
            type: 'transfer',
            fromPocketId: 'pangan',
            toPocketId: 'leftover',
            amount: leftoverAmount,
            timestamp: endOfDay,
            isRollover: true,
            rolloverDate: dateString,
            note: `Sisa pangan harian (${d}/${month + 1})`
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
      id: Math.random().toString(36).substr(2, 9),
      type: 'expense',
      fromPocketId: pocketId,
      amount,
      timestamp: Date.now(),
      note: note || ''
    };
    transactions.value.unshift(newTransaction);
    updateRollovers();
  }

  function addTransfer(fromPocketId: string, toPocketId: string, amount: number, note?: string) {
    const newTransaction: Transaction = {
      id: Math.random().toString(36).substr(2, 9),
      type: 'transfer',
      fromPocketId,
      toPocketId,
      amount,
      timestamp: Date.now(),
      note: note || ''
    };
    transactions.value.unshift(newTransaction);
    updateRollovers();
  }

  function removeTransaction(id: string) {
    transactions.value = transactions.value.filter(t => t.id !== id);
    updateRollovers();
  }

  function addPocket(name: string, allocation: number, colorClass: string, icon: string) {
    const newPocket: Pocket = {
      id: `pocket_${Math.random().toString(36).substr(2, 9)}`,
      name,
      allocation,
      colorClass,
      icon,
      isSystem: false
    };
    pockets.value.push(newPocket);
    updateRollovers();
  }

  function deletePocket(id: string, transferBalanceToPocketId?: string) {
    const pocketIndex = pockets.value.findIndex(p => p.id === id);
    if (pocketIndex === -1) return;
    const pocket = pockets.value[pocketIndex];
    if (pocket.isSystem) return; // Cannot delete system pockets

    // If there is any remaining balance, transfer it or let it go
    const balance = pocketBalances.value[id] || 0;
    if (balance > 0 && transferBalanceToPocketId) {
      addTransfer(id, transferBalanceToPocketId, balance, `Sisa saldo dari pocket ${pocket.name} yang dihapus`);
    }

    pockets.value.splice(pocketIndex, 1);
    
    transactions.value.forEach(t => {
      if (t.fromPocketId === id) t.fromPocketId = 'saving';
      if (t.toPocketId === id) t.toPocketId = 'saving';
    });
    
    updateRollovers();
  }

  function updatePocketAllocation(pocketId: string, amount: number) {
    const pocket = pockets.value.find(p => p.id === pocketId);
    if (pocket) {
      pocket.allocation = amount;
      updateRollovers();
    }
  }

  function updateAllAllocations(newAllocations: Record<string, number>) {
    Object.entries(newAllocations).forEach(([id, amount]) => {
      const pocket = pockets.value.find(p => p.id === id);
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
    totalSpent,
    updateRollovers,
    addExpense,
    addTransfer,
    removeTransaction,
    addPocket,
    deletePocket,
    updatePocketAllocation,
    updateAllAllocations,
    resetMonth
  };
});
