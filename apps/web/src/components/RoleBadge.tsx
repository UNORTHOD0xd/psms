import type { Role } from '../lib/api/types.js';

const LABELS: Record<Role, string> = {
  STUDENT: 'Student',
  SUPERVISOR: 'Supervisor',
  COORDINATOR: 'Coordinator',
  ADMINISTRATOR: 'Administrator',
};

export function RoleBadge({ role }: { role: Role }): JSX.Element {
  return (
    <span className={`psms-role-badge psms-role-badge--${role.toLowerCase()}`}>
      {LABELS[role]}
    </span>
  );
}
