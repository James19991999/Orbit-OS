import Link from 'next/link';
import { Logo } from '@/components/shell/Logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.18),transparent_65%)]" />
      </div>
      <header className="relative flex h-16 items-center px-4 md:px-8"><Logo /></header>
      <main id="main" className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8">{children}</main>
      <footer className="relative flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 pb-6 text-body-sm text-on-surface-variant">
        <Link href="/legal/privacy" className="hover:text-on-surface">Privacy Policy</Link><span aria-hidden>•</span>
        <Link href="/security" className="hover:text-on-surface">Security Whitepaper</Link><span aria-hidden>•</span>
        <Link href="/trust" className="hover:text-on-surface">Trust Center</Link>
      </footer>
    </div>
  );
}
