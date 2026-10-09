import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { User, SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured, ORG_COOKIE } from '@/lib/env';
import type { Organization, Profile, Role } from '@/lib/types';

export interface MembershipWithOrg { role: Role; title: string | null; org: Organization }

export interface AppContext {
  supabase: SupabaseClient;
  user: User;
  profile: Profile;
  memberships: MembershipWithOrg[];
  org: Organization;
  role: Role;
  aal: { current: string | null; next: string | null };
}

/** Loads the signed-in user, their workspaces and the active one. Cached per request. */
export const getAuthContext = cache(async (): Promise<Omit<AppContext, 'org' | 'role'> & { org: Organization | null; role: Role | null } | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [profileRes, membershipRes, aalRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('memberships').select('role, title, org:organizations(*)').eq('user_id', user.id).eq('status', 'active'),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (membershipRes.error) throw new Error(`Could not load workspaces: ${membershipRes.error.message}`);

  const memberships = ((membershipRes.data ?? []) as unknown as MembershipWithOrg[])
    .filter((m) => m.org)
    .sort((a, b) => a.org.name.localeCompare(b.org.name));
  const profile: Profile = (profileRes.data as Profile | null) ?? {
    id: user.id, email: user.email ?? null, full_name: (user.user_metadata?.full_name as string) || user.email || 'Member',
    avatar_url: null, timezone: 'Africa/Nairobi', work_start: '09:00', work_end: '17:00', city: null, country_code: null,
    theme: 'system', email_notifications: true, checkin_reminders: true,
    language: 'en', data_saver: false, whatsapp_checkins: true, whatsapp_approvals: true,
  };

  const wanted = (await headers()).get('x-orbit-tenant') || (await cookies()).get(ORG_COOKIE)?.value;
  const active = memberships.find((m) => m.org.slug === wanted) ?? memberships[0] ?? null;

  return {
    supabase, user, profile, memberships,
    org: active?.org ?? null,
    role: active?.role ?? null,
    aal: { current: aalRes.data?.currentLevel ?? null, next: aalRes.data?.nextLevel ?? null },
  };
});

/** For pages inside the app: guarantees a user AND an active workspace. */
export async function requireAppContext(): Promise<AppContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (!ctx.org || !ctx.role) redirect('/onboarding');
  return ctx as AppContext;
}

export function isWritable(org: Organization, now = Date.now()): boolean {
  return org.status === 'active' && new Date(org.plan_expires_at).getTime() > now - 3 * 86_400_000;
}
