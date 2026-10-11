import type { Role } from './types';
import type { T } from '@/i18n/shared';

/** Localized role name; auditors are marked read-only. */
export const roleName = (t: T, r: Role) => (r === 'auditor' ? t('role.auditor_ro') : t(`role.${r}`));
