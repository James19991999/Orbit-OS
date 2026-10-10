import type { Metadata } from 'next';
import Link from '@/components/ui/SmartLink';
import { notFound } from 'next/navigation';
import { requireAppContext } from '@/lib/context';
import { loadMembers, must } from '@/lib/data/members';
import { readiness, daysUntil } from '@/lib/compliance/readiness';
import { can } from '@/lib/roles';
import { Card, Icon, Pill, ProgressBar } from '@/components/ui';
import { ControlsTable } from '@/components/compliance/ControlsTable';
import type { Framework, Control, Evidence } from '@/lib/types';

export const metadata: Metadata = { title: 'Framework' };

export default async function FrameworkPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { supabase, org, role } = await requireAppContext();
  const { data } = await supabase.from('compliance_frameworks').select('*').eq('id', params.id).eq('org_id', org.id).maybeSingle();
  if (!data) notFound();
  const fw = data as Framework;
  const [ctrl, ev, members] = await Promise.all([
    supabase.from('compliance_controls').select('*').eq('framework_id', fw.id).order('ref'),
    supabase.from('compliance_evidence').select('*').eq('org_id', org.id).order('created_at', { ascending: false }),
    loadMembers(supabase, org.id),
  ]);
  const controls = must(ctrl, 'controls') as Control[];
  const r = readiness(controls);
  const days = daysUntil(fw.target_date);
  return (
    <div className="flex flex-col gap-4">
      <Link href="/compliance" className="flex items-center gap-1 text-label-md text-primary hover:underline"><Icon name="arrow_back" className="text-[18px]" />Compliance</Link>
      <Card glow>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-headline-lg-mobile md:text-headline-lg">{fw.name}</h1>
            {fw.description && <p className="text-body-md text-on-surface-variant">{fw.description}</p>}
          </div>
          <Pill tone={r.pct >= 95 ? 'healthy' : r.pct >= 70 ? 'warning' : 'alert'}>{r.pct}% ready</Pill>
        </div>
        <div className="mt-4"><ProgressBar value={r.passing} max={r.total} label="Controls passing" tone="healthy" /></div>
        <p className="mt-2 text-body-sm text-on-surface-variant tnum">{r.passing}/{r.total} passing · {r.failing} failing · {r.inReview} in review · {r.notStarted} not started{days !== null ? ` · audit in ${days} days` : ''}</p>
      </Card>
      <Card>
        <ControlsTable orgId={org.id} controls={controls} evidence={must(ev, 'evidence') as Evidence[]} people={members.map((m) => ({ id: m.user_id, name: m.profile.full_name }))} canManage={can.manage(role)} />
      </Card>
    </div>
  );
}
