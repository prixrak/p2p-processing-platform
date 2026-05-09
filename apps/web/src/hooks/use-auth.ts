'use client';

import { create } from 'zustand';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import {
  getToken,
  getUserFromToken,
  clearTokens,
  setTokens,
} from '@/lib/auth';
import { ensureValidAccessToken } from '@/lib/session-refresh';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  name?: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  requires2FA: boolean;
  tempToken: string | null;
  loadUser: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ requires2FA: boolean }>;
  verify2FA: (code: string) => Promise<void>;
  logout: () => void;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  requires2FA: false,
  tempToken: null,

  loadUser: async () => {
    if (typeof window === 'undefined') {
      set({ isLoading: false });
      return;
    }
    await ensureValidAccessToken();
    const token = getToken();
    if (token) {
      const decoded = getUserFromToken();
      if (decoded) {
        set({ user: decoded as AuthUser, isAuthenticated: true, isLoading: false });
        return;
      }
    }
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  login: async (email: string, password: string) => {
    const data = await api.post<{
      accessToken?: string;
      refreshToken?: string;
      requires2FA?: boolean;
      tempToken?: string;
      user?: AuthUser;
    }>(internalPaths.authLogin, { email, password });

    if (data.requires2FA) {
      set({ requires2FA: true, tempToken: data.tempToken ?? null });
      return { requires2FA: true };
    }

    if (data.accessToken && data.refreshToken) {
      setTokens(data.accessToken, data.refreshToken);
      const decoded = getUserFromToken();
      set({
        user: (data.user ?? decoded) as AuthUser | null,
        isAuthenticated: true,
        requires2FA: false,
        tempToken: null,
      });
    }
    return { requires2FA: false };
  },

  verify2FA: async (code: string) => {
    const { tempToken } = get();
    const data = await api.post<{
      accessToken: string;
      refreshToken: string;
      user?: AuthUser;
    }>(internalPaths.authTwoFaVerify, { code, tempToken });

    setTokens(data.accessToken, data.refreshToken);
    const decoded = getUserFromToken();
    set({
      user: (data.user ?? decoded) as AuthUser | null,
      isAuthenticated: true,
      requires2FA: false,
      tempToken: null,
    });
  },

  logout: () => {
    clearTokens();
    set({
      user: null,
      isAuthenticated: false,
      requires2FA: false,
      tempToken: null,
    });
    window.location.href = '/login';
  },
}));
