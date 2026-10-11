import { translate, coverage, LANGUAGES } from '@/i18n';
import { en } from '@/i18n/en';
import { sw } from '@/i18n/sw';
import { fr } from '@/i18n/fr';

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('i18n dictionaries', () => {
  it('translate every key into Kiswahili and French', () => {
    expect(coverage('sw')).toBe(1);
    expect(coverage('fr')).toBe(1);
    expect(LANGUAGES.map((l) => l.value)).toEqual(['en', 'sw', 'fr']);
  });
  it('keep the same {placeholders} in every language', () => {
    const bad: string[] = [];
    for (const [k, v] of Object.entries(en)) {
      for (const [lang, d] of [['sw', sw], ['fr', fr]] as const) {
        const tr = (d as Record<string, string>)[k];
        if (tr && JSON.stringify(vars(tr)) !== JSON.stringify(vars(v))) bad.push(`${lang}:${k}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('have no empty strings or leftover English in key UI strings', () => {
    for (const d of [sw, fr] as Record<string, string>[]) {
      expect(Object.values(d).every((v) => v.trim().length > 0)).toBe(true);
      expect(d['auth.sign_in']).not.toBe(en['auth.sign_in']);
      expect(d['checkin.save']).not.toBe(en['checkin.save']);
    }
  });
  it('use the singular form when count is 1', () => {
    expect(translate('en', 'net.sent', { count: 1 })).toBe('Sent 1 check-in saved while you were offline');
    expect(translate('en', 'net.sent', { count: 3 })).toBe('Sent 3 check-ins saved while you were offline');
    expect(translate('fr', 'pay.show', { count: 1 })).toBe('Afficher 1 paiement');
    expect(translate('sw', 'pay.summary', { total: 'KSh 10', count: 1, creator: 'Amina' })).toBe('KSh 10 · mtu 1 · yameandaliwa na Amina');
  });
});

import { makeFormatter } from '@/lib/locale';
describe('dates in Kiswahili and French', () => {
  const now = new Date('2026-10-11T09:00:00Z');
  it('uses the language’s month and weekday names, day first', () => {
    expect(makeFormatter('en-US', 'UTC', 'en').date('2026-10-08', 'long')).toBe('October 8, 2026');
    expect(makeFormatter('en-US', 'UTC', 'sw').date('2026-10-08', 'long')).toBe('8 Oktoba 2026');
    expect(makeFormatter('en-KE', 'UTC', 'fr').date('2026-02-08')).toBe('8 févr. 2026');
    expect(makeFormatter('en-US', 'Africa/Nairobi', 'fr').date('2026-10-08T15:30:00Z', 'datetime')).toBe('8 oct. 2026, 18:30');
    expect(makeFormatter('en-KE', 'Africa/Nairobi', 'sw').slot('2026-10-12T06:00:00Z')).toBe('Jtt 12 Okt · 09:00');
    expect(makeFormatter('en-KE', 'Europe/Paris', 'fr').slot('2026-10-12T06:00:00Z', undefined, false)).toBe('lun. 08:00');
  });
  it('says relative times in the language', () => {
    const at = (s: number) => new Date(now.getTime() + s * 1000);
    expect(makeFormatter('en-KE', 'UTC', 'en').relative(at(-300), now)).toBe('5 minutes ago');
    expect(makeFormatter('en-KE', 'UTC', 'en').relative(at(-86400), now)).toBe('yesterday');
    expect(makeFormatter('en-KE', 'UTC', 'sw').relative(at(-7200), now)).toBe('saa 2 zilizopita');
    expect(makeFormatter('en-KE', 'UTC', 'sw').relative(at(86400), now)).toBe('kesho');
    expect(makeFormatter('en-KE', 'UTC', 'fr').relative(at(-300), now)).toBe('il y a 5 min');
    expect(makeFormatter('en-KE', 'UTC', 'fr').relative(at(3 * 86400), now)).toBe('dans 3 jours');
    expect(makeFormatter('en-KE', 'UTC', 'fr').relative(at(10), now)).toBe('à l’instant');
  });
});
