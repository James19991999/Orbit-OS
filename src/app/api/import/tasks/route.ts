import { z } from 'zod';
import { handler, json, parseBody, requireApiContext, audit, rateLimit, ApiError } from '@/lib/api';
import { EMAIL_RE } from '@/lib/import/table';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Row = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  assignee_email: z.string().trim().toLowerCase().regex(EMAIL_RE).max(254).nullable().optional(),
  due_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  status: z.enum(['todo', 'in_progress', 'in_review', 'blocked', 'done']),
  points: z.number().int().min(0).max(100),
  tags: z.array(z.string().trim().min(1).max(40)).max(10),
}).strict();
const Body = z.object({ rows: z.array(Row).min(1).max(500), sprint_id: z.string().uuid().nullable().optional() }).strict();

/** Bulk tasks from a spreadsheet. Created as the signed-in person, so row-level security applies exactly as in the app. */
export const POST = handler(async (req) => {
  const ctx = await requireApiContext({ roles: ['owner', 'director', 'contributor'], writable: true });
  await rateLimit('import-tasks', ctx.user.id, 10, 3600);
  const { rows, sprint_id } = await parseBody(req, Body);
  const { data: members, error: mErr } = await ctx.supabase.from('memberships').select('user_id, profile:profiles(email)').eq('org_id', ctx.org.id).eq('status', 'active');
  if (mErr) throw new ApiError(500, mErr.message);
  const byEmail = new Map(((members ?? []) as unknown as { user_id: string; profile: { email: string | null } | null }[])
    .filter((m) => m.profile?.email).map((m) => [m.profile!.email!.toLowerCase(), m.user_id]));
  const unknown = rows.findIndex((r) => r.assignee_email && !byEmail.has(r.assignee_email));
  if (unknown >= 0) throw new ApiError(400, `Row ${unknown + 2}: ${rows[unknown]!.assignee_email} is not a member of this workspace`);
  const { data, error } = await ctx.supabase.from('tasks').insert(rows.map((r) => ({
    org_id: ctx.org.id, sprint_id: sprint_id ?? null, title: r.title, description: r.description ?? null,
    assignee_id: r.assignee_email ? byEmail.get(r.assignee_email)! : null, due_on: r.due_on ?? null,
    priority: r.priority, status: r.status, points: r.points, tags: r.tags,
  }))).select('id');
  if (error) throw new ApiError(/row-level security/i.test(error.message) ? 403 : 500, /row-level security/i.test(error.message) ? 'Your role does not allow creating these tasks' : error.message);
  await audit(req, ctx.org.id, ctx.user.id, 'task.imported', { type: 'task' }, { count: data?.length ?? 0 });
  return json({ created: data?.length ?? 0 });
});
