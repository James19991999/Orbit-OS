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
