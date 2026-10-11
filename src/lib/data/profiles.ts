import type { SupabaseClient } from '@supabase/supabase-js';

export interface ProfileLite { id: string; full_name: string; email: string | null; timezone: string; language: string | null }

/**
 * Loads profiles for a set of user ids. Only `memberships` has a foreign key to `profiles`, so tables
 * whose user_id points at auth.users (meeting_participants, training_assignments, …) can't use a
 * PostgREST `profile:profiles(...)` embed — it fails with "Could not find a relationship". Use this instead.
 */
export async function loadProfiles(sb: SupabaseClient, userIds: string[]): Promise<Map<string, ProfileLite>> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return new Map();
  const { data, error } = await sb.from('profiles').select('id, full_name, email, timezone, language').in('id', ids);
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as ProfileLite[]).map((p) => [p.id, p]));
}
