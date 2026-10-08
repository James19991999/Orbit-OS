import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { cookies, headers } from 'next/headers';
import { z } from 'zod';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { isSupabaseConfigured, ORG_COOKIE } from '@/lib/env';
import { limiter } from '@/lib/ratelimit';
import type { Organization, Role } from '@/lib/types';
import { reportError, setReportingUser } from '@/lib/observability/report';

export class ApiError extends Error {
  constructor(public status: number, message: string, public extraHeaders?: Record<string, string>) { super(message); }
}

export function json(data: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return NextResponse.json(data, { status, headers: extraHeaders });
}

/** Wraps a route handler: converts ApiError/ZodError into JSON responses, never leaks stack traces. */
export function handler<C = unknown>(fn: (req: NextRequest, ctx: C) => Promise<Response>) {
  return async (req: NextRequest, ctx: C) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      // Never swallow Next.js control-flow signals (dynamic usage, redirect, notFound) — rethrow them.
      const digest = (e as { digest?: unknown } | null)?.digest;
      if (typeof digest === 'string' && (digest === 'DYNAMIC_SERVER_USAGE' || digest.startsWith('NEXT_'))) throw e;
      if (e instanceof ApiError) {
        // 5xx ApiErrors are real faults (e.g. a failed database write); 503 "not configured" is expected setup state.
        if (e.status >= 500 && e.status !== 503) reportError(e, { route: req.nextUrl.pathname, method: req.method });
        return json({ error: e.message }, e.status, e.extraHeaders);
      }
      if (e instanceof z.ZodError) return json({ error: 'Invalid request', issues: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, 400);
      console.error('[api]', req.nextUrl.pathname, e);
      reportError(e, { route: req.nextUrl.pathname, method: req.method });
      return json({ error: 'Internal error' }, 500);
    }
  };
}

export function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

export async function rateLimit(name: string, key: string, limit: number, windowSec: number) {
  const r = await limiter(name, limit, windowSec).check(key);
  if (!r.ok) throw new ApiError(429, 'Too many requests — please slow down.', { 'Retry-After': String(r.retryAfterSec) });
}

export interface ApiContext { supabase: SupabaseClient; user: User; org: Organization; role: Role }

/**
 * Authenticated route context. Resolves the active workspace (explicit slug → subdomain → cookie),
 * re-verifies membership + role server-side, and optionally requires a writable workspace.
 */
export async function requireApiContext(opts: { roles?: Role[]; orgSlug?: string; writable?: boolean } = {}): Promise<ApiContext> {
  if (!isSupabaseConfigured()) throw new ApiError(503, 'Supabase is not configured');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new ApiError(401, 'Not signed in');
  const slug = opts.orgSlug || (await headers()).get('x-orbit-tenant') || (await cookies()).get(ORG_COOKIE)?.value;
  const { data, error } = await supabase.from('memberships').select('role, org:organizations(*)').eq('user_id', user.id).eq('status', 'active');
  if (error) throw new ApiError(500, error.message);
  const rows = ((data ?? []) as unknown as { role: Role; org: Organization | null }[]).filter((r) => r.org)
    .sort((a, b) => a.org!.name.localeCompare(b.org!.name));
  // An explicit slug must match exactly; an implicit one (cookie/subdomain) falls back like the UI does.
  const m = rows.find((r) => r.org!.slug === slug) ?? (opts.orgSlug ? undefined : rows[0]);
  if (!m || !m.org) throw new ApiError(403, 'You are not a member of this workspace');
  if (opts.roles && !opts.roles.includes(m.role)) throw new ApiError(403, 'Your role does not allow this action');
  if (opts.writable && (m.org.status !== 'active' || new Date(m.org.plan_expires_at).getTime() < Date.now() - 3 * 86_400_000)) {
    throw new ApiError(402, 'This workspace is read-only. Renew the plan to make changes.');
  }
  setReportingUser(user.id, m.org.id);
  return { supabase, user, org: m.org, role: m.role };
}

export async function parseBody<T extends z.ZodTypeAny>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try { raw = await req.json(); } catch { throw new ApiError(400, 'Body must be JSON'); }
  return schema.parse(raw);
}

/** Server-side audit write (service role). Best-effort: an audit failure is logged, never swallowed silently. */
export async function audit(req: NextRequest | null, orgId: string, actorId: string | null, action: string,
  target?: { type?: string; id?: string }, metadata: Record<string, unknown> = {}) {
  if (!hasServiceRole()) { console.warn('[audit] service role not configured; skipped', action); return; }
  const { error } = await getAdminClient().from('audit_log').insert({
    org_id: orgId, actor_id: actorId, action, target_type: target?.type ?? null, target_id: target?.id ?? null, metadata,
    ip: req ? clientIp(req) : null, user_agent: req?.headers.get('user-agent')?.slice(0, 300) ?? null,
  });
  if (error) console.error('[audit] insert failed', action, error.message);
}

export function requireCronSecret(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new ApiError(503, 'CRON_SECRET is not configured');
  const header = req.headers.get('authorization');
  if (header !== `Bearer ${secret}`) throw new ApiError(401, 'Unauthorized');
}
