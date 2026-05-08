// INP-10 — Per-user admin actions.
//
// The admin endpoints don't expose a single GET /admin/users/:id, so we
// pull the user out of the paginated list query (the API filters by `q`
// against email_lower and full_name; user_id matches neither, so we
// scan the cache by user_id and fall back to a full query). Two
// actions: deactivate (revokes sessions + flips is_active) and
// force-password-reset (issues + emails a one-hour token).
//
// Supervisors authenticate via magic-link and the API rejects
// force-password-reset for them — surface that as a disabled button
// with a hint, not just a 422.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import {
  Button,
  ErrorBanner,
  LoadingState,
  RoleBadge,
} from '../../components/index.js';
import { api } from '../../lib/api/client.js';
import type { Me, Page } from '../../lib/api/types.js';

interface Props {
  id: string;
}

export function UserDetail({ id }: Props): JSX.Element {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<'deactivate' | 'reset' | null>(null);

  // The admin user list is the authoritative source. Look first in
  // cached pages, then fall back to a targeted query (q=user_id won't
  // match server-side, so this is a best-effort lookup).
  const cachedUser = findCachedUser(qc, id);

  const query = useQuery<Me | null>({
    queryKey: ['admin', 'user', id],
    queryFn: async () => {
      // Walk the first 4 pages of users — pilot scale (< 500 users)
      // tolerates this; in the long run we'd add GET /admin/users/:id.
      for (let page = 1; page <= 4; page += 1) {
        const res = await api.get<Page<Me>>('/admin/users', {
          query: { page, pageSize: 100 },
        });
        const hit = res.data.find((u) => u.user_id === id);
        if (hit) return hit;
        if (res.page * res.pageSize >= res.total) return null;
      }
      return null;
    },
    initialData: cachedUser ?? undefined,
  });

  const deactivate = useMutation({
    mutationFn: () => api.post(`/admin/users/${id}/deactivate`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'user', id] });
      setConfirm(null);
    },
  });

  const forceReset = useMutation({
    mutationFn: () => api.post(`/admin/users/${id}/force-password-reset`),
    onSuccess: () => setConfirm(null),
  });

  if (query.isPending && !query.data) return <LoadingState />;
  if (query.error) return <ErrorBanner error={query.error} />;
  if (!query.data) {
    return (
      <section>
        <p>
          <Link to="/admin">← Users</Link>
        </p>
        <h1>User not found</h1>
        <p className="psms-list__meta">
          The user may have been deactivated or the ID is incorrect.
        </p>
      </section>
    );
  }

  const user = query.data;
  const isSupervisor = user.role === 'SUPERVISOR';

  return (
    <section>
      <p>
        <Link to="/admin">← Users</Link>
      </p>
      <header className="psms-form__row" style={{ justifyContent: 'space-between' }}>
        <h1>{user.full_name}</h1>
        <span
          className={`psms-status psms-status--${user.is_active ? 'active' : 'suspended'}`}
        >
          {user.is_active ? 'Active' : 'Inactive'}
        </span>
      </header>

      <ErrorBanner error={deactivate.error || forceReset.error} />

      <dl className="psms-detail__facts">
        <dt>User ID</dt>
        <dd>
          <code>{user.user_id}</code>
        </dd>
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>Role</dt>
        <dd>
          <RoleBadge role={user.role} />
        </dd>
        {user.programme_code ? (
          <>
            <dt>Programme</dt>
            <dd>{user.programme_code}</dd>
          </>
        ) : null}
        {user.student_id ? (
          <>
            <dt>Student ID</dt>
            <dd>{user.student_id}</dd>
          </>
        ) : null}
        {user.phone ? (
          <>
            <dt>Phone</dt>
            <dd>{user.phone}</dd>
          </>
        ) : null}
      </dl>

      <h2>Lifecycle actions</h2>
      <div className="psms-form__row">
        {confirm === 'deactivate' ? (
          <>
            <span>Deactivate this user? Their sessions will be revoked.</span>
            <Button
              variant="danger"
              onClick={() => deactivate.mutate()}
              loading={deactivate.isPending}
            >
              Yes, deactivate
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button
            variant="danger"
            disabled={!user.is_active}
            onClick={() => setConfirm('deactivate')}
          >
            {user.is_active ? 'Deactivate user' : 'Already inactive'}
          </Button>
        )}
      </div>

      <div className="psms-form__row">
        {confirm === 'reset' ? (
          <>
            <span>Send a password-reset email and revoke any prior reset tokens?</span>
            <Button onClick={() => forceReset.mutate()} loading={forceReset.isPending}>
              Yes, send
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            disabled={isSupervisor || !user.is_active}
            onClick={() => setConfirm('reset')}
          >
            Force password reset
          </Button>
        )}
      </div>
      {isSupervisor ? (
        <p className="psms-field__hint">
          Supervisors authenticate via magic link, not password.
        </p>
      ) : null}
      {forceReset.isSuccess ? (
        <p className="psms-field__hint" role="status">
          Password-reset email sent.
        </p>
      ) : null}
    </section>
  );
}

function findCachedUser(qc: ReturnType<typeof useQueryClient>, id: string): Me | null {
  const pages = qc.getQueriesData<Page<Me>>({ queryKey: ['admin', 'users'] });
  for (const [, page] of pages) {
    if (!page) continue;
    const hit = page.data.find((u) => u.user_id === id);
    if (hit) return hit;
  }
  return null;
}
