import { ref, readonly, watch } from 'vue';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

const user = ref<User | null>(null);
const session = ref<Session | null>(null);
const loading = ref(true);

let authSubscription: { unsubscribe: () => void } | null = null;
let onUserChangeCallback: ((userId: string | null) => void) | null = null;

export function onUserChange(cb: (userId: string | null) => void) {
  onUserChangeCallback = cb;
}

export function useAuth() {
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

  async function signUp(email: string, password: string) {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  }

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
