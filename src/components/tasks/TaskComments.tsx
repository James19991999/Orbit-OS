'use client';
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, Button, Icon, TimeAgo, cn, useToast } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap } from '@/hooks/useAction';
import { extractMentions, insertMention, mentionQuery, splitMentions, suggest, type Mentionable } from '@/lib/mentions';
import { useT } from '@/i18n/client';

export interface CommentView { id: string; created_at: string; author_id: string | null; body: string }
interface Person extends Mentionable { avatar: string | null }

export function TaskComments({ orgId, taskId, userId, comments, people, canComment, canModerate }: {
  orgId: string; taskId: string; userId: string; comments: CommentView[]; people: Person[]; canComment: boolean; canModerate: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const listId = useId();
  const inputId = useId();
  const box = useRef<HTMLTextAreaElement>(null);
  const caretAfter = useRef<number | null>(null);
  const [text, setText] = useState('');
  const [q, setQ] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const [local, setLocal] = useState<CommentView[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const byId = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);
  const names = useMemo(() => people.map((p) => p.name), [people]);
  const options = q ? suggest(people.filter((p) => p.id !== userId), q.query) : [];
  const shown = [...comments, ...local.filter((l) => !comments.some((c) => c.id === l.id))].filter((c) => !hidden.has(c.id));

  const post = useAction(async () => {
    const body = text.trim();
    if (!body) return null;
    if (body.length > 4000) throw new Error(t('cm.too_long'));
    const row = unwrap(await requireBrowserClient().from('task_comments')
      .insert({ org_id: orgId, task_id: taskId, body, mentions: extractMentions(body, people) })
      .select('id, created_at, author_id, body').single()) as CommentView;
    setLocal((l) => [...l, row]);
    setText('');
    setQ(null);
    router.refresh();
    return row;
  }, { success: t('cm.posted') });

  const remove = async (id: string) => {
    setHidden((h) => new Set(h).add(id));
    const { error } = await requireBrowserClient().from('task_comments').delete().eq('id', id);
    if (error) { setHidden((h) => { const n = new Set(h); n.delete(id); return n; }); toast(error.message, 'error'); return; }
    toast(t('cm.deleted'), 'success');
    router.refresh();
  };

  const onType = (value: string, caret: number) => {
    setText(value);
    const next = mentionQuery(value, caret);
    setQ(next);
    setActive(0);
  };
  const pick = (p: Mentionable) => {
    if (!q || !box.current) return;
    const r = insertMention(text, q.start, box.current.selectionStart ?? text.length, p.name);
    caretAfter.current = r.caret;
    setText(r.text);
    setQ(null);
  };
  // Put the caret right after the inserted name before the next keystroke lands.
  useLayoutEffect(() => {
    if (caretAfter.current === null || !box.current) return;
    box.current.focus();
    box.current.setSelectionRange(caretAfter.current, caretAfter.current);
    caretAfter.current = null;
  }, [text]);

  return (
    <section id="comments" aria-labelledby="comments-h" className="card scroll-mt-24 p-5">
      <h2 id="comments-h" className="flex items-center gap-2 text-headline-sm"><Icon name="forum" />{t('cm.title')} {shown.length > 0 && <span className="text-body-md text-on-surface-variant tnum">({shown.length})</span>}</h2>
      {shown.length === 0
        ? <p className="mt-3 text-body-md text-on-surface-variant">{t('cm.empty')}</p>
        : (
          <ul className="mt-4 flex flex-col gap-4">
            {shown.map((c) => {
              const who = c.author_id ? byId[c.author_id] : undefined;
              const name = who?.name ?? t('cm.former');
              return (
                <li key={c.id} className="flex gap-3">
                  <Avatar name={name} src={who?.avatar} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-body-sm">
                      <span className="text-label-md text-on-surface">{name}</span>
                      <TimeAgo date={c.created_at} className="text-on-surface-variant" />
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-body-md">
                      {splitMentions(c.body, names).map((s, i) => s.mention
                        ? <span key={i} className="rounded bg-primary-container/15 px-0.5 font-medium text-primary">{s.text}</span>
                        : <span key={i}>{s.text}</span>)}
                    </p>
                  </div>
                  {(c.author_id === userId || canModerate) && (
                    <button type="button" onClick={() => void remove(c.id)} aria-label={t('cm.delete')} title={t('cm.delete')}
                      className="self-start rounded p-1 text-on-surface-variant hover:bg-on-surface/5 hover:text-alert">
                      <Icon name="delete" className="text-[18px]" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

      {canComment ? (
        <form className="relative mt-5 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void post.run(); }}>
          <label htmlFor={inputId} className="sr-only">{t('cm.label')}</label>
          <textarea
            ref={box} id={inputId} rows={3} value={text} maxLength={4000} placeholder={t('cm.placeholder')}
            className="w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface placeholder:text-outline focus:border-primary-container focus:shadow-focus focus:outline-none"
            role="combobox" aria-autocomplete="list" aria-expanded={options.length > 0} aria-controls={listId}
            aria-activedescendant={options.length > 0 ? `${listId}-${active}` : undefined}
            onChange={(e) => onType(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onClick={(e) => setQ(mentionQuery(text, e.currentTarget.selectionStart ?? text.length))}
            onKeyDown={(e) => {
              if (options.length > 0) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % options.length); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + options.length) % options.length); return; }
                if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(options[active]!); return; }
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setQ(null); return; }
              }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void post.run(); }
            }}
          />
          {options.length > 0 && (
            <ul id={listId} role="listbox" aria-label={t('cm.mentions')}
              className="absolute left-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-lg border border-outline-variant bg-surface-container-high py-1 shadow-l2">
              {options.map((p, i) => (
                <li key={p.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
                  onMouseDown={(e) => { e.preventDefault(); pick(p); }} onMouseEnter={() => setActive(i)}
                  className={cn('flex cursor-pointer items-center gap-2 px-3 py-2 text-body-md', i === active && 'bg-primary-container/15')}>
                  <Avatar name={p.name} src={byId[p.id]?.avatar} size={24} />{p.name}
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end">
            <Button type="submit" icon="send" size="sm" loading={post.pending} disabled={!text.trim()}>{t('cm.post')}</Button>
          </div>
        </form>
      ) : <p className="mt-4 text-body-sm text-on-surface-variant">{t('cm.read_only')}</p>}
    </section>
  );
}
