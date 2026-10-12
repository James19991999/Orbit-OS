// @mentions in comments: find what's being typed, insert a name, and work out who was mentioned.
export interface Mentionable { id: string; name: string }

/** If the caret sits right after "@som", returns where the "@" is and the text typed after it. */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const m = text.slice(0, caret).match(/(^|[\s(])@([\p{L}\p{N}._'-]{0,30})$/u);
  if (!m) return null;
  return { start: caret - m[2]!.length - 1, query: m[2]! };
}

/** Replaces "@som" with "@Full Name " and returns the new text and caret position. */
export function insertMention(text: string, start: number, caret: number, name: string): { text: string; caret: number } {
  const insert = `@${name} `;
  return { text: text.slice(0, start) + insert + text.slice(caret), caret: start + insert.length };
}

/** People whose "@Full Name" appears in the text (longest names first, so "@Ann Marie" beats "@Ann"). */
export function extractMentions(text: string, people: Mentionable[]): string[] {
  const found = new Set<string>();
  let rest = text;
  for (const p of [...people].sort((a, b) => b.name.length - a.name.length)) {
    if (!p.name) continue;
    const tag = `@${p.name}`;
    if (rest.includes(tag)) { found.add(p.id); rest = rest.split(tag).join(' '); }
  }
  return [...found];
}

/** Splits text into plain parts and @mention parts for display. */
export function splitMentions(text: string, names: string[]): { text: string; mention: boolean }[] {
  const tags = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length).map((n) => `@${n}`);
  if (tags.length === 0) return [{ text, mention: false }];
  const re = new RegExp(`(${tags.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  return text.split(re).filter((s) => s !== '').map((s) => ({ text: s, mention: tags.includes(s) }));
}

/** Suggestions for "@query": names starting with it first, then names containing it. */
export function suggest(people: Mentionable[], query: string, limit = 6): Mentionable[] {
  const q = query.toLocaleLowerCase();
  const starts = people.filter((p) => p.name.toLocaleLowerCase().split(/\s+/).some((w) => w.startsWith(q)));
  const contains = people.filter((p) => !starts.includes(p) && p.name.toLocaleLowerCase().includes(q));
  return [...starts, ...contains].slice(0, limit);
}
