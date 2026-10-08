-- Row Level Security: the real tenant-isolation boundary.
-- Helper functions are SECURITY DEFINER so policies never recurse into memberships' own RLS.

create or replace function public.org_role(p_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.memberships
  where org_id = p_org and user_id = auth.uid() and status = 'active'
$$;

create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships
    where org_id = p_org and user_id = auth.uid() and status = 'active'
  )
$$;

create or replace function public.has_org_role(p_org uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.org_role(p_org) = any (p_roles), false)
$$;

-- An org is writable while active and within a 3-day grace period after plan expiry.
create or replace function public.org_is_writable(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organizations
    where id = p_org and status = 'active' and plan_expires_at > now() - interval '3 days'
  )
$$;

create or replace function public.can_write(p_org uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_org_role(p_org, p_roles) and public.org_is_writable(p_org)
$$;

-- Users who share at least one active org with the caller (for profile visibility).
create or replace function public.shares_org_with(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships a
    join public.memberships b on a.org_id = b.org_id
    where a.user_id = auth.uid() and a.status = 'active'
      and b.user_id = p_user and b.status = 'active'
  )
$$;

-- Role shorthands
-- ALL_WRITERS  = owner, director, contributor  (auditor is always read-only)
-- MANAGERS     = owner, director

-- ───────── Enable RLS everywhere ─────────
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- ───────── organizations ─────────
create policy org_select on public.organizations for select to authenticated
  using (public.is_org_member(id));
-- Clients may only update settings columns; billing/plan/status/SSO columns are server-only.
create policy org_update on public.organizations for update to authenticated
  using (public.can_write(id, array['owner', 'director']))
  with check (public.can_write(id, array['owner', 'director']));
revoke insert, update, delete on public.organizations from authenticated, anon;
grant update (name, legal_name, currency, core_window_start, core_window_end,
  golden_overlap_min_hours, quiet_hours, auto_detect_timezone,
  expense_approval_threshold_minor, hourly_cost_minor, seat_autoscale)
  on public.organizations to authenticated;

-- ───────── profiles ─────────
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_org_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke insert, delete on public.profiles from authenticated, anon;

-- ───────── memberships (writes go through RPCs / server routes only) ─────────
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.is_org_member(org_id));
revoke insert, update, delete on public.memberships from authenticated, anon;

-- ───────── invites (created by server route so the email can be sent) ─────────
create policy invites_select on public.invites for select to authenticated
  using (public.has_org_role(org_id, array['owner', 'director']));
create policy invites_delete on public.invites for delete to authenticated
  using (public.has_org_role(org_id, array['owner', 'director']));
revoke insert, update on public.invites from authenticated, anon;

-- ───────── Generic: members read, managers write ─────────
do $$
declare t text;
begin
  foreach t in array array['legal_entities', 'sprints', 'payroll_runs', 'channels', 'polls',
    'poll_options', 'lounges', 'compliance_frameworks', 'compliance_controls', 'policies',
    'dsar_requests', 'training_campaigns', 'report_schedules'] loop
    execute format($f$create policy %1$s_select on public.%1$I for select to authenticated
      using (public.is_org_member(org_id))$f$, t);
    execute format($f$create policy %1$s_insert on public.%1$I for insert to authenticated
      with check (public.can_write(org_id, array['owner','director']))$f$, t);
    execute format($f$create policy %1$s_update on public.%1$I for update to authenticated
      using (public.can_write(org_id, array['owner','director']))
      with check (public.can_write(org_id, array['owner','director']))$f$, t);
    execute format($f$create policy %1$s_delete on public.%1$I for delete to authenticated
      using (public.can_write(org_id, array['owner','director']))$f$, t);
  end loop;
end $$;

-- Lounges: contributors start/stop a shared focus session via set_lounge_session() (0003).

-- ───────── finance: managers only (contributors see dashboard summaries via RPC) ─────────
do $$
declare t text;
begin
  foreach t in array array['finance_entries', 'invoices'] loop
    execute format($f$create policy %1$s_select on public.%1$I for select to authenticated
      using (public.has_org_role(org_id, array['owner','director','auditor']))$f$, t);
    execute format($f$create policy %1$s_insert on public.%1$I for insert to authenticated
      with check (public.can_write(org_id, array['owner','director']))$f$, t);
    execute format($f$create policy %1$s_update on public.%1$I for update to authenticated
      using (public.can_write(org_id, array['owner','director']))
      with check (public.can_write(org_id, array['owner','director']))$f$, t);
    execute format($f$create policy %1$s_delete on public.%1$I for delete to authenticated
      using (public.can_write(org_id, array['owner','director']))$f$, t);
  end loop;
end $$;
-- Payment-derived invoice fields are server-only.
revoke update on public.invoices from authenticated;
grant update (client_name, client_email, description, amount_minor, currency, terms_days,
  issued_on, due_on, status) on public.invoices to authenticated;
-- Only owners approve spend.
revoke update on public.finance_entries from authenticated;
grant update (amount_minor, currency, category, vendor, occurred_on, note, approval_status, approved_by)
  on public.finance_entries to authenticated;

-- ───────── tasks: any writer creates; managers edit all; contributors edit own/assigned ─────────
create policy tasks_select on public.tasks for select to authenticated
  using (public.is_org_member(org_id));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.can_write(org_id, array['owner','director','contributor']) and created_by = auth.uid());
create policy tasks_update on public.tasks for update to authenticated
  using (public.can_write(org_id, array['owner','director'])
    or (public.can_write(org_id, array['contributor']) and (assignee_id = auth.uid() or created_by = auth.uid())))
  with check (public.can_write(org_id, array['owner','director','contributor']));
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.can_write(org_id, array['owner','director']) or (created_by = auth.uid() and public.can_write(org_id, array['contributor'])));

-- ───────── meetings ─────────
create policy meetings_select on public.meetings for select to authenticated
  using (public.is_org_member(org_id));
create policy meetings_insert on public.meetings for insert to authenticated
  with check (public.can_write(org_id, array['owner','director','contributor']) and organizer_id = auth.uid());
create policy meetings_update on public.meetings for update to authenticated
  using (organizer_id = auth.uid() or public.can_write(org_id, array['owner','director']))
  with check (public.can_write(org_id, array['owner','director','contributor']));
create policy meetings_delete on public.meetings for delete to authenticated
  using (organizer_id = auth.uid() or public.can_write(org_id, array['owner','director']));

create policy mp_select on public.meeting_participants for select to authenticated
  using (public.is_org_member(org_id));
create policy mp_insert on public.meeting_participants for insert to authenticated
  with check (public.can_write(org_id, array['owner','director','contributor'])
    and exists (select 1 from public.meetings m where m.id = meeting_participants.meeting_id and m.org_id = meeting_participants.org_id
      and (m.organizer_id = auth.uid() or public.has_org_role(m.org_id, array['owner','director'])))
    and public.shares_org_with(meeting_participants.user_id));
create policy mp_update on public.meeting_participants for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy mp_delete on public.meeting_participants for delete to authenticated
  using (exists (select 1 from public.meetings m where m.id = meeting_participants.meeting_id
    and (m.organizer_id = auth.uid() or public.has_org_role(m.org_id, array['owner','director']))));

-- ───────── check-ins: own rows ─────────
create policy checkins_select on public.check_ins for select to authenticated
  using (public.is_org_member(org_id));
create policy checkins_insert on public.check_ins for insert to authenticated
  with check (user_id = auth.uid() and public.can_write(org_id, array['owner','director','contributor']));
create policy checkins_update on public.check_ins for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.org_is_writable(org_id));

-- ───────── messages ─────────
create policy messages_select on public.messages for select to authenticated
  using (public.is_org_member(org_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (author_id = auth.uid()
    and public.can_write(org_id, array['owner','director','contributor'])
    and exists (select 1 from public.channels c where c.id = messages.channel_id and c.org_id = messages.org_id
      and (not c.is_announcement or public.has_org_role(c.org_id, array['owner','director']))));
create policy messages_update on public.messages for update to authenticated
  using (author_id = auth.uid() or public.can_write(org_id, array['owner','director']))
  with check (public.org_is_writable(org_id));
create policy messages_delete on public.messages for delete to authenticated
  using (author_id = auth.uid() or public.can_write(org_id, array['owner','director']));

create policy mr_select on public.message_reactions for select to authenticated
  using (public.is_org_member(org_id));
create policy mr_insert on public.message_reactions for insert to authenticated
  with check (user_id = auth.uid() and public.can_write(org_id, array['owner','director','contributor'])
    and exists (select 1 from public.messages m where m.id = message_reactions.message_id and m.org_id = message_reactions.org_id));
create policy mr_delete on public.message_reactions for delete to authenticated
  using (user_id = auth.uid());

-- ───────── polls: votes are private; tallies come from poll_results() ─────────
create policy votes_select on public.poll_votes for select to authenticated
  using (user_id = auth.uid());
create policy votes_insert on public.poll_votes for insert to authenticated
  with check (user_id = auth.uid()
    and public.can_write(org_id, array['owner','director','contributor'])
    and exists (select 1 from public.polls p join public.poll_options o on o.poll_id = p.id
      where p.id = poll_votes.poll_id and o.id = poll_votes.option_id and p.org_id = poll_votes.org_id
        and (p.closes_at is null or p.closes_at > now())));
create policy votes_delete on public.poll_votes for delete to authenticated
  using (user_id = auth.uid());

-- ───────── kudos ─────────
create policy kudos_select on public.kudos for select to authenticated
  using (public.is_org_member(org_id));
create policy kudos_insert on public.kudos for insert to authenticated
  with check (from_id = auth.uid() and public.can_write(org_id, array['owner','director','contributor'])
    and exists (select 1 from public.memberships m where m.org_id = kudos.org_id and m.user_id = kudos.to_id and m.status = 'active'));
create policy kudos_delete on public.kudos for delete to authenticated
  using (from_id = auth.uid() or public.can_write(org_id, array['owner','director']));

create policy kr_select on public.kudos_reactions for select to authenticated
  using (public.is_org_member(org_id));
create policy kr_insert on public.kudos_reactions for insert to authenticated
  with check (user_id = auth.uid() and public.can_write(org_id, array['owner','director','contributor'])
    and exists (select 1 from public.kudos k where k.id = kudos_reactions.kudos_id and k.org_id = kudos_reactions.org_id));
create policy kr_delete on public.kudos_reactions for delete to authenticated
  using (user_id = auth.uid());

-- ───────── compliance evidence, vault, devices, training ─────────
create policy evidence_select on public.compliance_evidence for select to authenticated
  using (public.is_org_member(org_id));
create policy evidence_insert on public.compliance_evidence for insert to authenticated
  with check (public.can_write(org_id, array['owner','director']));
create policy evidence_delete on public.compliance_evidence for delete to authenticated
  using (public.can_write(org_id, array['owner','director']));

create policy vault_select on public.vault_documents for select to authenticated
  using (public.has_org_role(org_id, array['owner','director']));
-- (file contents additionally require an AAL2/MFA session — see storage policies)
create policy vault_insert on public.vault_documents for insert to authenticated
  with check (public.can_write(org_id, array['owner','director']));
create policy vault_delete on public.vault_documents for delete to authenticated
  using (public.can_write(org_id, array['owner','director']));

create policy devices_select on public.devices for select to authenticated
  using (public.is_org_member(org_id));
create policy devices_insert on public.devices for insert to authenticated
  with check (public.can_write(org_id, array['owner','director'])
    or (owner_id = auth.uid() and public.can_write(org_id, array['contributor'])));
create policy devices_update on public.devices for update to authenticated
  using (public.can_write(org_id, array['owner','director'])
    or (owner_id = auth.uid() and public.can_write(org_id, array['contributor'])))
  with check (public.org_is_writable(org_id));
create policy devices_delete on public.devices for delete to authenticated
  using (public.can_write(org_id, array['owner','director']));

create policy ta_select on public.training_assignments for select to authenticated
  using (public.is_org_member(org_id));
create policy ta_insert on public.training_assignments for insert to authenticated
  with check (public.can_write(org_id, array['owner','director']));
create policy ta_update on public.training_assignments for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.training_assignments from authenticated;
grant update (completed_at) on public.training_assignments to authenticated;
create policy ta_delete on public.training_assignments for delete to authenticated
  using (public.can_write(org_id, array['owner','director']));

-- ───────── notifications: own only; created by triggers/server ─────────
create policy notif_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notif_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, delete on public.notifications from authenticated, anon;
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ───────── audit log: read-only for owner/director/auditor; NEVER client-writable ─────────
create policy audit_select on public.audit_log for select to authenticated
  using (public.has_org_role(org_id, array['owner','director','auditor']));
revoke insert, update, delete on public.audit_log from authenticated, anon;

-- ───────── integrations: managers ─────────
create policy integ_select on public.integrations for select to authenticated
  using (public.has_org_role(org_id, array['owner','director']));
create policy integ_write on public.integrations for all to authenticated
  using (public.can_write(org_id, array['owner','director']))
  with check (public.can_write(org_id, array['owner','director']));

-- ───────── billing: owner/auditor read; NEVER client-writable ─────────
create policy billing_select on public.billing_payments for select to authenticated
  using (public.has_org_role(org_id, array['owner','auditor']));
revoke insert, update, delete on public.billing_payments from authenticated, anon;

-- ───────── passkeys: own read/delete; created server-side after verification ─────────
create policy passkeys_select on public.passkeys for select to authenticated
  using (user_id = auth.uid());
create policy passkeys_delete on public.passkeys for delete to authenticated
  using (user_id = auth.uid());
revoke insert, update on public.passkeys from authenticated, anon;

-- webauthn challenges: server-only (no policies => no access for clients)
revoke all on public.webauthn_challenges from authenticated, anon;

-- health snapshots: members read; server writes
create policy hs_select on public.health_snapshots for select to authenticated
  using (public.is_org_member(org_id));
revoke insert, update, delete on public.health_snapshots from authenticated, anon;

-- anon gets nothing on any table
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
