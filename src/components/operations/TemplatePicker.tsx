'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dialog, Icon, Input, Select, cn } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap } from '@/hooks/useAction';
import { TEMPLATES, addDays, templateRows } from '@/lib/templates';
import { useFormat } from '@/lib/locale/client';
import { useLang, useT } from '@/i18n/client';
import type { PersonOption } from './TaskDialog';

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

/** "Use a template": pick a ready-made list, a start date and (optionally) who does it, then create all the tasks. */
export function TemplatePicker({ orgId, people, sprints, activeSprintId }:
  { orgId: string; people: PersonOption[]; sprints: { id: string; name: string }[]; activeSprintId: string | null }) {
  const t = useT();
  const lang = useLang();
  const fmt = useFormat();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [id, setId] = useState(TEMPLATES[0]!.id);
  const [start, setStart] = useState(today());
  const [assignee, setAssignee] = useState('');
  const [sprint, setSprint] = useState(activeSprintId ?? '');
  const tpl = TEMPLATES.find((x) => x.id === id)!;
  const rows = useMemo(() => templateRows(tpl, lang, /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : today(), { orgId, assigneeId: assignee || null, sprintId: sprint || null }), [tpl, lang, start, orgId, assignee, sprint]);
  const create = useAction(async () => {
    unwrap(await requireBrowserClient().from('tasks').insert(rows).select('id'));
    return true;
  }, { success: t('tpl.created', { n: rows.length, name: tpl.name[lang] }) });

  return (
    <>
      <Button size="sm" variant="secondary" icon="library_add" onClick={() => setOpen(true)}>{t('tpl.button')}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} wide title={t('tpl.title')} description={t('tpl.sub')}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button icon="playlist_add" loading={create.pending} onClick={async () => { if ((await create.run()) !== undefined) { setOpen(false); router.refresh(); } }}>{t('tpl.create', { count: rows.length })}</Button></>}>
        <div className="flex flex-col gap-4">
          <fieldset>
            <legend className="mb-2 text-label-md">{t('tpl.choose')}</legend>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
              {TEMPLATES.map((x) => (
                <label key={x.id} className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors focus-within:ring-2 focus-within:ring-primary-container',
                  x.id === id ? 'border-primary-container bg-primary-container/10' : 'border-outline-variant hover:bg-on-surface/5')}>
                  <input type="radio" name="template" value={x.id} checked={x.id === id} onChange={() => setId(x.id)} className="sr-only" />
                  <Icon name={x.icon} className="mt-0.5 text-secondary" />
                  <span className="min-w-0">
                    <span className="block text-label-md">{x.name[lang]}</span>
                    <span className="mt-0.5 block text-body-sm text-on-surface-variant">{x.description[lang]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label={t('tpl.start')} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            <Select label={t('tpl.assignee')} value={assignee} onChange={(e) => setAssignee(e.target.value)}
              options={[{ value: '', label: t('tpl.nobody') }, ...people.map((p) => ({ value: p.id, label: p.name }))]} />
            <Select label={t('tpl.sprint')} value={sprint} onChange={(e) => setSprint(e.target.value)}
              options={[{ value: '', label: t('tpl.backlog') }, ...sprints.map((s) => ({ value: s.id, label: s.name }))]} />
          </div>
          <ol className="divide-y divide-outline-variant rounded border border-outline-variant" aria-label={tpl.name[lang]}>
            {tpl.tasks.map((x, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2 text-body-sm">
                <span className="w-24 shrink-0 text-on-surface-variant tnum">{fmt.date(addDays(rows[i]!.due_on, 0))}</span>
                <span className="min-w-0 flex-1">{x.title[lang]}</span>
              </li>
            ))}
          </ol>
        </div>
      </Dialog>
    </>
  );
}
