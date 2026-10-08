export type ControlStatus = 'passing' | 'failing' | 'in_review' | 'not_started' | 'not_applicable';

export function readiness(controls: { status: ControlStatus }[]) {
  const applicable = controls.filter((c) => c.status !== 'not_applicable');
  const passing = applicable.filter((c) => c.status === 'passing').length;
  const inReview = applicable.filter((c) => c.status === 'in_review').length;
  const failing = applicable.filter((c) => c.status === 'failing').length;
  const notStarted = applicable.filter((c) => c.status === 'not_started').length;
  return {
    total: applicable.length,
    passing,
    inReview,
    failing,
    notStarted,
    pct: applicable.length ? Math.round((passing / applicable.length) * 1000) / 10 : 0,
  };
}

export function daysUntil(date: string | null, today: Date = new Date()): number | null {
  if (!date) return null;
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const [y, m, d] = date.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - t) / 86_400_000);
}
