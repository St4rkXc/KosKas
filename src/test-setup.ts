import { beforeEach, afterEach, vi } from 'vitest';

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
}));

// Override structuredClone to use JSON serialization (Vue reactive proxies
// cannot be cloned by native structuredClone in happy-dom)
(globalThis as any).structuredClone = (obj: unknown) =>
  JSON.parse(JSON.stringify(obj));

// Plain localStorage mock (no vi.fn by default)
class MockStorage {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = value;
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }

  // Test helpers
  _getStore(): Record<string, string> {
    return { ...this.store };
  }

  _setStore(data: Record<string, string>): void {
    this.store = { ...data };
  }
}

const mockStorage = new MockStorage();

Object.defineProperty(globalThis, 'localStorage', {
  value: mockStorage,
  writable: true,
  configurable: true,
});

// Spy on all methods so they can be mocked per-test and restored
let getItemSpy: ReturnType<typeof vi.spyOn>;
let setItemSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockStorage.clear();
  getItemSpy = vi.spyOn(mockStorage, 'getItem').mockImplementation(function (this: MockStorage, key: string) {
    return (this as any).store[key] ?? null;
  }.bind(mockStorage));
  setItemSpy = vi.spyOn(mockStorage, 'setItem').mockImplementation(function (this: MockStorage, key: string, value: string) {
    (this as any).store[key] = value;
  }.bind(mockStorage));
  vi.spyOn(mockStorage, 'removeItem').mockImplementation(function (this: MockStorage, key: string) {
    delete (this as any).store[key];
  }.bind(mockStorage));
  vi.spyOn(mockStorage, 'clear').mockImplementation(function (this: MockStorage) {
    (this as any).store = {};
  }.bind(mockStorage));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Expose for test access
(globalThis as any).__localStorageMock = mockStorage;
(globalThis as any).__setItemSpy = () => setItemSpy;
(globalThis as any).__getItemSpy = () => getItemSpy;
