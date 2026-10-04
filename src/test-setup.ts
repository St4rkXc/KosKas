/**
 * @module test-setup
 * @description Global Vitest setup file. Configures mocks for Supabase client and sync service.
 */
import { beforeEach, afterEach, vi } from 'vitest';

/** Mock Supabase client with stubbed auth and query methods. */
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
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
  },
}));

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

// Override structuredClone to use JSON serialization (Vue reactive proxies
// cannot be cloned by native structuredClone in happy-dom)
(globalThis as any).structuredClone = (obj: unknown) =>
  JSON.parse(JSON.stringify(obj));

afterEach(() => {
  vi.restoreAllMocks();
});
