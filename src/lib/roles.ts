import type { Role } from './types';

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  director: 'Director',
  contributor: 'Contributor',
  auditor: 'Auditor (read-only)',
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  owner: 'Full platform access, billing, SSO and offboarding',
  director: 'Operations, finance, scheduling, reports and compliance',
  contributor: 'Own tasks, check-ins, culture and dashboards',
  auditor: 'Read-only compliance, reports and audit log',
};

const MANAGERS: Role[] = ['owner', 'director'];
const WRITERS: Role[] = ['owner', 'director', 'contributor'];

export const can = {
  manage: (r: Role | null | undefined) => !!r && MANAGERS.includes(r),
  write: (r: Role | null | undefined) => !!r && WRITERS.includes(r),
  owner: (r: Role | null | undefined) => r === 'owner',
  seeFinance: (r: Role | null | undefined) => !!r && (MANAGERS.includes(r) || r === 'auditor'),
  seeAudit: (r: Role | null | undefined) => !!r && (MANAGERS.includes(r) || r === 'auditor'),
  billing: (r: Role | null | undefined) => r === 'owner',
};
