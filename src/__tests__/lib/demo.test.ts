import { DEMO, allowed, chaptersFor, linesFor, nextFor, screenFor } from '@/lib/demo/script';

describe('guided demo script', () => {
  it('every line exists in English, Kiswahili and French and is short enough to speak', () => {
    for (const s of DEMO) {
      expect(s.lines.length).toBeGreaterThan(0);
      for (const l of s.lines) for (const lang of ['en', 'sw', 'fr'] as const) {
        expect(l.text[lang].length).toBeGreaterThan(20);
        expect(l.text[lang].length).toBeLessThan(300);
      }
    }
    expect(new Set(DEMO.map((s) => s.id)).size).toBe(DEMO.length);
  });
  it('covers every main screen in the tour, in order, ending at Help', () => {
    const ids = chaptersFor('owner').map((s) => s.id);
    expect(ids).toEqual(['dashboard', 'my-day', 'operations', 'activity', 'finance', 'scheduling', 'culture', 'compliance', 'reports', 'people', 'leave', 'notifications', 'profile', 'settings', 'billing', 'audit', 'help']);
  });
  it('each person only gets chapters they can open', () => {
    const contributor = chaptersFor('contributor').map((s) => s.id);
    expect(contributor).not.toContain('finance');
    expect(contributor).not.toContain('billing');
    expect(contributor).not.toContain('audit');
    expect(chaptersFor('director').map((s) => s.id)).not.toContain('billing');
    expect(allowed(DEMO.find((s) => s.id === 'audit')!, 'auditor')).toBe(true);
    // "Next" skips what they can't open.
    expect(nextFor('activity', 'contributor')?.id).toBe('scheduling');
    expect(nextFor('activity', 'owner')?.id).toBe('finance');
    expect(nextFor('settings', 'director')?.id).toBe('audit');
    expect(nextFor('help', 'owner')).toBeUndefined();
  });
  it('opening a task, invoice, meeting, framework or channel explains it, then carries on from its list', () => {
    expect(screenFor('/operations/tasks/abc', '')?.id).toBe('task');
    expect(screenFor('/operations/invoices/abc', '')?.id).toBe('invoice');
    expect(screenFor('/scheduling/meetings/abc', '')?.id).toBe('meeting');
    expect(screenFor('/compliance/frameworks/abc', '')?.id).toBe('framework');
    expect(screenFor('/culture/channels/general', '')?.id).toBe('channel');
    expect(screenFor('/operations', 'tab=finance')?.id).toBe('finance');
    expect(screenFor('/people', 'tab=leave')?.id).toBe('leave');
    expect(nextFor('task', 'owner')?.id).toBe('activity');
    expect(screenFor('/founder', '')).toBeUndefined();
  });
  it('the “link is in the comments” sales line plays only for founders', () => {
    const help = DEMO.find((s) => s.id === 'help')!;
    expect(linesFor(help, true).some((l) => /comments/.test(l.text.en))).toBe(true);
    expect(linesFor(help, false).some((l) => /comments/.test(l.text.en))).toBe(false);
  });
});
