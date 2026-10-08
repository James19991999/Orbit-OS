import { cn } from './cn';

export type Tone = 'healthy' | 'warning' | 'alert' | 'info' | 'neutral';
const tones: Record<Tone, string> = {
  healthy: 'bg-healthy/10 text-healthy border-healthy/30',
  warning: 'bg-warning/10 text-warning border-warning/30',
  alert: 'bg-alert/10 text-alert border-alert/30',
  info: 'bg-secondary/10 text-secondary border-secondary/30',
  neutral: 'bg-on-surface/5 text-on-surface-variant border-outline-variant',
};
const dots: Record<Tone, string> = { healthy: 'bg-healthy', warning: 'bg-warning', alert: 'bg-alert', info: 'bg-secondary', neutral: 'bg-outline' };

export function Pill({ tone = 'neutral', children, pulse, className }: { tone?: Tone; children: React.ReactNode; pulse?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-label-xs uppercase', tones[tone], className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dots[tone], pulse && 'pulse-dot')} aria-hidden />
      {children}
    </span>
  );
}
