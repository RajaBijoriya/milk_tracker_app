import {create} from 'zustand';
import {ApiError} from '../services/api/apiClient';
import * as authService from '../services/api/authService';
import {
  clearStoredSession,
  getStoredSession,
} from '../services/api/authSession';
import {restoreAccessToken} from '../services/api/apiClient';
import {AuthUser} from '../services/api/authService';

type AuthState = {
  user: AuthUser | null;
  initialized: boolean;
  loading: boolean;
  offline: boolean;
  error: string | null;
  restore: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: {fullName: string; email: string; password: string}) => Promise<void>;
  signOut: () => Promise<void>;
  signOutAll: () => Promise<void>;
  clearError: () => void;
};

function isUnavailable(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof ApiError && error.status >= 500);
}

export const useAuthStore = create<AuthState>(set => ({
  user: null,
  initialized: false,
  loading: false,
  offline: false,
  error: null,
  restore: async () => {
    set({loading: true, error: null});
    const stored = await getStoredSession();
    if (!stored) {
      set({user: null, initialized: true, loading: false, offline: false});
      return;
    }
    try {
      const restored = await restoreAccessToken();
      if (!restored) {
        await clearStoredSession();
        set({user: null, initialized: true, loading: false, offline: false});
        return;
      }
      const user = await authService.getCurrentUser();
      set({user, initialized: true, loading: false, offline: false, error: null});
    } catch (error) {
      if (stored.cachedUser && isUnavailable(error)) {
        set({
          user: stored.cachedUser,
          initialized: true,
          loading: false,
          offline: true,
          error: 'Offline. Showing this account’s cached statements; edits need an internet connection.',
        });
        return;
      }
      if (error instanceof ApiError && error.status === 401) {
        await clearStoredSession();
        set({user: null, initialized: true, loading: false, offline: false, error: null});
        return;
      }
      set({
        user: null,
        initialized: true,
        loading: false,
        offline: false,
        error: error instanceof Error ? error.message : 'Unable to restore the saved session.',
      });
    }
  },
  signIn: async (email, password) => {
    set({loading: true, error: null});
    try {
      const user = await authService.login(email, password);
      set({user, loading: false, initialized: true, offline: false, error: null});
    } catch (error) {
      set({loading: false, error: error instanceof Error ? error.message : 'Unable to sign in.'});
      throw error;
    }
  },
  signUp: async input => {
    set({loading: true, error: null});
    try {
      const user = await authService.register(input);
      set({user, loading: false, initialized: true, offline: false, error: null});
    } catch (error) {
      set({loading: false, error: error instanceof Error ? error.message : 'Unable to create the account.'});
      throw error;
    }
  },
  signOut: async () => {
    set({loading: true, error: null});
    let failure: unknown;
    try {
      await authService.logout();
    } catch (error) {
      failure = error;
    } finally {
      await clearStoredSession();
      set({user: null, loading: false, offline: false});
    }
    if (failure) {
      const message = failure instanceof Error ? failure.message : 'Signed out locally, but the server could not confirm logout.';
      set({error: message});
      throw failure;
    }
  },
  signOutAll: async () => {
    set({loading: true, error: null});
    let failure: unknown;
    try {
      await authService.logoutAll();
    } catch (error) {
      failure = error;
    } finally {
      await clearStoredSession();
      set({user: null, loading: false, offline: false});
    }
    if (failure) {
      const message = failure instanceof Error ? failure.message : 'Signed out locally, but the server could not confirm logout.';
      set({error: message});
      throw failure;
    }
  },
  clearError: () => set({error: null}),
}));
