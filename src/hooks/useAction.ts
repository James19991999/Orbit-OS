'use client';
import { useCallback, useState } from 'react';
import { useToast } from '@/components/ui/Toast';

/**
 * Wraps an async action with pending + error state and a visible toast on failure.
 * Every write in the app goes through this so a failure is never silent and buttons always re-enable.
 */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>, opts: { success?: string; errorPrefix?: string } = {}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const run = useCallback(async (...args: A): Promise<R | undefined> => {
    setPending(true);
    setError(null);
    try {
      const r = await fn(...args);
      if (opts.success) toast(opts.success, 'success');
      return r;
    } catch (e) {
      const msg = errorMessage(e);
      setError(msg);
      toast(opts.errorPrefix ? `${opts.errorPrefix}: ${msg}` : msg, 'error');
      return undefined;
    } finally {
      setPending(false);
    }
  }, [fn, opts.success, opts.errorPrefix, toast]);
  return { run, pending, error, setError };
}

export function errorMessage(e: unknown): string {
  if (!e) return 'Unknown error';
  if (typeof e === 'string') return e;
  if (e instanceof Error) return friendly(e.message);
  if (typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') return friendly((e as { message: string }).message);
  return 'Something went wrong';
}

function friendly(m: string): string {
  if (/row-level security/i.test(m)) return "You don't have permission to do that (or this workspace is read-only).";
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Network error — check your connection and try again.';
  if (/duplicate key/i.test(m)) return 'That already exists.';
  return m;
}

/** Throws a Supabase-style { error } so useAction can surface it. */
export function unwrap<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export async function postJson<T = unknown>(url: string, body?: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}
