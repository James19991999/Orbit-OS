import { Logo } from '@/components/shell/Logo';
import { NotFoundContent } from '@/components/shell/NotFoundContent';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 items-center px-4 md:px-8"><Logo /></header>
      <NotFoundContent />
    </div>
  );
}
