import { cn } from './cn';

/** Material Symbols Outlined glyph. Decorative by default; pass `label` to make it meaningful. */
export function Icon({ name, className, label, filled }: { name: string; className?: string; label?: string; filled?: boolean }) {
  return (
    <span
      className={cn('ms', className)}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      style={filled ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" } : undefined}
    >
      {name}
    </span>
  );
}
