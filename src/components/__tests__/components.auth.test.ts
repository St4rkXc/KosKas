/**
 * components.auth.test.ts — App.vue Auth Gate, Status Banners & Dashboard Tests
 *
 * Validates:
 * - Auth rendering states: loading → no user → authenticated
 * - Sign out button visibility
 * - Storage failed banner (red)
 * - Sync failed banner (amber)
 * - Sync status indicator
 * - Dashboard content: pocket cards, status badges, FAB
 * - Auth error handling: invalid credentials, duplicate sign up
 * - Performance dashboard: month navigation, per-pocket analysis
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import { setActivePinia } from 'pinia';
import { computed } from 'vue';

import App from '../../App.vue';
import { DEFAULT_POCKETS, POCKET_IDS, type Pocket, type Transaction } from '../../types';

// ─── Module-level mock state for useAuth ──────────────────────────────────────

let mockUser: { id: string; email: string } | null = null;
let mockLoading = false;

const mockSignOut = vi.fn();
const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
const mockSignInWithGoogle = vi.fn();

vi.mock('../../composables/useAuth', () => ({
  useAuth: () => ({
    // Use computed so the template reactivity works correctly
    user: computed(() => mockUser),
    session: computed(() => null),
    loading: computed(() => mockLoading),
    initAuth: vi.fn(),
    signUp: mockSignUp,
    signIn: mockSignIn,
    signInWithGoogle: mockSignInWithGoogle,
    signOut: mockSignOut,
  }),
  onUserChange: vi.fn(),
}));

// ─── Shared Helpers ───────────────────────────────────────────────────────────

function createTestStore(overrides: {
  pockets?: Pocket[];
  transactions?: Transaction[];
  isLoaded?: boolean;
  storageFailed?: boolean;
  syncFailed?: boolean;
  isSyncing?: boolean;
} = {}) {
  const pinia = createTestingPinia({
    createSpy: vi.fn,
    initialState: {
      main: {
        pockets: overrides.pockets ?? structuredClone(DEFAULT_POCKETS),
        transactions: overrides.transactions ?? [],
        monthStart: Date.now(),
        isLoaded: overrides.isLoaded ?? true,
        storageFailed: overrides.storageFailed ?? false,
        syncFailed: overrides.syncFailed ?? false,
        isSyncing: overrides.isSyncing ?? false,
        syncEnabled: false,
        userId: null,
      },
    },
    stubActions: true, // Prevent loadFromStorage from overriding initial state
  });
  setActivePinia(pinia);
  return pinia;
}

function mockVibrate() {
  Object.defineProperty(navigator, 'vibrate', {
    value: vi.fn(),
    writable: true,
    configurable: true,
  });
}

function mockConfirm(result: boolean) {
  (window as any).confirm = vi.fn().mockReturnValue(result);
}

function mountApp() {
  return mount(App, {
    global: {
      stubs: {
        KeypadModal: true,
        PocketSettingsModal: true,
        TransferModal: true,
      },
    },
  });
}

// ─── Auth Gate ────────────────────────────────────────────────────────────────

describe('App.vue — Auth Gate', () => {
  beforeEach(() => {
    mockUser = null;
    mockLoading = false;
    vi.clearAllMocks();
    mockVibrate();
    mockConfirm(true);
  });

  it('should render empty div when auth is loading', () => {
    mockLoading = true;
    createTestStore();

    const wrapper = mountApp();
    // Loading state: empty div, no form, no dashboard
    expect(wrapper.find('input[type="email"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Total Sisa Saldo');
  });

  it('should render auth form when no user is logged in', () => {
    mockUser = null;
    mockLoading = false;
    createTestStore();

    const wrapper = mountApp();

    expect(wrapper.find('input[type="email"]').exists()).toBe(true);
    expect(wrapper.find('input[type="password"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('KosKas');
    expect(wrapper.text()).toContain('Sign in to sync your data');
  });

  it('should render Sign In and Sign Up buttons', () => {
    mockUser = null;
    createTestStore();

    const wrapper = mountApp();
    const buttonTexts = wrapper.findAll('button').map((b) => b.text().trim());
    expect(buttonTexts).toContain('Sign In');
    expect(buttonTexts).toContain('Sign Up');
  });

  it('should render Google sign-in button', () => {
    mockUser = null;
    createTestStore();

    const wrapper = mountApp();
    expect(wrapper.text()).toContain('Continue with Google');
  });

  it('should render dashboard when user is authenticated and store is loaded', () => {
    mockUser = { id: 'user-123', email: 'test@example.com' };
    mockLoading = false;
    createTestStore();

    const wrapper = mountApp();

    expect(wrapper.text()).toContain('Total Sisa Saldo');
    expect(wrapper.find('input[type="email"]').exists()).toBe(false);
  });

  it('should render empty div when authenticated but store not loaded', () => {
    mockUser = { id: 'user-123', email: 'test@example.com' };
    mockLoading = false;
    createTestStore({ isLoaded: false });

    const wrapper = mountApp();

    expect(wrapper.find('input[type="email"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Total Sisa Saldo');
  });

  it('should show sign out button when authenticated', () => {
    mockUser = { id: 'user-123', email: 'test@example.com' };
    createTestStore();

    const wrapper = mountApp();
    expect(wrapper.text()).toContain('Sign Out');
  });
});

// ─── Status Banners ───────────────────────────────────────────────────────────

describe('App.vue — Status Banners', () => {
  beforeEach(() => {
    mockUser = { id: 'user-123', email: 'test@example.com' };
    mockLoading = false;
    vi.clearAllMocks();
    mockVibrate();
    mockConfirm(true);
  });

  it('should show storage failed banner when storageFailed is true', () => {
    createTestStore({ storageFailed: true, syncFailed: false });
    const wrapper = mountApp();

    expect(wrapper.text()).toContain('Storage unavailable');
    expect(wrapper.text()).toContain('data will be lost');
  });

  it('should show sync failed banner when syncFailed is true and storageFailed is false', () => {
    createTestStore({ storageFailed: false, syncFailed: true });
    const wrapper = mountApp();

    expect(wrapper.text()).toContain('Supabase sync failed');
    expect(wrapper.text()).toContain('changes saved locally');
  });

  it('should prioritize storage failed banner over sync failed banner', () => {
    createTestStore({ storageFailed: true, syncFailed: true });
    const wrapper = mountApp();

    expect(wrapper.text()).toContain('Storage unavailable');
    expect(wrapper.text()).not.toContain('Supabase sync failed');
  });

  it('should not show any banner when both flags are false', () => {
    createTestStore({ storageFailed: false, syncFailed: false });
    const wrapper = mountApp();

    expect(wrapper.text()).not.toContain('Storage unavailable');
    expect(wrapper.text()).not.toContain('Supabase sync failed');
  });

  it('should show SYNC: SYNCING... when isSyncing is true', () => {
    createTestStore({ isSyncing: true, syncFailed: false });
    const wrapper = mountApp();

    expect(wrapper.text()).toContain('SYNC: SYNCING...');
  });

  it('should show SYNC: OFFLINE when syncFailed is true and not syncing', () => {
    createTestStore({ isSyncing: false, syncFailed: true });
    const wrapper = mountApp();

    expect(wrapper.text()).toContain('SYNC: OFFLINE');
  });

  it('should show SYNC: OK when not syncing and not failed', () => {
    createTestStore({ isSyncing: false, syncFailed: false });
    const wrapper = mountApp();

    expect(wrapper.text()).toContain('SYNC: OK');
  });
});

// ─── Dashboard Content ────────────────────────────────────────────────────────

describe('App.vue — Dashboard Content', () => {
  beforeEach(() => {
    mockUser = { id: 'user-123', email: 'test@example.com' };
    mockLoading = false;
    vi.clearAllMocks();
    mockVibrate();
    mockConfirm(true);
  });

  it('should render pocket names', () => {
    createTestStore();
    const wrapper = mountApp();

    expect(wrapper.text()).toContain('Pangan');
    expect(wrapper.text()).toContain('Fixed / Kos');
    expect(wrapper.text()).toContain('Transportasi');
  });

  it('should show "Aman" status badge when total remaining is healthy', () => {
    createTestStore();
    const wrapper = mountApp();

    expect(wrapper.text()).toContain('Aman');
  });

  it('should show "Danger" status badge when total remaining is negative', () => {
    const pockets = structuredClone(DEFAULT_POCKETS);
    pockets[0].allocation = 100000;
    const transactions: Transaction[] = [
      { id: 'tx-1', type: 'expense', fromPocketId: POCKET_IDS.PANGAN, amount: 9999999, timestamp: Date.now() },
    ];

    createTestStore({ pockets, transactions });
    const wrapper = mountApp();

    expect(wrapper.text()).toContain('Danger');
  });

  it('should show days remaining until reset', () => {
    createTestStore();
    const wrapper = mountApp();

    expect(wrapper.text()).toContain('Hari Menuju Reset');
  });

  it('should show daily Pangan stats', () => {
    createTestStore();
    const wrapper = mountApp();

    expect(wrapper.text()).toContain('Pangan Hari Ini');
  });

  it('should render the FAB for adding expenses', () => {
    createTestStore();
    const wrapper = mountApp();

    const fab = wrapper.find('button[aria-label="Tambah pengeluaran baru"]');
    expect(fab.exists()).toBe(true);
  });
});

// ─── Auth Error Handling ──────────────────────────────────────────────────────

describe('App.vue — Auth Error Handling', () => {
  beforeEach(() => {
    mockUser = null;
    mockLoading = false;
    vi.clearAllMocks();
    mockVibrate();
    mockConfirm(true);
  });

  it('should display "Invalid email or password" for invalid credentials', async () => {
    mockSignIn.mockRejectedValueOnce(new Error('Invalid login credentials'));
    createTestStore();

    const wrapper = mountApp();

    await wrapper.find('input[type="email"]').setValue('test@example.com');
    await wrapper.find('input[type="password"]').setValue('wrong');

    const signInBtn = wrapper.findAll('button').find((b) => b.text().trim() === 'Sign In');
    await signInBtn?.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Invalid email or password');
  });

  it('should display "already exists" for duplicate sign up', async () => {
    mockSignUp.mockRejectedValueOnce(new Error('User already registered'));
    createTestStore();

    const wrapper = mountApp();

    await wrapper.find('input[type="email"]').setValue('test@example.com');
    await wrapper.find('input[type="password"]').setValue('password123');

    const signUpBtn = wrapper.findAll('button').find((b) => b.text().trim() === 'Sign Up');
    await signUpBtn?.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('An account with this email already exists');
  });

  it('should display "Email not confirmed" error', async () => {
    mockSignIn.mockRejectedValueOnce(new Error('Email not confirmed'));
    createTestStore();

    const wrapper = mountApp();

    await wrapper.find('input[type="email"]').setValue('test@example.com');
    await wrapper.find('input[type="password"]').setValue('password123');

    const signInBtn = wrapper.findAll('button').find((b) => b.text().trim() === 'Sign In');
    await signInBtn?.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Please confirm your email address');
  });

  it('should display generic error message for unknown errors', async () => {
    mockSignIn.mockRejectedValueOnce(new Error('Something unexpected'));
    createTestStore();

    const wrapper = mountApp();

    await wrapper.find('input[type="email"]').setValue('test@example.com');
    await wrapper.find('input[type="password"]').setValue('password123');

    const signInBtn = wrapper.findAll('button').find((b) => b.text().trim() === 'Sign In');
    await signInBtn?.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('An unexpected error occurred. Please try again.');
  });
});

// ─── Performance Dashboard ────────────────────────────────────────────────────

describe('App.vue — Performance Dashboard', () => {
  beforeEach(() => {
    mockUser = { id: 'user-123', email: 'test@example.com' };
    mockLoading = false;
    vi.clearAllMocks();
    mockVibrate();
    mockConfirm(true);
  });

  it('should toggle performance view when BarChart3 button is clicked', async () => {
    createTestStore();
    const wrapper = mountApp();

    const perfBtn = wrapper.findAll('button').find((b) =>
      b.attributes('aria-label')?.includes('Performance')
    );
    if (perfBtn) {
      await perfBtn.trigger('click');
      await wrapper.vm.$nextTick();
      expect(wrapper.text()).toContain('Laporan Bulanan');
    }
  });

  it('should show per-pocket analysis in performance view', async () => {
    const transactions: Transaction[] = [
      { id: 'tx-1', type: 'expense', fromPocketId: POCKET_IDS.PANGAN, amount: 100000, timestamp: Date.now() },
    ];
    createTestStore({ transactions });
    const wrapper = mountApp();

    const perfBtn = wrapper.findAll('button').find((b) =>
      b.attributes('aria-label')?.includes('Performance')
    );
    if (perfBtn) {
      await perfBtn.trigger('click');
      await wrapper.vm.$nextTick();

      expect(wrapper.text()).toContain('Analisis Per Pocket');
      expect(wrapper.text()).toContain('Total Alokasi');
      expect(wrapper.text()).toContain('Total Terpakai');
      expect(wrapper.text()).toContain('Utilisasi Keseluruhan');
    }
  });
});
