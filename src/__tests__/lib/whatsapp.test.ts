/** @jest-environment node */
import { createHmac } from 'node:crypto';
jest.mock('server-only', () => ({}));
import { normalizeWhatsAppPhone, verifyWebhookSignature, maskPhone } from '@/lib/whatsapp/client';
import { parseCheckin, parseCommand, parseExpensePayload, extractMessages } from '@/lib/whatsapp/inbound';
import { translate, resolveLanguage, coverage } from '@/i18n';

describe('WhatsApp phone numbers', () => {
  it('normalises Kenyan local, international and 00 formats', () => {
    expect(normalizeWhatsAppPhone('0712 345 678')).toBe('254712345678');
    expect(normalizeWhatsAppPhone('+254 712-345-678')).toBe('254712345678');
    expect(normalizeWhatsAppPhone('+1 (415) 555-0100')).toBe('14155550100');
    expect(normalizeWhatsAppPhone('0044 20 7946 0958')).toBe('442079460958');
    expect(normalizeWhatsAppPhone('12345')).toBeNull();
    expect(normalizeWhatsAppPhone('+0 123 456 789')).toBeNull();
    expect(normalizeWhatsAppPhone('call me')).toBeNull();
    expect(maskPhone('254712345678')).toBe('+2547 ••• ••• 678');
  });
});

describe('webhook signature', () => {
  const OLD = process.env.WHATSAPP_APP_SECRET;
  beforeAll(() => { process.env.WHATSAPP_APP_SECRET = 'shh'; });
  afterAll(() => { process.env.WHATSAPP_APP_SECRET = OLD; });
  const body = '{"entry":[]}';
  const good = 'sha256=' + createHmac('sha256', 'shh').update(body).digest('hex');
  it('accepts a correct HMAC-SHA256 and rejects everything else', () => {
    expect(verifyWebhookSignature(body, good)).toBe(true);
    expect(verifyWebhookSignature(body + ' ', good)).toBe(false);
    expect(verifyWebhookSignature(body, 'sha256=' + 'a'.repeat(64))).toBe(false);
    expect(verifyWebhookSignature(body, 'sha1=abc')).toBe(false);
    expect(verifyWebhookSignature(body, null)).toBe(false);
  });
});

describe('check-in replies', () => {
  it('reads mood, shipped and blockers', () => {
    expect(parseCheckin('4 Shipped the invoice export. Blockers: waiting on API keys')).toEqual({ mood: 4, shipped: 'Shipped the invoice export.', blockers: 'waiting on API keys' });
    expect(parseCheckin('5/5 - closed 3 deals')).toEqual({ mood: 5, shipped: 'closed 3 deals', blockers: null });
    expect(parseCheckin('Fixed login bug\nBlockers: none')).toEqual({ mood: 3, shipped: 'Fixed login bug', blockers: null });
    expect(parseCheckin('Nimemaliza ripoti. Vikwazo: hakuna')).toEqual({ mood: 3, shipped: 'Nimemaliza ripoti.', blockers: null });
    expect(parseCheckin('2 Revue du code. Blocages : accès VPN')).toEqual({ mood: 2, shipped: 'Revue du code.', blockers: 'accès VPN' });
    expect(parseCheckin('2026 roadmap drafted').mood).toBe(3); // a year is not a mood
  });
  it('recognises commands in three languages', () => {
    expect(parseCommand('STOP')).toBe('stop');
    expect(parseCommand('acha')).toBe('stop');
    expect(parseCommand('Aide')).toBe('help');
    expect(parseCommand('start.')).toBe('start');
    expect(parseCommand('stop the build')).toBeNull();
  });
  it('accepts only well-formed expense payloads', () => {
    const id = '7b3c9a1e-2f4d-4c5b-9a8e-1d2c3b4a5f6e';
    expect(parseExpensePayload(`exp:approved:${id}`)).toEqual({ decision: 'approved', id });
    expect(parseExpensePayload(`exp:rejected:${id}`)).toEqual({ decision: 'rejected', id });
    expect(parseExpensePayload(`exp:deleted:${id}`)).toBeNull();
    expect(parseExpensePayload(`exp:approved:${id}; drop table`)).toBeNull();
    expect(parseExpensePayload(undefined)).toBeNull();
  });
  it('extracts messages and ignores status callbacks', () => {
    const body = { entry: [{ changes: [{ value: { statuses: [{ id: 'x', status: 'read' }] } }, { value: { messages: [{ id: 'wamid.1', from: '254712345678', type: 'text', text: { body: 'hi' } }] } }] }] };
    expect(extractMessages(body).map((m) => m.id)).toEqual(['wamid.1']);
    expect(extractMessages(null)).toEqual([]);
    expect(extractMessages({ entry: 'nope' })).toEqual([]);
  });
});

describe('i18n core', () => {
  it('translates with placeholders and falls back to English', () => {
    expect(translate('sw', 'wa.checkin.saved', { name: 'Amina', org: 'Acme', mood: 4 })).toBe('Asante Amina! Ripoti yako ya leo kwa Acme imehifadhiwa. Hali 4/5.');
    expect(translate('fr', 'wa.expense.rejected', { what: '$5.00' })).toBe('Refusée : $5.00.');
    expect(translate('en', 'wa.stopped')).toMatch(/Send START/);
  });
  it('resolves language from cookie or Accept-Language', () => {
    expect(resolveLanguage('sw')).toBe('sw');
    expect(resolveLanguage(undefined, 'fr-FR,fr;q=0.9,en;q=0.8')).toBe('fr');
    expect(resolveLanguage('de', 'de-DE')).toBe('en');
  });
  it('has every WhatsApp message translated', () => {
    expect(coverage('sw')).toBe(1);
    expect(coverage('fr')).toBe(1);
  });
});
