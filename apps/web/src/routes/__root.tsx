import { Outlet, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

import { LoadingState } from '../components/index.js';
import { useAuth } from '../lib/auth/AuthProvider.js';

export function RootLayout(): JSX.Element {
  return <Outlet />;
}

const PUBLIC_PATHS = ['/sign-in', '/auth/magic', '/verify'];

export function AuthGate(): JSX.Element {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.status !== 'anonymous') return;
    const path = window.location.pathname;
    const onPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
    if (onPublic) return;
    void navigate({ to: '/sign-in', replace: true });
  }, [auth.status, navigate]);

  if (auth.status === 'loading') {
    return (
      <main className="psms-shell">
        <LoadingState label="Loading your session…" />
      </main>
    );
  }

  return <Outlet />;
}

export function RoleHomeRedirect(): JSX.Element {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.status !== 'authenticated' || !auth.me) return;
    const map: Record<string, string> = {
      STUDENT: '/student',
      SUPERVISOR: '/supervisor',
      COORDINATOR: '/coordinator',
      ADMINISTRATOR: '/admin',
    };
    const dest = map[auth.me.role] ?? '/sign-in';
    void navigate({ to: dest, replace: true });
  }, [auth.status, auth.me, navigate]);

  return <LoadingState label="Taking you to your dashboard…" />;
}
