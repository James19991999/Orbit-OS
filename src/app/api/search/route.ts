import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { handler, json, rateLimit, requireApiContext } from '@/lib/api';
import { likeExact } from '@/lib/security/request-guard';
import { can } from '@/lib/roles';

export const dynamic = 'force-dynamic';

const Query = z.string().trim().min(2).max(80);

export interface SearchHit { type: 'task' | 'person' | 'meeting' | 'invoice'; id: string; title: string; sub: string | null; href: string }

/**
 * Search for the Ctrl+K box. Runs as the signed-in person, so row-level security decides what they can find:
 * only their workspace, and invoices only for roles that can see finance.
 */
export const GET = handler(async (req: NextRequest) => {
  const ctx = await requireApiContext();
  await rateLimit('search', ctx.user.id, 90, 60);
  const q = Query.parse(req.nextUrl.searchParams.get('q') ?? '');
  const like = `%${likeExact(q)}%`;
  const { supabase, org } = ctx;
  const [tasks, people, meetings, invoices] = await Promise.all([
    supabase.from('tasks').select('id, title, status').eq('org_id', org.id).ilike('title', like).order('created_at', { ascending: false }).limit(6),
    supabase.from('memberships').select('user_id, title, department, profile:profiles!inner(full_name)').eq('org_id', org.id).eq('status', 'active').ilike('profile.full_name', like).limit(6),
    supabase.from('meetings').select('id, title, starts_at').eq('org_id', org.id).ilike('title', like).order('starts_at', { ascending: false }).limit(5),
    can.seeFinance(ctx.role)
      ? supabase.from('invoices').select('id, number, client_name, status').eq('org_id', org.id).or(`number.ilike.${pgrstQuote(like)},client_name.ilike.${pgrstQuote(like)}`).order('issued_on', { ascending: false }).limit(5)
      : Promise.resolve({ data: [] as { id: string; number: string; client_name: string; status: string }[] }),
  ]);
  const hits: SearchHit[] = [
    ...((tasks.data ?? []) as { id: string; title: string; status: string }[]).map((r) => ({ type: 'task' as const, id: r.id, title: r.title, sub: r.status, href: `/operations/tasks/${r.id}` })),
    ...((people.data ?? []) as unknown as { user_id: string; title: string | null; department: string | null; profile: { full_name: string } }[])
      .map((r) => ({ type: 'person' as const, id: r.user_id, title: r.profile.full_name, sub: [r.title, r.department].filter(Boolean).join(' · ') || null, href: `/people?person=${r.user_id}` })),
    ...((meetings.data ?? []) as { id: string; title: string; starts_at: string }[]).map((r) => ({ type: 'meeting' as const, id: r.id, title: r.title, sub: r.starts_at, href: `/scheduling/meetings/${r.id}` })),
    ...((invoices.data ?? []) as { id: string; number: string; client_name: string; status: string }[]).map((r) => ({ type: 'invoice' as const, id: r.id, title: `${r.number} · ${r.client_name}`, sub: r.status, href: `/operations/invoices/${r.id}` })),
  ];
  return json({ hits });
});

/** A value inside a PostgREST or() filter: double-quoted, so commas and brackets in the search can't change the filter. */
function pgrstQuote(v: string) {
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
