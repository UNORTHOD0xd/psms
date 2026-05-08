// INP-10 — Admin user directory.
//
// Filters by role and free-text query (matches against full_name and
// email). Rows link to UserDetail for the lifecycle actions.

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import {
  EmptyState,
  ErrorBanner,
  LoadingState,
  Pagination,
  RoleBadge,
} from '../../components/index.js';
import { api } from '../../lib/api/client.js';
import type { Me, Page, Role } from '../../lib/api/types.js';

type RoleFilter = '' | Role;

export function UsersList(): JSX.Element {
  const [page, setPage] = useState(1);
  const [role, setRole] = useState<RoleFilter>('');
  const [q, setQ] = useState('');

  const query = useQuery<Page<Me>>({
    queryKey: ['admin', 'users', { page, role, q }],
    queryFn: () =>
      api.get('/admin/users', {
        query: {
          page,
          pageSize: 25,
          ...(role ? { role } : {}),
          ...(q ? { q } : {}),
        },
      }),
  });

  return (
    <section>
      <header className="psms-form__row" style={{ justifyContent: 'space-between' }}>
        <h1>Users</h1>
      </header>

      <form
        className="psms-form psms-form--inline psms-form__row"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
        }}
      >
        <label className="psms-field__label-text" htmlFor="user-q">
          Search
        </label>
        <input
          id="user-q"
          type="search"
          value={q}
          placeholder="Name or email…"
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="psms-field__label-text" htmlFor="user-role">
          Role
        </label>
        <select
          id="user-role"
          value={role}
          onChange={(e) => {
            setRole(e.target.value as RoleFilter);
            setPage(1);
          }}
        >
          <option value="">All</option>
          <option value="STUDENT">Student</option>
          <option value="SUPERVISOR">Supervisor</option>
          <option value="COORDINATOR">Coordinator</option>
          <option value="ADMINISTRATOR">Administrator</option>
        </select>
      </form>

      {query.isPending ? <LoadingState /> : null}
      <ErrorBanner error={query.error} />
      {query.data && query.data.data.length === 0 ? (
        <EmptyState title="No users match" detail="Try a different filter." />
      ) : null}

      {query.data && query.data.data.length > 0 ? (
        <table className="psms-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {query.data.data.map((u) => (
              <tr key={u.user_id}>
                <td>
                  <Link to="/admin/users/$id" params={{ id: u.user_id }}>
                    {u.full_name}
                  </Link>
                </td>
                <td>{u.email}</td>
                <td>
                  <RoleBadge role={u.role} />
                </td>
                <td>
                  <span
                    className={`psms-status psms-status--${u.is_active ? 'active' : 'suspended'}`}
                  >
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {query.data ? (
        <Pagination
          page={query.data.page}
          pageSize={query.data.pageSize}
          total={query.data.total}
          onChange={setPage}
        />
      ) : null}
    </section>
  );
}
