// Supervisor session shell.
//
// External supervisors arrive via a magic link (PRC-03) — they have no
// Knox account and their session is scoped to a single placement. The
// shell keeps the chrome minimal: one top bar that names the
// placement they're logged in for, plus sign-out. No nav drawer
// because there is only one screen (the inbox) and a couple of forms
// reachable from it.

import { useQuery } from '@tanstack/react-query';
import { Outlet } from '@tanstack/react-router';

import { Button, RoleBadge } from '../../components/index.js';
import { api } from '../../lib/api/client.js';
import { useAuth } from '../../lib/auth/AuthProvider.js';
import type { Page, Placement } from '../../lib/api/types.js';

export function SupervisorShell(): JSX.Element {
  const auth = useAuth();
  // The API filters /placements to the supervisor's scoped placement(s).
  // We surface the first one's title as the session context line.
  const placements = useQuery<Page<Placement>>({
    queryKey: ['supervisor', 'placements'],
    queryFn: () => api.get('/placements'),
    enabled: auth.status === 'authenticated',
  });
  const scope = placements.data?.data[0];

  return (
    <div className="psms-shell">
      <header className="psms-shell__header">
        <div>
          <strong>Knox PSMS</strong>
          {auth.me ? (
            <span className="psms-shell__user">
              {auth.me.full_name} <RoleBadge role={auth.me.role} />
            </span>
          ) : null}
          {scope ? (
            <span className="psms-shell__scope" aria-label="Session scope">
              · Logged in for{' '}
              <strong>{scope.opportunity_title ?? 'placement'}</strong>
              {scope.student_name ? ` — ${scope.student_name}` : null}
            </span>
          ) : null}
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            void auth.signOut().then(() => {
              window.location.href = '/sign-in';
            });
          }}
        >
          Sign out
        </Button>
      </header>
      <main className="psms-shell__main">
        <Outlet />
      </main>
    </div>
  );
}
