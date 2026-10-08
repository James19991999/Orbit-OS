import { Card, Icon } from '@/components/ui';

export function SetupNotice() {
  return (
    <Card>
      <h1 className="flex items-center gap-2 text-headline-md"><Icon name="construction" className="text-warning" />Finish setting up OrbitOS</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">
        This deployment has no Supabase connection yet. Add <code className="rounded bg-surface-container-highest px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
        <code className="rounded bg-surface-container-highest px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (and <code className="rounded bg-surface-container-highest px-1">SUPABASE_SERVICE_ROLE_KEY</code> for server features), then redeploy.
      </p>
      <p className="mt-2 text-body-sm text-on-surface-variant">See README → “Setup” for the full checklist.</p>
    </Card>
  );
}
