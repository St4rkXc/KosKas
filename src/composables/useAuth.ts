import { ref, readonly } from 'vue';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

const user = ref<User | null>(null);
const session = ref<Session | null>(null);
const loading = ref(true);

export function useAuth() {
  async function initAuth() {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    session.value = currentSession;
    user.value = currentSession?.user ?? null;
    loading.value = false;

    supabase.auth.onAuthStateChange((_event, newSession) => {
      session.value = newSession;
      user.value = newSession?.user ?? null;
    });
  }

  async function signUp(email: string, password: string) {
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
