/**
 * store.edge.test.ts — Critical Edge Cases & Error Paths for the Pinia Store
 *
 * Validates:
 * - resetMonth: sync integration, retry logic
 * - deletePocket: negative balance, zero balance, reassignment, preservation transfer
 * - insertSorted: binary search correctness via updateRollovers
 * - loadFromStorage with auth: remote data precedence, Supabase-only
 * - removeTransaction with sync: remote delete delegation
 * - Computed properties: edge cases with empty/unknown data
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useStore } from '../store';
import {
  POCKET_IDS,
  DEFAULT_POCKETS,
} from '../types';

vi.mock('@/services/sync', () => ({
  fetchPockets: vi.fn().mockResolvedValue([]),
  fetchTransactions: vi.fn().mockResolvedValue([]),
  upsertAllPockets: vi.fn().mockResolvedValue(undefined),
  syncAllTransactions: vi.fn().mockResolvedValue(undefined),
  upsertPocket: vi.fn().mockResolvedValue(undefined),
  upsertTransaction: vi.fn().mockResolvedValue(undefined),
  deletePocketRemote: vi.fn().mockResolvedValue(undefined),
  deleteTransactionRemote: vi.fn().mockResolvedValue(undefined),
  deleteAllTransactionsRemote: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

import {
  fetchPockets,
  fetchTransactions,
  upsertAllPockets,
  syncAllTransactions,
  deleteTransactionRemote,
  deleteAllTransactionsRemote,
} from '../services/sync';
import { supabase } from '../lib/supabase';

/** Helper: configure supabase.from to return profile data */
function mockProfileFetch(profileData: { month_start?: number } | null) {
  (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
    if (table === 'profiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: profileData }),
          }),
        }),
        upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    };
  });
}

describe('Store — Edge Cases & Error Paths', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: null },
    });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    });
    (fetchPockets as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (fetchTransactions as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (upsertAllPockets as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (syncAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (deleteTransactionRemote as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (deleteAllTransactionsRemote as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  // ─── resetMonth Edge Cases ──────────────────────────────────────────────

  describe('resetMonth edge cases', () => {
    it('should clear transactions', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);
      store.transactions = [
        { id: 'tx-1', type: 'expense', fromPocketId: 'pangan', amount: 50000, timestamp: Date.now() },
        { id: 'tx-2', type: 'transfer', fromPocketId: 'pangan', toPocketId: 'saving', amount: 100000, timestamp: Date.now() },
      ];

      store.resetMonth();

      expect(store.transactions).toHaveLength(0);
    });

    it('should call deleteAllTransactionsRemote when sync is enabled', async () => {
      (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { session: { user: { id: 'user-123' }, access_token: 'tok' } },
      });
      (fetchPockets as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (fetchTransactions as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      mockProfileFetch(null);

      const store = useStore();
      await store.loadFromStorage();

      expect(store.syncEnabled).toBe(true);

      store.transactions = [
        { id: 'tx-1', type: 'expense', fromPocketId: 'pangan', amount: 50000, timestamp: Date.now() },
      ];

      (deleteAllTransactionsRemote as ReturnType<typeof vi.fn>).mockClear();
      await store.resetMonth();

      expect(deleteAllTransactionsRemote).toHaveBeenCalledWith('user-123');
    });

    it('should NOT call deleteAllTransactionsRemote when sync is disabled', async () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);
      store.transactions = [
        { id: 'tx-1', type: 'expense', fromPocketId: 'pangan', amount: 50000, timestamp: Date.now() },
      ];
      await store.loadFromStorage();

      (deleteAllTransactionsRemote as ReturnType<typeof vi.fn>).mockClear();
      await store.resetMonth();

      expect(deleteAllTransactionsRemote).not.toHaveBeenCalled();
    });

    it('should retry deleteAllTransactionsRemote up to 3 times on failure', async () => {
      (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { session: { user: { id: 'user-123' }, access_token: 'tok' } },
      });
      (fetchPockets as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (fetchTransactions as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      mockProfileFetch(null);

      const store = useStore();
      await store.loadFromStorage();

      store.transactions = [
        { id: 'tx-1', type: 'expense', fromPocketId: 'pangan', amount: 50000, timestamp: Date.now() },
      ];

      (deleteAllTransactionsRemote as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network'));

      await store.resetMonth();
      expect(store.transactions).toHaveLength(0);
      expect(deleteAllTransactionsRemote).toHaveBeenCalledTimes(3);
    });

    it('should auto-reset during loadFromStorage when profile month_start is from previous month', async () => {
      const prevMonth = new Date(2026, 6, 1).getTime();
      const remoteTxs = [
        { id: 'remote-1', type: 'expense' as const, fromPocketId: 'pangan', amount: 50000, timestamp: prevMonth },
      ];

      (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { session: { user: { id: 'user-123' }, access_token: 'tok' } },
      });
      (fetchPockets as ReturnType<typeof vi.fn>).mockResolvedValue(structuredClone(DEFAULT_POCKETS));
      (fetchTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(remoteTxs);
      mockProfileFetch({ month_start: prevMonth });

      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 7, 1, 12, 0, 0));

      const store = useStore();
      await store.loadFromStorage();

      expect(deleteAllTransactionsRemote).toHaveBeenCalledWith('user-123');
      expect(store.transactions).toHaveLength(0);
      expect(store.pocketBalances[POCKET_IDS.PANGAN]).toBe(1500000);

      vi.useRealTimers();
    });

    it('should auto-reset in updateRollovers if month transitions while app is active', () => {
      const store = useStore();
      store.pockets = structuredClone(DEFAULT_POCKETS);
      store.monthStart = new Date(2026, 6, 1).getTime();
      store.transactions = [
        { id: 'tx-old', type: 'expense', fromPocketId: 'pangan', amount: 100000, timestamp: new Date(2026, 6, 10).getTime() },
      ];

      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 7, 1, 10, 0, 0));

      store.updateRollovers();

      expect(store.transactions).toHaveLength(0);
      expect(store.pocketBalances[POCKET_IDS.PANGAN]).toBe(1500000);

      vi.useRealTimers();
    });
  });

  // ─── deletePocket Edge Cases ────────────────────────────────────────────

  describe('deletePocket edge cases', () => {
    it('should NOT create transfer when pocket has negative balance (overspent)', () => {
      const store = useStore();
      store.pockets = [
        ...structuredClone(DEFAULT_POCKETS),
        { id: 'custom-1', name: 'Custom', allocation: 100000, colorClass: 'bg', icon: 'G', isSystem: false },
      ];
      store.monthStart = Date.now() - 2000;
      store.transactions = [
        { id: 'tx-1', type: 'expense', fromPocketId: 'custom-1', amount: 200000, timestamp: Date.now() },
      ];

      store.deletePocket('custom-1', 'saving');

      const preserveTx = store.transactions.find(
        (t) => t.type === 'transfer' && t.fromPocketId === 'custom-1' && t.toPocketId === 'saving'
      );
      expect(preserveTx).toBeUndefined();
      expect(store.pockets.find((p) => p.id === 'custom-1')).toBeUndefined();
    });

    it('should NOT create transfer when pocket has exactly zero balance', () => {
      const store = useStore();
      store.pockets = [
        ...structuredClone(DEFAULT_POCKETS),
        { id: 'custom-1', name: 'Custom', allocation: 100000, colorClass: 'bg', icon: 'G', isSystem: false },
      ];
      store.monthStart = Date.now() - 2000;
      store.transactions = [
        { id: 'tx-1', type: 'expense', fromPocketId: 'custom-1', amount: 100000, timestamp: Date.now() },
      ];

      store.deletePocket('custom-1', 'saving');

      const preserveTx = store.transactions.find(
        (t) => t.type === 'transfer' && t.fromPocketId === 'custom-1' && t.toPocketId === 'saving'
      );
      expect(preserveTx).toBeUndefined();
    });

    it('should reassign fromPocketId but not toPocketId for transfers referencing deleted pocket', () => {
      const store = useStore();
      store.pockets = [
        ...structuredClone(DEFAULT_POCKETS),
        { id: 'custom-1', name: 'A', allocation: 500000, colorClass: 'bg', icon: 'G', isSystem: false },
        { id: 'custom-2', name: 'B', allocation: 300000, colorClass: 'bg', icon: 'G', isSystem: false },
      ];
      store.monthStart = Date.now() - 2000;
      store.transactions = [
        { id: 'tx-1', type: 'transfer', fromPocketId: 'custom-1', toPocketId: 'custom-2', amount: 50000, timestamp: Date.now() },
      ];

      store.deletePocket('custom-1');

      const tx = store.transactions.find((t) => t.id === 'tx-1');
      expect(tx?.fromPocketId).toBe(POCKET_IDS.SAVING);
      expect(tx?.toPocketId).toBe('custom-2');
    });

    it('should preserve balance transfer ID during historical reassignment', () => {
      const store = useStore();
      store.pockets = [
        ...structuredClone(DEFAULT_POCKETS),
        { id: 'custom-1', name: 'Custom', allocation: 500000, colorClass: 'bg', icon: 'G', isSystem: false },
      ];
      store.monthStart = Date.now() - 20000;
      store.transactions = [
        { id: 'old-expense', type: 'expense', fromPocketId: 'custom-1', amount: 100000, timestamp: Date.now() - 10000 },
      ];

      store.deletePocket('custom-1', 'saving');

      const preserveTx = store.transactions.find(
        (t) => t.type === 'transfer' && t.fromPocketId === 'custom-1'
      );
      expect(preserveTx).toBeDefined();
      expect(preserveTx?.amount).toBe(400000);

      const oldTx = store.transactions.find((t) => t.id === 'old-expense');
      expect(oldTx?.fromPocketId).toBe(POCKET_IDS.SAVING);
    });

    it('should handle deleting pocket that received incoming transfers', () => {
      const store = useStore();
      store.pockets = [
        ...structuredClone(DEFAULT_POCKETS),
        { id: 'custom-1', name: 'Custom', allocation: 0, colorClass: 'bg', icon: 'G', isSystem: false },
      ];
      store.monthStart = Date.now() - 2000;
      store.transactions = [
        { id: 'tx-in', type: 'transfer', fromPocketId: 'pangan', toPocketId: 'custom-1', amount: 100000, timestamp: Date.now() },
      ];

      store.deletePocket('custom-1', 'saving');

      const preserveTx = store.transactions.find(
        (t) => t.type === 'transfer' && t.fromPocketId === 'custom-1' && t.toPocketId === 'saving'
      );
      expect(preserveTx).toBeDefined();
      expect(preserveTx?.amount).toBe(100000);

      const incomingTx = store.transactions.find((t) => t.id === 'tx-in');
      expect(incomingTx?.toPocketId).toBe(POCKET_IDS.SAVING);
    });
  });

  // ─── insertSorted via updateRollovers ───────────────────────────────────

  describe('insertSorted binary search correctness', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('should create rollovers in correct order via insertSorted', () => {
      const store = useStore();
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();

      store.pockets = structuredClone(DEFAULT_POCKETS);
      store.monthStart = new Date(year, month, 1).getTime();
      store.transactions = [];

      store.updateRollovers();

      const todayDate = now.getDate();
      if (todayDate > 1) {
        const rollovers = store.transactions.filter((t) => t.isRollover);
        expect(rollovers.length).toBe(todayDate - 1);

        for (let i = 1; i < rollovers.length; i++) {
          expect(rollovers[i].timestamp).toBeLessThanOrEqual(rollovers[i - 1].timestamp);
        }
      }
    });

    it('should handle existing transactions at rollover timestamps', () => {
      const store = useStore();
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();

      store.pockets = structuredClone(DEFAULT_POCKETS);
      store.monthStart = new Date(year, month, 1).getTime();

      const day1End = new Date(year, month, 1, 23, 59, 59, 999).getTime() + 1;
      store.transactions = [
        { id: 'existing', type: 'expense', fromPocketId: POCKET_IDS.PANGAN, amount: 10000, timestamp: day1End },
      ];

      store.updateRollovers();
      expect(store.transactions.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── loadFromStorage with Auth ──────────────────────────────────────────

  describe('loadFromStorage with authentication', () => {
    it('should set syncFailed when Supabase fetch fails (no localStorage fallback)', async () => {
      (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { session: { user: { id: 'user-123' }, access_token: 'tok' } },
      });
      (fetchPockets as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network'));

      const store = useStore();
      await store.loadFromStorage();

      expect(store.pockets).toEqual([]);
      expect(store.syncFailed).toBe(true);
      expect(store.isLoaded).toBe(true);
    });

    it('should use remote data when available and authenticated', async () => {
      const remotePockets = [
        { id: 'remote-p1', name: 'Remote', allocation: 2000000, colorClass: 'bg', icon: 'H' },
      ];
      const remoteTxs = [
        { id: 'remote-tx-1', type: 'expense', fromPocketId: 'remote-p1', amount: 50000, timestamp: Date.now() },
      ];

      (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { session: { user: { id: 'user-123' }, access_token: 'tok' } },
      });
      (fetchPockets as ReturnType<typeof vi.fn>).mockResolvedValueOnce(remotePockets);
      (fetchTransactions as ReturnType<typeof vi.fn>).mockResolvedValueOnce(remoteTxs);
      const testMonthStart = Date.now();
      mockProfileFetch({ month_start: testMonthStart });

      const store = useStore();
      await store.loadFromStorage();

      expect(store.pockets).toHaveLength(1);
      expect(store.pockets[0].id).toBe('remote-p1');
      expect(store.transactions).toHaveLength(1);
      expect(store.transactions[0].id).toBe('remote-tx-1');
      expect(store.monthStart).toBe(testMonthStart);
      expect(store.syncEnabled).toBe(true);
    });

    it('should upload default pockets when remote is empty', async () => {
      (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { session: { user: { id: 'user-1' }, access_token: 'tok' } },
      });
      (fetchPockets as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      (fetchTransactions as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      mockProfileFetch(null);

      const store = useStore();
      await store.loadFromStorage();

      expect(upsertAllPockets).toHaveBeenCalledWith('user-1', expect.any(Array));
      const uploaded = (upsertAllPockets as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(uploaded).toHaveLength(DEFAULT_POCKETS.length);
    });

    it('should NOT upload local transactions when remote is empty', async () => {
      (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { session: { user: { id: 'user-1' }, access_token: 'tok' } },
      });
      (fetchPockets as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      (fetchTransactions as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      mockProfileFetch(null);

      const store = useStore();
      await store.loadFromStorage();

      expect(syncAllTransactions).not.toHaveBeenCalled();
    });

    it('should use profile month_start from Supabase', async () => {
      const testMonthStart = Date.now();
      (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { session: { user: { id: 'user-1' }, access_token: 'tok' } },
      });
      (fetchPockets as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (fetchTransactions as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      mockProfileFetch({ month_start: testMonthStart });

      const store = useStore();
      await store.loadFromStorage();

      expect(store.monthStart).toBe(testMonthStart);
    });

    it('should default monthStart to Date.now() when profile has no month_start', async () => {
      const before = Date.now();

      (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { session: { user: { id: 'user-1' }, access_token: 'tok' } },
      });
      (fetchPockets as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (fetchTransactions as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      mockProfileFetch(null);

      const store = useStore();
      await store.loadFromStorage();

      expect(store.monthStart).toBeGreaterThanOrEqual(before);
    });
  });

  // ─── removeTransaction with Sync ────────────────────────────────────────

  describe('removeTransaction with sync', () => {
    it('should call deleteTransactionRemote when sync is enabled', async () => {
      (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { session: { user: { id: 'user-123' }, access_token: 'tok' } },
      });
      (fetchPockets as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (fetchTransactions as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      mockProfileFetch(null);

      const store = useStore();
      await store.loadFromStorage();

      store.transactions = [
        { id: 'tx-1', type: 'expense', fromPocketId: 'pangan', amount: 10000, timestamp: Date.now() },
      ];

      (deleteTransactionRemote as ReturnType<typeof vi.fn>).mockClear();
      store.removeTransaction('tx-1');

      expect(deleteTransactionRemote).toHaveBeenCalledWith('user-123', 'tx-1');
    });

    it('should NOT call deleteTransactionRemote when sync is disabled', async () => {
      const store = useStore();
      await store.loadFromStorage();

      store.transactions = [
        { id: 'tx-1', type: 'expense', fromPocketId: 'pangan', amount: 10000, timestamp: Date.now() },
      ];

      (deleteTransactionRemote as ReturnType<typeof vi.fn>).mockClear();
      store.removeTransaction('tx-1');

      expect(deleteTransactionRemote).not.toHaveBeenCalled();
    });

    it('should handle deleteTransactionRemote failure gracefully', async () => {
      (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { session: { user: { id: 'user-123' }, access_token: 'tok' } },
      });
      (fetchPockets as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (fetchTransactions as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      mockProfileFetch(null);

      const store = useStore();
      await store.loadFromStorage();

      store.transactions = [
        { id: 'tx-1', type: 'expense', fromPocketId: 'pangan', amount: 10000, timestamp: Date.now() },
      ];

      (deleteTransactionRemote as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network'));

      store.removeTransaction('tx-1');
      expect(store.transactions).toHaveLength(0);
    });
  });

  // ─── Computed Properties Edge Cases ─────────────────────────────────────

  describe('computed properties edge cases', () => {
    it('should return empty object for pocketBalances with no pockets', () => {
      const store = useStore();
      store.pockets = [];
      store.transactions = [];
      expect(store.pocketBalances).toEqual({});
    });

    it('should handle totalRemaining with negative balances', () => {
      const store = useStore();
      store.pockets = [{ ...DEFAULT_POCKETS[0], allocation: 100000 }];
      store.monthStart = Date.now() - 2000;
      store.transactions = [
        { id: 'tx-1', type: 'expense', fromPocketId: 'pangan', amount: 200000, timestamp: Date.now() },
      ];
      expect(store.totalRemaining).toBe(-100000);
    });

    it('should handle totalAllocation with zero-allocation pockets', () => {
      const store = useStore();
      store.pockets = [
        { ...DEFAULT_POCKETS[5], allocation: 0 },
        { ...DEFAULT_POCKETS[6], allocation: 0 },
      ];
      expect(store.totalAllocation).toBe(0);
    });

    it('should ignore transactions referencing unknown pocket IDs', () => {
      const store = useStore();
      store.pockets = [{ ...DEFAULT_POCKETS[0], allocation: 1000000 }];
      store.monthStart = Date.now() - 2000;
      store.transactions = [
        { id: 'tx-1', type: 'expense', fromPocketId: 'ghost', amount: 500000, timestamp: Date.now() },
        { id: 'tx-2', type: 'transfer', fromPocketId: 'ghost', toPocketId: 'phantom', amount: 300000, timestamp: Date.now() },
      ];
      expect(store.pocketBalances['pangan']).toBe(1000000);
    });

    it('should handle mixed valid and invalid pocket references in transactions', () => {
      const store = useStore();
      store.pockets = [
        { ...DEFAULT_POCKETS[0], allocation: 1000000 },
        { ...DEFAULT_POCKETS[5], allocation: 200000 },
      ];
      store.monthStart = Date.now() - 2000;
      store.transactions = [
        { id: 'tx-1', type: 'expense', fromPocketId: 'pangan', amount: 100000, timestamp: Date.now() },
        { id: 'tx-2', type: 'expense', fromPocketId: 'nonexistent', amount: 999999, timestamp: Date.now() },
        { id: 'tx-3', type: 'transfer', fromPocketId: 'pangan', toPocketId: 'saving', amount: 50000, timestamp: Date.now() },
      ];

      expect(store.pocketBalances['pangan']).toBe(850000);
      expect(store.pocketBalances['saving']).toBe(250000);
    });
  });
});
