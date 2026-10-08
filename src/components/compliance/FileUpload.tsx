'use client';
import { useRef, useState } from 'react';
import { Button, useToast } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { errorMessage } from '@/hooks/useAction';

const MAX_BYTES = 20 * 1024 * 1024;

/** Uploads to a private Storage bucket under "<orgId>/…" then calls onUploaded(path, name). */
export function FileUpload({ bucket, prefix, onUploaded, label = 'Upload file', accept }:
  { bucket: 'evidence' | 'vault'; prefix: string; onUploaded: (path: string, name: string) => Promise<void>; label?: string; accept?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) { toast('Files must be 20 MB or smaller.', 'error'); return; }
    setBusy(true);
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
      const path = `${prefix}/${crypto.randomUUID()}-${safe}`;
      const { error } = await requireBrowserClient().storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (error) throw error;
      await onUploaded(path, file.name);
      toast('Uploaded');
    } catch (e) {
      toast(`Upload failed: ${errorMessage(e)}`, 'error');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  return (
    <>
      <input ref={input} type="file" className="sr-only" accept={accept} onChange={(e) => onFile(e.target.files?.[0])} tabIndex={-1} aria-hidden />
      <Button size="sm" variant="secondary" icon="upload_file" loading={busy} onClick={() => input.current?.click()}>{label}</Button>
    </>
  );
}

export async function openSigned(bucket: 'evidence' | 'vault', path: string): Promise<void> {
  const { data, error } = await requireBrowserClient().storage.from(bucket).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Could not open file');
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}
