'use client';
import { useMemo, useState } from 'react';
import { Button, Card, CardHeader, Icon, InlineError, Input, Textarea } from '@/components/ui';
import { errorMessage, postJson } from '@/hooks/useAction';
import { useT } from '@/i18n/client';

interface A { id: string; icon: string; title: string; body: string[]; keywords: string }

/** Search the articles, open one, or ask a question the assistant answers from them. */
export function HelpCenter({ articles, contact }: { articles: A[]; contact: string | null }) {
  const t = useT();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ answer: string | null; sources: string[] } | null>(null);

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    if (!words.length) return articles;
    return articles.filter((a) => {
      const hay = `${a.title} ${a.keywords} ${a.body.join(' ')}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [q, articles]);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (question.trim().length < 3) { setError(t('help.too_short')); return; }
    setBusy(true); setResult(null);
    try { setResult(await postJson<{ answer: string | null; sources: string[] }>('/api/help/ask', { question: question.trim() })); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };
  const byId = (id: string) => articles.find((a) => a.id === id);
  const jump = (id: string) => { setQ(''); setOpen(id); setTimeout(() => document.getElementById(`help-${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50); };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:items-start">
      <Card className="xl:col-span-5" aria-labelledby="help-ask-h">
        <CardHeader title={<span id="help-ask-h">{t('help.ask_t')}</span>} icon="support_agent" />
        <form onSubmit={ask} className="flex flex-col gap-3">
          <Textarea label={t('help.ask_t')} hideLabel placeholder={t('help.ask_ph')} value={question} maxLength={500} rows={3} onChange={(e) => setQuestion(e.target.value)} />
          <div><Button type="submit" icon="send" loading={busy}>{t('help.ask')}</Button></div>
        </form>
        <InlineError message={error} />
        <div aria-live="polite" className="mt-3 flex flex-col gap-3">
          {result && (
            <div className="rounded-lg border border-outline-variant p-4" data-testid="help-answer">
              {result.answer
                ? <><h3 className="mb-1 text-label-md">{t('help.answer')}</h3><p className="whitespace-pre-wrap text-body-md">{result.answer}</p></>
                : <p className="text-body-md">{t('help.not_covered')}</p>}
              {result.sources.length > 0 && (
                <div className="mt-3">
                  <p className="text-body-sm text-on-surface-variant">{result.answer ? t('help.sources') : t('help.related')}</p>
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {result.sources.map((id) => byId(id) && (
                      <li key={id}><button type="button" onClick={() => jump(id)} className="inline-flex items-center gap-1 rounded-full border border-outline-variant px-3 py-1 text-label-sm hover:bg-on-surface/5">
                        <Icon name={byId(id)!.icon} className="text-[16px]" />{byId(id)!.title}</button></li>
                    ))}
                  </ul>
                </div>
              )}
              {result.answer && <p className="mt-3 text-body-sm text-on-surface-variant">{t('help.ai_note')}</p>}
              {!result.answer && <p className="mt-3 text-body-sm text-on-surface-variant">{contact ? t('help.contact', { email: contact }) : t('help.contact_none')}</p>}
            </div>
          )}
        </div>
      </Card>

      <div className="flex flex-col gap-3 xl:col-span-7">
        <Input label={t('help.search')} hideLabel type="search" placeholder={t('help.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <p className="text-body-sm text-on-surface-variant" aria-live="polite">{q ? t('help.count', { count: shown.length }) : t('help.all')}</p>
        {shown.length === 0 && <p className="text-body-md text-on-surface-variant">{t('help.no_results')}</p>}
        <ul className="flex flex-col gap-2">
          {shown.map((a) => (
            <li key={a.id} id={`help-${a.id}`} className="scroll-mt-20">
              <details open={open === a.id} onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; setOpen((cur) => (o ? a.id : cur === a.id ? null : cur)); }}
                className="group rounded-lg border border-outline-variant bg-surface-container-lowest">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-label-md">
                  <Icon name={a.icon} className="text-secondary" />
                  <span className="flex-1">{a.title}</span>
                  <Icon name="expand_more" className="transition-transform group-open:rotate-180" />
                </summary>
                <div className="flex flex-col gap-2 px-4 pb-4 text-body-md text-on-surface-variant">
                  {a.body.map((p, i) => <p key={i}>{p}</p>)}
                </div>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
