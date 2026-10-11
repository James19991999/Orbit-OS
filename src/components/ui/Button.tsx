import { forwardRef } from 'react';
import Link from '@/components/ui/SmartLink';
import { cn } from './cn';
import { Icon } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const base = 'inline-flex items-center justify-center gap-2 rounded font-medium transition-colors select-none disabled:opacity-50 disabled:cursor-not-allowed focus-visible:shadow-focus';
const variants: Record<Variant, string> = {
  primary: 'bg-primary-container text-on-primary-container shadow-bevel hover:bg-[#1d4ed8] hover:shadow-glow',
  secondary: 'bg-surface-container-high text-on-surface border border-outline-variant hover:bg-surface-container-highest',
  ghost: 'text-on-surface-variant hover:bg-on-surface/5 hover:text-on-surface',
  danger: 'bg-error-container text-on-error-container border border-alert/40 hover:brightness-110',
};
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-label-sm md:h-8',
  md: 'h-11 px-4 text-label-md md:h-10',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant; size?: Size; icon?: string; loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, loading, className, children, disabled, type = 'button', ...rest }, ref,
) {
  return (
    <button ref={ref} type={type} className={cn(base, variants[variant], sizes[size], className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : icon ? <Icon name={icon} className="text-[18px]" /> : null}
      {children}
    </button>
  );
});

export function LinkButton({ href, variant = 'primary', size = 'md', icon, className, children, ...rest }:
  { href: string; variant?: Variant; size?: Size; icon?: string; className?: string; children: React.ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const external = /^https?:/.test(href);
  const cls = cn(base, variants[variant], sizes[size], className);
  const content = (<>{icon ? <Icon name={icon} className="text-[18px]" /> : null}{children}</>);
  if (external) return <a href={href} className={cls} target="_blank" rel="noopener noreferrer" {...rest}>{content}</a>;
  // Files served by API routes (PDFs, exports) are plain downloads, not client-side navigations.
  if (href.startsWith('/api/')) return <a href={href} className={cls} {...rest}>{content}</a>;
  return <Link href={href} className={cls} {...rest}>{content}</Link>;
}
