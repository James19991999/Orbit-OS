-- RLS / RPC behaviour tests. Run via supabase/tests/run.sh against a real Postgres.
\set QUIET on
\pset tuples_only on
set client_min_messages = notice;

create schema tests;
grant usage on schema tests to authenticated, anon;
create table tests.results (label text, ok boolean);
grant all on tests.results to authenticated, anon;

create function tests.pass(p_label text) returns void language plpgsql as $$
begin insert into tests.results values (p_label, true); raise notice 'PASS  %', p_label; end $$;

create function tests.expect_error(p_sql text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    perform tests.pass(p_label || '  [' || left(sqlerrm, 70) || ']');
    return;
  end;
  insert into tests.results values (p_label, false);
  raise warning 'FAIL  % (statement succeeded but should have been blocked)', p_label;
end $$;

create function tests.eq(p_actual text, p_expected text, p_label text) returns void language plpgsql as $$
begin
  if p_actual is not distinct from p_expected then perform tests.pass(p_label);
  else
    insert into tests.results values (p_label, false);
    raise warning 'FAIL  % (expected %, got %)', p_label, p_expected, p_actual;
  end if;
end $$;

create function tests.login(p_uid uuid, p_aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, false);
$$;
grant execute on all functions in schema tests to authenticated, anon;

-- ── fixtures (as superuser) ──
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@a.test', '{"full_name":"Alice Owner"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@a.test',   '{"full_name":"Bob Contributor"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@a.test', '{"full_name":"Carol Auditor"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@b.test',  '{"full_name":"Dave Other Owner"}'),
  ('00000000-0000-0000-0000-00000000000e', 'erin@x.test',  '{"full_name":"Erin Outsider"}');

select tests.eq((select count(*)::text from public.profiles where email like '%.test'), '5', 'auth trigger creates a profile per new user');

-- ── 1. Bootstrap: a brand-new user can create an org and becomes its owner ──
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select tests.eq((select public.slug_available('alpha-co'))::text, 'true', 'slug_available reports a free slug');
select public.create_organization('Alpha Co', 'alpha-co', 'KES');
select tests.eq((select role from public.memberships m join public.organizations o on o.id = m.org_id where o.slug = 'alpha-co'), 'owner', 'creator is owner of new org (no bootstrap lockout)');
select tests.eq((select count(*)::text from public.channels c join public.organizations o on o.id = c.org_id where o.slug='alpha-co'), '3', 'default channels created with org');
select tests.expect_error($$select public.create_organization('Dup', 'alpha-co', 'KES')$$, 'duplicate slug rejected');
select tests.expect_error($$insert into public.organizations (name, slug, owner_id) values ('X','x-org', auth.uid())$$, 'direct org insert blocked');
reset role;

select tests.login('00000000-0000-0000-0000-00000000000d');
set role authenticated;
select public.create_organization('Beta Ltd', 'beta-ltd', 'USD');
reset role;

-- invites are created server-side (service role); simulate as superuser
insert into public.invites (org_id, email, role, code) select id, 'bob@a.test', 'contributor', 'code-bob' from public.organizations where slug='alpha-co';
insert into public.invites (org_id, email, role, code) select id, 'carol@a.test', 'auditor', 'code-carol' from public.organizations where slug='alpha-co';
insert into public.invites (org_id, email, role, code, expires_at) select id, 'erin@x.test', 'contributor', 'code-expired', now() - interval '1 day' from public.organizations where slug='alpha-co';

-- ── 2. Invite redemption ──
select tests.login('00000000-0000-0000-0000-00000000000e');
set role authenticated;
select tests.expect_error($$select public.redeem_invite('code-bob')$$, 'invite cannot be redeemed by a different email');
select tests.expect_error($$select public.redeem_invite('code-expired')$$, 'expired invite rejected');
select tests.eq((select count(*)::text from public.organizations), '0', 'outsider sees no organizations');
reset role;

select tests.login('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select public.redeem_invite('code-bob');
select tests.expect_error($$select public.redeem_invite('code-bob')$$, 'invite cannot be reused');
select tests.expect_error($$insert into public.memberships (org_id, user_id, role) select id, auth.uid(), 'owner' from public.organizations where slug='alpha-co'$$, 'contributor cannot self-promote via memberships insert');
select tests.expect_error($$update public.memberships set role = 'owner' where user_id = auth.uid()$$, 'contributor cannot update own role');
reset role;

select tests.login('00000000-0000-0000-0000-00000000000c');
set role authenticated;
select public.redeem_invite('code-carol');
reset role;

-- shared fixtures in org A (as alice)
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
insert into public.tasks (org_id, title, assignee_id) select id, 'Alpha task', '00000000-0000-0000-0000-00000000000b' from public.organizations where slug='alpha-co';
insert into public.finance_entries (org_id, kind, amount_minor, currency, occurred_on) select id, 'expense', 500000, 'KES', current_date from public.organizations where slug='alpha-co';
insert into public.finance_entries (org_id, kind, amount_minor, currency, occurred_on) select id, 'cash_balance', 90000000, 'KES', current_date from public.organizations where slug='alpha-co';
select tests.eq((select count(*)::text from public.notifications), '0', 'assigner does not get their own assignment notification');
insert into public.polls (org_id, question) select id, 'How was the week?' from public.organizations where slug='alpha-co';
insert into public.poll_options (poll_id, org_id, label) select p.id, p.org_id, 'Smooth' from public.polls p;
insert into public.compliance_frameworks (org_id, key, name) select id, 'soc2', 'SOC 2' from public.organizations where slug='alpha-co';
select tests.expect_error($$update public.organizations set plan = 'enterprise' where slug = 'alpha-co'$$, 'owner cannot change plan column from client');
select tests.expect_error($$update public.organizations set plan_expires_at = now() + interval '10 years' where slug = 'alpha-co'$$, 'owner cannot extend plan expiry from client');
update public.organizations set name = 'Alpha Company' where slug = 'alpha-co';
select tests.eq((select name from public.organizations where slug='alpha-co'), 'Alpha Company', 'owner can update allowed settings column');
select tests.expect_error($$insert into public.billing_payments (org_id, plan, period, seats, amount_minor, currency, method, api_ref, state) select id, 'enterprise', 'annual', 200, 1, 'KES', 'MPESA', 'fake', 'COMPLETE' from public.organizations where slug='alpha-co'$$, 'client cannot mint a billing payment');
select tests.expect_error($$insert into public.audit_log (org_id, action) select id, 'fake' from public.organizations where slug='alpha-co'$$, 'client cannot write audit log');
select tests.expect_error($$select public.apply_intasend_payment('x', 'COMPLETE', null, '{}')$$, 'authenticated cannot call apply_intasend_payment');
select tests.eq((select count(*)::text from public.audit_log where action = 'org.settings_updated'), '1', 'org settings change is audited by trigger');
reset role;

-- org_id immutability is enforced by trigger even for a role that bypasses RLS
select tests.expect_error($$update public.tasks set org_id = (select id from public.organizations where slug='beta-ltd') where title = 'Alpha task'$$, 'org_id is immutable on tenant rows (trigger, even bypassing RLS)');

-- ── 3. Cross-tenant isolation (dave owns org B) ──
select tests.login('00000000-0000-0000-0000-00000000000d');
set role authenticated;
select tests.eq((select count(*)::text from public.tasks), '0', 'other tenant sees no tasks');
select tests.eq((select count(*)::text from public.finance_entries), '0', 'other tenant sees no finance');
select tests.eq((select count(*)::text from public.memberships where org_id = (select id from public.organizations where slug='alpha-co')), '0', 'other tenant sees no memberships');
select tests.eq((select count(*)::text from public.profiles where email = 'bob@a.test'), '0', 'other tenant cannot read profiles outside shared orgs');
select tests.expect_error($$insert into public.tasks (org_id, title) select org_id, 'x' from public.memberships where false union all select '00000000-0000-0000-0000-000000000000'::uuid, 'x'$$, 'insert into unknown org blocked');
select tests.eq((select count(*)::text from public.finance_monthly((select org_id from public.memberships where user_id <> auth.uid() limit 1))), '0', 'finance_monthly returns nothing for non-member org');
reset role;
-- dave tries to write directly into org A by id (looked up as superuser)
select set_config('tests.org_a', (select id::text from public.organizations where slug='alpha-co'), false);
select tests.login('00000000-0000-0000-0000-00000000000d');
set role authenticated;
select tests.expect_error(format($$insert into public.tasks (org_id, title) values (%L, 'pwned')$$, current_setting('tests.org_a')), 'cross-tenant task insert blocked');
select tests.expect_error(format($$insert into public.kudos (org_id, to_id, badge, message) values (%L, '00000000-0000-0000-0000-00000000000b', 'ship_it', 'x')$$, current_setting('tests.org_a')), 'cross-tenant kudos insert blocked');
select tests.eq((select count(*)::text from public.poll_results((select id from public.polls limit 1))), '0', 'cross-tenant cannot see poll (no rows)');
reset role;

-- ── 4. Contributor permissions (bob) ──
select tests.login('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select tests.eq((select count(*)::text from public.notifications where kind = 'task_assigned'), '1', 'assignee notified of new task');
select tests.eq((select count(*)::text from public.finance_entries), '0', 'contributor cannot read finance ledger');
select tests.eq((select count(*)::text from public.finance_monthly(current_setting('tests.org_a')::uuid)), '2', 'contributor gets finance summary via RPC');
select tests.expect_error(format($$insert into public.finance_entries (org_id, kind, amount_minor, currency) values (%L, 'expense', 1, 'KES')$$, current_setting('tests.org_a')), 'contributor cannot add finance entries');
update public.tasks set status = 'done' where title = 'Alpha task';
select tests.eq((select (completed_at is not null)::text from public.tasks where title = 'Alpha task'), 'true', 'assignee can complete own task; completed_at stamped');
insert into public.check_ins (org_id, shipped, mood) values (current_setting('tests.org_a')::uuid, 'Shipped login', 4);
select tests.expect_error(format($$insert into public.check_ins (org_id, user_id, shipped, mood) values (%L, '00000000-0000-0000-0000-00000000000a', 'fake', 5)$$, current_setting('tests.org_a')), 'cannot check in on behalf of someone else');
insert into public.poll_votes (poll_id, option_id, org_id) select o.poll_id, o.id, o.org_id from public.poll_options o;
select tests.expect_error($$insert into public.messages (org_id, channel_id, body) select org_id, id, 'hi all' from public.channels where slug = 'announcements'$$, 'contributor cannot post to announcement channel');
insert into public.messages (org_id, channel_id, body) select org_id, id, 'hello' from public.channels where slug = 'general';
select tests.expect_error($$update public.messages set pinned = true where body = 'hello'$$, 'contributor cannot pin messages');
insert into public.kudos (org_id, to_id, badge, message) values (current_setting('tests.org_a')::uuid, '00000000-0000-0000-0000-00000000000a', 'team_glue', 'Thanks!');
select tests.expect_error(format($$insert into public.kudos (org_id, to_id, badge, message) values (%L, auth.uid(), 'ship_it', 'me')$$, current_setting('tests.org_a')), 'cannot give kudos to yourself');
select tests.eq((select count(*)::text from public.audit_log), '0', 'contributor cannot read audit log');
select tests.eq((select count(*)::text from public.billing_payments), '0', 'contributor cannot read billing');
reset role;

-- ── 5. Poll privacy (alice cannot see bob's vote row, but tally is 1) ──
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select tests.eq((select count(*)::text from public.poll_votes), '0', 'individual votes are private');
select tests.eq((select sum(votes)::text from public.poll_results((select id from public.polls limit 1))), '1', 'poll_results returns tally');
select tests.eq((select count(*)::text from public.notifications where kind = 'kudos'), '1', 'kudos recipient notified');
update public.messages set pinned = true where body = 'hello';
select tests.eq((select pinned::text from public.messages where body = 'hello'), 'true', 'owner can pin');
select tests.expect_error($$update public.messages set body = 'edited by owner' where body = 'hello'$$, 'owner cannot rewrite someone else''s message');
reset role;

-- ── 6. Auditor (carol): read-only ──
select tests.login('00000000-0000-0000-0000-00000000000c');
set role authenticated;
select tests.expect_error(format($$insert into public.tasks (org_id, title) values (%L, 'audit task')$$, current_setting('tests.org_a')), 'auditor cannot create tasks');
select tests.expect_error(format($$insert into public.check_ins (org_id, shipped, mood) values (%L, 'x', 3)$$, current_setting('tests.org_a')), 'auditor cannot check in');
select tests.eq(((select count(*) from public.audit_log) > 0)::text, 'true', 'auditor can read audit log');
select tests.eq((select count(*)::text from public.finance_entries), '2', 'auditor can read finance ledger');
update public.compliance_frameworks set name = 'hacked';
select tests.eq((select name from public.compliance_frameworks limit 1), 'SOC 2', 'auditor update silently affects 0 rows');
reset role;

-- ── 7. Storage: evidence + MFA-gated vault ──
insert into storage.objects (bucket_id, name) values
  ('evidence', current_setting('tests.org_a') || '/soc2/policy.pdf'),
  ('vault', current_setting('tests.org_a') || '/nda.pdf');
select tests.login('00000000-0000-0000-0000-00000000000d');
set role authenticated;
select tests.eq((select count(*)::text from storage.objects), '0', 'other tenant cannot see evidence or vault files');
reset role;
select tests.login('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select tests.eq((select count(*)::text from storage.objects where bucket_id = 'evidence'), '1', 'member can read own org evidence');
select tests.eq((select count(*)::text from storage.objects where bucket_id = 'vault'), '0', 'contributor cannot read vault');
reset role;
select tests.login('00000000-0000-0000-0000-00000000000a', 'aal1');
set role authenticated;
select tests.eq((select count(*)::text from storage.objects where bucket_id = 'vault'), '0', 'owner without MFA session cannot read vault');
reset role;
select tests.login('00000000-0000-0000-0000-00000000000a', 'aal2');
set role authenticated;
select tests.eq((select count(*)::text from storage.objects where bucket_id = 'vault'), '1', 'owner with MFA (aal2) session can read vault');
reset role;

-- ── 8. Payments (service role path), idempotency ──
insert into public.billing_payments (org_id, plan, period, seats, amount_minor, currency, method, api_ref)
  values (current_setting('tests.org_a')::uuid, 'enterprise', 'annual', 200, 39900000, 'KES', 'MPESA', 'orb_test_1');
select set_config('tests.before', (select plan_expires_at::text from public.organizations where slug='alpha-co'), false);
select tests.eq(public.apply_intasend_payment('orb_test_1', 'PROCESSING', 'INV1', '{}'), 'processing', 'non-final state recorded without applying');
select tests.eq(public.apply_intasend_payment('orb_test_1', 'COMPLETE', 'INV1', '{}'), 'applied', 'COMPLETE applies payment');
select tests.eq(public.apply_intasend_payment('orb_test_1', 'COMPLETE', 'INV1', '{}'), 'already_applied', 'replayed webhook is idempotent');
select tests.eq((select plan || '/' || seat_limit from public.organizations where slug='alpha-co'), 'enterprise/200', 'plan + seats updated');
select tests.eq((select (plan_expires_at::date - current_setting('tests.before')::timestamptz::date between 364 and 366)::text from public.organizations where slug='alpha-co'), 'true', 'annual plan extends from current expiry by one year');
select tests.eq(public.apply_intasend_payment('nope', 'COMPLETE', null, '{}'), 'unknown_ref', 'unknown api_ref ignored');

-- ── 9. Expired workspace becomes read-only ──
update public.organizations set plan_expires_at = now() - interval '10 days' where slug = 'alpha-co';
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select tests.expect_error(format($$insert into public.tasks (org_id, title) values (%L, 'after expiry')$$, current_setting('tests.org_a')), 'expired workspace blocks writes');
select tests.eq(((select count(*) from public.tasks) > 0)::text, 'true', 'expired workspace still readable');
reset role;

-- ── 9b. Activity stream + expense approval rules ──
select tests.eq((select count(*)::text from public.activity_events where kind = 'kudos' and org_id = current_setting('tests.org_a')::uuid), '1', 'kudos produce an activity event');
update public.organizations set plan_expires_at = now() + interval '30 days', expense_approval_threshold_minor = 1000 where slug = 'alpha-co';
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
insert into public.finance_entries (org_id, kind, amount_minor, currency, vendor, approval_status) values (current_setting('tests.org_a')::uuid, 'expense', 999999, 'KES', 'BigVendor', 'approved');
select tests.eq((select approval_status from public.finance_entries where vendor = 'BigVendor'), 'pending', 'expense above threshold forced to pending even if client says approved');
select tests.expect_error($$update public.finance_entries set approval_status = 'approved' where vendor = 'BigVendor'$$, 'cannot approve your own expense');
select tests.expect_error($$insert into public.activity_events (org_id, kind, title) values (current_setting('tests.org_a')::uuid, 'fake', 'x')$$, 'activity stream not client-writable');
reset role;

-- ── 10. Anonymous ──
set role anon;
select set_config('request.jwt.claims', '', false);
select tests.eq((select name from public.org_by_slug('BETA-LTD')), 'Beta Ltd', 'anon can resolve tenant by slug for login');
select tests.expect_error($$select * from public.organizations$$, 'anon cannot read organizations');
select tests.expect_error($$select public.create_organization('a','anon-org','KES')$$, 'anon cannot create organizations');
reset role;

-- ── summary ──
\pset tuples_only off
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from tests.results;
do $$ begin
  if exists (select 1 from tests.results where not ok) then raise exception 'RLS test suite FAILED'; end if;
end $$;
