/** Shared Pomodoro state derived from a single started_at, so every client shows the same timer. */
export function focusState(startedAt: string | null, focusMin: number, breakMin: number, rounds: number, now = Date.now()) {
  if (!startedAt) return { active: false as const };
  const cycle = (focusMin + breakMin) * 60_000;
  const elapsed = now - new Date(startedAt).getTime();
  if (elapsed < 0) return { active: false as const };
  const round = Math.floor(elapsed / cycle) + 1;
  if (round > rounds) return { active: false as const, finished: true };
  const into = elapsed % cycle;
  const inFocus = into < focusMin * 60_000;
  const remainingMs = inFocus ? focusMin * 60_000 - into : cycle - into;
  return { active: true as const, round, rounds, inFocus, remainingMs };
}

export function mmss(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
