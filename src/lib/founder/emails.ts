/** Platform operators: FOUNDER_EMAILS, comma- or space-separated. Empty = nobody has the Founder Console. */
export function parseFounderEmails(raw: string | undefined): string[] {
  return (raw ?? '').split(/[,\s;]+/).map((s) => s.trim().toLowerCase()).filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
}
export function isFounderEmail(email: string | null | undefined, raw = process.env.FOUNDER_EMAILS): boolean {
  if (!email) return false;
  return parseFounderEmails(raw).includes(email.trim().toLowerCase());
}
