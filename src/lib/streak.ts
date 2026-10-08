/** Consecutive days (ending today, or yesterday if today has none yet) with a check-in. */
export function streakFrom(dates: string[], today = new Date().toISOString().slice(0, 10)): number {
  const set = new Set(dates);
  let d = new Date(today + 'T00:00:00Z');
  if (!set.has(today)) d = new Date(d.getTime() - 86_400_000);
  let n = 0;
  while (set.has(d.toISOString().slice(0, 10))) { n++; d = new Date(d.getTime() - 86_400_000); }
  return n;
}
