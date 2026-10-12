// Turning a spreadsheet (CSV, pasted rows or Excel) into checked rows for import.
// Pure functions, shared by the browser preview and the server, which checks everything again.

export type Cell = string | number | boolean | Date | null | undefined;

/** CSV or pasted text → rows. Detects tab, semicolon or comma; handles quotes and line breaks inside quotes. */
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Any cell → trimmed text. Dates become yyyy-MM-dd. */
export function cellText(v: Cell): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : iso(v);
  return String(v).trim();
}

/** Dates as people type them: 2026-11-30, 30/11/2026 (day first, as in Kenya), 30.11.2026, or an Excel day number. */
export function parseDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  let y: number, mo: number, d: number;
  if (m) { y = +m[1]!; mo = +m[2]!; d = +m[3]!; }
  else if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) { d = +m[1]!; mo = +m[2]!; y = +m[3]!; }
  else if (/^\d{5}(\.\d+)?$/.test(s) && +s > 20000 && +s < 80000) return iso(new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86_400_000));
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? iso(dt) : null;
}

export const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/;
const norm = (s: string) => s.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export interface FieldDef { key: string; required?: boolean; synonyms: string[] }

export const PEOPLE_FIELDS: FieldDef[] = [
  { key: 'email', required: true, synonyms: ['email', 'e mail', 'email address', 'work email', 'mail', 'barua pepe', 'courriel', 'adresse e mail'] },
  { key: 'role', synonyms: ['role', 'access', 'permission', 'jukumu', 'nafasi'] },
  { key: 'job', synonyms: ['job title', 'title', 'position', 'job', 'designation', 'cheo', 'kazi', 'poste', 'fonction', 'intitule du poste'] },
  { key: 'department', synonyms: ['department', 'team', 'dept', 'unit', 'idara', 'timu', 'service', 'departement', 'equipe'] },
];

export const TASK_FIELDS: FieldDef[] = [
  { key: 'title', required: true, synonyms: ['title', 'task', 'task title', 'name', 'summary', 'jina', 'kazi', 'jina la kazi', 'titre', 'tache', 'titre de la tache'] },
  { key: 'description', synonyms: ['description', 'details', 'notes', 'maelezo', 'details de la tache'] },
  { key: 'assignee', synonyms: ['assignee', 'assignee email', 'owner', 'assigned to', 'email', 'mhusika', 'responsable', 'assigne a'] },
  { key: 'due', synonyms: ['due', 'due date', 'deadline', 'due on', 'tarehe', 'tarehe ya mwisho', 'echeance', 'date limite'] },
  { key: 'priority', synonyms: ['priority', 'kipaumbele', 'priorite'] },
  { key: 'status', synonyms: ['status', 'state', 'hali', 'statut', 'etat'] },
  { key: 'points', synonyms: ['points', 'story points', 'estimate', 'pointi', 'estimation'] },
  { key: 'tags', synonyms: ['tags', 'labels', 'lebo', 'etiquettes'] },
];

/** For each field, the index of the matching column (or -1). Each column is used once. */
export function autoMatch(headers: string[], fields: FieldDef[]): Record<string, number> {
  const h = headers.map(norm);
  const used = new Set<number>();
  const out: Record<string, number> = {};
  for (const exact of [true, false]) {
    for (const f of fields) {
      if (out[f.key] !== undefined && out[f.key]! >= 0) continue;
      const i = h.findIndex((x, idx) => !used.has(idx) && f.synonyms.some((s) => (exact ? x === s : x.includes(s) && s.length > 3)));
      if (i >= 0) { out[f.key] = i; used.add(i); }
    }
  }
  for (const f of fields) out[f.key] ??= -1;
  return out;
}

export interface Checked<T> { row: number; value: T | null; errors: string[] }

export interface PersonImport { email: string; role: 'director' | 'contributor' | 'auditor'; title: string | null; department: string | null }
const ROLES: Record<string, PersonImport['role']> = {
  director: 'director', directeur: 'director', directrice: 'director', manager: 'director', mkurugenzi: 'director', admin: 'director',
  contributor: 'contributor', member: 'contributor', contributeur: 'contributor', contributrice: 'contributor', membre: 'contributor', mwanachama: 'contributor', staff: 'contributor', employee: 'contributor',
  auditor: 'auditor', auditeur: 'auditor', auditrice: 'auditor', mkaguzi: 'auditor', viewer: 'auditor',
};

/** People rows → invites. Error codes are message keys (im.e.*). */
export function checkPeople(rows: Cell[][], map: Record<string, number>, existing: Set<string> = new Set()): Checked<PersonImport>[] {
  const seen = new Set<string>();
  return rows.map((r, i) => {
    const get = (k: string) => (map[k]! >= 0 ? cellText(r[map[k]!]) : '');
    const errors: string[] = [];
    const email = get('email').toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) errors.push('im.e.email');
    else if (seen.has(email)) errors.push('im.e.dup');
    else if (existing.has(email)) errors.push('im.e.member');
    seen.add(email);
    const roleText = norm(get('role'));
    const role = roleText ? ROLES[roleText] : 'contributor';
    if (!role) errors.push('im.e.role');
    const title = get('job').slice(0, 100) || null;
    const department = get('department').slice(0, 100) || null;
    return { row: i + 2, errors, value: errors.length ? null : { email, role: role!, title, department } };
  });
}

export interface TaskImport {
  title: string; description: string | null; assignee_email: string | null; due_on: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical'; status: 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done'; points: number; tags: string[];
}
const PRIORITY: Record<string, TaskImport['priority']> = {
  low: 'low', basse: 'low', faible: 'low', chini: 'low',
  medium: 'medium', normal: 'medium', moyenne: 'medium', wastani: 'medium', kati: 'medium',
  high: 'high', haute: 'high', elevee: 'high', juu: 'high',
  critical: 'critical', urgent: 'critical', critique: 'critical', dharura: 'critical',
};
const STATUS: Record<string, TaskImport['status']> = {
  todo: 'todo', 'to do': 'todo', open: 'todo', new: 'todo', 'a faire': 'todo', mpya: 'todo',
  'in progress': 'in_progress', doing: 'in_progress', started: 'in_progress', 'en cours': 'in_progress', inaendelea: 'in_progress',
  'in review': 'in_review', review: 'in_review', 'en revue': 'in_review', 'en verification': 'in_review',
  blocked: 'blocked', bloque: 'blocked', imekwama: 'blocked',
  done: 'done', complete: 'done', completed: 'done', closed: 'done', termine: 'done', imekamilika: 'done',
};

/** Task rows. Assignees must be members (checked by email); everything else gets sensible defaults when blank. */
export function checkTasks(rows: Cell[][], map: Record<string, number>, memberEmails?: Set<string>): Checked<TaskImport>[] {
  return rows.map((r, i) => {
    const get = (k: string) => (map[k]! >= 0 ? cellText(r[map[k]!]) : '');
    const errors: string[] = [];
    const title = get('title');
    if (!title || title.length > 200) errors.push('im.e.title');
    const assignee = get('assignee').toLowerCase() || null;
    if (assignee && (!EMAIL_RE.test(assignee) || (memberEmails && !memberEmails.has(assignee)))) errors.push('im.e.assignee');
    const dueText = get('due');
    const due = dueText ? parseDate(dueText) : null;
    if (dueText && !due) errors.push('im.e.due');
    const pText = norm(get('priority'));
    const priority = pText ? PRIORITY[pText] : 'medium';
    if (!priority) errors.push('im.e.priority');
    const sText = norm(get('status'));
    const status = sText ? STATUS[sText] : 'todo';
    if (!status) errors.push('im.e.status');
    const ptsText = get('points');
    const points = ptsText ? Number(ptsText) : 1;
    if (!Number.isInteger(points) || points < 0 || points > 100) errors.push('im.e.points');
    const tags = get('tags').split(/[,;#]/).map((s) => s.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean).slice(0, 10).map((s) => s.slice(0, 40));
    const description = get('description').slice(0, 5000) || null;
    return { row: i + 2, errors, value: errors.length ? null : { title, description, assignee_email: assignee, due_on: due, priority: priority!, status: status!, points, tags } };
  });
}

/** CSV templates offered for download (header row + one example). */
export const TEMPLATES = {
  people: 'email,role,job title,department\nwanjiru@example.co.ke,contributor,Accountant,Finance\n',
  tasks: 'title,description,assignee email,due date,priority,status,points,tags\nPrepare November payroll,Check overtime and deductions,wanjiru@example.co.ke,2026-11-25,high,todo,3,finance;payroll\n',
};
