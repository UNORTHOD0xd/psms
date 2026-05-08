// Coordinator shell — top bar + nav drawer for the placement coordinator.
//
// Mirrors StudentShell. Coordinator nav surfaces the six work areas
// they touch daily: dashboard (PRC-09), organisations (INP-02),
// opportunities (INP-03), applications review (INP-04), placement
// monitor (INP-08), and reports (OUT-06/09/10).

import { Link, Outlet } from '@tanstack/react-router';

import { Button, RoleBadge } from '../../components/index.js';
import { useAuth } from '../../lib/auth/AuthProvider.js';

export function CoordinatorShell(): JSX.Element {
  const auth = useAuth();
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
      <nav className="psms-shell__nav" aria-label="Coordinator navigation">
        <Link to="/coordinator">Dashboard</Link>
        <Link to="/coordinator/organisations">Organisations</Link>
        <Link to="/coordinator/opportunities">Opportunities</Link>
        <Link to="/coordinator/applications">Applications</Link>
        <Link to="/coordinator/placements">Placements</Link>
        <Link to="/coordinator/reports">Reports</Link>
      </nav>
      <main className="psms-shell__main">
        <Outlet />
      </main>
    </div>
  );
}
