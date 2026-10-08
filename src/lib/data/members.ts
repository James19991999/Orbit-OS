import type { SupabaseClient } from '@supabase/supabase-js';
import type { Member } from '@/lib/types';
import type { MemberWindow } from '@/lib/scheduling/time';

export async function loadMembers(supabase: SupabaseClient, orgId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('memberships')
    .select('user_id, role, title, department, status, created_at, profile:profiles(*)')
    .eq('org_id', orgId)
    .eq('status', 'active');
  if (error) throw new Error(`Could not load members: ${error.message}`);
  return ((data ?? []) as unknown as Member[]).filter((m) => m.profile)
    .sort((a, b) => a.profile.full_name.localeCompare(b.profile.full_name));
}

export function toWindows(members: Member[]): MemberWindow[] {
  return members.map((m) => ({
    userId: m.user_id, name: m.profile.full_name, timezone: m.profile.timezone || 'UTC',
    workStart: m.profile.work_start || '09:00', workEnd: m.profile.work_end || '17:00', city: m.profile.city,
  }));
}

export function nameMap(members: Member[]): Record<string, { name: string; avatar: string | null; city: string | null; timezone: string }> {
  return Object.fromEntries(members.map((m) => [m.user_id, { name: m.profile.full_name || m.profile.email || 'Member', avatar: m.profile.avatar_url, city: m.profile.city, timezone: m.profile.timezone }]));
}

export function isoDaysAgo(days: number, from = new Date()): string {
  return new Date(from.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

/** Throw on a Supabase error so error.tsx renders a real error state instead of an empty page. */
export function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Could not load ${what}: ${res.error.message}`);
  return (res.data ?? ([] as unknown)) as T;
}
