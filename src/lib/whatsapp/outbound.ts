import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isLanguage, type Language } from '@/i18n';
import { formatMoney, type Currency } from '@/lib/format';
import { localeForCurrency } from '@/lib/locale';
import { isWhatsAppConfigured, sendTemplate, TEMPLATES } from './client';

interface Linked { userId: string; phone: string; language: Language; firstName: string; checkins: boolean; approvals: boolean }

/** WhatsApp-linked people among `userIds`, with their preferences. */
export async function linkedUsers(admin: SupabaseClient, userIds: string[]): Promise<Map<string, Linked>> {
  const out = new Map<string, Linked>();
  if (!userIds.length || !isWhatsAppConfigured()) return out;
  const [{ data: links }, { data: profs }] = await Promise.all([
    admin.from('whatsapp_links').select('user_id, phone').in('user_id', userIds),
    admin.from('profiles').select('id, full_name, language, whatsapp_checkins, whatsapp_approvals').in('id', userIds),
  ]);
  const byId = new Map((profs ?? []).map((p) => [p.id as string, p]));
  for (const l of links ?? []) {
    const p = byId.get(l.user_id as string);
    out.set(l.user_id as string, {
      userId: l.user_id as string, phone: l.phone as string, language: isLanguage(p?.language) ? p!.language : 'en',
      firstName: String(p?.full_name ?? '').split(' ')[0] || 'there', checkins: p?.whatsapp_checkins !== false, approvals: p?.whatsapp_approvals !== false,
    });
  }
  return out;
}

/** Check-in reminder ("Hi {1}, time for your {2} check-in…"). Records the prompt so a reply maps to this workspace. */
export async function sendCheckinReminder(admin: SupabaseClient, person: Linked, org: { id: string; name: string }) {
  await sendTemplate(person.phone, TEMPLATES.checkin, person.language, [person.firstName, org.name]);
  await admin.from('whatsapp_prompts').insert({ user_id: person.userId, org_id: org.id, kind: 'checkin' });
}

/**
 * Asks every other owner/director with WhatsApp approvals on to approve a pending expense.
 * Template body: "{1} logged an expense of {2} for {3} in {4}." + quick replies [Approve, Reject].
 */
export async function requestExpenseApprovals(admin: SupabaseClient, expenseId: string): Promise<{ sent: number; reason?: string }> {
  if (!isWhatsAppConfigured()) return { sent: 0, reason: 'not_configured' };
  const { data: e } = await admin.from('finance_entries').select('id, org_id, amount_minor, currency, vendor, category, approval_status, created_by').eq('id', expenseId).maybeSingle();
  if (!e || e.approval_status !== 'pending') return { sent: 0, reason: 'not_pending' };
  const [{ data: org }, { data: approvers }, { data: creator }] = await Promise.all([
    admin.from('organizations').select('name').eq('id', e.org_id).maybeSingle(),
    admin.from('memberships').select('user_id').eq('org_id', e.org_id).eq('status', 'active').in('role', ['owner', 'director']).neq('user_id', e.created_by ?? '00000000-0000-0000-0000-000000000000'),
    admin.from('profiles').select('full_name').eq('id', e.created_by ?? '').maybeSingle(),
  ]);
  const people = await linkedUsers(admin, (approvers ?? []).map((a) => a.user_id as string));
  let sent = 0;
  const amount = formatMoney(Number(e.amount_minor), e.currency as Currency, { locale: localeForCurrency(e.currency as Currency) });
  for (const p of people.values()) {
    if (!p.approvals) continue;
    try {
      await sendTemplate(p.phone, TEMPLATES.approval, p.language,
        [creator?.full_name || 'A teammate', amount, (e.vendor || e.category || '—') as string, org?.name ?? ''],
        { buttons: [`exp:approved:${e.id}`, `exp:rejected:${e.id}`] });
      await admin.from('whatsapp_prompts').insert({ user_id: p.userId, org_id: e.org_id, kind: 'approval', ref_id: e.id });
      sent++;
    } catch (err) {
      console.error('[whatsapp] approval request failed', (err as Error).message);
    }
  }
  return { sent };
}
