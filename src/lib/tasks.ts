import type { Priority, TaskStatus } from '@/lib/types';
import type { Tone } from '@/components/ui/Pill';

// Shared (server + client) task helpers. Must NOT live in a 'use client' module, or Server
// Components receive a client reference instead of a callable function.
export const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'To do', in_progress: 'In progress', in_review: 'In review', blocked: 'Blocked', done: 'Done' };
export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
export const PRIORITY_TONE: Record<Priority, Tone> = { low: 'neutral', medium: 'info', high: 'warning', critical: 'alert' };

export function dueLabel(due: string | null, now = new Date()): string | null {
  if (!due) return null;
  const today = now.toISOString().slice(0, 10);
  const days = Math.round((Date.parse(due) - Date.parse(today)) / 86_400_000);
  if (days < 0) return `${-days}d overdue`;
  if (days === 0) return 'Due today';
  return `Due in ${days}d`;
}
