/** Normalise Kenyan M-Pesa numbers to 2547XXXXXXXX / 2541XXXXXXXX. Returns null if invalid. */
export function normalizeKePhone(input: string): string | null {
  const digits = input.replace(/[\s\-()+]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  let n = digits;
  if (n.startsWith('254')) n = n.slice(3);
  else if (n.startsWith('0')) n = n.slice(1);
  if (!/^(7|1)\d{8}$/.test(n)) return null;
  return '254' + n;
}
