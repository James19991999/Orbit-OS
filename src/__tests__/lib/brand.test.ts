import { brandCss, brandShades, contrast, hexToRgb } from '@/lib/brand';

const W: [number, number, number] = [255, 255, 255];
describe('brand colours', () => {
  it('parses only #rrggbb', () => {
    expect(hexToRgb('#2563eb')).toEqual([37, 99, 235]);
    expect(hexToRgb('red')).toBeNull();
    expect(hexToRgb('#fff')).toBeNull();
  });
  it.each(['#ffeb3b', '#2563eb', '#000000', '#ffffff', '#00ff00', '#be123c'])('keeps AA contrast for %s in both themes', (hex) => {
    const s = brandShades(hex)!;
    expect(contrast(s.container, W)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(s.lightText, [248, 250, 252])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(s.darkText, [11, 19, 38])).toBeGreaterThanOrEqual(4.5);
  });
  it('leaves an already-dark colour alone for buttons', () => {
    expect(brandShades('#1f2937')!.container).toEqual([31, 41, 55]);
  });
  it('emits CSS only for valid colours (no injection)', () => {
    expect(brandCss('#2563eb')).toContain('--c-primary-container:37 99 235');
    expect(brandCss('red;}</style><script>')).toBe('');
    expect(brandCss(null)).toBe('');
  });
});

import { TEMPLATES, addDays, templateRows } from '@/lib/templates';
describe('templates', () => {
  it('every task has a title in all three languages and sane values', () => {
    for (const tpl of TEMPLATES) {
      for (const l of ['en', 'sw', 'fr'] as const) { expect(tpl.name[l]).toBeTruthy(); expect(tpl.description[l]).toBeTruthy(); }
      for (const x of tpl.tasks) {
        for (const l of ['en', 'sw', 'fr'] as const) expect(x.title[l].length).toBeLessThanOrEqual(200);
        expect(x.points).toBeGreaterThanOrEqual(0);
      }
    }
  });
  it('dates count from the start date, including before it and across months', () => {
    expect(addDays('2026-11-01', 8)).toBe('2026-11-09');
    expect(addDays('2026-11-01', -10)).toBe('2026-10-22');
    expect(addDays('2026-12-25', 10)).toBe('2027-01-04');
  });
  it('builds rows in the chosen language', () => {
    const rows = templateRows(TEMPLATES.find((x) => x.id === 'kra')!, 'sw', '2026-11-01', { orgId: 'o', assigneeId: null, sprintId: null });
    expect(rows[0]).toMatchObject({ title: 'Wasilisha PAYE kwenye iTax', due_on: '2026-11-09', status: 'todo', org_id: 'o' });
  });
});
