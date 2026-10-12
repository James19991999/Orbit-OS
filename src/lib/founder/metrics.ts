import 'server-only';
import { getAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { isEmailConfigured } from '@/lib/email';
import { isIntaSendConfigured } from '@/lib/intasend/client';
import { isWhatsAppConfigured } from '@/lib/whatsapp/client';
import { isEncryptionConfigured } from '@/lib/crypto/secrets';
import { isProviderConfigured } from '@/lib/calendar/providers';

export interface Money { currency: string; amount_minor: number }
export interface Metrics {
  generated_at: string; workspaces: number; paying: number; on_trial: number; lapsed: number; offboarding: number;
  new_workspaces_7d: number; new_workspaces_30d: number; users: number; new_users_7d: number; new_users_30d: number;
  online_now: number; active_24h: number; active_7d: number; active_30d: number; signins_today: number;
  online: { last_seen_at: string; name: string | null; workspace: string | null }[];
  plan_mix: { plan: string; period: string; n: number }[];
  mrr: (Money & { workspaces: number })[];
  revenue_by_month: (Money & { month: string; payments: number })[];
  failed_payments_7d: { created_at: string; workspace: string; method: string; currency: string; amount_minor: number }[];
  trials_ending: { name: string; slug: string; plan_expires_at: string }[];
  renewals_due: { name: string; slug: string; plan: string; plan_period: string; plan_expires_at: string }[];
  etims: { queued: number; rejected_7d: number; submitted_24h: number; oldest_queued: string | null; connected_workspaces: number; platform_status: string | null };
  delivery_failures_24h: Partial<Record<'email' | 'whatsapp', number>>;
  recent_delivery_failures: { created_at: string; channel: string; error: string; context: string | null }[];
  jobs: { job: string; last_started_at: string | null; last_finished_at: string | null; last_ok_at: string | null; last_status: number | null;
    last_error: string | null; last_summary: string | null; last_duration_ms: number | null; runs: number; failures: number }[];
  calendar_connections: number;
  /** Present once supabase/update_security.sql has run. */
  security?: { failed_logins_1h: number; failed_logins_24h: number; accounts_targeted_24h: number; mfa_users: number };
}
export interface WorkspaceRow { id: string; name: string; slug: string; plan: string; plan_period: string; status: string; plan_expires_at: string;
  created_at: string; seat_limit: number; members: number; last_active: string | null; revenue: Record<string, number>; currency: string }
export interface SentryIssue { title: string; count: string; lastSeen: string; permalink: string; level: string }

/** Background jobs and how often each must run. A job is "late" when its last success is older than this. */
export const JOBS: { job: string; label: string; everyHours: number }[] = [
  { job: 'digests', label: 'Report digests', everyHours: 1 },
  { job: 'checkin-reminders', label: 'Check-in reminders', everyHours: 1 },
  { job: 'renewals', label: 'Renewal reminders & seat alerts', everyHours: 1 },
  { job: 'payouts', label: 'M-Pesa payout status', everyHours: 1 },
  { job: 'ai-briefs', label: 'AI chief-of-staff briefs', everyHours: 1 },
  { job: 'etims', label: 'KRA eTIMS retries', everyHours: 1 },
  { job: 'calendar', label: 'Calendar busy times', everyHours: 1 },
  { job: 'health-snapshot', label: 'Team-health snapshot', everyHours: 24 },
  { job: 'retention', label: 'Retention clean-up', everyHours: 24 },
];

export function configChecklist() {
  return [
    { label: 'Database (Supabase service key)', ok: hasServiceRole(), note: 'Required' },
    { label: 'Background jobs (CRON_SECRET)', ok: Boolean(process.env.CRON_SECRET), note: 'Required' },
    { label: 'Email (Resend)', ok: isEmailConfigured(), note: 'Sign-up, invites, reminders' },
    { label: 'Payments (IntaSend)', ok: isIntaSendConfigured(), note: process.env.INTASEND_TEST_MODE === 'false' ? 'Live mode' : 'Test mode — no real money' },
    { label: 'Error alerts (Sentry)', ok: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN), note: 'Recommended' },
    { label: 'Encryption key', ok: isEncryptionConfigured(), note: 'Needed for eTIMS and calendar sync' },
    { label: 'KRA eTIMS (your receipts)', ok: Boolean(process.env.ETIMS_TIN && process.env.ETIMS_DEVICE_SERIAL && process.env.ETIMS_ITEM_CLS_CD), note: process.env.ETIMS_ENV === 'production' ? 'Production' : 'Sandbox' },
    { label: 'Google Calendar sync', ok: isProviderConfigured('google'), note: 'Optional' },
    { label: 'Outlook sync', ok: isProviderConfigured('microsoft'), note: 'Optional' },
    { label: 'WhatsApp', ok: isWhatsAppConfigured(), note: 'Optional' },
    { label: 'AI chief of staff (Claude)', ok: Boolean(process.env.ANTHROPIC_API_KEY), note: 'Optional' },
    { label: 'Shared rate limits (Upstash)', ok: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN), note: 'Recommended' },
  ];
}

/** Unresolved Sentry issues seen in the last 24 h. Needs SENTRY_AUTH_TOKEN with project:read, SENTRY_ORG, SENTRY_PROJECT. */
async function sentryIssues(): Promise<{ status: 'off' | 'ok' | 'error'; issues: SentryIssue[]; error?: string }> {
  const token = process.env.SENTRY_AUTH_TOKEN; const org = process.env.SENTRY_ORG; const project = process.env.SENTRY_PROJECT;
  if (!token || !org || !project) return { status: 'off', issues: [] };
  const base = (process.env.SENTRY_API_BASE || 'https://sentry.io').replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/?query=is:unresolved&statsPeriod=24h&limit=8`, {
      headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(4000), cache: 'no-store',
    });
    if (!res.ok) return { status: 'error', issues: [], error: res.status === 403 ? 'The token needs the project:read scope.' : `Sentry answered ${res.status}` };
    const data = (await res.json()) as SentryIssue[];
    return { status: 'ok', issues: data.map((i) => ({ title: i.title, count: i.count, lastSeen: i.lastSeen, permalink: i.permalink, level: i.level })) };
  } catch (e) {
    return { status: 'error', issues: [], error: (e as Error).message };
  }
}

export async function loadFounderData(search: string | null) {
  const admin = getAdminClient();
  const pingStart = Date.now();
  const [ping, metricsRes, workspacesRes, sentry] = await Promise.all([
    admin.from('organizations').select('id', { count: 'exact', head: true }).then((r) => ({ ok: !r.error, ms: Date.now() - pingStart, error: r.error?.message })),
    admin.rpc('platform_metrics'),
    admin.rpc('platform_workspaces', { p_search: search?.trim() || null }),
    sentryIssues(),
  ]);
  if (metricsRes.error) throw new Error(`Founder metrics unavailable: ${metricsRes.error.message}. Run supabase/update_founder_console.sql.`);
  return {
    db: ping,
    metrics: metricsRes.data as Metrics,
    workspaces: (workspacesRes.data ?? []) as WorkspaceRow[],
    sentry,
  };
}

/** Logs a console visit (at most once per 10 minutes per person, since the page refreshes itself). */
export async function logConsoleView(actorId: string, email: string | undefined, ip: string | null) {
  try {
    const admin = getAdminClient();
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count } = await admin.from('platform_audit').select('id', { count: 'exact', head: true }).eq('actor_id', actorId).eq('action', 'founder.console_viewed').gte('created_at', since);
    if (!count) await admin.from('platform_audit').insert({ actor_id: actorId, actor_email: email ?? null, action: 'founder.console_viewed', ip });
  } catch (e) {
    console.error('[founder] could not log console view', (e as Error).message);
  }
}
