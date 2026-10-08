import { cn } from './cn';
import { initials } from '@/lib/format';

const palette = ['bg-[#2563eb]', 'bg-[#0369a1]', 'bg-[#047857]', 'bg-[#7c3aed]', 'bg-[#b45309]', 'bg-[#be123c]', 'bg-[#0f766e]'];
function hash(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }

export function Avatar({ name, src, size = 32, online, className }: { name: string; src?: string | null; size?: number; online?: boolean; className?: string }) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)} style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        <span className={cn('flex h-full w-full items-center justify-center rounded-full font-semibold text-white', palette[hash(name) % palette.length])}
          style={{ fontSize: Math.max(10, size * 0.38) }} aria-hidden>
          {initials(name)}
        </span>
      )}
      {online !== undefined && (
        <span className={cn('absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-surface-container', online ? 'bg-healthy' : 'bg-outline')}
          aria-label={online ? 'Online' : 'Offline'} role="img" />
      )}
    </span>
  );
}

export function AvatarStack({ people, max = 4, size = 28 }: { people: { name: string; src?: string | null }[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="flex -space-x-2" aria-label={`${people.length} people`} role="img">
      {shown.map((p, i) => <Avatar key={i} name={p.name} src={p.src} size={size} className="ring-2 ring-surface-container rounded-full" />)}
      {rest > 0 && (
        <span className="flex items-center justify-center rounded-full bg-surface-container-highest text-label-xs text-on-surface ring-2 ring-surface-container" style={{ width: size, height: size }} aria-hidden>
          +{rest}
        </span>
      )}
    </span>
  );
}
