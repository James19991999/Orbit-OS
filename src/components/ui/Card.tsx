import { cn } from './cn';
import { Icon } from './Icon';

export function Card({ className, children, glow, as: As = 'section', ...rest }:
  { className?: string; children: React.ReactNode; glow?: boolean; as?: 'section' | 'div' | 'article' } & React.HTMLAttributes<HTMLElement>) {
  return <As className={cn('card p-4 md:p-5', glow && 'glow-focal', className)} {...rest}>{children}</As>;
}

export function CardHeader({ title, icon, action, subtitle, level = 2 }:
  { title: React.ReactNode; icon?: string; action?: React.ReactNode; subtitle?: React.ReactNode; level?: 2 | 3 }) {
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2">
        {icon && <Icon name={icon} className="mt-0.5 text-secondary" />}
        <div className="min-w-0">
          <H className="text-headline-sm text-on-surface">{title}</H>
          {subtitle && <p className="mt-0.5 text-body-sm text-on-surface-variant">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Overline({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('text-label-xs uppercase text-on-surface-variant', className)}>{children}</p>;
}
