import { parseDelimited, parseDate, autoMatch, checkPeople, checkTasks, PEOPLE_FIELDS, TASK_FIELDS, cellText } from '@/lib/import/table';

describe('parseDelimited', () => {
  it('handles commas, quotes, escaped quotes and line breaks inside quotes', () => {
    expect(parseDelimited('a,b\n"x, y","he said ""hi"""\n"line1\nline2",z\n')).toEqual([['a', 'b'], ['x, y', 'he said "hi"'], ['line1\nline2', 'z']]);
  });
  it('detects tabs (pasted from Excel) and semicolons (European CSV), ignores blank lines and BOM', () => {
    expect(parseDelimited('﻿a\tb\r\n1\t2\r\n\r\n')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseDelimited('a;b\n1,5;2')).toEqual([['a', 'b'], ['1,5', '2']]);
  });
});

describe('parseDate', () => {
  it('accepts ISO, day-first and Excel serial dates; rejects impossible ones', () => {
    expect(parseDate('2026-11-30')).toBe('2026-11-30');
    expect(parseDate('30/11/2026')).toBe('2026-11-30');
    expect(parseDate('1.2.2027')).toBe('2027-02-01');
    expect(parseDate('46356')).toBe('2026-11-30');
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseDate('next week')).toBeNull();
    expect(cellText(new Date(Date.UTC(2026, 10, 30)))).toBe('2026-11-30');
  });
});

describe('autoMatch', () => {
  it('matches English, Kiswahili and French headers', () => {
    expect(autoMatch(['Barua pepe', 'Cheo', 'Idara', 'Jukumu'], PEOPLE_FIELDS)).toEqual({ email: 0, job: 1, department: 2, role: 3 });
    expect(autoMatch(['Titre', 'Échéance', 'Priorité', 'Responsable'], TASK_FIELDS)).toMatchObject({ title: 0, due: 1, priority: 2, assignee: 3, status: -1 });
    expect(autoMatch(['Task', 'Assignee Email', 'Due date'], TASK_FIELDS)).toMatchObject({ title: 0, assignee: 1, due: 2 });
  });
});

describe('checkPeople', () => {
  it('validates emails and roles, flags duplicates and existing members, defaults to contributor', () => {
    const map = { email: 0, role: 1, job: 2, department: -1 };
    const r = checkPeople([['A@x.co', '', 'Dev'], ['bad', 'director'], ['a@x.co', 'auditor'], ['b@x.co', 'boss'], ['c@x.co', 'Directeur'], ['m@x.co', '']], map, new Set(['m@x.co']));
    expect(r[0]).toMatchObject({ row: 2, value: { email: 'a@x.co', role: 'contributor', title: 'Dev', department: null } });
    expect(r[1]!.errors).toEqual(['im.e.email']);
    expect(r[2]!.errors).toEqual(['im.e.dup']);
    expect(r[3]!.errors).toEqual(['im.e.role']);
    expect(r[4]!.value?.role).toBe('director');
    expect(r[5]!.errors).toEqual(['im.e.member']);
  });
});

describe('checkTasks', () => {
  it('fills defaults, maps words for priority/status and checks assignees', () => {
    const map = { title: 0, description: -1, assignee: 1, due: 2, priority: 3, status: 4, points: 5, tags: 6 };
    const members = new Set(['w@x.co']);
    const r = checkTasks([
      ['Payroll', 'W@x.co', '25/11/2026', 'Haute', 'en cours', '3', 'Finance; Pay Roll'],
      ['Plain', '', '', '', '', '', ''],
      ['', 'z@x.co', 'soon', 'meh', 'maybe', '200', ''],
    ], map, members);
    expect(r[0]!.value).toEqual({ title: 'Payroll', description: null, assignee_email: 'w@x.co', due_on: '2026-11-25', priority: 'high', status: 'in_progress', points: 3, tags: ['finance', 'pay-roll'] });
    expect(r[1]!.value).toMatchObject({ priority: 'medium', status: 'todo', points: 1, assignee_email: null, due_on: null });
    expect(r[2]!.errors.sort()).toEqual(['im.e.assignee', 'im.e.due', 'im.e.points', 'im.e.priority', 'im.e.status', 'im.e.title']);
  });
});
