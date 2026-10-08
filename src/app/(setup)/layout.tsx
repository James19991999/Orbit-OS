import { Logo } from '@/components/shell/Logo';

export const dynamic = 'force-dynamic';

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 items-center px-4 md:px-8"><Logo href="/dashboard" /></header>
      <main id="main" className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-8">{children}</main>
    </div>
  );
}
