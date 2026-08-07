/**
 * useAuth.test.ts — Tests for the useAuth composable
 *
 * Validates:
 * - initAuth: session loading, user state, loading flag, subscription management
 * - signUp: password validation, Supabase delegation, error handling
 * - signIn: Supabase delegation, error handling
 * - signInWithGoogle: OAuth provider config, redirectTo, error handling
 * - signOut: Supabase delegation, error handling
 * - Return values: readonly refs for user, session, loading
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock state ──────────────────────────────────────────────────────────────

let mockGetSession: ReturnType<typeof vi.fn>;
let mockOnAuthStateChange: ReturnType<typeof vi.fn>;
let mockSignUp: ReturnType<typeof vi.fn>;
let mockSignInWithPassword: ReturnType<typeof vi.fn>;
let mockSignInWithOAuth: ReturnType<typeof vi.fn>;
let mockSignOut: ReturnType<typeof vi.fn>;
let mockUnsubscribe: ReturnType<typeof vi.fn>;

function createFreshMocks() {
  mockUnsubscribe = vi.fn();
  mockGetSession = vi.fn().mockResolvedValue({ data: { session: null } });
  mockOnAuthStateChange = vi.fn().mockReturnValue({
    data: { subscription: { unsubscribe: mockUnsubscribe } },
  });
  mockSignUp = vi.fn().mockResolvedValue({ error: null });
  mockSignInWithPassword = vi.fn().mockResolvedValue({ error: null });
  mockSignInWithOAuth = vi.fn().mockResolvedValue({ error: null });
  mockSignOut = vi.fn().mockResolvedValue({ error: null });
  return {
    mockGetSession,
    mockOnAuthStateChange,
    mockSignUp,
    mockSignInWithPassword,
    mockSignInWithOAuth,
    mockSignOut,
    mockUnsubscribe,
  };
}

// ─── Helper: fresh import of useAuth with mocked supabase ────────────────────

async function loadUseAuth() {
  vi.resetModules();

  const mocks = createFreshMocks();

  vi.doMock('@/lib/supabase', () => ({
    supabase: {
      auth: {
        getSession: mocks.mockGetSession,
        onAuthStateChange: mocks.mockOnAuthStateChange,
        signUp: mocks.mockSignUp,
        signInWithPassword: mocks.mockSignInWithPassword,
        signInWithOAuth: mocks.mockSignInWithOAuth,
        signOut: mocks.mockSignOut,
      },
    },
  }));

  const { useAuth } = await import('@/composables/useAuth');
  return { useAuth, ...mocks };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useAuth', () => {
  // ─── initAuth ────────────────────────────────────────────────────────────

  describe('initAuth', () => {
    it('should set user and session when session exists', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const mockSession = { user: mockUser, access_token: 'tok' };

      const { useAuth, mockGetSession } = await loadUseAuth();
      mockGetSession.mockResolvedValue({ data: { session: mockSession } });

      const auth = useAuth();
      await auth.initAuth();

      expect(auth.user.value).toEqual(mockUser);
      expect(auth.session.value).toEqual(mockSession);
    });

    it('should set user and session to null when no session exists', async () => {
      const { useAuth, mockGetSession } = await loadUseAuth();
      mockGetSession.mockResolvedValue({ data: { session: null } });

      const auth = useAuth();
      await auth.initAuth();

      expect(auth.user.value).toBeNull();
      expect(auth.session.value).toBeNull();
    });

    it('should set loading to false after completion', async () => {
      const { useAuth } = await loadUseAuth();
      const auth = useAuth();

      // loading starts as true (module-level ref initial value)
      expect(auth.loading.value).toBe(true);

      await auth.initAuth();

      expect(auth.loading.value).toBe(false);
    });

    it('should subscribe to auth state changes', async () => {
      const { useAuth, mockOnAuthStateChange } = await loadUseAuth();
      const auth = useAuth();
      await auth.initAuth();

      expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1);
      expect(mockOnAuthStateChange).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should update user and session when auth state changes', async () => {
      const { useAuth, mockOnAuthStateChange } = await loadUseAuth();

      // Capture the callback passed to onAuthStateChange
      let authChangeCallback: Function | null = null;
      mockOnAuthStateChange.mockImplementation((cb: Function) => {
        authChangeCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      });

      const auth = useAuth();
      await auth.initAuth();

      // Simulate auth state change
      const newUser = { id: 'user-456', email: 'new@example.com' };
      const newSession = { user: newUser, access_token: 'new-tok' };
      expect(authChangeCallback).not.toBeNull();
      authChangeCallback!('SIGNED_IN', newSession);

      expect(auth.user.value).toEqual(newUser);
      expect(auth.session.value).toEqual(newSession);
    });

    it('should set user to null when auth state change provides null session', async () => {
      const { useAuth, mockOnAuthStateChange, mockGetSession } = await loadUseAuth();

      // Start with a session
      const initialUser = { id: 'user-123', email: 'test@example.com' };
      mockGetSession.mockResolvedValue({
        data: { session: { user: initialUser, access_token: 'tok' } },
      });

      let authChangeCallback: Function | null = null;
      mockOnAuthStateChange.mockImplementation((cb: Function) => {
        authChangeCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      });

      const auth = useAuth();
      await auth.initAuth();
      expect(auth.user.value).toEqual(initialUser);

      // Simulate sign out via auth state change
      authChangeCallback!('SIGNED_OUT', null);
      expect(auth.user.value).toBeNull();
      expect(auth.session.value).toBeNull();
    });

    it('should unsubscribe previous subscription on re-init', async () => {
      const { useAuth, mockUnsubscribe, mockOnAuthStateChange } = await loadUseAuth();

      const auth = useAuth();

      // First init
      await auth.initAuth();
      expect(mockUnsubscribe).not.toHaveBeenCalled();

      // Second init — should unsubscribe the first subscription
      await auth.initAuth();
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
      expect(mockOnAuthStateChange).toHaveBeenCalledTimes(2);
    });
  });

  // ─── signUp ──────────────────────────────────────────────────────────────

  describe('signUp', () => {
    it('should call supabase.auth.signUp with email and password', async () => {
      const { useAuth, mockSignUp } = await loadUseAuth();
      const auth = useAuth();

      await auth.signUp('test@example.com', 'password123');

      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });

    it('should throw on password < 8 chars', async () => {
      const { useAuth } = await loadUseAuth();
      const auth = useAuth();

      await expect(auth.signUp('test@example.com', 'short')).rejects.toThrow(
        'Password must be at least 8 characters long'
      );
    });

    it('should throw on empty password', async () => {
      const { useAuth } = await loadUseAuth();
      const auth = useAuth();

      await expect(auth.signUp('test@example.com', '')).rejects.toThrow(
        'Password must be at least 8 characters long'
      );
    });

    it('should not call supabase.auth.signUp when password is too short', async () => {
      const { useAuth, mockSignUp } = await loadUseAuth();
      const auth = useAuth();

      try {
        await auth.signUp('test@example.com', 'abc');
      } catch {
        // expected
      }

      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it('should throw when Supabase returns error', async () => {
      const { useAuth, mockSignUp } = await loadUseAuth();
      const supabaseError = new Error('User already registered');
      mockSignUp.mockResolvedValue({ error: supabaseError });

      const auth = useAuth();

      await expect(auth.signUp('test@example.com', 'password123')).rejects.toThrow(
        'User already registered'
      );
    });
  });

  // ─── signIn ──────────────────────────────────────────────────────────────

  describe('signIn', () => {
    it('should call supabase.auth.signInWithPassword with email and password', async () => {
      const { useAuth, mockSignInWithPassword } = await loadUseAuth();
      const auth = useAuth();

      await auth.signIn('test@example.com', 'password123');

      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });

    it('should throw when Supabase returns error', async () => {
      const { useAuth, mockSignInWithPassword } = await loadUseAuth();
      const supabaseError = new Error('Invalid login credentials');
      mockSignInWithPassword.mockResolvedValue({ error: supabaseError });

      const auth = useAuth();

      await expect(auth.signIn('test@example.com', 'wrong')).rejects.toThrow(
        'Invalid login credentials'
      );
    });
  });

  // ─── signInWithGoogle ────────────────────────────────────────────────────

  describe('signInWithGoogle', () => {
    it('should call supabase.auth.signInWithOAuth with provider: google', async () => {
      const { useAuth, mockSignInWithOAuth } = await loadUseAuth();
      const auth = useAuth();

      await auth.signInWithGoogle();

      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
    });

    it('should include redirectTo: window.location.origin', async () => {
      const { useAuth, mockSignInWithOAuth } = await loadUseAuth();
      const auth = useAuth();

      await auth.signInWithGoogle();

      const callArgs = mockSignInWithOAuth.mock.calls[0][0];
      expect(callArgs.options.redirectTo).toBe(window.location.origin);
    });

    it('should throw when Supabase returns error', async () => {
      const { useAuth, mockSignInWithOAuth } = await loadUseAuth();
      const supabaseError = new Error('OAuth error');
      mockSignInWithOAuth.mockResolvedValue({ error: supabaseError });

      const auth = useAuth();

      await expect(auth.signInWithGoogle()).rejects.toThrow('OAuth error');
    });
  });

  // ─── signOut ─────────────────────────────────────────────────────────────

  describe('signOut', () => {
    it('should call supabase.auth.signOut', async () => {
      const { useAuth, mockSignOut } = await loadUseAuth();
      const auth = useAuth();

      await auth.signOut();

      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });

    it('should throw when Supabase returns error', async () => {
      const { useAuth, mockSignOut } = await loadUseAuth();
      const supabaseError = new Error('Sign out failed');
      mockSignOut.mockResolvedValue({ error: supabaseError });

      const auth = useAuth();

      await expect(auth.signOut()).rejects.toThrow('Sign out failed');
    });
  });

  // ─── Return values ───────────────────────────────────────────────────────

  describe('return values', () => {
    it('user, session, loading should be readonly refs', async () => {
      const { useAuth } = await loadUseAuth();
      const auth = useAuth();

      // readonly refs should not be writable
      // In Vue 3, setting a readonly ref value triggers a warning and the value doesn't change
      const originalUser = auth.user.value;
      const originalSession = auth.session.value;
      const originalLoading = auth.loading.value;

      // Attempting to write should not change the value (readonly)
      try {
        (auth.user as any).value = { id: 'hacker' };
      } catch {
        // may throw in strict mode
      }
      try {
        (auth.session as any).value = { access_token: 'hacked' };
      } catch {
        // may throw in strict mode
      }
      try {
        (auth.loading as any).value = false;
      } catch {
        // may throw in strict mode
      }

      // Values should remain unchanged (readonly protection)
      expect(auth.user.value).toBe(originalUser);
      expect(auth.session.value).toBe(originalSession);
      expect(auth.loading.value).toBe(originalLoading);
    });

    it('should return all expected functions', async () => {
      const { useAuth } = await loadUseAuth();
      const auth = useAuth();

      expect(auth.initAuth).toBeTypeOf('function');
      expect(auth.signUp).toBeTypeOf('function');
      expect(auth.signIn).toBeTypeOf('function');
      expect(auth.signInWithGoogle).toBeTypeOf('function');
      expect(auth.signOut).toBeTypeOf('function');
    });

    it('should expose user, session, loading as properties', async () => {
      const { useAuth } = await loadUseAuth();
      const auth = useAuth();

      expect(auth).toHaveProperty('user');
      expect(auth).toHaveProperty('session');
      expect(auth).toHaveProperty('loading');
    });
  });
});
