import Link from 'next/link';
import { cn } from './cn';
import { Icon } from './Icon';
import { Pill, type Tone } from './Pill';

export function KpiTile({ label, value, sub, href, status, icon, className }:
  { label: string; value: React.ReactNode; sub?: React.ReactNode; href?: string; status?: { tone: Tone; text: string }; icon?: string; className?: string }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-label-xs uppercase text-on-surface-variant">{icon && <Icon name={icon} className="text-[16px]" />}{label}</p>
        {status && <Pill tone={status.tone}>{status.text}</Pill>}
      </div>
      <p className="mt-2 text-headline-md tnum text-on-surface">{value}</p>
      {sub && <p className="mt-1 text-body-sm text-on-surface-variant tnum">{sub}</p>}
    </>
  );
  const cls = cn('card glow-focal block p-4 transition-colors', href && 'hover:border-outline', className);
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-label-xs uppercase text-on-surface-variant">{label}</p>
      <p className="mt-1 text-headline-sm tnum text-on-surface">{value}</p>
      {sub && <p className="text-body-sm text-on-surface-variant tnum">{sub}</p>}
    </div>
  );
}
