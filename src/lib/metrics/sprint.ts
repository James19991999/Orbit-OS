export interface SprintLike { starts_on: string; ends_on: string; committed_points: number }
export interface TaskLike { status: string; points: number; completed_at?: string | null; due_on?: string | null; priority?: string }

const DAY = 86_400_000;
const dateUtc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));

export function sprintProgress(sprint: SprintLike, tasks: TaskLike[], now: Date = new Date()) {
  const start = dateUtc(sprint.starts_on);
  const end = dateUtc(sprint.ends_on) + DAY; // inclusive end date
  const totalDays = Math.round((end - start) / DAY);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = Math.min(totalDays, Math.max(1, Math.floor((today - start) / DAY) + 1));
  const elapsedFraction = Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
  const committed = sprint.committed_points > 0 ? sprint.committed_points : tasks.reduce((a, t) => a + t.points, 0);
  const done = tasks.filter((t) => t.status === 'done').reduce((a, t) => a + t.points, 0);
  const pct = committed ? Math.round((done / committed) * 100) : 0;
  const expected = committed * elapsedFraction;
  const blocked = tasks.filter((t) => t.status === 'blocked').length;
  const status: 'on_track' | 'at_risk' | 'behind' =
    done >= expected * 0.9 ? 'on_track' : done >= expected * 0.7 ? 'at_risk' : 'behind';
  return { day, totalDays, elapsedFraction, committed, done, pct, expected, blocked, status, velocityDeltaPct: expected ? ((done - expected) / expected) * 100 : 0 };
}

/** Average days from created_at to completed_at for done tasks. */
export function avgCycleDays(tasks: { created_at: string; completed_at: string | null }[]): number | null {
  const done = tasks.filter((t) => t.completed_at);
  if (!done.length) return null;
  const sum = done.reduce((a, t) => a + (new Date(t.completed_at!).getTime() - new Date(t.created_at).getTime()), 0);
  return Math.max(0, sum / done.length / DAY);
}
