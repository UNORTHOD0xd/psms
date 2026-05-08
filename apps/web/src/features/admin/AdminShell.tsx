// Admin shell — top bar + nav drawer for the system administrator.
//
// Mirrors CoordinatorShell. Five links cover the four admin work areas
// (users INP-10, audit log OUT-09, imports PRC-01, system config) plus
// a home that lands on the users list — admins don't have a dedicated
// dashboard surface in the pilot.

import { Link, Outlet } from '@tanstack/react-router';

import { Button, RoleBadge } from '../../components/index.js';
import { useAuth } from '../../lib/auth/AuthProvider.js';

export function AdminShell(): JSX.Element {
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
      <nav className="psms-shell__nav" aria-label="Admin navigation">
        <Link to="/admin">Users</Link>
        <Link to="/admin/audit-log">Audit log</Link>
        <Link to="/admin/imports">iSIMS imports</Link>
        <Link to="/admin/config">System config</Link>
      </nav>
      <main className="psms-shell__main">
        <Outlet />
      </main>
    </div>
  );
}
