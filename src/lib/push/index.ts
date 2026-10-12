import 'server-only';
import webpush from 'web-push';
import { getAdminClient } from '@/lib/supabase/admin';
import { makeT } from '@/i18n';
import type { Language } from '@/i18n/shared';
import { localizeNotification } from '@/lib/notification-text';
import { contactEmail, appUrl } from '@/lib/env';

/** Phone/desktop notifications (Web Push with VAPID keys). Off unless both keys are set. */
export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let ready = false;
function init() {
  if (ready) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || `mailto:${contactEmail() ?? 'support@orbitos.app'}`, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  ready = true;
}

export interface PushPayload { title: string; body?: string | null; url?: string | null; tag?: string }
type Admin = ReturnType<typeof getAdminClient>;

/** Sends to every device the person turned on. Removes devices the push service says are gone. */
export async function sendPushToUser(admin: Admin, userId: string, payload: PushPayload): Promise<{ sent: number; removed: number }> {
  if (!pushConfigured()) return { sent: 0, removed: 0 };
  init();
  const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth, failures').eq('user_id', userId).limit(20);
  let sent = 0; let removed = 0;
  const body = JSON.stringify({ title: payload.title.slice(0, 120), body: payload.body?.slice(0, 240) ?? '', url: payload.url ?? '/notifications', tag: payload.tag ?? 'orbitos' });
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } }, body, { TTL: 3600, urgency: 'high' });
      sent++;
      await admin.from('push_subscriptions').update({ last_success_at: new Date().toISOString(), failures: 0 }).eq('id', s.id);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode ?? 0;
      if (status === 404 || status === 410 || (s.failures as number) >= 4) { removed++; await admin.from('push_subscriptions').delete().eq('id', s.id); }
      else await admin.from('push_subscriptions').update({ failures: (s.failures as number) + 1 }).eq('id', s.id);
    }
  }));
  return { sent, removed };
}

/** Pushes one stored notification, in the reader's language, once (pushed_at marks it). */
export async function pushNotification(admin: Admin, id: string): Promise<{ sent: number; skipped?: string }> {
  const claim = await admin.from('notifications').update({ pushed_at: new Date().toISOString() }).eq('id', id).is('pushed_at', null)
    .select('id, user_id, kind, title, body, link').maybeSingle();
  if (!claim.data) return { sent: 0, skipped: 'already_pushed_or_missing' };
  const n = claim.data as { id: string; user_id: string; kind: string; title: string; body: string | null; link: string | null };
  const { data: prof } = await admin.from('profiles').select('language').eq('id', n.user_id).maybeSingle();
  const t = makeT(((prof?.language as Language | undefined) ?? 'en'));
  const l = localizeNotification(n, t);
  const url = n.link ? new URL(n.link, appUrl()).pathname + (n.link.includes('#') ? `#${n.link.split('#')[1]}` : '') : '/notifications';
  const r = await sendPushToUser(admin, n.user_id, { title: l.title, body: l.body, url, tag: n.kind });
  return { sent: r.sent };
}
