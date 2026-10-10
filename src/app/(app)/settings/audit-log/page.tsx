import type { Metadata } from 'next';
import Link from '@/components/ui/SmartLink';
import { requireAppContext } from '@/lib/context';
import { loadMembers, nameMap, must } from '@/lib/data/members';
import { can } from '@/lib/roles';
import { auditLabel, auditTargetLabel } from '@/lib/audit-labels';
import { Card, Icon, Banner, EmptyState } from '@/components/ui';
import type { AuditEntry } from '@/lib/types';

export const metadata: Metadata = { title: 'Audit log' };
const PAGE = 50;

export default async function AuditLogPage(props: { searchParams: Promise<{ q?: string; actor?: string; from?: string; to?: string; page?: string }> }) {
  const searchParams = await props.searchParams;
  const { supabase, org, role } = await requireAppContext();
  if (!can.seeAudit(role)) return <Banner tone="info">The audit log is visible to owners, directors and auditors.</Banner>;
  const page = Math.max(0, Number(searchParams.page) || 0);
  let q = supabase.from('audit_log').select('*', { count: 'exact' }).eq('org_id', org.id).order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
  if (searchParams.q) q = q.ilike('action', `%${searchParams.q.replace(/[%_]/g, '')}%`);
  if (searchParams.actor) q = q.eq('actor_id', searchParams.actor);
  if (searchParams.from) q = q.gte('created_at', searchParams.from);
  if (searchParams.to) q = q.lte('created_at', `${searchParams.to}T23:59:59Z`);
  const [res, members] = await Promise.all([q, loadMembers(supabase, org.id)]);
  const rows = must(res, 'audit log') as AuditEntry[];
  const people = nameMap(members);
  const qs = new URLSearchParams(Object.entries(searchParams).filter(([k, v]) => v && k !== 'page') as [string, string][]);
  return (
    <div className="flex flex-col gap-5">
      <Link href="/settings" className="flex items-center gap-1 text-label-md text-primary hover:underline"><Icon name="arrow_back" className="text-[18px]" />Settings</Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-headline-lg-mobile md:text-headline-lg">Audit log</h1><p className="text-body-md text-on-surface-variant">Append-only · retained {org.audit_retention_years} years · {res.count ?? 0} events</p></div>
        <a href={`/api/audit/export?${qs}`} className="inline-flex h-10 items-center gap-2 rounded border border-outline-variant bg-surface-container-high px-4 text-label-md"><Icon name="download" className="text-[18px]" />Export CSV</a>
      </div>
      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" method="get">
        <label className="flex flex-col gap-1.5 text-label-sm text-on-surface-variant">Action contains<input name="q" defaultValue={searchParams.q} className="h-10 rounded border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface" /></label>
        <label className="flex flex-col gap-1.5 text-label-sm text-on-surface-variant">Actor
          <select name="actor" defaultValue={searchParams.actor ?? ''} className="h-10 rounded border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface">
            <option value="">Anyone</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.profile.full_name}</option>)}
          </select></label>
        <label className="flex flex-col gap-1.5 text-label-sm text-on-surface-variant">From<input type="date" name="from" defaultValue={searchParams.from} className="h-10 rounded border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface" /></label>
        <label className="flex flex-col gap-1.5 text-label-sm text-on-surface-variant">To<input type="date" name="to" defaultValue={searchParams.to} className="h-10 rounded border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface" /></label>
        <div className="flex items-end"><button type="submit" className="h-10 rounded bg-primary-container px-4 text-label-md text-white">Filter</button></div>
      </form>
      <Card>
        {rows.length === 0 ? <EmptyState icon="history" title="No events match" /> : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-left text-body-md">
              <thead><tr className="border-b border-outline-variant text-label-xs uppercase text-on-surface-variant"><th scope="col" className="py-2 pr-3">When (UTC)</th><th scope="col" className="py-2 pr-3">Event</th><th scope="col" className="py-2 pr-3">Actor</th><th scope="col" className="py-2 pr-3">Target</th><th scope="col" className="py-2">IP</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-outline-variant align-top last:border-0">
                    <td className="py-2 pr-3 tnum text-on-surface-variant">{r.created_at.slice(0, 16).replace('T', ' ')}</td>
                    <td className="py-2 pr-3"><span className={r.action.includes('failed') ? 'text-alert' : ''}>{auditLabel(r.action)}</span><span className="block font-mono text-body-sm text-on-surface-variant">{r.action}</span></td>
                    <td className="py-2 pr-3">{r.actor_id ? people[r.actor_id]?.name ?? 'Former member' : 'System'}</td>
                    <td className="py-2 pr-3 text-body-sm">{auditTargetLabel(r.target_type)}{r.target_type === 'membership' && r.target_id && people[r.target_id] ? `: ${people[r.target_id].name}` : ''}
                      {Object.keys(r.metadata ?? {}).length > 0 && <details><summary className="cursor-pointer text-primary">details</summary><pre className="relative max-w-md overflow-x-auto whitespace-pre-wrap break-all text-body-sm">{JSON.stringify(r.metadata, null, 1)}</pre></details>}</td>
                    <td className="py-2 font-mono text-body-sm text-on-surface-variant">{r.ip ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 flex justify-between">
          {page > 0 ? <Link href={`?${qs}&page=${page - 1}`} className="text-primary hover:underline">← Newer</Link> : <span />}
          {(res.count ?? 0) > (page + 1) * PAGE && <Link href={`?${qs}&page=${page + 1}`} className="text-primary hover:underline">Older →</Link>}
        </div>
      </Card>
    </div>
  );
}
