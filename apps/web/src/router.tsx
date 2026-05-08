// Code-based TanStack Router tree.
//
// Layout:
//   /              → role-based redirect (auth required)
//   /sign-in       → public
//   /auth/magic    → public
//   /student/...   → student-only shell + nested screens
//
// Other roles' subtrees are mounted in later phases. The auth gate is
// implemented in __root.tsx; routes themselves stay declarative.

import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';

import { RouteError } from './components/index.js';
import { AuthGate, RoleHomeRedirect, RootLayout } from './routes/__root.js';
import { SignInRoute } from './routes/sign-in.js';
import { MagicLinkRoute } from './routes/auth/magic.js';
import { VerifyCertificate } from './routes/verify/Verify.js';
import {
  ApplicationsList,
  ApplyForm,
  CertificateList,
  LedgerView,
  OpportunitiesList,
  OpportunityDetail,
  PlacementDetail,
  StudentDashboard,
  StudentShell,
} from './features/student/index.js';
import {
  EvaluationForm,
  SupervisorInbox,
  SupervisorShell,
} from './features/supervisor/index.js';
import {
  ApplicationsReview,
  CoordinatorDashboard,
  CoordinatorOpportunitiesList,
  CoordinatorOpportunityDetail,
  CoordinatorPlacementDetail,
  CoordinatorReports,
  CoordinatorShell,
  OpportunityForm,
  OrganisationForm,
  OrganisationsList,
  PlacementMonitor,
} from './features/coordinator/index.js';
import {
  AdminShell,
  AuditLogViewer,
  ImportDetail,
  ImportsList,
  SystemConfig,
  UserDetail,
  UsersList,
} from './features/admin/index.js';
import type { EvaluationType } from './lib/api/types.js';

const rootRoute = createRootRoute({
  component: RootLayout,
  errorComponent: RouteError,
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  component: SignInRoute,
});

const magicRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/magic',
  component: MagicLinkRoute,
});

// OUT-08 — public certificate verification, no auth gate.
const verifyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/verify/$id',
  component: function VerifyRoute() {
    const { id } = verifyRoute.useParams();
    return <VerifyCertificate id={id} />;
  },
});

// Authenticated branch — gate first, then per-role subtrees.
const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authed',
  component: AuthGate,
});

const homeRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/',
  component: RoleHomeRedirect,
});

// Force role-correct routing: a non-STUDENT hitting /student gets
// bounced to their own home.
function requireStudent(): void {
  // The shell relies on AuthProvider context; the gate is in __root.tsx.
  // We keep this hook in case a router-level loader becomes useful later.
}

const studentLayoutRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/student',
  component: () => {
    requireStudent();
    return <StudentShell />;
  },
});

const studentDashboardRoute = createRoute({
  getParentRoute: () => studentLayoutRoute,
  path: '/',
  component: StudentDashboard,
});

const studentOpportunitiesRoute = createRoute({
  getParentRoute: () => studentLayoutRoute,
  path: 'opportunities',
  component: OpportunitiesList,
});

const studentOpportunityDetailRoute = createRoute({
  getParentRoute: () => studentLayoutRoute,
  path: 'opportunities/$id',
  component: function StudentOpportunityDetailRoute() {
    const { id } = studentOpportunityDetailRoute.useParams();
    return <OpportunityDetail id={id} />;
  },
});

const studentApplyRoute = createRoute({
  getParentRoute: () => studentLayoutRoute,
  path: 'opportunities/$id/apply',
  component: function StudentApplyRoute() {
    const { id } = studentApplyRoute.useParams();
    return <ApplyForm opportunityId={id} />;
  },
});

const studentApplicationsRoute = createRoute({
  getParentRoute: () => studentLayoutRoute,
  path: 'applications',
  component: ApplicationsList,
});

const studentPlacementDetailRoute = createRoute({
  getParentRoute: () => studentLayoutRoute,
  path: 'placements/$id',
  component: function StudentPlacementRoute() {
    const { id } = studentPlacementDetailRoute.useParams();
    return <PlacementDetail id={id} />;
  },
});

const studentLedgerRoute = createRoute({
  getParentRoute: () => studentLayoutRoute,
  path: 'ledger',
  component: LedgerView,
});

const studentCertificatesRoute = createRoute({
  getParentRoute: () => studentLayoutRoute,
  path: 'certificates',
  component: CertificateList,
});

// Supervisor subtree — single layout (no nav), inbox + evaluation form.
const supervisorLayoutRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/supervisor',
  component: SupervisorShell,
});

const supervisorInboxRoute = createRoute({
  getParentRoute: () => supervisorLayoutRoute,
  path: '/',
  component: SupervisorInbox,
});

const supervisorEvaluationNewRoute = createRoute({
  getParentRoute: () => supervisorLayoutRoute,
  path: 'placements/$id/evaluations/new',
  validateSearch: (search: Record<string, unknown>): { type: EvaluationType } => {
    const t = search.type;
    if (t !== 'MIDTERM' && t !== 'FINAL') {
      throw new Error('type must be MIDTERM or FINAL');
    }
    return { type: t };
  },
  component: function SupervisorEvaluationNewRoute() {
    const { id } = supervisorEvaluationNewRoute.useParams();
    const { type } = supervisorEvaluationNewRoute.useSearch();
    return <EvaluationForm placementId={id} evaluationType={type} />;
  },
});

// Coordinator subtree.
const coordinatorLayoutRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/coordinator',
  component: CoordinatorShell,
});

const coordinatorDashboardRoute = createRoute({
  getParentRoute: () => coordinatorLayoutRoute,
  path: '/',
  component: CoordinatorDashboard,
});

const coordinatorOrganisationsRoute = createRoute({
  getParentRoute: () => coordinatorLayoutRoute,
  path: 'organisations',
  component: OrganisationsList,
});

const coordinatorOrganisationNewRoute = createRoute({
  getParentRoute: () => coordinatorLayoutRoute,
  path: 'organisations/new',
  component: () => <OrganisationForm />,
});

const coordinatorOrganisationDetailRoute = createRoute({
  getParentRoute: () => coordinatorLayoutRoute,
  path: 'organisations/$id',
  component: function CoordinatorOrgDetailRoute() {
    const { id } = coordinatorOrganisationDetailRoute.useParams();
    return <OrganisationForm id={id} />;
  },
});

const coordinatorOpportunitiesRoute = createRoute({
  getParentRoute: () => coordinatorLayoutRoute,
  path: 'opportunities',
  component: CoordinatorOpportunitiesList,
});

const coordinatorOpportunityNewRoute = createRoute({
  getParentRoute: () => coordinatorLayoutRoute,
  path: 'opportunities/new',
  component: () => <OpportunityForm />,
});

const coordinatorOpportunityDetailRoute = createRoute({
  getParentRoute: () => coordinatorLayoutRoute,
  path: 'opportunities/$id',
  component: function CoordinatorOpportunityDetailRoute() {
    const { id } = coordinatorOpportunityDetailRoute.useParams();
    return <CoordinatorOpportunityDetail id={id} />;
  },
});

const coordinatorOpportunityEditRoute = createRoute({
  getParentRoute: () => coordinatorLayoutRoute,
  path: 'opportunities/$id/edit',
  component: function CoordinatorOpportunityEditRoute() {
    const { id } = coordinatorOpportunityEditRoute.useParams();
    return <OpportunityForm id={id} />;
  },
});

const coordinatorApplicationsRoute = createRoute({
  getParentRoute: () => coordinatorLayoutRoute,
  path: 'applications',
  validateSearch: (search: Record<string, unknown>): { opportunity_id?: string } => {
    const oid = search.opportunity_id;
    return typeof oid === 'string' ? { opportunity_id: oid } : {};
  },
  component: ApplicationsReview,
});

const coordinatorPlacementsRoute = createRoute({
  getParentRoute: () => coordinatorLayoutRoute,
  path: 'placements',
  component: PlacementMonitor,
});

const coordinatorPlacementDetailRoute = createRoute({
  getParentRoute: () => coordinatorLayoutRoute,
  path: 'placements/$id',
  component: function CoordinatorPlacementDetailRoute() {
    const { id } = coordinatorPlacementDetailRoute.useParams();
    return <CoordinatorPlacementDetail id={id} />;
  },
});

const coordinatorReportsRoute = createRoute({
  getParentRoute: () => coordinatorLayoutRoute,
  path: 'reports',
  component: CoordinatorReports,
});

// Admin subtree.
const adminLayoutRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/admin',
  component: AdminShell,
});

const adminUsersRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/',
  component: UsersList,
});

const adminUserDetailRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: 'users/$id',
  component: function AdminUserDetailRoute() {
    const { id } = adminUserDetailRoute.useParams();
    return <UserDetail id={id} />;
  },
});

const adminAuditLogRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: 'audit-log',
  component: AuditLogViewer,
});

const adminImportsRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: 'imports',
  component: ImportsList,
});

const adminImportDetailRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: 'imports/$id',
  component: function AdminImportDetailRoute() {
    const { id } = adminImportDetailRoute.useParams();
    return <ImportDetail id={id} />;
  },
});

const adminConfigRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: 'config',
  component: SystemConfig,
});

// Catch-all for unknown URLs under the authed gate: send to role home.
const notFoundRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '*',
  beforeLoad: () => {
    throw redirect({ to: '/' });
  },
  component: () => null as unknown as JSX.Element,
});

void Outlet; // imported for the rootRoute outlet semantics

const routeTree = rootRoute.addChildren([
  signInRoute,
  magicRoute,
  verifyRoute,
  authedRoute.addChildren([
    homeRoute,
    studentLayoutRoute.addChildren([
      studentDashboardRoute,
      studentOpportunitiesRoute,
      studentOpportunityDetailRoute,
      studentApplyRoute,
      studentApplicationsRoute,
      studentPlacementDetailRoute,
      studentLedgerRoute,
      studentCertificatesRoute,
    ]),
    supervisorLayoutRoute.addChildren([
      supervisorInboxRoute,
      supervisorEvaluationNewRoute,
    ]),
    coordinatorLayoutRoute.addChildren([
      coordinatorDashboardRoute,
      coordinatorOrganisationsRoute,
      coordinatorOrganisationNewRoute,
      coordinatorOrganisationDetailRoute,
      coordinatorOpportunitiesRoute,
      coordinatorOpportunityNewRoute,
      coordinatorOpportunityDetailRoute,
      coordinatorOpportunityEditRoute,
      coordinatorApplicationsRoute,
      coordinatorPlacementsRoute,
      coordinatorPlacementDetailRoute,
      coordinatorReportsRoute,
    ]),
    adminLayoutRoute.addChildren([
      adminUsersRoute,
      adminUserDetailRoute,
      adminAuditLogRoute,
      adminImportsRoute,
      adminImportDetailRoute,
      adminConfigRoute,
    ]),
    notFoundRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
