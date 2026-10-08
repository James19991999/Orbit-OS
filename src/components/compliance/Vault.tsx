'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, EmptyState, Icon, Select, useToast } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { errorMessage } from '@/hooks/useAction';
import { FileUpload, openSigned } from './FileUpload';
import type { VaultDoc } from '@/lib/types';

/** Legal & IP vault: owners/directors only, and file contents require an MFA-verified (AAL2) session. */
export function Vault({ orgId, docs, aal2 }: { orgId: string; docs: VaultDoc[]; aal2: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [category, setCategory] = useState<VaultDoc['category']>('nda');
  async function record(path: string, name: string) {
    const { error } = await requireBrowserClient().from('vault_documents').insert({ org_id: orgId, title: name, category, file_path: path });
    if (error) throw error;
    router.refresh();
  }
  return (
    <div>
      {!aal2 && (
        <p className="mb-3 flex items-start gap-2 rounded border border-warning/40 bg-warning/10 p-3 text-body-sm">
          <Icon name="key" className="text-warning" />
          <span>Opening vault files requires two-factor verification. <Link href="/mfa?next=/compliance" className="text-primary underline">Verify now</Link></span>
        </p>
      )}
      {docs.length === 0 ? <EmptyState icon="lock" title="Vault is empty" body="Store NDAs, IP assignments and contracts here." /> : (
        <ul className="divide-y divide-outline-variant text-body-md">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0 truncate"><span className="mr-2 text-label-xs uppercase text-on-surface-variant">{d.category}</span>{d.title}</span>
              <Button size="sm" variant="ghost" icon="open_in_new" disabled={!aal2} onClick={() => openSigned('vault', d.file_path).catch((e) => toast(errorMessage(e), 'error'))}>Open</Button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value as VaultDoc['category'])} options={[{ value: 'nda', label: 'NDA' }, { value: 'ip', label: 'IP agreement' }, { value: 'contract', label: 'Contract' }, { value: 'other', label: 'Other' }]} />
        <FileUpload bucket="vault" prefix={orgId} onUploaded={record} label="Add document" accept=".pdf,.doc,.docx,.png,.jpg" />
      </div>
    </div>
  );
}
