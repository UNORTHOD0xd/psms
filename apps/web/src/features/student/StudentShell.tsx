import { Link, Outlet } from '@tanstack/react-router';

import { Button, RoleBadge } from '../../components/index.js';
import { useAuth } from '../../lib/auth/AuthProvider.js';

export function StudentShell(): JSX.Element {
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
      <nav className="psms-shell__nav" aria-label="Student navigation">
        <Link to="/student">Dashboard</Link>
        <Link to="/student/opportunities">Opportunities</Link>
        <Link to="/student/applications">My applications</Link>
        <Link to="/student/ledger">Service-hours ledger</Link>
        <Link to="/student/certificates">Certificates</Link>
      </nav>
      <main className="psms-shell__main">
        <Outlet />
      </main>
    </div>
  );
}
