/** Only allow same-origin relative redirects ("/x", never "//evil.com" or "https://…"). */
export function safeNext(next: string | null | undefined, fallback = '/dashboard'): string {
  if (!next || typeof next !== 'string') return fallback;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}
