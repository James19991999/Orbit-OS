import Link from 'next/link';
import { Logo } from '@/components/shell/Logo';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-outline-variant bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Logo />
          <nav aria-label="Site" className="flex items-center gap-1 text-label-md">
            <Link href="/#features" className="hidden rounded px-3 py-2 text-on-surface-variant hover:text-on-surface sm:block">Features</Link>
            <Link href="/pricing" className="rounded px-3 py-2 text-on-surface-variant hover:text-on-surface">Pricing</Link>
            <Link href="/security" className="hidden rounded px-3 py-2 text-on-surface-variant hover:text-on-surface sm:block">Security</Link>
            <Link href="/login" className="rounded px-3 py-2 text-on-surface-variant hover:text-on-surface">Sign in</Link>
            <Link href="/signup" className="ml-1 rounded bg-primary-container px-3 py-2 text-white shadow-bevel hover:bg-[#1d4ed8]">Start free</Link>
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1">{children}</main>
      <footer className="border-t border-outline-variant">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-body-sm text-on-surface-variant sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} OrbitOS. Built in Nairobi for distributed teams everywhere.</p>
          <nav aria-label="Legal" className="flex flex-wrap gap-4">
            <Link href="/legal/privacy" className="hover:text-on-surface">Privacy</Link>
            <Link href="/legal/terms" className="hover:text-on-surface">Terms</Link>
            <Link href="/trust" className="hover:text-on-surface">Trust Center</Link>
            <Link href="/security" className="hover:text-on-surface">Security</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
