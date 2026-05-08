export const ROLES = ['STUDENT', 'SUPERVISOR', 'COORDINATOR', 'ADMINISTRATOR'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_GUARDS = {
  PUBLIC: 'PUBLIC',
  ANY_AUTHENTICATED: 'ANY_AUTHENTICATED',
  STUDENT: 'STUDENT',
  SUPERVISOR: 'SUPERVISOR',
  COORDINATOR: 'COORDINATOR',
  ADMINISTRATOR: 'ADMINISTRATOR',
  COORDINATOR_OR_ADMIN: 'COORDINATOR_OR_ADMIN',
} as const;

export type RoleGuard = (typeof ROLE_GUARDS)[keyof typeof ROLE_GUARDS];

export function roleSatisfies(actor: Role | null, guard: RoleGuard): boolean {
  switch (guard) {
    case 'PUBLIC':
      return true;
    case 'ANY_AUTHENTICATED':
      return actor !== null;
    case 'COORDINATOR_OR_ADMIN':
      return actor === 'COORDINATOR' || actor === 'ADMINISTRATOR';
    default:
      return actor === guard;
  }
}
