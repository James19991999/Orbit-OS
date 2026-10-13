/** @jest-environment node */
jest.mock('server-only', () => ({}));
import { trialStep, lapsedStep, isoWeek } from '@/lib/growth/rules';
import { ARTICLES, searchArticles } from '@/lib/help/articles';
import { makeT } from '@/i18n';

describe('trial follow-up timing', () => {
  const created = '2026-11-02'; const ends = '2026-11-16';
  it('welcome the next day, nudge on day 3, summary on day 7, notice 2 days before the end', () => {
    expect(trialStep(created, ends, '2026-11-02')).toBeNull();
    expect(trialStep(created, ends, '2026-11-03')).toBe('d1');
    expect(trialStep(created, ends, '2026-11-05')).toBe('d3');
    expect(trialStep(created, ends, '2026-11-09')).toBe('d7');
    expect(trialStep(created, ends, '2026-11-14')).toBe('ending');
    expect(trialStep(created, ends, '2026-11-16')).toBe('ending');
    expect(trialStep(created, ends, '2026-11-17')).toBeNull();
  });
  it('a short or extended trial still gets the ending notice', () => {
    expect(trialStep('2026-11-02', '2026-11-04', '2026-11-03')).toBe('ending');
  });
});

describe('lapsed plan follow-up', () => {
  const exp = '2026-11-01T12:00:00Z';
  it('next day, after a week, after 30 days, then stops', () => {
    expect(lapsedStep(exp, new Date('2026-11-01T20:00:00Z'))).toBeNull();
    expect(lapsedStep(exp, new Date('2026-11-02T13:00:00Z'))).toBe('l1');
    expect(lapsedStep(exp, new Date('2026-11-09T13:00:00Z'))).toBe('l7');
    expect(lapsedStep(exp, new Date('2026-12-02T13:00:00Z'))).toBe('l30');
    expect(lapsedStep(exp, new Date('2026-12-10T13:00:00Z'))).toBeNull();
  });
});

describe('weekly founder email', () => {
  it('ISO weeks, including the year boundary', () => {
    expect(isoWeek('2026-10-12')).toBe('2026-W42');
    expect(isoWeek('2026-12-31')).toBe('2026-W53');
    expect(isoWeek('2027-01-01')).toBe('2026-W53');
    expect(isoWeek('2027-01-04')).toBe('2027-W01');
    expect(isoWeek('2024-12-30')).toBe('2025-W01');
  });
});

describe('unsubscribe links', () => {
  beforeAll(() => { process.env.EMAIL_LINK_SECRET = 'test-secret-for-links'; });
  it('only the signed link for that person works', async () => {
    const { unsubscribeSig, verifyUnsubscribe } = await import('@/lib/growth');
    const a = '11111111-1111-1111-1111-111111111111'; const b = '22222222-2222-2222-2222-222222222222';
    expect(verifyUnsubscribe(a, unsubscribeSig(a))).toBe(true);
    expect(verifyUnsubscribe(b, unsubscribeSig(a))).toBe(false);
    expect(verifyUnsubscribe(a, 'x'.repeat(32))).toBe(false);
    expect(verifyUnsubscribe('not-a-uuid', unsubscribeSig(a))).toBe(false);
  });
});

describe('help centre', () => {
  it('every article exists in all three languages', () => {
    for (const a of ARTICLES) for (const l of ['en', 'sw', 'fr'] as const) {
      expect(a.title[l].length).toBeGreaterThan(3);
      expect(a.body[l].length).toBe(a.body.en.length);
    }
    expect(new Set(ARTICLES.map((a) => a.id)).size).toBe(ARTICLES.length);
  });
  it('search finds the right article in each language', () => {
    expect(searchArticles('How do I pay with M-Pesa?', 'en')[0]?.id).toBe('billing');
    expect(searchArticles('likizo makabidhiano', 'sw')[0]?.id).toBe('time-off');
    expect(searchArticles('double authentification', 'fr')[0]?.id).toBe('security');
    expect(searchArticles('zz', 'en')).toEqual([]);
  });
  it('the trial and payment emails are translated with plurals', () => {
    expect(makeT('sw')('email.trial.stat_members', { count: 1 })).toBe('mtu 1 katika eneo la kazi');
    expect(makeT('fr')('email.trial.stat_tasks', { count: 4 })).toBe('4 tâches');
  });
});

describe('help answers', () => {
  const OLD = { ...process.env };
  afterEach(() => { process.env = { ...OLD }; jest.restoreAllMocks(); });
  it('without AI, returns matching articles instead of an answer', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { answerQuestion } = await import('@/lib/help/ask');
    const r = await answerQuestion('How do I renew with M-Pesa?', 'en');
    expect(r.answer).toBeNull();
    expect(r.sources[0]).toBe('billing');
  });
  it('keeps only real article ids as sources, and treats NOT_COVERED as no answer', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    global.fetch = jest.fn() as unknown as typeof fetch;
    const reply = (text: string) => (global.fetch as jest.Mock).mockResolvedValueOnce(new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200 }));
    const { answerQuestion } = await import('@/lib/help/ask');
    reply('1. Open Settings.\n2. Choose Billing [billing].\nSOURCES: billing, made-up-id');
    const a = await answerQuestion('renew', 'en');
    expect(a).toEqual({ answer: '1. Open Settings.\n2. Choose Billing .', sources: ['billing'], answered: true });
    reply('NOT_COVERED');
    const b = await answerQuestion('best pizza in Nairobi', 'en');
    expect(b.answered).toBe(false);
    expect(b.answer).toBeNull();
  });
});
