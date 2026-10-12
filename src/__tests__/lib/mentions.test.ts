import { mentionQuery, insertMention, extractMentions, splitMentions, suggest } from '@/lib/mentions';

const people = [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Ann Marie' }, { id: 'c', name: 'Wanjiru Njeri' }];

describe('mentions', () => {
  it('detects an @ being typed, only at a word start', () => {
    expect(mentionQuery('Hi @wan', 7)).toEqual({ start: 3, query: 'wan' });
    expect(mentionQuery('@', 1)).toEqual({ start: 0, query: '' });
    expect(mentionQuery('mail me at me@x', 15)).toBeNull();
    expect(mentionQuery('Hi @wan there', 13)).toBeNull();
  });
  it('inserts the full name and moves the caret after it', () => {
    expect(insertMention('Hi @wan!', 3, 7, 'Wanjiru Njeri')).toEqual({ text: 'Hi @Wanjiru Njeri !', caret: 18 });
  });
  it('finds who was mentioned, preferring the longest name', () => {
    expect(extractMentions('Thanks @Ann Marie and @Wanjiru Njeri', people).sort()).toEqual(['b', 'c']);
    expect(extractMentions('Thanks @Ann', people)).toEqual(['a']);
    expect(extractMentions('No mentions', people)).toEqual([]);
  });
  it('splits text for highlighting', () => {
    expect(splitMentions('Ping @Ann Marie now', ['Ann', 'Ann Marie'])).toEqual([
      { text: 'Ping ', mention: false }, { text: '@Ann Marie', mention: true }, { text: ' now', mention: false },
    ]);
  });
  it('suggests by first or last name', () => {
    expect(suggest(people, 'nj').map((p) => p.id)).toEqual(['c']);
    expect(suggest(people, 'mar').map((p) => p.id)).toEqual(['b']);
  });
});

import { weekdaysBetween, annualBalance, awayOn } from '@/lib/leave';
describe('leave', () => {
  it('counts Monday–Friday only, inclusive', () => {
    expect(weekdaysBetween('2026-11-02', '2026-11-08')).toBe(5);
    expect(weekdaysBetween('2026-11-07', '2026-11-08')).toBe(0);
    expect(weekdaysBetween('2026-12-31', '2027-01-01')).toBe(2);
    expect(weekdaysBetween('bad', '2026-01-01')).toBe(0);
  });
  it('computes the annual balance for this year only', () => {
    const b = annualBalance([
      { kind: 'annual', status: 'approved', starts_on: '2026-03-02', days: 5 },
      { kind: 'annual', status: 'pending', starts_on: '2026-12-21', days: 4 },
      { kind: 'sick', status: 'approved', starts_on: '2026-04-01', days: 2 },
      { kind: 'annual', status: 'approved', starts_on: '2025-12-01', days: 3 },
      { kind: 'annual', status: 'declined', starts_on: '2026-05-01', days: 3 },
    ], 21, 2026);
    expect(b).toEqual({ allowance: 21, used: 5, pending: 4, left: 12 });
  });
  it('knows who is away on a date', () => {
    expect(awayOn([{ user_id: 'u', starts_on: '2026-11-02', ends_on: '2026-11-06' }], 'u', '2026-11-04')).toBe(true);
    expect(awayOn([{ user_id: 'u', starts_on: '2026-11-02', ends_on: '2026-11-06' }], 'u', '2026-11-07')).toBe(false);
  });
});
