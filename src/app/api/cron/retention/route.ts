import { handler, json, requireCronSecret } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** Daily housekeeping: audit-log retention, expired challenges/invites, and workspaces past their offboarding date. */
export const GET = handler(async (req) => {
  requireCronSecret(req);
  const admin = getAdminClient();
  const purged = await admin.rpc('purge_audit_log');
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const quarterAgo = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const halfYearAgo = new Date(Date.now() - 180 * 86_400_000).toISOString();
  const [ch, inv, df, trash, hq] = await Promise.all([
    admin.from('webauthn_challenges').delete().lt('created_at', hourAgo).select('id'),
    admin.from('invites').delete().lt('expires_at', monthAgo).select('id'),
    admin.from('delivery_failures').delete().lt('created_at', quarterAgo).select('id'),
    admin.from('task_trash').delete().lt('deleted_at', dayAgo).select('task_id'), // undo window is 10 minutes
    // Help-centre questions are kept 180 days (absent before update_growth.sql: then this just reports 0).
    admin.from('help_questions').delete().lt('created_at', halfYearAgo).select('id').then((r) => r, () => ({ data: [] as { id: string }[] })),
  ]);
  const { data: doomed } = await admin.from('organizations').select('id, slug').eq('status', 'offboarding').lt('deletion_scheduled_at', new Date().toISOString());
  let deleted = 0;
  const failures: string[] = [];
  for (const o of doomed ?? []) {
    for (const bucket of ['evidence', 'vault'] as const) {
      const { data: files } = await admin.storage.from(bucket).list(o.id, { limit: 1000 });
      if (files?.length) await admin.storage.from(bucket).remove(files.map((f) => `${o.id}/${f.name}`));
    }
    const del = await admin.from('organizations').delete().eq('id', o.id); // cascades to every tenant table
    if (del.error) failures.push(`${o.slug}: ${del.error.message}`); else deleted++;
  }
  return json({ auditPurged: purged.data ?? 0, challenges: ch.data?.length ?? 0, invites: inv.data?.length ?? 0, deliveryFailures: df.data?.length ?? 0, deletedTasks: trash.data?.length ?? 0, helpQuestions: hq.data?.length ?? 0, workspacesDeleted: deleted, failures });
});
