import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useStore } from './store';
import {
  POCKET_IDS,
  DEFAULT_POCKETS,
} from './types';
import { supabase } from './lib/supabase';
import {
  fetchPockets,
  fetchTransactions,
  upsertAllPockets,
  deleteAllTransactionsRemote,
} from './services/sync';

const mockFetchPockets = fetchPockets as ReturnType<typeof vi.fn>;
const mockFetchTransactions = fetchTransactions as ReturnType<typeof vi.fn>;
const mockUpsertAllPockets = upsertAllPockets as ReturnType<typeof vi.fn>;
const mockDeleteAllTransactionsRemote = deleteAllTransactionsRemote as ReturnType<typeof vi.fn>;
const mockGetSession = supabase.auth.getSession as ReturnType<typeof vi.fn>;

describe('useStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.useRealTimers();
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockFetchPockets.mockResolvedValue([]);
    mockFetchTransactions.mockResolvedValue([]);
    mockUpsertAllPockets.mockResolvedValue(undefined);
    mockDeleteAllTransactionsRemote.mockResolvedValue(undefined);
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

    it('should start with syncFailed = false', () => {
      const store = useStore();
      expect(store.syncFailed).toBe(false);
    });
  });

  // ─── loadFromStorage ─────────────────────────────────────────────

  describe('loadFromStorage', () => {
    it('should load pockets and transactions from Supabase', async () => {
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

      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: 'user-123' } } },
      });
      mockFetchPockets.mockResolvedValue(testPockets);
      mockFetchTransactions.mockResolvedValue(testTx);

      const store = useStore();
      await store.loadFromStorage();

      expect(store.pockets).toHaveLength(1);
      expect(store.pockets[0].id).toBe('test');
      expect(store.transactions).toHaveLength(1);
      expect(store.transactions[0].id).toBe('tx-1');
      expect(store.isLoaded).toBe(true);
    });

    it('should use default pockets when Supabase returns empty', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: 'user-123' } } },
      });
      mockFetchPockets.mockResolvedValue([]);
      mockFetchTransactions.mockResolvedValue([]);

      const store = useStore();
      await store.loadFromStorage();

      expect(store.pockets).toHaveLength(DEFAULT_POCKETS.length);
      expect(store.pockets[0].id).toBe(POCKET_IDS.PANGAN);
      expect(store.isLoaded).toBe(true);
      expect(mockUpsertAllPockets).toHaveBeenCalledWith('user-123', store.pockets);
    });

    it('should set syncFailed = true when Supabase fetch fails', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: 'user-123' } } },
      });
      mockFetchPockets.mockRejectedValue(new Error('Network error'));

      const store = useStore();
      await store.loadFromStorage();

      expect(store.syncFailed).toBe(true);
      expect(store.isLoaded).toBe(true);
      expect(store.pockets).toEqual([]);
    });

    it('should set syncFailed = true when no session exists', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });

      const store = useStore();
      await store.loadFromStorage();

      expect(store.syncFailed).toBe(true);
      expect(store.isLoaded).toBe(true);
    });

    it('should load monthStart from profile', async () => {
      const monthStartTs = new Date(2026, 8, 1).getTime();
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: 'user-123' } } },
      });
      mockFetchPockets.mockResolvedValue([{ id: 'pangan', name: 'Pangan', allocation: 1500000, colorClass: 'bg', icon: 'Utensils' }]);
      mockFetchTransactions.mockResolvedValue([]);

      const mockSingle = vi.fn().mockResolvedValue({ data: { month_start: monthStartTs } });
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
        if (table === 'profiles') {
          return { select: mockSelect, upsert: mockUpsert };
        }
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null }) }) }), upsert: mockUpsert };
      });

      const store = useStore();
      await store.loadFromStorage();

      expect(mockSelect).toHaveBeenCalledWith('month_start');
      expect(mockEq).toHaveBeenCalledWith('id', 'user-123');
      expect(mockSingle).toHaveBeenCalled();
      // monthStart should be set from profile data
      expect(Number.isFinite(store.monthStart)).toBe(true);
    });

    it('should default monthStart to Date.now() when profile has no month_start', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: 'user-123' } } },
      });
      mockFetchPockets.mockResolvedValue([{ id: 'pangan', name: 'Pangan', allocation: 1500000, colorClass: 'bg', icon: 'Utensils' }]);
      mockFetchTransactions.mockResolvedValue([]);

      (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null }),
              }),
            }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
      });

      const before = Date.now();
      const store = useStore();
      await store.loadFromStorage();
      const after = Date.now();

      expect(store.monthStart).toBeGreaterThanOrEqual(before);
      expect(store.monthStart).toBeLessThanOrEqual(after);
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
      store.monthStart = Date.now() - 2000;
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
      store.monthStart = Date.now() - 2000;
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
      store.monthStart = Date.now() - 2000;
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
      store.monthStart = Date.now() - 2000;
      store.transactions = [
        {
          id: 'tx-1',
          type: 'expense',
          fromPocketId: 'nonexistent',
          amount: 500000,
          timestamp: Date.now(),
        },
      ];

      expect(store.pocketBalances['pangan']).toBe(1000000);
    });

    it('should handle negative balance (overspending)', () => {
      const store = useStore();
      store.pockets = [
        { ...DEFAULT_POCKETS[0], allocation: 100000 },
      ];
      store.monthStart = Date.now() - 2000;
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

    it('should exclude transactions before monthStart from balance calculation', () => {
      const store = useStore();
      store.pockets = [
        { ...DEFAULT_POCKETS[0], allocation: 1000000 },
      ];
      const now = Date.now();
      store.monthStart = now - 1000;
      store.transactions = [
        {
          id: 'old-tx',
          type: 'expense',
          fromPocketId: 'pangan',
          amount: 500000,
          timestamp: now - 5000,
        },
        {
          id: 'new-tx',
          type: 'expense',
          fromPocketId: 'pangan',
          amount: 100000,
          timestamp: now,
        },
      ];

      expect(store.pocketBalances['pangan']).toBe(900000);
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
      store.monthStart = Date.now() - 2000;
      store.transactions = [
        {
          id: 'tx-1',
          type: 'expense',
          fromPocketId: 'pangan',
          amount: 300000,
          timestamp: Date.now(),
        },
      ];

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
      store.monthStart = Date.now() - 2000;
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
      store.monthStart = Date.now() - 20000;
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
    it('should clear transactions', () => {
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

    it('should call deleteAllTransactionsRemote when sync is enabled', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: 'user-123' } } },
      });
      mockFetchPockets.mockResolvedValue([]);
      mockFetchTransactions.mockResolvedValue([]);
      (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }));

      const store = useStore();
      await store.loadFromStorage();

      store.transactions = [
        {
          id: 'tx-1',
          type: 'expense',
          fromPocketId: 'pangan',
          amount: 50000,
          timestamp: Date.now(),
        },
      ];

      mockDeleteAllTransactionsRemote.mockClear();
      await store.resetMonth();

      expect(mockDeleteAllTransactionsRemote).toHaveBeenCalledWith('user-123');
    });

    it('should NOT call deleteAllTransactionsRemote when sync is disabled', async () => {
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

      await store.resetMonth();

      expect(mockDeleteAllTransactionsRemote).not.toHaveBeenCalled();
    });

    it('should handle deleteAllTransactionsRemote failure gracefully', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: 'user-123' } } },
      });
      mockFetchPockets.mockResolvedValue([]);
      mockFetchTransactions.mockResolvedValue([]);
      (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }));

      const store = useStore();
      await store.loadFromStorage();

      store.transactions = [
        {
          id: 'tx-1',
          type: 'expense',
          fromPocketId: 'pangan',
          amount: 50000,
          timestamp: Date.now(),
        },
      ];

      mockDeleteAllTransactionsRemote.mockRejectedValue(new Error('Network'));

      await store.resetMonth();

      expect(store.transactions).toHaveLength(0);
      expect(mockDeleteAllTransactionsRemote).toHaveBeenCalledTimes(3);
    });

    it('should not archive to localStorage', async () => {
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

      await store.resetMonth();

      expect(store.transactions).toHaveLength(0);
    });
  });

  // ─── updateRollovers ─────────────────────────────────────────────

  describe('updateRollovers', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('should not create rollover for today', () => {
      const store = useStore();
      const year = 2026;
      const month = 8;
      vi.useFakeTimers();
      vi.setSystemTime(new Date(year, month, 15, 12, 0, 0));

      store.pockets = structuredClone(DEFAULT_POCKETS);
      store.monthStart = new Date(year, month, 1).getTime();

      store.updateRollovers();

      const todayRollover = store.transactions.find(
        (t) => t.isRollover && t.rolloverDate === `${year}-09-15`,
      );
      expect(todayRollover).toBeUndefined();
    });

    it('should create rollover for past days when there is leftover', () => {
      const store = useStore();
      const year = 2026;
      const month = 8;
      vi.useFakeTimers();
      vi.setSystemTime(new Date(year, month, 15, 12, 0, 0));

      store.monthStart = new Date(year, month, 1).getTime();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      store.updateRollovers();

      const rollovers = store.transactions.filter((t) => t.isRollover);
      expect(rollovers.length).toBe(14);
    });

    it('should not create rollover when daily spending equals or exceeds daily limit', () => {
      const store = useStore();
      const year = 2026;
      const month = 8;
      vi.useFakeTimers();
      vi.setSystemTime(new Date(year, month, 15, 12, 0, 0));

      store.monthStart = new Date(year, month, 1).getTime();
      store.pockets = structuredClone(DEFAULT_POCKETS);
      const day1Timestamp = new Date(year, month, 1, 12, 0, 0).getTime();
      store.transactions = [
        {
          id: 'tx-1',
          type: 'expense',
          fromPocketId: POCKET_IDS.PANGAN,
          amount: 999999,
          timestamp: day1Timestamp,
        },
      ];

      store.updateRollovers();

      const day1Rollover = store.transactions.find(
        (t) => t.isRollover && t.rolloverDate === `${year}-09-01`,
      );
      expect(day1Rollover).toBeUndefined();
    });

    it('should update existing rollover instead of creating duplicate', () => {
      const store = useStore();
      const year = 2026;
      const month = 8;
      vi.useFakeTimers();
      vi.setSystemTime(new Date(year, month, 15, 12, 0, 0));

      store.monthStart = new Date(year, month, 1).getTime();
      store.pockets = structuredClone(DEFAULT_POCKETS);

      store.updateRollovers();

      const day1RolloverBefore = store.transactions.find(
        (t) => t.isRollover && t.rolloverDate === `${year}-09-01`,
      );
      expect(day1RolloverBefore).toBeDefined();
      const initialId = day1RolloverBefore?.id;

      store.updateRollovers();

      const day1Rollovers = store.transactions.filter(
        (t) => t.isRollover && t.rolloverDate === `${year}-09-01`,
      );
      expect(day1Rollovers).toHaveLength(1);
      expect(day1Rollovers[0].id).toBe(initialId);
    });

    it('should handle missing pangan pocket gracefully', () => {
      const store = useStore();
      store.pockets = [
        { ...DEFAULT_POCKETS[1] },
      ];

      store.updateRollovers();
    });
  });

  // ─── checkMonthTransition ─────────────────────────────────────────

  describe('checkMonthTransition', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('should automatically reset when monthStart is from previous month', async () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);
      store.monthStart = new Date(2026, 7, 1).getTime();
      store.transactions = [
        {
          id: 'aug-tx-1',
          type: 'expense',
          fromPocketId: POCKET_IDS.PANGAN,
          amount: 50000,
          timestamp: new Date(2026, 7, 15).getTime(),
        },
      ];

      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 8, 1, 10, 0, 0));

      await store.checkMonthTransition();

      expect(store.transactions).toHaveLength(0);
      expect(store.pocketBalances[POCKET_IDS.PANGAN]).toBe(1500000);
    });

    it('should not reset when monthStart is in the current month', async () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);
      store.monthStart = new Date(2026, 8, 1).getTime();
      store.transactions = [
        {
          id: 'sep-tx-1',
          type: 'expense',
          fromPocketId: POCKET_IDS.PANGAN,
          amount: 20000,
          timestamp: new Date(2026, 8, 1).getTime(),
        },
      ];

      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 8, 5, 10, 0, 0));

      await store.checkMonthTransition();

      expect(store.transactions).toHaveLength(1);
      expect(store.transactions[0].id).toBe('sep-tx-1');
    });

    it('should reset across year boundary (December -> January)', async () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);
      store.monthStart = new Date(2025, 11, 1).getTime();
      store.transactions = [
        {
          id: 'dec-tx',
          type: 'expense',
          fromPocketId: POCKET_IDS.PANGAN,
          amount: 30000,
          timestamp: new Date(2025, 11, 20).getTime(),
        },
      ];

      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 0, 1, 9, 0, 0));

      await store.checkMonthTransition();

      expect(store.transactions).toHaveLength(0);
      expect(store.pocketBalances[POCKET_IDS.PANGAN]).toBe(1500000);
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

      store.addExpense('pangan', 20000);

      expect(store.transactions[0].timestamp).toBeGreaterThanOrEqual(
        store.transactions[1].timestamp,
      );
    });
  });

  // ─── Regression: Schema Validation ───────────────────────────────

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
