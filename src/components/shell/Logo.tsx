import Link from 'next/link';

export function Logo({ href = '/', compact }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded text-on-surface" aria-label="OrbitOS home">
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
        <rect width="32" height="32" rx="7" fill="#2563eb" />
        <circle cx="16" cy="16" r="6" fill="none" stroke="#fff" strokeWidth="2.4" />
        <ellipse cx="16" cy="16" rx="12" ry="4.5" fill="none" stroke="#89ceff" strokeWidth="1.6" transform="rotate(-25 16 16)" />
        <circle cx="26" cy="11.5" r="1.8" fill="#4edea3" />
      </svg>
      {!compact && <span className="text-headline-sm tracking-tight">OrbitOS</span>}
    </Link>
  );
}
