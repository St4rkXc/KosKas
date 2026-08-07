import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useStore } from './store';
import {
  POCKET_IDS,
  DEFAULT_POCKETS,
  generateId,
} from './types';

// Access the mocked localStorage from test-setup
const mockLs = (globalThis as any).__localStorageMock;

describe('useStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockLs.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  // ─── Initial State ───────────────────────────────────────────────

  describe('initial state', () => {
    it('should start with empty pockets', () => {
      const store = useStore();
      expect(store.pockets).toEqual([]);
    });

    it('should start with empty transactions', () => {
      const store = useStore();
      expect(store.transactions).toEqual([]);
    });

    it('should start with isLoaded = false', () => {
      const store = useStore();
      expect(store.isLoaded).toBe(false);
    });

    it('should start with storageFailed = false', () => {
      const store = useStore();
      expect(store.storageFailed).toBe(false);
    });
  });

  // ─── loadFromStorage ─────────────────────────────────────────────

  describe('loadFromStorage', () => {
    it('should load pockets and transactions from localStorage', async () => {
      const testPockets = [
        {
          id: 'test',
          name: 'Test',
          allocation: 500000,
          colorClass: 'bg-[#10B981] text-black',
          icon: 'Utensils',
        },
      ];
      const testTx = [
        {
          id: 'tx-1',
          type: 'expense' as const,
          fromPocketId: 'test',
          amount: 10000,
          timestamp: Date.now(),
        },
      ];

      mockLs.setItem('koskas_pockets', JSON.stringify(testPockets));
      mockLs.setItem('koskas_transactions', JSON.stringify(testTx));
      mockLs.setItem('koskas_month_start', '1700000000000');

      const store = useStore();
      await store.loadFromStorage();

      expect(store.pockets).toHaveLength(1);
      expect(store.pockets[0].id).toBe('test');
      expect(store.transactions).toHaveLength(1);
      expect(store.transactions[0].id).toBe('tx-1');
      expect(store.monthStart).toBe(1700000000000);
      expect(store.isLoaded).toBe(true);
    });

    it('should use default pockets when localStorage is empty', async () => {
      const store = useStore();
      await store.loadFromStorage();

      expect(store.pockets).toHaveLength(DEFAULT_POCKETS.length);
      expect(store.pockets[0].id).toBe(POCKET_IDS.PANGAN);
      expect(store.isLoaded).toBe(true);
    });

    it('should fall back to defaults when pocket data is corrupt JSON', async () => {
      mockLs.setItem('koskas_pockets', 'NOT VALID JSON{{{');
      const store = useStore();
      await store.loadFromStorage();

      expect(store.pockets).toHaveLength(DEFAULT_POCKETS.length);
      expect(store.isLoaded).toBe(true);
    });

    it('should fall back to defaults when pocket data is not an array', async () => {
      mockLs.setItem('koskas_pockets', JSON.stringify({ not: 'an array' }));
      const store = useStore();
      await store.loadFromStorage();

      expect(store.pockets).toHaveLength(DEFAULT_POCKETS.length);
    });

    it('should fall back to defaults when pocket data fails schema validation', async () => {
      const badPockets = [{ id: 123, name: 'Bad' }];
      mockLs.setItem('koskas_pockets', JSON.stringify(badPockets));
      const store = useStore();
      await store.loadFromStorage();

      expect(store.pockets).toHaveLength(DEFAULT_POCKETS.length);
    });

    it('should use empty array when transaction data is corrupt JSON', async () => {
      mockLs.setItem('koskas_transactions', 'BROKEN JSON');
      const store = useStore();
      await store.loadFromStorage();

      expect(store.transactions).toEqual([]);
    });

    it('should use empty array when transaction data fails schema validation', async () => {
      const badTx = [{ id: 123, type: 'invalid' }];
      mockLs.setItem('koskas_transactions', JSON.stringify(badTx));
      const store = useStore();
      await store.loadFromStorage();

      expect(store.transactions).toEqual([]);
    });

    it('should migrate legacy expenses when no modern transactions exist', async () => {
      const legacyExpenses = [
        {
          id: 'legacy-1',
          categoryId: 'pangan',
          amount: 25000,
          timestamp: 1700000000000,
          note: 'Nasi Goreng',
        },
      ];
      mockLs.setItem('koskas_expenses', JSON.stringify(legacyExpenses));

      const store = useStore();
      await store.loadFromStorage();

      expect(store.transactions).toHaveLength(1);
      expect(store.transactions[0].type).toBe('expense');
      expect(store.transactions[0].fromPocketId).toBe('pangan');
      expect(store.transactions[0].amount).toBe(25000);
    });

    it('should migrate legacy budgets to pocket allocations', async () => {
      const legacyBudgets = {
        pangan: 2000000,
        kos: 1500000,
        lifestyle: 500000,
      };
      mockLs.setItem('koskas_budgets', JSON.stringify(legacyBudgets));

      const store = useStore();
      await store.loadFromStorage();

      const pangan = store.pockets.find((p) => p.id === 'pangan');
      const kos = store.pockets.find((p) => p.id === 'kos');
      const lifestyle = store.pockets.find((p) => p.id === 'lifestyle');

      expect(pangan?.allocation).toBe(2000000);
      expect(kos?.allocation).toBe(1500000);
      expect(lifestyle?.allocation).toBe(500000);
    });

    it('should handle legacy expenses with missing fields gracefully', async () => {
      const legacyExpenses = [
        { amount: 10000, timestamp: 1700000000000 },
        { id: 'good', categoryId: 'kos', amount: 20000, timestamp: 1700000000000 },
      ];
      mockLs.setItem('koskas_expenses', JSON.stringify(legacyExpenses));

      const store = useStore();
      await store.loadFromStorage();

      // The first expense gets a generated ID and undefined fromPocketId,
      // but fromPocketId is optional so it passes isValidTransaction.
      // The second one has id='good'. Both survive.
      expect(store.transactions).toHaveLength(2);
      expect(store.transactions.some((t) => t.id === 'good')).toBe(true);
      // The one without an original id gets a generated UUID
      const generated = store.transactions.find((t) => t.id !== 'good');
      expect(generated).toBeDefined();
      expect(generated?.fromPocketId).toBeUndefined();
    });

    it('should parse monthStart correctly from localStorage', async () => {
      mockLs.setItem('koskas_month_start', '1609459200000');
      const store = useStore();
      await store.loadFromStorage();
      expect(store.monthStart).toBe(1609459200000);
    });

    it('should default monthStart to Date.now() when not stored', async () => {
      const before = Date.now();
      const store = useStore();
      await store.loadFromStorage();
      const after = Date.now();
      expect(store.monthStart).toBeGreaterThanOrEqual(before);
      expect(store.monthStart).toBeLessThanOrEqual(after);
    });

    it('should default monthStart to Date.now() when stored value is NaN', async () => {
      mockLs.setItem('koskas_month_start', 'not-a-number');
      const store = useStore();
      await store.loadFromStorage();
      expect(Number.isFinite(store.monthStart)).toBe(true);
    });
  });

  // ─── Persistence & Watcher ───────────────────────────────────────

  describe('persistence and watcher', () => {
    it('should persist state to localStorage after loadFromStorage calls updateRollovers', async () => {
      const store = useStore();
      await store.loadFromStorage();

      // updateRollovers calls persistToStorage directly
      const setItemSpy = (globalThis as any).__setItemSpy();
      expect(setItemSpy).toHaveBeenCalled();
    });

    it('should set storageFailed = true when localStorage throws', async () => {
      const setItemSpy = (globalThis as any).__setItemSpy();
      setItemSpy.mockImplementation(() => {
        throw new Error('Quota exceeded');
      });

      const store = useStore();
      await store.loadFromStorage();

      expect(store.storageFailed).toBe(true);
    });

    it('should reset storageFailed to false on successful persist', async () => {
      const store = useStore();
      // First simulate a failure by setting the flag
      (store as any).storageFailed = true;
      await store.loadFromStorage();
      // After successful load + persist, flag should be false
      expect(store.storageFailed).toBe(false);
    });
  });

  // ─── pocketBalances Computed ─────────────────────────────────────

  describe('pocketBalances', () => {
    it('should initialize balances from pocket allocations', () => {
      const store = useStore();
      store.pockets = [
        { ...DEFAULT_POCKETS[0], allocation: 1000000 },
        { ...DEFAULT_POCKETS[1], allocation: 500000 },
      ];

      expect(store.pocketBalances['pangan']).toBe(1000000);
      expect(store.pocketBalances['kos']).toBe(500000);
    });

    it('should reduce balance when expense is added', () => {
      const store = useStore();
      store.pockets = [
        { ...DEFAULT_POCKETS[0], allocation: 1000000 },
      ];
      store.transactions = [
        {
          id: 'tx-1',
          type: 'expense',
          fromPocketId: 'pangan',
          amount: 200000,
          timestamp: Date.now(),
        },
      ];

      expect(store.pocketBalances['pangan']).toBe(800000);
    });

    it('should handle transfer: reduce source and increase destination', () => {
      const store = useStore();
      store.pockets = [
        { ...DEFAULT_POCKETS[0], allocation: 1000000 },
        { ...DEFAULT_POCKETS[5], allocation: 0 },
      ];
      store.transactions = [
        {
          id: 'tx-1',
          type: 'transfer',
          fromPocketId: 'pangan',
          toPocketId: 'saving',
          amount: 100000,
          timestamp: Date.now(),
        },
      ];

      expect(store.pocketBalances['pangan']).toBe(900000);
      expect(store.pocketBalances['saving']).toBe(100000);
    });

    it('should aggregate multiple transactions correctly', () => {
      const store = useStore();
      store.pockets = [
        { ...DEFAULT_POCKETS[0], allocation: 1000000 },
      ];
      store.transactions = [
        {
          id: 'tx-1',
          type: 'expense',
          fromPocketId: 'pangan',
          amount: 100000,
          timestamp: Date.now() - 1000,
        },
        {
          id: 'tx-2',
          type: 'expense',
          fromPocketId: 'pangan',
          amount: 200000,
          timestamp: Date.now(),
        },
      ];

      expect(store.pocketBalances['pangan']).toBe(700000);
    });

    it('should skip transactions referencing non-existent pocket IDs', () => {
      const store = useStore();
      store.pockets = [
        { ...DEFAULT_POCKETS[0], allocation: 1000000 },
      ];
      store.transactions = [
        {
          id: 'tx-1',
          type: 'expense',
          fromPocketId: 'nonexistent',
          amount: 500000,
          timestamp: Date.now(),
        },
      ];

      // Should remain unchanged since pocket doesn't exist
      expect(store.pocketBalances['pangan']).toBe(1000000);
    });

    it('should handle negative balance (overspending)', () => {
      const store = useStore();
      store.pockets = [
        { ...DEFAULT_POCKETS[0], allocation: 100000 },
      ];
      store.transactions = [
        {
          id: 'tx-1',
          type: 'expense',
          fromPocketId: 'pangan',
          amount: 200000,
          timestamp: Date.now(),
        },
      ];

      expect(store.pocketBalances['pangan']).toBe(-100000);
    });
  });

  // ─── totalAllocation & totalRemaining ────────────────────────────

  describe('totalAllocation and totalRemaining', () => {
    it('should sum all pocket allocations', () => {
      const store = useStore();
      store.pockets = [
        { ...DEFAULT_POCKETS[0], allocation: 1000000 },
        { ...DEFAULT_POCKETS[1], allocation: 500000 },
      ];

      expect(store.totalAllocation).toBe(1500000);
    });

    it('should return 0 when no pockets exist', () => {
      const store = useStore();
      expect(store.totalAllocation).toBe(0);
    });

    it('should sum all pocket balances for totalRemaining', () => {
      const store = useStore();
      store.pockets = [
        { ...DEFAULT_POCKETS[0], allocation: 1000000 },
        { ...DEFAULT_POCKETS[5], allocation: 200000 },
      ];
      store.transactions = [
        {
          id: 'tx-1',
          type: 'expense',
          fromPocketId: 'pangan',
          amount: 300000,
          timestamp: Date.now(),
        },
      ];

      // pangan: 700000, saving: 200000
      expect(store.totalRemaining).toBe(900000);
    });
  });

  // ─── addExpense ──────────────────────────────────────────────────

  describe('addExpense', () => {
    it('should create an expense transaction with correct fields', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      store.addExpense('pangan', 50000, 'Lunch');

      expect(store.transactions).toHaveLength(1);
      const tx = store.transactions[0];
      expect(tx.type).toBe('expense');
      expect(tx.fromPocketId).toBe('pangan');
      expect(tx.amount).toBe(50000);
      expect(tx.note).toBe('Lunch');
      expect(tx.id).toBeDefined();
    });

    it('should add expense to the front of the transactions array', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);
      store.transactions = [
        {
          id: 'old-tx',
          type: 'expense',
          fromPocketId: 'pangan',
          amount: 10000,
          timestamp: Date.now() - 10000,
        },
      ];

      store.addExpense('pangan', 20000);

      expect(store.transactions[0].id).not.toBe('old-tx');
      expect(store.transactions[1].id).toBe('old-tx');
    });

    it('should do nothing when pocket does not exist', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      store.addExpense('nonexistent', 50000);

      expect(store.transactions).toHaveLength(0);
    });

    it('should do nothing when amount is zero', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      store.addExpense('pangan', 0);

      expect(store.transactions).toHaveLength(0);
    });

    it('should do nothing when amount is negative', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      store.addExpense('pangan', -100);

      expect(store.transactions).toHaveLength(0);
    });

    it('should do nothing when amount is NaN', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      store.addExpense('pangan', NaN);

      expect(store.transactions).toHaveLength(0);
    });

    it('should do nothing when amount is Infinity', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      store.addExpense('pangan', Infinity);

      expect(store.transactions).toHaveLength(0);
    });

    it('should use empty string for note when not provided', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      store.addExpense('pangan', 50000);

      expect(store.transactions[0].note).toBe('');
    });
  });

  // ─── addTransfer ─────────────────────────────────────────────────

  describe('addTransfer', () => {
    it('should create a transfer transaction with correct fields', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      store.addTransfer('pangan', 'saving', 100000, 'Monthly savings');

      expect(store.transactions).toHaveLength(1);
      const tx = store.transactions[0];
      expect(tx.type).toBe('transfer');
      expect(tx.fromPocketId).toBe('pangan');
      expect(tx.toPocketId).toBe('saving');
      expect(tx.amount).toBe(100000);
      expect(tx.note).toBe('Monthly savings');
    });

    it('should do nothing when source pocket does not exist', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      store.addTransfer('nonexistent', 'saving', 100000);

      expect(store.transactions).toHaveLength(0);
    });

    it('should do nothing when destination pocket does not exist', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      store.addTransfer('pangan', 'nonexistent', 100000);

      expect(store.transactions).toHaveLength(0);
    });

    it('should do nothing when amount is zero or negative', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      store.addTransfer('pangan', 'saving', 0);
      store.addTransfer('pangan', 'saving', -50);

      expect(store.transactions).toHaveLength(0);
    });
  });

  // ─── removeTransaction ───────────────────────────────────────────

  describe('removeTransaction', () => {
    it('should remove a transaction by ID', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);
      store.transactions = [
        {
          id: 'tx-1',
          type: 'expense',
          fromPocketId: 'pangan',
          amount: 10000,
          timestamp: Date.now(),
        },
        {
          id: 'tx-2',
          type: 'expense',
          fromPocketId: 'kos',
          amount: 20000,
          timestamp: Date.now(),
        },
      ];

      store.removeTransaction('tx-1');

      expect(store.transactions).toHaveLength(1);
      expect(store.transactions[0].id).toBe('tx-2');
    });

    it('should do nothing when transaction ID does not exist', () => {
      const store = useStore();
      store.transactions = [
        {
          id: 'tx-1',
          type: 'expense',
          fromPocketId: 'pangan',
          amount: 10000,
          timestamp: Date.now(),
        },
      ];

      store.removeTransaction('nonexistent');

      expect(store.transactions).toHaveLength(1);
    });
  });

  // ─── addPocket ───────────────────────────────────────────────────

  describe('addPocket', () => {
    it('should create a new pocket and return its ID', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      const id = store.addPocket('Entertainment', 200000, 'bg-[#EC4899] text-white', 'Gamepad2');

      expect(typeof id).toBe('string');
      expect(id.startsWith('pocket_')).toBe(true);
      expect(store.pockets).toHaveLength(DEFAULT_POCKETS.length + 1);

      const newPocket = store.pockets.find((p) => p.id === id);
      expect(newPocket).toBeDefined();
      expect(newPocket?.name).toBe('Entertainment');
      expect(newPocket?.allocation).toBe(200000);
      expect(newPocket?.isSystem).toBe(false);
    });

    it('should generate unique pocket IDs', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      const id1 = store.addPocket('Pocket 1', 100, 'bg-[#10B981] text-black', 'Coins');
      const id2 = store.addPocket('Pocket 2', 200, 'bg-[#3B82F6] text-white', 'Heart');

      expect(id1).not.toBe(id2);
    });
  });

  // ─── deletePocket ────────────────────────────────────────────────

  describe('deletePocket', () => {
    it('should remove a non-system pocket', () => {
      const store = useStore();
      store.pockets = [
        ...structuredClone(DEFAULT_POCKETS),
        {
          id: 'custom-1',
          name: 'Custom',
          allocation: 300000,
          colorClass: 'bg-[#EC4899] text-white',
          icon: 'Gift',
          isSystem: false,
        },
      ];

      store.deletePocket('custom-1');

      expect(store.pockets.find((p) => p.id === 'custom-1')).toBeUndefined();
      expect(store.pockets).toHaveLength(DEFAULT_POCKETS.length);
    });

    it('should NOT delete a system pocket', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);
      const initialLength = store.pockets.length;

      store.deletePocket('pangan');

      expect(store.pockets).toHaveLength(initialLength);
      expect(store.pockets.find((p) => p.id === 'pangan')).toBeDefined();
    });

    it('should do nothing when pocket does not exist', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);
      const initialLength = store.pockets.length;

      store.deletePocket('nonexistent');

      expect(store.pockets).toHaveLength(initialLength);
    });

    it('should create balance preservation transfer when pocket has remaining balance', () => {
      const store = useStore();
      store.pockets = [
        ...structuredClone(DEFAULT_POCKETS),
        {
          id: 'custom-1',
          name: 'Custom',
          allocation: 500000,
          colorClass: 'bg-[#EC4899] text-white',
          icon: 'Gift',
          isSystem: false,
        },
      ];
      // No expenses, so balance = 500000

      store.deletePocket('custom-1', 'saving');

      const transferTx = store.transactions.find(
        (t) => t.fromPocketId === 'custom-1' && t.type === 'transfer',
      );
      expect(transferTx).toBeDefined();
      expect(transferTx?.amount).toBe(500000);
      expect(transferTx?.toPocketId).toBe('saving');
    });

    it('should NOT create transfer when pocket has zero balance', () => {
      const store = useStore();
      store.pockets = [
        ...structuredClone(DEFAULT_POCKETS),
        {
          id: 'custom-1',
          name: 'Custom',
          allocation: 100000,
          colorClass: 'bg-[#EC4899] text-white',
          icon: 'Gift',
          isSystem: false,
        },
      ];
      // Spend all of it
      store.transactions = [
        {
          id: 'tx-1',
          type: 'expense',
          fromPocketId: 'custom-1',
          amount: 100000,
          timestamp: Date.now(),
        },
      ];

      store.deletePocket('custom-1', 'saving');

      const transferTx = store.transactions.find(
        (t) => t.fromPocketId === 'custom-1' && t.toPocketId === 'saving',
      );
      expect(transferTx).toBeUndefined();
    });

    it('should rewrite historical transaction refs from deleted pocket to SAVING', () => {
      const store = useStore();
      store.pockets = [
        ...structuredClone(DEFAULT_POCKETS),
        {
          id: 'custom-1',
          name: 'Custom',
          allocation: 500000,
          colorClass: 'bg-[#EC4899] text-white',
          icon: 'Gift',
          isSystem: false,
        },
      ];
      store.transactions = [
        {
          id: 'tx-1',
          type: 'expense',
          fromPocketId: 'custom-1',
          amount: 50000,
          timestamp: Date.now() - 10000,
        },
        {
          id: 'tx-2',
          type: 'transfer',
          fromPocketId: 'pangan',
          toPocketId: 'custom-1',
          amount: 30000,
          timestamp: Date.now() - 5000,
        },
      ];

      store.deletePocket('custom-1');

      const tx1 = store.transactions.find((t) => t.id === 'tx-1');
      const tx2 = store.transactions.find((t) => t.id === 'tx-2');

      expect(tx1?.fromPocketId).toBe(POCKET_IDS.SAVING);
      expect(tx2?.toPocketId).toBe(POCKET_IDS.SAVING);
    });

    it('should NOT rewrite the balance preservation transfer during historical rewrite', () => {
      const store = useStore();
      store.pockets = [
        ...structuredClone(DEFAULT_POCKETS),
        {
          id: 'custom-1',
          name: 'Custom',
          allocation: 500000,
          colorClass: 'bg-[#EC4899] text-white',
          icon: 'Gift',
          isSystem: false,
        },
      ];

      store.deletePocket('custom-1', 'saving');

      const preserveTx = store.transactions.find(
        (t) => t.fromPocketId === 'custom-1' && t.toPocketId === 'saving',
      );
      expect(preserveTx).toBeDefined();
      // The preservation transfer should still reference the deleted pocket
      expect(preserveTx?.fromPocketId).toBe('custom-1');
    });

    it('should not create transfer when transferBalanceToPocketId is not provided', () => {
      const store = useStore();
      store.pockets = [
        ...structuredClone(DEFAULT_POCKETS),
        {
          id: 'custom-1',
          name: 'Custom',
          allocation: 500000,
          colorClass: 'bg-[#EC4899] text-white',
          icon: 'Gift',
          isSystem: false,
        },
      ];

      store.deletePocket('custom-1');

      const transferTx = store.transactions.find(
        (t) => t.fromPocketId === 'custom-1',
      );
      expect(transferTx).toBeUndefined();
    });
  });

  // ─── updatePocketAllocation ──────────────────────────────────────

  describe('updatePocketAllocation', () => {
    it('should update allocation for an existing pocket', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      store.updatePocketAllocation('pangan', 2000000);

      const pangan = store.pockets.find((p) => p.id === 'pangan');
      expect(pangan?.allocation).toBe(2000000);
    });

    it('should do nothing when pocket does not exist', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      store.updatePocketAllocation('nonexistent', 2000000);

      // No error, just no change
      expect(store.pockets.find((p) => p.id === 'nonexistent')).toBeUndefined();
    });
  });

  // ─── updateAllAllocations ────────────────────────────────────────

  describe('updateAllAllocations', () => {
    it('should update allocations for multiple pockets', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      store.updateAllAllocations({
        pangan: 2000000,
        kos: 1500000,
        nonexistent: 999,
      });

      expect(store.pockets.find((p) => p.id === 'pangan')?.allocation).toBe(2000000);
      expect(store.pockets.find((p) => p.id === 'kos')?.allocation).toBe(1500000);
    });

    it('should skip pocket IDs that do not exist', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);
      const initialLength = store.pockets.length;

      store.updateAllAllocations({ nonexistent: 999 });

      expect(store.pockets).toHaveLength(initialLength);
    });
  });

  // ─── resetMonth ──────────────────────────────────────────────────

  describe('resetMonth', () => {
    it('should archive transactions and pockets before clearing', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);
      store.transactions = [
        {
          id: 'tx-1',
          type: 'expense',
          fromPocketId: 'pangan',
          amount: 50000,
          timestamp: Date.now(),
        },
      ];

      store.resetMonth();

      const getItemSpy = (globalThis as any).__getItemSpy();
      const archivesCall = getItemSpy.mock.calls.find(
        (call: unknown[]) => (call as [string])[0] === 'koskas_archives',
      );
      // Archives should have been written (setItem called with koskas_archives)
      const setItemSpy = (globalThis as any).__setItemSpy();
      const archivesSetCall = setItemSpy.mock.calls.find(
        (call: unknown[]) => (call as [string])[0] === 'koskas_archives',
      );
      expect(archivesSetCall).toBeDefined();
      const archives = JSON.parse((archivesSetCall as [string, string])[1]);
      expect(archives).toHaveLength(1);
      expect(archives[0].transactions).toHaveLength(1);
      expect(archives[0].transactions[0].id).toBe('tx-1');
    });

    it('should clear transactions after archiving', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);
      store.transactions = [
        {
          id: 'tx-1',
          type: 'expense',
          fromPocketId: 'pangan',
          amount: 50000,
          timestamp: Date.now(),
        },
      ];

      store.resetMonth();

      expect(store.transactions).toHaveLength(0);
    });

    it('should reset monthStart to current time', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);
      const before = Date.now();

      store.resetMonth();

      expect(store.monthStart).toBeGreaterThanOrEqual(before);
    });

    it('should not archive when there are no transactions', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);
      store.transactions = [];

      const setItemSpy = (globalThis as any).__setItemSpy();
      setItemSpy.mockClear();

      store.resetMonth();

      const archivesSetCall = setItemSpy.mock.calls.find(
        (call: unknown[]) => (call as [string])[0] === 'koskas_archives',
      );
      expect(archivesSetCall).toBeUndefined();
    });

    it('should keep only the last 6 archives', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      // Create 7 archives by calling resetMonth 7 times
      for (let i = 0; i < 7; i++) {
        store.transactions = [
          {
            id: `tx-${i}`,
            type: 'expense',
            fromPocketId: 'pangan',
            amount: 1000,
            timestamp: Date.now(),
          },
        ];
        store.resetMonth();
      }

      const getItemSpy = (globalThis as any).__getItemSpy();
      const lastArchivesCall = getItemSpy.mock.calls.findLast(
        (call: unknown[]) => (call as [string])[0] === 'koskas_archives',
      );
      // The last call to getItem for archives happens during the 7th resetMonth
      // But we need to check what was actually stored. Let's check via the internal store.
      // Since resetMonth reads, modifies, and writes archives, the final state should have 6.
      // We can verify by checking the last setItem call for koskas_archives.
      const setItemSpy = (globalThis as any).__setItemSpy();
      const archivesSetCalls = setItemSpy.mock.calls.filter(
        (call: unknown[]) => (call as [string])[0] === 'koskas_archives',
      );
      const lastSetCall = archivesSetCalls[archivesSetCalls.length - 1];
      const archives = JSON.parse((lastSetCall as [string, string])[1]);
      expect(archives).toHaveLength(6);
    });

    it('should handle localStorage failure during archiving gracefully', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);
      store.transactions = [
        {
          id: 'tx-1',
          type: 'expense',
          fromPocketId: 'pangan',
          amount: 50000,
          timestamp: Date.now(),
        },
      ];

      // Mock localStorage getItem to throw during archive read
      const getItemSpy = (globalThis as any).__getItemSpy();
      const originalGetItem = getItemSpy.getMockImplementation();
      getItemSpy.mockImplementation(() => {
        throw new Error('Read error');
      });

      // Should not crash
      store.resetMonth();

      // Restore
      getItemSpy.mockImplementation(originalGetItem);

      // Transactions should still be cleared
      expect(store.transactions).toHaveLength(0);
    });
  });

  // ─── updateRollovers ─────────────────────────────────────────────

  describe('updateRollovers', () => {
    it('should not create rollover for today', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);
      store.monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

      store.updateRollovers();

      const today = new Date().getDate().toString().padStart(2, '0');
      const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
      const year = new Date().getFullYear();
      const todayRollover = store.transactions.find(
        (t) => t.isRollover && t.rolloverDate === `${year}-${month}-${today}`,
      );
      expect(todayRollover).toBeUndefined();
    });

    it('should create rollover for past days when there is leftover', () => {
      const store = useStore();
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();

      // Set month start to the 1st of current month
      store.monthStart = new Date(year, month, 1).getTime();
      store.pockets = structuredClone(DEFAULT_POCKETS);
      // Pangan allocation: 1500000
      // If no expenses, every past day should have rollover

      store.updateRollovers();

      const todayDate = now.getDate();
      // Should have rollovers for days 1 through todayDate-1
      const rollovers = store.transactions.filter((t) => t.isRollover);
      expect(rollovers.length).toBe(todayDate - 1);
    });

    it('should not create rollover when daily spending equals or exceeds daily limit', () => {
      const store = useStore();
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();

      store.monthStart = new Date(year, month, 1).getTime();
      store.pockets = structuredClone(DEFAULT_POCKETS);
      // Pangan: 1500000, totalDays varies, let's say 30 => dailyLimit = 50000
      // Spend more than daily limit on day 1
      const day1Timestamp = new Date(year, month, 1, 12, 0, 0).getTime();
      store.transactions = [
        {
          id: 'tx-1',
          type: 'expense',
          fromPocketId: POCKET_IDS.PANGAN,
          amount: 999999, // Way more than daily limit
          timestamp: day1Timestamp,
        },
      ];

      store.updateRollovers();

      const padMonth = (month + 1).toString().padStart(2, '0');
      const day1Rollover = store.transactions.find(
        (t) => t.isRollover && t.rolloverDate === `${year}-${padMonth}-01`,
      );
      expect(day1Rollover).toBeUndefined();
    });

    it('should update existing rollover instead of creating duplicate', () => {
      const store = useStore();
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();

      store.monthStart = new Date(year, month, 1).getTime();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      // First run creates rollovers
      store.updateRollovers();

      const padMonth = (month + 1).toString().padStart(2, '0');
      const day1RolloverBefore = store.transactions.find(
        (t) => t.isRollover && t.rolloverDate === `${year}-${padMonth}-01`,
      );
      expect(day1RolloverBefore).toBeDefined();
      const initialId = day1RolloverBefore?.id;

      // Second run should update, not create new
      store.updateRollovers();

      const day1Rollovers = store.transactions.filter(
        (t) => t.isRollover && t.rolloverDate === `${year}-${padMonth}-01`,
      );
      expect(day1Rollovers).toHaveLength(1);
      expect(day1Rollovers[0].id).toBe(initialId);
    });

    it('should remove existing rollover when leftover becomes zero', () => {
      const store = useStore();
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();

      store.monthStart = new Date(year, month, 1).getTime();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      // Create rollovers
      store.updateRollovers();

      const padMonth = (month + 1).toString().padStart(2, '0');
      const day1Rollover = store.transactions.find(
        (t) => t.isRollover && t.rolloverDate === `${year}-${padMonth}-01`,
      );
      expect(day1Rollover).toBeDefined();

      // Now add expense that uses up all daily limit for day 1
      const totalDays = new Date(year, month + 1, 0).getDate();
      const dailyLimit = Math.floor(1500000 / totalDays);
      const day1Timestamp = new Date(year, month, 1, 12, 0, 0).getTime();
      store.transactions.push({
        id: 'big-expense',
        type: 'expense',
        fromPocketId: POCKET_IDS.PANGAN,
        amount: dailyLimit,
        timestamp: day1Timestamp,
      });

      store.updateRollovers();

      const remainingRollover = store.transactions.find(
        (t) => t.isRollover && t.rolloverDate === `${year}-${padMonth}-01`,
      );
      expect(remainingRollover).toBeUndefined();
    });

    it('should insert rollover transactions in sorted position', () => {
      const store = useStore();
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();

      store.monthStart = new Date(year, month, 1).getTime();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      // Add an existing transaction
      const existingTimestamp = new Date(year, month, 5, 10, 0, 0).getTime();
      store.transactions = [
        {
          id: 'existing',
          type: 'expense',
          fromPocketId: 'pangan',
          amount: 10000,
          timestamp: existingTimestamp,
        },
      ];

      store.updateRollovers();

      // Verify transactions are sorted by timestamp (descending for newest first via unshift,
      // but rollovers use insertSorted which places them by timestamp)
      // Rollover for day 5 has timestamp = endOfDay + 1
      const day5End = new Date(year, month, 5, 23, 59, 59, 999).getTime() + 1;
      const day5Rollover = store.transactions.find(
        (t) => t.isRollover && t.rolloverDate && t.rolloverDate.includes('-05'),
      );
      if (day5Rollover) {
        expect(day5Rollover.timestamp).toBe(day5End);
      }
    });

    it('should handle missing pangan pocket gracefully', () => {
      const store = useStore();
      store.pockets = [
        { ...DEFAULT_POCKETS[1] }, // No pangan pocket
      ];

      // Should not crash
      store.updateRollovers();
    });

    it('should calculate daily leftover correctly', () => {
      const store = useStore();
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const totalDays = new Date(year, month + 1, 0).getDate();

      store.monthStart = new Date(year, month, 1).getTime();
      store.pockets = structuredClone(DEFAULT_POCKETS);
      // Pangan allocation: 1500000
      const dailyLimit = Math.floor(1500000 / totalDays);

      // Spend half the daily limit on day 1
      const day1Timestamp = new Date(year, month, 1, 12, 0, 0).getTime();
      store.transactions = [
        {
          id: 'tx-1',
          type: 'expense',
          fromPocketId: POCKET_IDS.PANGAN,
          amount: Math.floor(dailyLimit / 2),
          timestamp: day1Timestamp,
        },
      ];

      store.updateRollovers();

      const padMonth = (month + 1).toString().padStart(2, '0');
      const day1Rollover = store.transactions.find(
        (t) => t.isRollover && t.rolloverDate === `${year}-${padMonth}-01`,
      );

      expect(day1Rollover).toBeDefined();
      expect(day1Rollover?.amount).toBe(Math.ceil(dailyLimit / 2));
    });
  });

  // ─── insertSorted (via updateRollovers) ──────────────────────────

  describe('insertSorted ordering', () => {
    it('should maintain descending timestamp order when transactions are unshifted', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      const oldTimestamp = Date.now() - 100000;
      store.transactions = [
        {
          id: 'old',
          type: 'expense',
          fromPocketId: 'pangan',
          amount: 10000,
          timestamp: oldTimestamp,
        },
      ];

      // addExpense uses unshift (newest first)
      store.addExpense('pangan', 20000);

      expect(store.transactions[0].timestamp).toBeGreaterThanOrEqual(
        store.transactions[1].timestamp,
      );
    });
  });

  // ─── Regression: Watcher Feedback Loop ───────────────────────────

  describe('regression: watcher feedback loop', () => {
    it('should not cause excessive localStorage writes during addExpense', async () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);
      await store.loadFromStorage();

      // Clear any calls from loadFromStorage
      const setItemSpy = (globalThis as any).__setItemSpy();
      setItemSpy.mockClear();

      store.addExpense('pangan', 50000);

      // Count writes per key
      const writeCounts: Record<string, number> = {};
      for (const call of setItemSpy.mock.calls) {
        const key = call[0] as string;
        writeCounts[key] = (writeCounts[key] || 0) + 1;
      }

      // Each key should be written at most a few times (not dozens)
      for (const [key, count] of Object.entries(writeCounts)) {
        expect(count).toBeLessThanOrEqual(3);
      }
    });

    it('should suppress watcher during updateRollovers to prevent feedback', async () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);
      await store.loadFromStorage();

      const setItemSpy = (globalThis as any).__setItemSpy();
      setItemSpy.mockClear();

      // updateRollovers sets suppressWatch = true
      store.updateRollovers();

      // The only writes should come from the explicit persistToStorage at the end
      // of updateRollovers, not from the watcher
      const writeCount = setItemSpy.mock.calls.length;
      // Should be exactly 3 (one persistToStorage call with 3 keys)
      expect(writeCount).toBe(3);
    });
  });

  // ─── Regression: Schema Validation ───────────────────────────────

  describe('regression: schema validation prevents NaN', () => {
    it('should not produce NaN in pockets when data is corrupt', async () => {
      mockLs.setItem('koskas_pockets', JSON.stringify([{ id: null, allocation: 'bad' }]));
      const store = useStore();
      await store.loadFromStorage();

      // Should use defaults, not corrupt data
      store.pockets.forEach((p) => {
        expect(Number.isNaN(p.allocation)).toBe(false);
        expect(typeof p.id).toBe('string');
      });
    });

    it('should not produce NaN in transactions when data is corrupt', async () => {
      mockLs.setItem('koskas_transactions', JSON.stringify([{ amount: 'not a number' }]));
      const store = useStore();
      await store.loadFromStorage();

      expect(store.transactions).toEqual([]);
    });
  });

  // ─── Regression: ID Generation ───────────────────────────────────

  describe('regression: ID generation', () => {
    it('should generate unique transaction IDs for each expense', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      store.addExpense('pangan', 10000);
      store.addExpense('pangan', 20000);
      store.addExpense('kos', 30000);

      const ids = store.transactions.map((t) => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should use UUID format for transaction IDs', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      store.addExpense('pangan', 10000);

      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(uuidRegex.test(store.transactions[0].id)).toBe(true);
    });
  });

  // ─── Regression: Pocket Validation ──────────────────────────────

  describe('regression: pocket validation', () => {
    it('should reject addExpense for non-existent pocket', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      store.addExpense('does-not-exist', 50000);

      expect(store.transactions).toHaveLength(0);
    });

    it('should reject addTransfer for non-existent source pocket', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      store.addTransfer('does-not-exist', 'saving', 50000);

      expect(store.transactions).toHaveLength(0);
    });

    it('should reject addTransfer for non-existent destination pocket', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      store.addTransfer('pangan', 'does-not-exist', 50000);

      expect(store.transactions).toHaveLength(0);
    });
  });
});
