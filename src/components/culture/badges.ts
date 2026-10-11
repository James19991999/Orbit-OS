import type { Badge } from '@/lib/types';
import type { MessageKey, T } from '@/i18n/shared';

/** Badge emoji; names and hints are translated via cul.badge.<id>. Safe to import on the server. */
export const BADGES: Record<Badge, { emoji: string }> = {
  firefighter: { emoji: '🔥' },
  team_glue: { emoji: '🤝' },
  ship_it: { emoji: '⚡' },
  innovator: { emoji: '💡' },
};
export const badgeLabel = (t: T, b: Badge) => t(`cul.badge.${b}` as MessageKey);
export const badgeHint = (t: T, b: Badge) => t(`cul.badge.${b}.hint` as MessageKey);
