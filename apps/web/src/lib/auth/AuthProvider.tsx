// CTL-04 + CTL-10 — auth state for the web app.
//
// The truth is the API: we keep nothing in localStorage. On mount we
// call GET /auth/me. If the cookie is valid the API returns the Me
// payload; otherwise 401 and we render an "unauthenticated" tree.
//
// Refresh after sign-in / sign-out is just a query invalidation —
// the cookie is set/cleared server-side so the next /auth/me call
// reflects the new state.

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ProblemError } from '../api/client.js';
import type { Me } from '../api/types.js';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthState {
  status: AuthStatus;
  me: Me | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const ME_QUERY_KEY = ['auth', 'me'] as const;

async function fetchMe(): Promise<Me | null> {
  try {
    return await api.get<Me>('/auth/me');
  } catch (err) {
    if (err instanceof ProblemError && err.status === 401) return null;
    throw err;
  }
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: fetchMe,
    // Auth state is small and read-often; revalidate on focus is OK
    // because the cost is one cached request when the cookie is fresh.
    staleTime: 60_000,
    retry: false,
  });

  const value = useMemo<AuthState>(() => {
    let status: AuthStatus = 'loading';
    if (!query.isPending) status = query.data ? 'authenticated' : 'anonymous';
    return {
      status,
      me: query.data ?? null,
      async refresh() {
        await qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
      },
      async signOut() {
        try {
          await api.post('/auth/sign-out');
        } catch {
          // 401 here just means the cookie was already invalid;
          // either way clear local cache and force a re-render.
        }
        qc.setQueryData(ME_QUERY_KEY, null);
        await qc.invalidateQueries();
      },
    };
  }, [query.isPending, query.data, qc]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
