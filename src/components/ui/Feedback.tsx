import { cn } from './cn';
import { Icon } from './Icon';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-on-surface/10', className)} aria-hidden />;
}

export function EmptyState({ icon = 'inbox', title, body, action, className }: { icon?: string; title: string; body?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-2 rounded-lg border border-dashed border-outline-variant px-4 py-8 text-center', className)}>
      <Icon name={icon} className="text-[28px] text-outline" />
      <p className="text-label-md text-on-surface">{title}</p>
      {body && <p className="max-w-sm text-body-sm text-on-surface-variant">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', body, onRetry, retryLabel = 'Try again', className }: { title?: string; body?: string; onRetry?: () => void; retryLabel?: string; className?: string }) {
  return (
    <div role="alert" className={cn('flex flex-col items-start gap-2 rounded-lg border border-alert/30 bg-alert/5 p-4', className)}>
      <p className="flex items-center gap-2 text-label-md text-alert"><Icon name="error" />{title}</p>
      {body && <p className="text-body-sm text-on-surface-variant">{body}</p>}
      {onRetry && <button type="button" onClick={onRetry} className="text-label-sm text-primary underline underline-offset-2">{retryLabel}</button>}
    </div>
  );
}

export function InlineError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return <p role="alert" className="flex items-center gap-1.5 text-body-sm text-alert"><Icon name="error" className="text-[16px]" />{message}</p>;
}

export function Banner({ tone = 'info', children, icon }: { tone?: 'info' | 'warning' | 'alert'; children: React.ReactNode; icon?: string }) {
  const t = { info: 'border-secondary/30 bg-secondary/5 text-on-surface', warning: 'border-warning/40 bg-warning/10 text-on-surface', alert: 'border-alert/40 bg-alert/10 text-on-surface' }[tone];
  const ic = { info: 'info', warning: 'warning', alert: 'error' }[tone];
  return (
    <div role={tone === 'info' ? 'status' : 'alert'} className={cn('flex items-start gap-2 rounded-lg border px-4 py-3 text-body-md', t)}>
      <Icon name={icon ?? ic} className={cn('mt-0.5', tone === 'info' ? 'text-secondary' : tone === 'warning' ? 'text-warning' : 'text-alert')} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function ProgressBar({ value, max = 100, label, tone = 'primary' }: { value: number; max?: number; label: string; tone?: 'primary' | 'healthy' | 'warning' | 'alert' }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const bar = { primary: 'bg-primary-container', healthy: 'bg-healthy', warning: 'bg-warning', alert: 'bg-alert' }[tone];
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-container-highest">
      <div className={cn('h-full rounded-full transition-[width]', bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}
