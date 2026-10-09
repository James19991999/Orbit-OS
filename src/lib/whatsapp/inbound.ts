import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isLanguage, makeT, type Language, type MessageKey } from '@/i18n';
import { formatMoney, type Currency } from '@/lib/format';
import { localeForCurrency } from '@/lib/locale';
import { sendText } from './client';

/** One message from Meta's webhook payload (entry[].changes[].value.messages[]). */
export interface InboundMessage {
  id: string;
  from: string;
  type: string;
  text?: { body?: string };
  button?: { payload?: string; text?: string };
  interactive?: { type?: string; button_reply?: { id?: string; title?: string } };
}

/** Pulls messages out of a webhook body; ignores delivery/read statuses. */
export function extractMessages(body: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  const entries = (body as { entry?: unknown[] } | null)?.entry;
  if (!Array.isArray(entries)) return out;
  for (const e of entries) {
    for (const c of ((e as { changes?: unknown[] }).changes ?? [])) {
      const msgs = (c as { value?: { messages?: InboundMessage[] } }).value?.messages;
      if (Array.isArray(msgs)) for (const m of msgs) if (m && typeof m.id === 'string' && typeof m.from === 'string') out.push(m);
    }
  }
  return out;
}

export type Command = 'stop' | 'start' | 'help' | null;
export function parseCommand(text: string): Command {
  const t = text.trim().toLowerCase().replace(/[.!]+$/, '');
  if (['stop', 'unsubscribe', 'acha', 'simama', 'arrêt', 'arret'].includes(t)) return 'stop';
  if (['start', 'anza', 'démarrer', 'demarrer'].includes(t)) return 'start';
  if (['help', 'msaada', 'aide', '?'].includes(t)) return 'help';
  return null;
}

/**
 * "4 Shipped the invoice export. Blockers: waiting on API keys" →
 * { mood: 4, shipped: 'Shipped the invoice export.', blockers: 'waiting on API keys' }.
 * Mood defaults to 3 when no leading 1–5 is given. Blockers marker works in English, Kiswahili, French.
 */
export function parseCheckin(text: string): { shipped: string; blockers: string | null; mood: number } {
  let t = text.trim();
  let mood = 3;
  const m = /^([1-5])(?:\s*\/\s*5)?[\s.:,-]+/.exec(t);
  if (m) { mood = Number(m[1]); t = t.slice(m[0].length); }
  const split = /\s*(?:\n|^|\s)(?:blockers?|blocked|vikwazo|kikwazo|blocages?|bloqu[ée]s?)\s*[:\-–]\s*/i.exec(t);
  let shipped = t; let blockers: string | null = null;
  if (split) { shipped = t.slice(0, split.index).trim(); blockers = t.slice(split.index + split[0].length).trim() || null; }
  if (blockers && /^(none|no|nothing|hakuna|aucun|rien)\.?$/i.test(blockers)) blockers = null;
  return { shipped: shipped.trim(), blockers, mood };
}

/** Button payload "exp:approved:<uuid>" → decision. Anything else → null. */
export function parseExpensePayload(p: string | undefined): { decision: 'approved' | 'rejected'; id: string } | null {
  const m = /^exp:(approved|rejected):([0-9a-f-]{36})$/.exec(p ?? '');
  return m ? { decision: m[1] as 'approved' | 'rejected', id: m[2]! } : null;
}

interface Person { userId: string; name: string; language: Language }

async function personByPhone(admin: SupabaseClient, phone: string): Promise<Person | null> {
  const { data } = await admin.from('whatsapp_links').select('user_id').eq('phone', phone).maybeSingle();
  if (!data) return null;
  const { data: p } = await admin.from('profiles').select('full_name, language').eq('id', data.user_id).maybeSingle();
  return { userId: data.user_id, name: (p?.full_name || '').split(' ')[0] || '', language: isLanguage(p?.language) ? p!.language : 'en' };
}

/**
 * Handles one inbound message and returns what it was treated as. Replies go out as free-form
 * text, which WhatsApp allows because the person just messaged us.
 */
export async function handleInbound(admin: SupabaseClient, msg: InboundMessage, reply: (to: string, text: string) => Promise<unknown> = sendText): Promise<string> {
  // Idempotency: Meta retries webhooks; process each message id once.
  const { error: dup } = await admin.from('whatsapp_inbound').insert({ wa_message_id: msg.id, from_phone: msg.from });
  if (dup) return dup.code === '23505' ? 'duplicate' : `error:${dup.message}`;

  const person = await personByPhone(admin, msg.from);
  const mark = (handled: string) => admin.from('whatsapp_inbound').update({ handled_as: handled, user_id: person?.userId ?? null }).eq('wa_message_id', msg.id).then(() => handled);
  if (!person) { await reply(msg.from, makeT('en')('wa.unknown_number')); return mark('unknown_number'); }
  const t = makeT(person.language);
  const say = (key: MessageKey, vars?: Record<string, string | number>) => reply(msg.from, t(key, vars));

  // Button taps (template quick replies arrive as type "button"; interactive replies as "interactive").
  const payload = msg.button?.payload ?? msg.interactive?.button_reply?.id;
  const exp = parseExpensePayload(payload);
  if (exp) {
    const { data: row } = await admin.from('finance_entries').select('amount_minor, currency, vendor, category').eq('id', exp.id).maybeSingle();
    const { data: result, error } = await admin.rpc('decide_expense_as', { p_user: person.userId, p_expense: exp.id, p_decision: exp.decision });
    if (error) throw new Error(error.message);
    const what = row ? `${formatMoney(Number(row.amount_minor), row.currency as Currency, { locale: localeForCurrency(row.currency as Currency) })} · ${row.vendor ?? row.category ?? ''}`.replace(/ · $/, '') : '';
    const keyFor: Record<string, MessageKey> = {
      approved: 'wa.expense.approved', rejected: 'wa.expense.rejected', already_approved: 'wa.expense.already_approved',
      already_rejected: 'wa.expense.already_rejected', forbidden: 'wa.expense.forbidden', own_expense: 'wa.expense.own',
      not_found: 'wa.expense.not_found', read_only: 'wa.expense.read_only',
    };
    await say(keyFor[String(result)] ?? 'wa.expense.not_found', { what });
    return mark(`expense:${result}`);
  }

  const text = msg.text?.body ?? (msg.type === 'button' ? msg.button?.text : undefined);
  if (!text) { await say('wa.unsupported'); return mark('unsupported'); }

  const cmd = parseCommand(text);
  if (cmd === 'help') { await say('wa.help'); return mark('help'); }
  if (cmd === 'stop' || cmd === 'start') {
    const on = cmd === 'start';
    await admin.from('profiles').update({ whatsapp_checkins: on, whatsapp_approvals: on }).eq('id', person.userId);
    await say(on ? 'wa.started' : 'wa.stopped');
    return mark(cmd);
  }

  // Otherwise: a check-in. Use the workspace of the latest reminder (24h), else the only eligible one.
  const parsed = parseCheckin(text);
  if (parsed.shipped.length < 3) { await say('wa.checkin.too_short'); return mark('checkin:too_short'); }
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data: prompt } = await admin.from('whatsapp_prompts').select('org_id').eq('user_id', person.userId).eq('kind', 'checkin').gte('created_at', since).order('created_at', { ascending: false }).limit(1).maybeSingle();
  let orgId = prompt?.org_id as string | undefined;
  if (!orgId) {
    const { data: ms } = await admin.from('memberships').select('org_id').eq('user_id', person.userId).eq('status', 'active').neq('role', 'auditor');
    if (!ms?.length) { await say('wa.checkin.no_org'); return mark('checkin:no_org'); }
    if (ms.length > 1) { await say('wa.checkin.which_org'); return mark('checkin:ambiguous'); }
    orgId = ms[0]!.org_id as string;
  }
  const { data: org } = await admin.from('organizations').select('name').eq('id', orgId).maybeSingle();
  const { data: result, error } = await admin.rpc('checkin_as', { p_user: person.userId, p_org: orgId, p_shipped: parsed.shipped, p_blockers: parsed.blockers, p_mood: parsed.mood });
  if (error) throw new Error(error.message);
  if (result === 'saved') await say('wa.checkin.saved', { name: person.name, org: org?.name ?? '', mood: parsed.mood });
  else if (result === 'read_only') await say('wa.checkin.read_only', { org: org?.name ?? '' });
  else await say('wa.checkin.no_org');
  return mark(`checkin:${result}`);
}
