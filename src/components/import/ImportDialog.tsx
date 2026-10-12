'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dialog, Icon, Select, Textarea, cn, useToast } from '@/components/ui';
import { postJson, errorMessage } from '@/hooks/useAction';
import {
  autoMatch, checkPeople, checkTasks, parseDelimited, PEOPLE_FIELDS, TASK_FIELDS, TEMPLATES, cellText,
  type Cell, type Checked, type PersonImport, type TaskImport,
} from '@/lib/import/table';
import type { MessageKey } from '@/i18n/shared';
import { useT } from '@/i18n/client';

type Kind = 'people' | 'tasks';
const LIMIT: Record<Kind, number> = { people: 200, tasks: 500 };
const FIELD_LABEL: Record<string, MessageKey> = {
  email: 'im.f.email', role: 'im.f.role', job: 'im.f.job', department: 'im.f.department',
  title: 'im.f.title', description: 'im.f.description', assignee: 'im.f.assignee', due: 'im.f.due',
  priority: 'im.f.priority', status: 'im.f.status', points: 'im.f.points', tags: 'im.f.tags',
};

/**
 * Import from Excel (.xlsx), CSV or rows pasted from a spreadsheet: match columns, check every row, then import
 * the good ones. The server checks everything again.
 */
export function ImportButton({ kind, memberEmails, seatsFree }: { kind: Kind; memberEmails: string[]; seatsFree?: number }) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [table, setTable] = useState<Cell[][] | null>(null);
  const [map, setMap] = useState<Record<string, number>>({});
  const [paste, setPaste] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fields = kind === 'people' ? PEOPLE_FIELDS : TASK_FIELDS;
  const members = useMemo(() => new Set(memberEmails.map((e) => e.toLowerCase())), [memberEmails]);

  const load = (rows: Cell[][]) => {
    setErr(null);
    const clean = rows.filter((r) => r.some((c) => cellText(c) !== ''));
    if (clean.length < 2) { setTable(null); setErr(t('im.err_empty')); return; }
    if (clean.length - 1 > LIMIT[kind]) { setTable(null); setErr(t('im.too_many').replace('500', String(LIMIT[kind]))); return; }
    setTable(clean);
    setMap(autoMatch(clean[0]!.map((c) => cellText(c)), fields));
  };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (/\.xlsx$/i.test(file.name)) {
        const { readSheet } = await import('read-excel-file/browser');
        load((await readSheet(file)) as Cell[][]);
      } else {
        load(parseDelimited(await file.text()));
      }
    } catch { setTable(null); setErr(t('im.err_parse')); }
  };

  const checked: Checked<PersonImport | TaskImport>[] = useMemo(() => {
    if (!table) return [];
    const rows = table.slice(1);
    return kind === 'people' ? checkPeople(rows, map, members) : checkTasks(rows, map, members);
  }, [table, map, kind, members]);
  const ok = checked.filter((c) => c.value);
  const bad = checked.filter((c) => !c.value);
  const overSeats = kind === 'people' && seatsFree !== undefined && ok.length > seatsFree;

  const reset = () => { setTable(null); setPaste(''); setErr(null); };
  const submit = async () => {
    setBusy(true);
    try {
      const rows = ok.map((c) => c.value);
      const r = await postJson<{ created: number; emailed?: number }>(`/api/import/${kind}`, { rows });
      toast(kind === 'people' ? `${t('im.done_people', { n: r.created })}. ${r.emailed ? t('im.emailed') : t('im.not_emailed')}` : t('im.done_tasks', { n: r.created }), 'success');
      setOpen(false); reset(); router.refresh();
    } catch (e) {
      const m = errorMessage(e).match(/^seats:(\d+)$/);
      toast(m ? t('im.seats', { n: m[1]! }) : errorMessage(e), 'error');
    } finally { setBusy(false); }
  };
  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATES[kind])}`;
  const headers = table?.[0]?.map((c) => cellText(c)) ?? [];

  return (
    <>
      <Button size="sm" variant="secondary" icon="upload_file" onClick={() => setOpen(true)}>{t(kind === 'people' ? 'im.people' : 'im.tasks')}</Button>
      <Dialog open={open} onClose={() => { setOpen(false); reset(); }} wide title={t(kind === 'people' ? 'im.title_people' : 'im.title_tasks')} description={t('im.intro')}
        footer={<>
          <Button variant="ghost" onClick={() => { setOpen(false); reset(); }}>{t('common.cancel')}</Button>
          <Button icon="upload" loading={busy} disabled={!table || ok.length === 0 || overSeats} onClick={() => void submit()}>{t('im.import', { count: ok.length })}</Button>
        </>}>
        <div className="flex flex-col gap-4">
          {!table && (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <label className="flex flex-col gap-1.5 text-label-sm text-on-surface-variant">
                  {t('im.file')}
                  <input type="file" accept=".xlsx,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(e) => void onFile(e.target.files?.[0])}
                    className="text-body-md text-on-surface file:mr-3 file:rounded file:border file:border-outline-variant file:bg-surface-container file:px-3 file:py-1.5 file:text-label-md file:text-on-surface" />
                </label>
                <a href={template} download={`orbitos-${kind}-template.csv`} className="inline-flex items-center gap-1 text-label-md text-primary hover:underline"><Icon name="download" className="text-[18px]" />{t('im.template')}</a>
              </div>
              <Textarea label={t('im.paste')} rows={4} value={paste} onChange={(e) => setPaste(e.target.value)}
                onBlur={() => { if (paste.trim()) load(parseDelimited(paste)); }}
                onPaste={(e) => { const text = e.clipboardData.getData('text'); if (text.trim()) { e.preventDefault(); setPaste(text); load(parseDelimited(text)); } }} />
            </>
          )}
          {err && <p role="alert" className="text-body-sm text-alert">{err}</p>}
          {table && (
            <>
              <fieldset>
                <legend className="mb-2 text-label-md">{t('im.columns')}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {fields.map((f) => (
                    <Select key={f.key} label={`${t(FIELD_LABEL[f.key]!)}${f.required ? ' *' : ''}`} value={String(map[f.key] ?? -1)}
                      onChange={(e) => setMap({ ...map, [f.key]: Number(e.target.value) })}
                      options={[{ value: '-1', label: t('im.ignore') }, ...headers.map((h, i) => ({ value: String(i), label: h || `#${i + 1}` }))]} />
                  ))}
                </div>
              </fieldset>
              <section aria-labelledby="im-prev-h">
                <h3 id="im-prev-h" className="text-label-md">{t('im.preview')}</h3>
                <p className="mt-1 text-body-sm tnum" aria-live="polite">{t('im.summary', { ok: ok.length, bad: bad.length })}</p>
                {overSeats && <p role="alert" className="mt-1 text-body-sm text-alert">{t('im.seats', { n: seatsFree! })}</p>}
                <ul className="mt-2 max-h-64 divide-y divide-outline-variant overflow-y-auto rounded border border-outline-variant">
                  {[...bad, ...ok].slice(0, 100).map((c) => {
                    const v = c.value as (PersonImport & TaskImport) | null;
                    return (
                      <li key={c.row} className={cn('flex items-start gap-2 px-3 py-2 text-body-sm', !v && 'bg-alert/5')}>
                        <Icon name={v ? 'check_circle' : 'error'} className={cn('text-[18px]', v ? 'text-healthy' : 'text-alert')} />
                        <span className="w-16 shrink-0 text-on-surface-variant">{t('im.row', { n: c.row })}</span>
                        <span className="min-w-0 flex-1">
                          {v ? <span className="truncate">{kind === 'people' ? `${v.email} · ${v.role}${v.title ? ` · ${v.title}` : ''}` : `${v.title}${v.assignee_email ? ` · ${v.assignee_email}` : ''}${v.due_on ? ` · ${v.due_on}` : ''}`}</span>
                            : c.errors.map((e) => t(e as MessageKey)).join(' · ')}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
              <Button size="sm" variant="ghost" icon="restart_alt" onClick={reset} className="self-start">{t('im.again')}</Button>
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}
