'use client';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Check-ins written while offline wait in this browser and are sent when the connection returns.
 * Storage can be unavailable (private mode, blocked site data), so every access is guarded.
 */
const KEY = 'orbit_offline_checkins';
export interface QueuedCheckin { org_id: string; user_id: string; for_date: string; shipped: string; blockers: string | null; mood: number; queued_at: number }

function read(): QueuedCheckin[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function write(items: QueuedCheckin[]) {
  try { if (items.length) localStorage.setItem(KEY, JSON.stringify(items)); else localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

/** Returns false when this browser can't store it (then the caller shows the normal error). */
export function queueCheckin(item: Omit<QueuedCheckin, 'queued_at'>): boolean {
  const items = read().filter((i) => !(i.org_id === item.org_id && i.user_id === item.user_id && i.for_date === item.for_date));
  items.push({ ...item, queued_at: Date.now() });
  write(items);
  return read().some((i) => i.for_date === item.for_date && i.org_id === item.org_id);
}

export const queuedCount = () => read().length;

/** Sends queued check-ins; keeps any that fail for another try. Returns how many were sent. */
export async function flushCheckins(sb: SupabaseClient): Promise<number> {
  const items = read();
  if (!items.length) return 0;
  const left: QueuedCheckin[] = [];
  let sent = 0;
  for (const { queued_at: _q, ...row } of items) {
    const { error } = await sb.from('check_ins').upsert(row, { onConflict: 'org_id,user_id,for_date' });
    if (error) {
      // Permanent errors (e.g. no longer a member) are dropped; network errors are retried later.
      if (/fetch|network|Failed to/i.test(error.message)) left.push({ ...row, queued_at: _q });
    } else sent++;
  }
  write(left);
  return sent;
}

/** True for failures caused by having no connection (as opposed to a server refusal). */
export function isOfflineError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = e instanceof Error ? e.message : String(e ?? '');
  return /Failed to fetch|NetworkError|Load failed|network request failed|fetch failed/i.test(msg);
}
