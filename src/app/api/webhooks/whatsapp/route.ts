import { type NextRequest } from 'next/server';
import { getAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { verifyWebhookSignature, isWhatsAppConfigured } from '@/lib/whatsapp/client';
import { extractMessages, handleInbound } from '@/lib/whatsapp/inbound';
import { reportError } from '@/lib/observability/report';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Meta's one-time subscription check: echo hub.challenge when the verify token matches. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === token) {
    return new Response(p.get('hub.challenge') ?? '', { status: 200, headers: { 'content-type': 'text/plain' } });
  }
  return new Response('Forbidden', { status: 403 });
}

/** Inbound messages. Signed with the app secret; every message is handled at most once. */
export async function POST(req: NextRequest) {
  if (!isWhatsAppConfigured() || !hasServiceRole()) return new Response('Not configured', { status: 503 });
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get('x-hub-signature-256'))) return new Response('Bad signature', { status: 401 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return new Response('Bad JSON', { status: 400 }); }
  const admin = getAdminClient();
  const results: string[] = [];
  for (const msg of extractMessages(body)) {
    try {
      results.push(await handleInbound(admin, msg));
    } catch (e) {
      // Let Meta retry this message: forget we saw it, and answer 500.
      await admin.from('whatsapp_inbound').delete().eq('wa_message_id', msg.id);
      reportError(e, { route: '/api/webhooks/whatsapp', method: 'POST' });
      console.error('[whatsapp] inbound failed', msg.id, (e as Error).message);
      return new Response('Retry', { status: 500 });
    }
  }
  return Response.json({ ok: true, handled: results });
}
