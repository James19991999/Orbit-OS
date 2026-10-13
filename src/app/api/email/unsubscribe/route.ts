import { NextResponse, type NextRequest } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { verifyUnsubscribe } from '@/lib/growth';
import { appUrl } from '@/lib/env';
import { escapeHtml } from '@/lib/email';
import { isLanguage, makeT } from '@/i18n';

export const dynamic = 'force-dynamic';

/**
 * "Stop tips and follow-up emails" from an email footer. The link is signed per person, so it can't change anyone
 * else's settings. Opening the link only shows a confirm button (email scanners that pre-open links change nothing);
 * the button posts back here. Payment and account emails are not affected.
 */
async function languageOf(userId: string) {
  try {
    const { data } = await getAdminClient().from('profiles').select('language').eq('id', userId).maybeSingle();
    return data?.language && isLanguage(data.language) ? data.language : 'en';
  } catch { return 'en'; }
}

function page(lang: string, title: string, body: string, status: number) {
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>OrbitOS</title></head>
<body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;color:#0f172a"><main style="max-width:480px;margin:64px auto;padding:0 16px">
<h1 style="font-size:22px">${escapeHtml(title)}</h1>${body}</main></body></html>`;
  return new NextResponse(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u') ?? '';
  const s = req.nextUrl.searchParams.get('s') ?? '';
  const valid = (() => { try { return verifyUnsubscribe(u, s); } catch { return false; } })();
  const lang = valid ? await languageOf(u) : 'en';
  const t = makeT(lang as 'en');
  if (!valid) return page(lang, t('unsub.bad'), `<p><a href="${escapeHtml(appUrl())}/profile" style="color:#1d4ed8">${escapeHtml(t('unsub.back'))}</a></p>`, 400);
  return page(lang, t('email.unsubscribe'),
    `<p style="color:#334155">${escapeHtml(t('unsub.body'))}</p><form method="post"><input type="hidden" name="u" value="${escapeHtml(u)}"><input type="hidden" name="s" value="${escapeHtml(s)}">`
    + `<button type="submit" style="background:#1d4ed8;color:#fff;border:0;border-radius:4px;padding:10px 18px;font-weight:600;font-size:15px;cursor:pointer">${escapeHtml(t('email.unsubscribe'))}</button></form>`, 200);
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const u = String(form?.get('u') ?? ''); const s = String(form?.get('s') ?? '');
  let ok = false;
  try {
    if (verifyUnsubscribe(u, s)) {
      const { data } = await getAdminClient().from('profiles').update({ product_emails: false }).eq('id', u).select('id').maybeSingle();
      ok = !!data;
    }
  } catch (e) { console.error('[unsubscribe]', (e as Error).message); }
  const lang = ok ? await languageOf(u) : 'en';
  const t = makeT(lang as 'en');
  return page(lang, ok ? t('unsub.title') : t('unsub.bad'),
    `${ok ? `<p style="color:#334155">${escapeHtml(t('unsub.body'))}</p>` : ''}<p><a href="${escapeHtml(appUrl())}/profile" style="color:#1d4ed8">${escapeHtml(t('unsub.back'))}</a></p>`, ok ? 200 : 400);
}
