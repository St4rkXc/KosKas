/**
 * sync.test.ts — Tests for the sync service with focus on data privacy (user scoping)
 *
 * Validates:
 * - All read operations filter by user_id
 * - All write operations include user_id
 * - All delete operations filter by user_id
 * - Data mapping between snake_case (DB) and camelCase (app) is correct
 * - Batch operations work correctly
 * - No operation can access data can access data without user_id
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Chainable mock builder ──────────────────────────────────────────────────
// Builds a chainable mock that records all method calls and resolves to
// a pre-configured { data, error } response.

interface RecordedCall {
  method: string;
  args: unknown[];
}

function createChain(response: { data: unknown; error: unknown }) {
  const calls: RecordedCall[] = [];

  // The chain object — each method call records itself and returns `chain`
  const chain: Record<string, unknown> = {};

  // Make chain thenable so `await supabase.from(...)...` resolves
  chain.then = (onFulfilled: (value: unknown) => unknown) => {
    return onFulfilled({ data: response.data, error: response.error });
  };

  // Use a Proxy to intercept all method calls
  const proxy = new Proxy(chain, {
    get(target, prop: string) {
      if (prop === 'then') return target.then;
      // Return a function that records the call and returns the proxy
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        return proxy;
      };
    },
  });

  return { proxy, calls };
}

// ─── Mock state ──────────────────────────────────────────────────────────────

let mockFrom: ReturnType<typeof vi.fn>;
let allChainCalls: RecordedCall[];
let pendingResponse: { data: unknown; error: unknown };

function setupSupabaseMock() {
  allChainCalls = [];
  pendingResponse = { data: null, error: null };

  mockFrom = vi.fn().mockImplementation((_table: string) => {
    const { proxy, calls } = createChain(pendingResponse);
    // Track which table was used
    calls.push({ method: '__from__', args: [_table] });
    allChainCalls.push(...calls);
    // Return the proxy — but we need allChainCalls to include calls
    // made AFTER from() returns. So we need a different approach.
    return proxy;
  });

  return mockFrom;
}

// Actually, the issue with the above is that allChainCalls gets a snapshot
// of calls at the time from() is called, not after the chain is consumed.
// Let me use a shared mutable array instead.

let sharedCalls: RecordedCall[];

function setupSupabaseMockV2() {
  sharedCalls = [];
  pendingResponse = { data: null, error: null };

  mockFrom = vi.fn().mockImplementation((table: string) => {
    sharedCalls.push({ method: '__from__', args: [table] });

    const chain: Record<string, unknown> = {};

    chain.then = (onFulfilled: (value: unknown) => unknown) => {
      return onFulfilled({ data: pendingResponse.data, error: pendingResponse.error });
    };

    const proxy = new Proxy(chain, {
      get(target, prop: string) {
        if (prop === 'then') return target.then;
        return (...args: unknown[]) => {
          sharedCalls.push({ method: prop, args });
          return proxy;
        };
      },
    });

    return proxy;
  });

  return mockFrom;
}

function setResponse(data: unknown, error: unknown = null) {
  pendingResponse = { data, error };
}

function getFromCalls(): string[] {
  return sharedCalls.filter((c) => c.method === '__from__').map((c) => c.args[0] as string);
}

function getEqCalls(): { column: string; value: unknown }[] {
  return sharedCalls
    .filter((c) => c.method === 'eq')
    .map((c) => ({ column: c.args[0] as string, value: c.args[1] }));
}

function getUpsertCalls(): unknown[] {
  return sharedCalls.filter((c) => c.method === 'upsert').map((c) => c.args[0]);
}

function getDeleteCalls(): number {
  return sharedCalls.filter((c) => c.method === 'delete').length;
}

// ─── Helper: fresh import of sync with mocked supabase ───────────────────────

async function loadSync() {
  vi.resetModules();
  setupSupabaseMockV2();

  // Override the global mock from test-setup.ts — we need the REAL sync module
  vi.doMock('@/services/sync', async (importOriginal) => {
    return await importOriginal();
  });

  vi.doMock('@/lib/supabase', () => ({
    supabase: {
      from: mockFrom,
    },
  }));

  const sync = await import('@/services/sync');
  return { sync, mockFrom };
}

// ─── Test data ───────────────────────────────────────────────────────────────

const TEST_USER_ID = 'user-abc-123';
const OTHER_USER_ID = 'user-xyz-999';

const samplePocketRow = {
  id: 'pangan',
  user_id: TEST_USER_ID,
  name: 'Pangan',
  allocation: 1500000,
  color_class: 'bg-[#10B981] text-black',
  icon: 'Utensils',
  is_system: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const sampleTransactionRow = {
  id: 'tx-1',
  user_id: TEST_USER_ID,
  type: 'expense',
  from_pocket_id: 'pangan',
  to_pocket_id: null,
  amount: 50000,
  timestamp: 1700000000000,
  note: 'Lunch',
  is_rollover: false,
  rollover_date: null,
  created_at: '2026-01-01T00:00:00Z',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('sync service', () => {
  // ─── fetchPockets ──────────────────────────────────────────────────────────

  describe('fetchPockets(userId)', () => {
    it('should call supabase.from("pockets").select("*").eq("user_id", userId)', async () => {
      const { sync, mockFrom } = await loadSync();
      setResponse([samplePocketRow]);

      await sync.fetchPockets(TEST_USER_ID);

      expect(mockFrom).toHaveBeenCalledWith('pockets');
      const eqCalls = getEqCalls();
      expect(eqCalls).toContainEqual({ column: 'user_id', value: TEST_USER_ID });
    });

    it('should verify the userId is passed to .eq()', async () => {
      const { sync } = await loadSync();
      setResponse([samplePocketRow]);

      await sync.fetchPockets(TEST_USER_ID);

      const userIdEq = getEqCalls().find((c) => c.column === 'user_id');
      expect(userIdEq).toBeDefined();
      expect(userIdEq!.value).toBe(TEST_USER_ID);
    });

    it('should map snake_case DB rows to camelCase Pocket objects', async () => {
      const { sync } = await loadSync();
      setResponse([samplePocketRow]);

      const result = await sync.fetchPockets(TEST_USER_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'pangan',
        name: 'Pangan',
        allocation: 1500000,
        colorClass: 'bg-[#10B981] text-black',
        icon: 'Utensils',
        isSystem: true,
      });
    });

    it('should return empty array when no data', async () => {
      const { sync } = await loadSync();
      setResponse(null);

      const result = await sync.fetchPockets(TEST_USER_ID);

      expect(result).toEqual([]);
    });

    it('should return empty array when data is empty array', async () => {
      const { sync } = await loadSync();
      setResponse([]);

      const result = await sync.fetchPockets(TEST_USER_ID);

      expect(result).toEqual([]);
    });

    it('should throw on Supabase error', async () => {
      const { sync } = await loadSync();
      const dbError = new Error('Database connection failed');
      setResponse(null, dbError);

      await expect(sync.fetchPockets(TEST_USER_ID)).rejects.toThrow('Database connection failed');
    });
  });

  // ─── fetchTransactions ─────────────────────────────────────────────────────

  describe('fetchTransactions(userId)', () => {
    it('should call supabase.from("transactions").select("*").eq("user_id", userId)', async () => {
      const { sync, mockFrom } = await loadSync();
      setResponse([sampleTransactionRow]);

      await sync.fetchTransactions(TEST_USER_ID);

      expect(mockFrom).toHaveBeenCalledWith('transactions');
      const eqCalls = getEqCalls();
      expect(eqCalls).toContainEqual({ column: 'user_id', value: TEST_USER_ID });
    });

    it('should verify user scoping — userId passed to .eq()', async () => {
      const { sync } = await loadSync();
      setResponse([sampleTransactionRow]);

      await sync.fetchTransactions(TEST_USER_ID);

      const userIdEq = getEqCalls().find((c) => c.column === 'user_id');
      expect(userIdEq).toBeDefined();
      expect(userIdEq!.value).toBe(TEST_USER_ID);
    });

    it('should map snake_case DB rows to camelCase Transaction objects', async () => {
      const { sync } = await loadSync();
      setResponse([sampleTransactionRow]);

      const result = await sync.fetchTransactions(TEST_USER_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'tx-1',
        type: 'expense',
        fromPocketId: 'pangan',
        toPocketId: undefined,
        amount: 50000,
        timestamp: 1700000000000,
        note: 'Lunch',
        isRollover: false,
        rolloverDate: undefined,
      });
    });

    it('should map transfer type transactions correctly', async () => {
      const { sync } = await loadSync();
      const transferRow = {
        ...sampleTransactionRow,
        id: 'tx-transfer',
        type: 'transfer',
        from_pocket_id: 'pangan',
        to_pocket_id: 'kos',
      };
      setResponse([transferRow]);

      const result = await sync.fetchTransactions(TEST_USER_ID);

      expect(result[0].type).toBe('transfer');
      expect(result[0].fromPocketId).toBe('pangan');
      expect(result[0].toPocketId).toBe('kos');
    });

    it('should return empty array when no data', async () => {
      const { sync } = await loadSync();
      setResponse(null);

      const result = await sync.fetchTransactions(TEST_USER_ID);

      expect(result).toEqual([]);
    });

    it('should throw on Supabase error', async () => {
      const { sync } = await loadSync();
      const dbError = new Error('Query timeout');
      setResponse(null, dbError);

      await expect(sync.fetchTransactions(TEST_USER_ID)).rejects.toThrow('Query timeout');
    });
  });

  // ─── upsertPocket ──────────────────────────────────────────────────────────

  describe('upsertPocket(userId, pocket)', () => {
    const testPocket = {
      id: 'pangan',
      name: 'Pangan',
      allocation: 1500000,
      colorClass: 'bg-[#10B981] text-black',
      icon: 'Utensils',
      isSystem: true,
    };

    it('should include user_id in the upserted row — CRITICAL for data privacy', async () => {
      const { sync } = await loadSync();
      setResponse(null, null);

      await sync.upsertPocket(TEST_USER_ID, testPocket);

      const upsertCalls = getUpsertCalls();
      expect(upsertCalls).toHaveLength(1);
      const upsertedRow = upsertCalls[0] as Record<string, unknown>;
      expect(upsertedRow.user_id).toBe(TEST_USER_ID);
    });

    it('should map camelCase to snake_case', async () => {
      const { sync } = await loadSync();
      setResponse(null, null);

      await sync.upsertPocket(TEST_USER_ID, testPocket);

      const upsertCalls = getUpsertCalls();
      const row = upsertCalls[0] as Record<string, unknown>;
      expect(row.color_class).toBe('bg-[#10B981] text-black');
      expect(row.is_system).toBe(true);
      expect(row).toHaveProperty('updated_at');
      expect(row).not.toHaveProperty('colorClass');
      expect(row).not.toHaveProperty('isSystem');
    });

    it('should include all required fields', async () => {
      const { sync } = await loadSync();
      setResponse(null, null);

      await sync.upsertPocket(TEST_USER_ID, testPocket);

      const upsertCalls = getUpsertCalls();
      const row = upsertCalls[0] as Record<string, unknown>;
      expect(row.id).toBe('pangan');
      expect(row.name).toBe('Pangan');
      expect(row.allocation).toBe(1500000);
      expect(row.icon).toBe('Utensils');
    });

    it('should default is_system to false when isSystem is undefined', async () => {
      const { sync } = await loadSync();
      setResponse(null, null);

      const pocketWithoutSystem = { ...testPocket, isSystem: undefined };
      await sync.upsertPocket(TEST_USER_ID, pocketWithoutSystem);

      const upsertCalls = getUpsertCalls();
      const row = upsertCalls[0] as Record<string, unknown>;
      expect(row.is_system).toBe(false);
    });

    it('should throw on error', async () => {
      const { sync } = await loadSync();
      const dbError = new Error('Constraint violation');
      setResponse(null, dbError);

      await expect(sync.upsertPocket(TEST_USER_ID, testPocket)).rejects.toThrow('Constraint violation');
    });
  });

  // ─── upsertTransaction ─────────────────────────────────────────────────────

  describe('upsertTransaction(userId, tx)', () => {
    const testTx = {
      id: 'tx-1',
      type: 'expense' as const,
      fromPocketId: 'pangan',
      amount: 50000,
      timestamp: 1700000000000,
      note: 'Lunch',
    };

    it('should include user_id in the upserted row — CRITICAL for data privacy', async () => {
      const { sync } = await loadSync();
      setResponse(null, null);

      await sync.upsertTransaction(TEST_USER_ID, testTx);

      const upsertCalls = getUpsertCalls();
      expect(upsertCalls).toHaveLength(1);
      const row = upsertCalls[0] as Record<string, unknown>;
      expect(row.user_id).toBe(TEST_USER_ID);
    });

    it('should map camelCase to snake_case', async () => {
      const { sync } = await loadSync();
      setResponse(null, null);

      await sync.upsertTransaction(TEST_USER_ID, testTx);

      const upsertCalls = getUpsertCalls();
      const row = upsertCalls[0] as Record<string, unknown>;
      expect(row.from_pocket_id).toBe('pangan');
      expect(row.to_pocket_id).toBeNull();
      expect(row.is_rollover).toBe(false);
      expect(row.rollover_date).toBeNull();
      expect(row).not.toHaveProperty('fromPocketId');
      expect(row).not.toHaveProperty('toPocketId');
    });

    it('should handle transfer type with both pocket IDs', async () => {
      const { sync } = await loadSync();
      setResponse(null, null);

      const transferTx = {
        id: 'tx-transfer',
        type: 'transfer' as const,
        fromPocketId: 'pangan',
        toPocketId: 'kos',
        amount: 100000,
        timestamp: 1700000000000,
      };

      await sync.upsertTransaction(TEST_USER_ID, transferTx);

      const upsertCalls = getUpsertCalls();
      const row = upsertCalls[0] as Record<string, unknown>;
      expect(row.from_pocket_id).toBe('pangan');
      expect(row.to_pocket_id).toBe('kos');
    });

    it('should set nullable fields to null when undefined', async () => {
      const { sync } = await loadSync();
      setResponse(null, null);

      const minimalTx = {
        id: 'tx-min',
        type: 'expense' as const,
        amount: 10000,
        timestamp: 1700000000000,
      };

      await sync.upsertTransaction(TEST_USER_ID, minimalTx);

      const upsertCalls = getUpsertCalls();
      const row = upsertCalls[0] as Record<string, unknown>;
      expect(row.from_pocket_id).toBeNull();
      expect(row.to_pocket_id).toBeNull();
      expect(row.note).toBeNull();
      expect(row.is_rollover).toBe(false);
      expect(row.rollover_date).toBeNull();
    });

    it('should throw on error', async () => {
      const { sync } = await loadSync();
      const dbError = new Error('Upsert failed');
      setResponse(null, dbError);

      await expect(sync.upsertTransaction(TEST_USER_ID, testTx)).rejects.toThrow('Upsert failed');
    });
  });

  // ─── deletePocketRemote ────────────────────────────────────────────────────

  describe('deletePocketRemote(userId, pocketId)', () => {
    it('should filter by BOTH user_id AND pocketId — CRITICAL for data privacy', async () => {
      const { sync } = await loadSync();
      setResponse(null, null);

      await sync.deletePocketRemote(TEST_USER_ID, 'pangan');

      const eqCalls = getEqCalls();
      const userIdFilter = eqCalls.find((c) => c.column === 'user_id');
      const idFilter = eqCalls.find((c) => c.column === 'id');

      expect(userIdFilter).toBeDefined();
      expect(userIdFilter!.value).toBe(TEST_USER_ID);
      expect(idFilter).toBeDefined();
      expect(idFilter!.value).toBe('pangan');
    });

    it('should not delete pockets belonging to other users', async () => {
      const { sync } = await loadSync();
      setResponse(null, null);

      await sync.deletePocketRemote(TEST_USER_ID, 'pangan');

      const eqCalls = getEqCalls();
      const userIdFilter = eqCalls.find((c) => c.column === 'user_id');
      expect(userIdFilter!.value).toBe(TEST_USER_ID);
      expect(userIdFilter!.value).not.toBe(OTHER_USER_ID);
    });

    it('should call delete on the pockets table', async () => {
      const { sync, mockFrom } = await loadSync();
      setResponse(null, null);

      await sync.deletePocketRemote(TEST_USER_ID, 'pangan');

      expect(mockFrom).toHaveBeenCalledWith('pockets');
      expect(getDeleteCalls()).toBeGreaterThanOrEqual(1);
    });

    it('should throw on error', async () => {
      const { sync } = await loadSync();
      const dbError = new Error('Delete failed');
      setResponse(null, dbError);

      await expect(sync.deletePocketRemote(TEST_USER_ID, 'pangan')).rejects.toThrow('Delete failed');
    });
  });

  // ─── deleteTransactionRemote ───────────────────────────────────────────────

  describe('deleteTransactionRemote(userId, txId)', () => {
    it('should filter by BOTH user_id AND txId — CRITICAL for data privacy', async () => {
      const { sync } = await loadSync();
      setResponse(null, null);

      await sync.deleteTransactionRemote(TEST_USER_ID, 'tx-1');

      const eqCalls = getEqCalls();
      const userIdFilter = eqCalls.find((c) => c.column === 'user_id');
      const idFilter = eqCalls.find((c) => c.column === 'id');

      expect(userIdFilter).toBeDefined();
      expect(userIdFilter!.value).toBe(TEST_USER_ID);
      expect(idFilter).toBeDefined();
      expect(idFilter!.value).toBe('tx-1');
    });

    it('should call delete on the transactions table', async () => {
      const { sync, mockFrom } = await loadSync();
      setResponse(null, null);

      await sync.deleteTransactionRemote(TEST_USER_ID, 'tx-1');

      expect(mockFrom).toHaveBeenCalledWith('transactions');
    });

    it('should throw on error', async () => {
      const { sync } = await loadSync();
      const dbError = new Error('Delete failed');
      setResponse(null, dbError);

      await expect(
        sync.deleteTransactionRemote(TEST_USER_ID, 'tx-1')
      ).rejects.toThrow('Delete failed');
    });
  });

  // ─── deleteAllTransactionsRemote ───────────────────────────────────────────

  describe('deleteAllTransactionsRemote(userId)', () => {
    it('should filter by user_id only', async () => {
      const { sync } = await loadSync();
      setResponse(null, null);

      await sync.deleteAllTransactionsRemote(TEST_USER_ID);

      const eqCalls = getEqCalls();
      const userIdFilter = eqCalls.find((c) => c.column === 'user_id');

      expect(userIdFilter).toBeDefined();
      expect(userIdFilter!.value).toBe(TEST_USER_ID);

      // Should NOT have an 'id' filter (deleting ALL transactions for user)
      const idFilter = eqCalls.find((c) => c.column === 'id');
      expect(idFilter).toBeUndefined();
    });

    it('should call delete on the transactions table', async () => {
      const { sync, mockFrom } = await loadSync();
      setResponse(null, null);

      await sync.deleteAllTransactionsRemote(TEST_USER_ID);

      expect(mockFrom).toHaveBeenCalledWith('transactions');
    });

    it('should throw on error', async () => {
      const { sync } = await loadSync();
      const dbError = new Error('Bulk delete failed');
      setResponse(null, dbError);

      await expect(
        sync.deleteAllTransactionsRemote(TEST_USER_ID)
      ).rejects.toThrow('Bulk delete failed');
    });
  });

  // ─── upsertAllPockets ──────────────────────────────────────────────────────

  describe('upsertAllPockets(userId, pockets)', () => {
    const testPockets = [
      { id: 'pangan', name: 'Pangan', allocation: 1500000, colorClass: 'bg-[#10B981] text-black', icon: 'Utensils', isSystem: true },
      { id: 'kos', name: 'Kos', allocation: 1000000, colorClass: 'bg-[#3B82F6] text-white', icon: 'Home', isSystem: true },
      { id: 'custom', name: 'Custom', allocation: 200000, colorClass: 'bg-[#F97316] text-black', icon: 'Gift', isSystem: false },
    ];

    it('should include user_id in EVERY row', async () => {
      const { sync } = await loadSync();
      setResponse(null, null);

      await sync.upsertAllPockets(TEST_USER_ID, testPockets);

      const upsertCalls = getUpsertCalls();
      expect(upsertCalls).toHaveLength(1);
      const rows = upsertCalls[0] as Record<string, unknown>[];
      expect(rows).toHaveLength(3);

      for (const row of rows) {
        expect(row.user_id).toBe(TEST_USER_ID);
      }
    });

    it('should map all pockets to snake_case', async () => {
      const { sync } = await loadSync();
      setResponse(null, null);

      await sync.upsertAllPockets(TEST_USER_ID, testPockets);

      const upsertCalls = getUpsertCalls();
      const rows = upsertCalls[0] as Record<string, unknown>[];

      for (const row of rows) {
        expect(row).toHaveProperty('color_class');
        expect(row).toHaveProperty('is_system');
        expect(row).toHaveProperty('updated_at');
        expect(row).not.toHaveProperty('colorClass');
        expect(row).not.toHaveProperty('isSystem');
      }
    });

    it('should throw on error', async () => {
      const { sync } = await loadSync();
      const dbError = new Error('Bulk upsert failed');
      setResponse(null, dbError);

      await expect(sync.upsertAllPockets(TEST_USER_ID, testPockets)).rejects.toThrow(
        'Bulk upsert failed'
      );
    });

    it('should handle empty pockets array', async () => {
      const { sync } = await loadSync();
      setResponse(null, null);

      await sync.upsertAllPockets(TEST_USER_ID, []);

      const upsertCalls = getUpsertCalls();
      const rows = upsertCalls[0] as Record<string, unknown>[];
      expect(rows).toHaveLength(0);
    });
  });

  // ─── syncAllTransactions ───────────────────────────────────────────────────

  describe('syncAllTransactions(userId, txs)', () => {
    const testTxs = Array.from({ length: 5 }, (_, i) => ({
      id: `tx-${i}`,
      type: 'expense' as const,
      fromPocketId: 'pangan',
      amount: 10000 * (i + 1),
      timestamp: 1700000000000 + i,
      note: `Transaction ${i}`,
    }));

    it('should include user_id in EVERY row', async () => {
      const { sync } = await loadSync();
      setResponse(null, null);

      await sync.syncAllTransactions(TEST_USER_ID, testTxs);

      const upsertCalls = getUpsertCalls();
      expect(upsertCalls).toHaveLength(1);
      const rows = upsertCalls[0] as Record<string, unknown>[];
      expect(rows).toHaveLength(5);

      for (const row of rows) {
        expect(row.user_id).toBe(TEST_USER_ID);
      }
    });

    it('should batch in chunks of 100', async () => {
      const { sync } = await loadSync();
      setResponse(null, null);

      // Create 250 transactions — should result in 3 batches (100, 100, 50)
      const manyTxs = Array.from({ length: 250 }, (_, i) => ({
        id: `tx-${i}`,
        type: 'expense' as const,
        amount: 1000,
        timestamp: 1700000000000 + i,
      }));

      await sync.syncAllTransactions(TEST_USER_ID, manyTxs);

      // Should have called upsert 3 times (100 + 100 + 50)
      const upsertCalls = getUpsertCalls();
      expect(upsertCalls).toHaveLength(3);

      // First batch: 100 rows
      const batch1 = upsertCalls[0] as Record<string, unknown>[];
      expect(batch1).toHaveLength(100);

      // Second batch: 100 rows
      const batch2 = upsertCalls[1] as Record<string, unknown>[];
      expect(batch2).toHaveLength(100);

      // Third batch: 50 rows
      const batch3 = upsertCalls[2] as Record<string, unknown>[];
      expect(batch3).toHaveLength(50);

      // All rows in all batches should have user_id
      for (const batch of [batch1, batch2, batch3]) {
        for (const row of batch) {
          expect(row.user_id).toBe(TEST_USER_ID);
        }
      }
    });

    it('should not call upsert when transactions array is empty', async () => {
      const { sync } = await loadSync();
      setResponse(null, null);

      await sync.syncAllTransactions(TEST_USER_ID, []);

      const upsertCalls = getUpsertCalls();
      expect(upsertCalls).toHaveLength(0);
    });

    it('should handle exactly 100 transactions in one batch', async () => {
      const { sync } = await loadSync();
      setResponse(null, null);

      const hundredTxs = Array.from({ length: 100 }, (_, i) => ({
        id: `tx-${i}`,
        type: 'expense' as const,
        amount: 1000,
        timestamp: 1700000000000 + i,
      }));

      await sync.syncAllTransactions(TEST_USER_ID, hundredTxs);

      const upsertCalls = getUpsertCalls();
      expect(upsertCalls).toHaveLength(1);
      const rows = upsertCalls[0] as Record<string, unknown>[];
      expect(rows).toHaveLength(100);
    });

    it('should throw on error in any batch', async () => {
      const { sync } = await loadSync();

      // First batch succeeds, second fails
      let callCount = 0;
      const origImpl = mockFrom.getMockImplementation()!;
      mockFrom.mockImplementation((table: string) => {
        callCount++;
        if (callCount === 2) {
          // Set error for this chain
          pendingResponse = { data: null, error: new Error('Batch 2 failed') };
        } else {
          pendingResponse = { data: null, error: null };
        }
        return origImpl(table);
      });

      const manyTxs = Array.from({ length: 250 }, (_, i) => ({
        id: `tx-${i}`,
        type: 'expense' as const,
        amount: 1000,
        timestamp: 1700000000000 + i,
      }));

      await expect(sync.syncAllTransactions(TEST_USER_ID, manyTxs)).rejects.toThrow('Batch 2 failed');
    });
  });

  // ─── Data Privacy Tests ────────────────────────────────────────────────────

  describe('Data Privacy — User Scoping Verification', () => {
    it('ALL read operations filter by user_id', async () => {
      // Test fetchPockets
      {
        const { sync } = await loadSync();
        setResponse([]);
        await sync.fetchPockets(TEST_USER_ID);
        const eqCalls = getEqCalls();
        const userIdFilter = eqCalls.find((c) => c.column === 'user_id');
        expect(userIdFilter, 'fetchPockets must filter by user_id').toBeDefined();
        expect(userIdFilter!.value).toBe(TEST_USER_ID);
      }

      // Test fetchTransactions
      {
        const { sync } = await loadSync();
        setResponse([]);
        await sync.fetchTransactions(TEST_USER_ID);
        const eqCalls = getEqCalls();
        const userIdFilter = eqCalls.find((c) => c.column === 'user_id');
        expect(userIdFilter, 'fetchTransactions must filter by user_id').toBeDefined();
        expect(userIdFilter!.value).toBe(TEST_USER_ID);
      }
    });

    it('ALL write operations include user_id in the data', async () => {
      // Test upsertPocket
      {
        const { sync } = await loadSync();
        setResponse(null, null);
        await sync.upsertPocket(TEST_USER_ID, {
          id: 'p1', name: 'P1', allocation: 100, colorClass: 'c', icon: 'I', isSystem: false,
        });
        const upsertCalls = getUpsertCalls();
        const row = upsertCalls[0] as Record<string, unknown>;
        expect(row.user_id, 'upsertPocket must include user_id').toBe(TEST_USER_ID);
      }

      // Test upsertTransaction
      {
        const { sync } = await loadSync();
        setResponse(null, null);
        await sync.upsertTransaction(TEST_USER_ID, {
          id: 'tx1', type: 'expense', amount: 100, timestamp: 1700000000000,
        });
        const upsertCalls = getUpsertCalls();
        const row = upsertCalls[0] as Record<string, unknown>;
        expect(row.user_id, 'upsertTransaction must include user_id').toBe(TEST_USER_ID);
      }

      // Test upsertAllPockets
      {
        const { sync } = await loadSync();
        setResponse(null, null);
        await sync.upsertAllPockets(TEST_USER_ID, [
          { id: 'p1', name: 'P1', allocation: 100, colorClass: 'c', icon: 'I', isSystem: false },
          { id: 'p2', name: 'P2', allocation: 200, colorClass: 'c', icon: 'I', isSystem: false },
        ]);
        const upsertCalls = getUpsertCalls();
        const rows = upsertCalls[0] as Record<string, unknown>[];
        for (const row of rows) {
          expect(row.user_id, 'upsertAllPockets must include user_id in every row').toBe(TEST_USER_ID);
        }
      }

      // Test syncAllTransactions
      {
        const { sync } = await loadSync();
        setResponse(null, null);
        await sync.syncAllTransactions(TEST_USER_ID, [
          { id: 'tx1', type: 'expense', amount: 100, timestamp: 1700000000000 },
          { id: 'tx2', type: 'expense', amount: 200, timestamp: 1700000000001 },
        ]);
        const upsertCalls = getUpsertCalls();
        const rows = upsertCalls[0] as Record<string, unknown>[];
        for (const row of rows) {
          expect(row.user_id, 'syncAllTransactions must include user_id in every row').toBe(TEST_USER_ID);
        }
      }
    });

    it('ALL delete operations filter by user_id', async () => {
      // Test deletePocketRemote
      {
        const { sync } = await loadSync();
        setResponse(null, null);
        await sync.deletePocketRemote(TEST_USER_ID, 'p1');
        const eqCalls = getEqCalls();
        const userIdFilter = eqCalls.find((c) => c.column === 'user_id');
        expect(userIdFilter, 'deletePocketRemote must filter by user_id').toBeDefined();
        expect(userIdFilter!.value).toBe(TEST_USER_ID);
      }

      // Test deleteTransactionRemote
      {
        const { sync } = await loadSync();
        setResponse(null, null);
        await sync.deleteTransactionRemote(TEST_USER_ID, 'tx1');
        const eqCalls = getEqCalls();
        const userIdFilter = eqCalls.find((c) => c.column === 'user_id');
        expect(userIdFilter, 'deleteTransactionRemote must filter by user_id').toBeDefined();
        expect(userIdFilter!.value).toBe(TEST_USER_ID);
      }

      // Test deleteAllTransactionsRemote
      {
        const { sync } = await loadSync();
        setResponse(null, null);
        await sync.deleteAllTransactionsRemote(TEST_USER_ID);
        const eqCalls = getEqCalls();
        const userIdFilter = eqCalls.find((c) => c.column === 'user_id');
        expect(userIdFilter, 'deleteAllTransactionsRemote must filter by user_id').toBeDefined();
        expect(userIdFilter!.value).toBe(TEST_USER_ID);
      }
    });

    it('no operation can access data without user_id', async () => {
      const operations = [
        {
          name: 'fetchPockets',
          run: async (sync: any, userId: string) => {
            setResponse([]);
            return sync.fetchPockets(userId);
          },
        },
        {
          name: 'fetchTransactions',
          run: async (sync: any, userId: string) => {
            setResponse([]);
            return sync.fetchTransactions(userId);
          },
        },
        {
          name: 'upsertPocket',
          run: async (sync: any, userId: string) => {
            setResponse(null, null);
            return sync.upsertPocket(userId, {
              id: 'p1', name: 'P1', allocation: 100, colorClass: 'c', icon: 'I',
            });
          },
        },
        {
          name: 'upsertTransaction',
          run: async (sync: any, userId: string) => {
            setResponse(null, null);
            return sync.upsertTransaction(userId, {
              id: 'tx1', type: 'expense', amount: 100, timestamp: 1700000000000,
            });
          },
        },
        {
          name: 'deletePocketRemote',
          run: async (sync: any, userId: string) => {
            setResponse(null, null);
            return sync.deletePocketRemote(userId, 'p1');
          },
        },
        {
          name: 'deleteTransactionRemote',
          run: async (sync: any, userId: string) => {
            setResponse(null, null);
            return sync.deleteTransactionRemote(userId, 'tx1');
          },
        },
        {
          name: 'deleteAllTransactionsRemote',
          run: async (sync: any, userId: string) => {
            setResponse(null, null);
            return sync.deleteAllTransactionsRemote(userId);
          },
        },
      ];

      for (const op of operations) {
        const { sync } = await loadSync();
        await op.run(sync, TEST_USER_ID);

        // Check eq calls for user_id
        const eqCalls = getEqCalls();
        const userIdFilter = eqCalls.find((c) => c.column === 'user_id');

        // Check upsert calls for user_id
        const upsertCalls = getUpsertCalls();

        const hasUserIdInEq = userIdFilter && userIdFilter.value === TEST_USER_ID;
        const hasUserIdInUpsert =
          upsertCalls.length > 0 &&
          (upsertCalls[0] as Record<string, unknown>).user_id === TEST_USER_ID;

        expect(
          hasUserIdInEq || hasUserIdInUpsert,
          `${op.name} must scope data access by user_id`
        ).toBe(true);
      }
    });

    it('different user IDs produce different query filters', async () => {
      // Verify that changing the userId changes the filter value
      {
        const { sync } = await loadSync();
        setResponse([]);
        await sync.fetchPockets(TEST_USER_ID);
        const eqCalls = getEqCalls();
        const userIdFilter = eqCalls.find((c) => c.column === 'user_id');
        expect(userIdFilter!.value).toBe(TEST_USER_ID);
      }

      {
        const { sync } = await loadSync();
        setResponse([]);
        await sync.fetchPockets(OTHER_USER_ID);
        const eqCalls = getEqCalls();
        const userIdFilter = eqCalls.find((c) => c.column === 'user_id');
        expect(userIdFilter!.value).toBe(OTHER_USER_ID);
      }
    });
  });
});
