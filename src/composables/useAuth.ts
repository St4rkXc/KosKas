/**
 * @module composables/useAuth
 * @description Vue composable for Supabase authentication state management.
 * Exposes module-level singleton refs so all components share the same auth state.
 * Provides email/password sign-up/sign-in, Google OAuth, and sign-out.
 *
 * The `initAuth()` function must be called before the app mounts to resolve the
 * initial session and subscribe to auth state changes.
 */
import { ref, readonly } from 'vue';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

/** Module-level singleton: the currently authenticated user, shared across all consumers. */
const user = ref<User | null>(null);
/** Module-level singleton: the current Supabase session. */
const session = ref<Session | null>(null);
/** Module-level singleton: true while the initial session is being resolved. */
const loading = ref(true);

let authSubscription: { unsubscribe: () => void } | null = null;
let onUserChangeCallback: ((userId: string | null) => void) | null = null;

/**
 * Register a callback that fires whenever the authenticated user changes
 * (sign-in, sign-up, or sign-out). Only one callback is supported at a time.
 * @param cb - Callback receiving the new user ID (or null on sign-out).
 */
export function onUserChange(cb: (userId: string | null) => void) {
  onUserChangeCallback = cb;
}

/**
 * Authentication composable providing auth state and auth operations.
 * @returns Readonly refs for `user`, `session`, `loading`, plus action functions.
 * @example
 * const { user, loading, signIn, signOut } = useAuth();
 */
export function useAuth() {
  /**
   * Initialize authentication: resolve the current session and subscribe to changes.
   * Must be called once before the app mounts.
   * @throws Supabase error if session retrieval fails.
   */
  async function initAuth() {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    session.value = currentSession;
    user.value = currentSession?.user ?? null;
    loading.value = false;

    if (authSubscription) {
      authSubscription.unsubscribe();
      authSubscription = null;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      const prevUser = user.value?.id ?? null;
      session.value = newSession;
      user.value = newSession?.user ?? null;
      const newUser = user.value?.id ?? null;
      if (prevUser !== newUser && onUserChangeCallback) {
        onUserChangeCallback(newUser);
      }
    });
    authSubscription = subscription;
  }

  /**
   * Register a new user with email and password.
   * @param email - The user's email address.
   * @param password - The password (minimum 8 characters).
   * @throws Error if password is shorter than 8 characters.
   * @throws Supabase error if registration fails.
   */
  async function signUp(email: string, password: string) {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }

  /**
   * Sign in an existing user with email and password.
   * @param email - The user's email address.
   * @param password - The user's password.
   * @throws Supabase error if credentials are invalid.
   */
  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  /**
   * Initiate Google OAuth sign-in flow. Redirects the browser to Google's consent screen.
   * @throws Supabase error if the OAuth flow cannot be initiated.
   */
  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  }

  /**
   * Sign out the current user and clear the session.
   * @throws Supabase error if sign-out fails.
   */
  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  return {
    user: readonly(user),
    session: readonly(session),
    loading: readonly(loading),
    initAuth,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
  };
}
