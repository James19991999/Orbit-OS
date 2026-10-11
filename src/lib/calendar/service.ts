import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { encryptSecret, decryptSecret } from '@/lib/crypto/secrets';
import { appUrl } from '@/lib/env';
import {
  CalendarAuthError, createEvent, deleteEvent, fetchBusy, refreshAccess, updateEvent, type Provider, type EventInput,
} from './providers';

type Admin = SupabaseClient;
export const BUSY_DAYS = 14;
const BUSY_STALE_MS = 15 * 60_000;

export interface Connection {
  user_id: string; provider: Provider; account_email: string; refresh_token_enc: string; access_token_enc: string | null;
  access_expires_at: string | null; status: 'active' | 'error'; last_error: string | null; connected_at: string; busy_synced_at: string | null;
}

export const redirectUri = (p: Provider) => `${appUrl()}/api/calendar/callback/${p}`;

// ───────── OAuth state: signed, short-lived, bound to the signed-in user and a cookie nonce ─────────
function stateKey(): Buffer {
  const k = process.env.ENCRYPTION_KEY || '';
  return createHmac('sha256', 'orbitos-calendar-state').update(k).digest();
}
export function signState(v: { u: string; p: Provider; n: string }): string {
  const payload = Buffer.from(JSON.stringify({ ...v, t: Date.now() })).toString('base64url');
  return `${payload}.${createHmac('sha256', stateKey()).update(payload).digest('base64url')}`;
}
export function readState(state: string, nonce: string | undefined): { u: string; p: Provider } | null {
  const [payload, sig] = state.split('.');
  if (!payload || !sig || !nonce) return null;
  const want = createHmac('sha256', stateKey()).update(payload).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const v = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { u: string; p: Provider; n: string; t: number };
  if (v.n !== nonce || Date.now() - v.t > 10 * 60_000) return null;
  return { u: v.u, p: v.p };
}
export const newNonce = () => randomBytes(16).toString('base64url');

// ───────── Tokens ─────────
export async function loadConnections(admin: Admin, userIds: string[]): Promise<Map<string, Connection>> {
  if (!userIds.length) return new Map();
  const { data, error } = await admin.from('calendar_connections').select('*').in('user_id', userIds);
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as Connection[]).map((c) => [c.user_id, c]));
}

/** A usable access token, refreshed when expired. A revoked grant marks the connection as needing reconnect. */
async function accessToken(admin: Admin, c: Connection): Promise<string | null> {
  if (c.status !== 'active') return null;
  if (c.access_token_enc && c.access_expires_at && Date.parse(c.access_expires_at) > Date.now()) return decryptSecret(c.access_token_enc);
  try {
    const t = await refreshAccess(c.provider, decryptSecret(c.refresh_token_enc));
    const upd: Record<string, unknown> = { access_token_enc: encryptSecret(t.accessToken), access_expires_at: t.expiresAt.toISOString(), last_error: null };
    if (t.refreshToken) upd.refresh_token_enc = encryptSecret(t.refreshToken);   // rotated (Microsoft does this)
    await admin.from('calendar_connections').update(upd).eq('user_id', c.user_id);
    c.access_token_enc = upd.access_token_enc as string; c.access_expires_at = upd.access_expires_at as string;
    return t.accessToken;
  } catch (e) {
    if (e instanceof CalendarAuthError) await markError(admin, c.user_id, 'Access was removed or expired. Connect your calendar again.');
    else await admin.from('calendar_connections').update({ last_error: (e as Error).message.slice(0, 300) }).eq('user_id', c.user_id);
    return null;
  }
}

async function markError(admin: Admin, userId: string, msg: string) {
  await admin.from('calendar_connections').update({ status: 'error', last_error: msg, access_token_enc: null }).eq('user_id', userId);
}

/** Runs a provider call with a fresh token, retrying once with a refreshed token if the old one was rejected. */
async function withToken<T>(admin: Admin, c: Connection, fn: (token: string) => Promise<T>): Promise<T | null> {
  let token = await accessToken(admin, c);
  if (!token) return null;
  try {
    return await fn(token);
  } catch (e) {
    if (!(e instanceof CalendarAuthError)) throw e;
    c.access_expires_at = null;
    token = await accessToken(admin, c);
    if (!token) return null;
    try { return await fn(token); } catch (e2) {
      if (e2 instanceof CalendarAuthError) { await markError(admin, c.user_id, 'Access was removed. Connect your calendar again.'); return null; }
      throw e2;
    }
  }
}

// ───────── Meetings → calendars ─────────
interface MeetingRow { id: string; title: string; description: string | null; starts_at: string; duration_min: number; video_url: string | null }

function toEvent(m: MeetingRow): EventInput {
  const start = new Date(m.starts_at);
  return { title: m.title, description: m.description, start, end: new Date(start.getTime() + m.duration_min * 60_000), url: m.video_url ?? `${appUrl()}/scheduling/meetings/${m.id}` };
}

/**
 * Puts a meeting in the calendar of every participant who connected one (creating, updating, or removing the
 * event for people who declined or were removed). Returns who was synced, so the rest get an .ics email instead.
 */
export async function syncMeeting(admin: Admin, meetingId: string) {
  const [{ data: m }, { data: parts }, { data: links }] = await Promise.all([
    admin.from('meetings').select('id, title, description, starts_at, duration_min, video_url').eq('id', meetingId).maybeSingle(),
    admin.from('meeting_participants').select('user_id, rsvp').eq('meeting_id', meetingId),
    admin.from('calendar_event_links').select('user_id, provider, external_id').eq('meeting_id', meetingId),
  ]);
  const synced = new Set<string>(); const failed = new Set<string>();
  if (!m) return { synced, failed };
  const wanted = new Set((parts ?? []).filter((p) => p.rsvp !== 'no').map((p) => p.user_id as string));
  const linkBy = new Map((links ?? []).map((l) => [l.user_id as string, l as { user_id: string; provider: Provider; external_id: string }]));
  const conns = await loadConnections(admin, [...new Set([...wanted, ...linkBy.keys()])]);
  const ev = toEvent(m as MeetingRow);
  await Promise.all([...new Set([...wanted, ...linkBy.keys()])].map(async (uid) => {
    const c = conns.get(uid); const link = linkBy.get(uid);
    try {
      if (!wanted.has(uid)) {
        // Declined or removed: take it out of their calendar.
        if (link && c && c.provider === link.provider) await withToken(admin, c, (t) => deleteEvent(link.provider, t, link.external_id));
        if (link) await admin.from('calendar_event_links').delete().eq('meeting_id', meetingId).eq('user_id', uid);
        return;
      }
      if (!c || c.status !== 'active') return;
      if (link && link.provider === c.provider) {
        const ok = await withToken(admin, c, (t) => updateEvent(c.provider, t, link.external_id, ev).then(() => true));
        if (ok) { synced.add(uid); await admin.from('calendar_event_links').update({ synced_at: new Date().toISOString() }).eq('meeting_id', meetingId).eq('user_id', uid); }
        else failed.add(uid);
        return;
      }
      const id = await withToken(admin, c, (t) => createEvent(c.provider, t, ev));
      if (!id) { failed.add(uid); return; }
      await admin.from('calendar_event_links').upsert({ meeting_id: meetingId, user_id: uid, provider: c.provider, external_id: id, synced_at: new Date().toISOString() });
      synced.add(uid);
    } catch (e) {
      failed.add(uid);
      await admin.from('calendar_connections').update({ last_error: `Couldn’t update “${(m as MeetingRow).title}”: ${(e as Error).message}`.slice(0, 300) }).eq('user_id', uid);
    }
  }));
  return { synced, failed };
}

/** Removes a meeting from every calendar it was written to (before the meeting is deleted). */
export async function removeMeetingEverywhere(admin: Admin, meetingId: string) {
  const { data: links } = await admin.from('calendar_event_links').select('user_id, provider, external_id').eq('meeting_id', meetingId);
  const conns = await loadConnections(admin, (links ?? []).map((l) => l.user_id as string));
  let removed = 0;
  await Promise.all((links ?? []).map(async (l) => {
    const c = conns.get(l.user_id as string);
    if (c && c.provider === l.provider) {
      const done = await withToken(admin, c, (t) => deleteEvent(l.provider as Provider, t, l.external_id as string).then(() => true)).catch(() => null);
      if (done) removed++;
    }
  }));
  await admin.from('calendar_event_links').delete().eq('meeting_id', meetingId);
  return removed;
}

/** After someone connects: put their upcoming OrbitOS meetings in the new calendar. */
export async function backfillUpcoming(admin: Admin, userId: string) {
  const { data } = await admin.from('meeting_participants').select('meeting_id, rsvp, meetings!inner(starts_at)').eq('user_id', userId)
    .neq('rsvp', 'no').gte('meetings.starts_at', new Date(Date.now() - 3_600_000).toISOString()).limit(100);
  let n = 0;
  for (const r of data ?? []) { const s = await syncMeeting(admin, r.meeting_id as string); if (s.synced.has(userId)) n++; }
  return n;
}

// ───────── Calendars → busy times ─────────
export async function refreshBusy(admin: Admin, c: Connection): Promise<boolean> {
  const from = new Date(Date.now() - 3_600_000); const to = new Date(Date.now() + BUSY_DAYS * 86_400_000);
  const blocks = await withToken(admin, c, (t) => fetchBusy(c.provider, t, from, to)).catch(async (e) => {
    await admin.from('calendar_connections').update({ last_error: (e as Error).message.slice(0, 300) }).eq('user_id', c.user_id);
    return null;
  });
  if (!blocks) return false;
  // Everything that makes them busy, including OrbitOS meetings already written to that calendar.
  await admin.from('calendar_busy').delete().eq('user_id', c.user_id);
  const rows = blocks.filter((b) => b.end > b.start).slice(0, 1000).map((b) => ({ user_id: c.user_id, starts_at: b.start.toISOString(), ends_at: b.end.toISOString() }));
  if (rows.length) await admin.from('calendar_busy').insert(rows);
  await admin.from('calendar_connections').update({ busy_synced_at: new Date().toISOString(), last_error: null }).eq('user_id', c.user_id);
  return true;
}

/** Busy times for these people, refreshing any calendar not read in the last 15 minutes. */
export async function busyFor(admin: Admin, userIds: string[]) {
  const conns = await loadConnections(admin, userIds);
  const stale = [...conns.values()].filter((c) => c.status === 'active' && (!c.busy_synced_at || Date.now() - Date.parse(c.busy_synced_at) > BUSY_STALE_MS));
  for (let i = 0; i < stale.length; i += 5) await Promise.all(stale.slice(i, i + 5).map((c) => refreshBusy(admin, c)));
  const { data } = await admin.from('calendar_busy').select('user_id, starts_at, ends_at').in('user_id', [...conns.keys()])
    .gte('ends_at', new Date().toISOString()).order('starts_at').limit(5000);
  const busy: Record<string, { start: number; end: number }[]> = {};
  for (const r of data ?? []) (busy[r.user_id as string] ??= []).push({ start: Date.parse(r.starts_at as string), end: Date.parse(r.ends_at as string) });
  return { busy, connected: [...conns.values()].filter((c) => c.status === 'active').map((c) => c.user_id) };
}
