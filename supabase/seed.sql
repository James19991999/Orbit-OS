-- DEV-ONLY demo data: "Acme Global", 12 members across 9 cities. Never run against production.
-- Every demo account signs in with password: OrbitOS-demo-2026  (e.g. elena@acme-global.demo)

do $$
declare
  v_org uuid;
  v_sprint_prev uuid;
  v_sprint_cur uuid;
  v_soc2 uuid; v_gdpr uuid; v_iso uuid; v_hipaa uuid;
  v_poll uuid; v_retreat uuid; v_campaign uuid;
  v_general uuid; v_ann uuid; v_eng uuid; v_design uuid; v_random uuid;
  v_k uuid;
  r record;
  i int;
  m int;
begin
  -- ── users ──
  create temp table demo_people (n int, first text, last text, email text, role text, title text, dept text,
    tz text, city text, cc text, ws time, we time) on commit drop;
  insert into demo_people values
    (1, 'Elena', 'Kamau', 'elena', 'owner', 'CEO & Founder', 'Leadership', 'Africa/Nairobi', 'Nairobi', 'KE', '08:00', '17:00'),
    (2, 'Marcus', 'Vance', 'marcus', 'director', 'Principal Architect', 'Engineering', 'Europe/London', 'London', 'GB', '09:00', '17:30'),
    (3, 'Mei-Ling', 'Chen', 'meiling', 'contributor', 'Product Designer', 'Design', 'Asia/Singapore', 'Singapore', 'SG', '09:00', '18:00'),
    (4, 'Lukas', 'Lindqvist', 'lukas', 'contributor', 'Backend Engineer', 'Engineering', 'Europe/Berlin', 'Berlin', 'DE', '09:00', '17:00'),
    (5, 'Devon', 'Vance', 'devon', 'director', 'VP Finance', 'Finance', 'America/Los_Angeles', 'San Francisco', 'US', '08:30', '17:30'),
    (6, 'Amara', 'Okafor', 'amara', 'contributor', 'DevOps Engineer', 'Engineering', 'Africa/Lagos', 'Lagos', 'NG', '09:00', '17:00'),
    (7, 'Kiran', 'Rao', 'kiran', 'contributor', 'Developer Advocate', 'Growth', 'Asia/Tokyo', 'Tokyo', 'JP', '09:30', '18:30'),
    (8, 'Sofia', 'Alvarez', 'sofia', 'contributor', 'Security Engineer', 'Security', 'America/New_York', 'New York', 'US', '09:00', '17:00'),
    (9, 'Wanjiru', 'Njeri', 'wanjiru', 'contributor', 'Frontend Engineer', 'Engineering', 'Africa/Nairobi', 'Nairobi', 'KE', '08:30', '17:30'),
    (10, 'Tomás', 'Silva', 'tomas', 'contributor', 'Customer Success', 'Operations', 'Europe/Lisbon', 'Lisbon', 'PT', '09:00', '18:00'),
    (11, 'Priya', 'Shah', 'priya', 'auditor', 'External Auditor', 'Compliance', 'Europe/London', 'London', 'GB', '09:00', '17:00'),
    (12, 'Sam', 'Otieno', 'sam', 'contributor', 'Data Analyst', 'Finance', 'Africa/Kampala', 'Kampala', 'UG', '08:00', '17:00');

  for r in select * from demo_people loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000',
      ('10000000-0000-0000-0000-0000000000' || lpad(r.n::text, 2, '0'))::uuid,
      'authenticated', 'authenticated', r.email || '@acme-global.demo',
      crypt('OrbitOS-demo-2026', gen_salt('bf')), now(), '', '', '', '',
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('full_name', r.first || ' ' || r.last, 'timezone', r.tz), now(), now())
    on conflict (id) do nothing;
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), ('10000000-0000-0000-0000-0000000000' || lpad(r.n::text, 2, '0'))::uuid,
      ('10000000-0000-0000-0000-0000000000' || lpad(r.n::text, 2, '0')),
      jsonb_build_object('sub', '10000000-0000-0000-0000-0000000000' || lpad(r.n::text, 2, '0'), 'email', r.email || '@acme-global.demo', 'email_verified', true),
      'email', now(), now(), now());
    update public.profiles set timezone = r.tz, city = r.city, country_code = r.cc, work_start = r.ws, work_end = r.we,
      full_name = r.first || ' ' || r.last
    where id = ('10000000-0000-0000-0000-0000000000' || lpad(r.n::text, 2, '0'))::uuid;
  end loop;

  -- ── org via the real bootstrap RPC, as Elena ──
  perform set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  v_org := public.create_organization('Acme Global', 'acme-global', 'KES');
  -- the rest of the seed writes as the system (no end-user JWT), so approval rules don't re-route seeded expenses
  perform set_config('request.jwt.claims', '', true);
  update public.organizations set legal_name = 'Acme Global Technologies Ltd', plan = 'enterprise', plan_period = 'annual',
    seat_limit = 200, plan_expires_at = now() + interval '300 days', core_window_start = '08:00', core_window_end = '18:00'
  where id = v_org;
  insert into public.memberships (org_id, user_id, role, title, department)
  select v_org, ('10000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, role, title, dept
  from demo_people where n > 1;
  update public.memberships set department = 'Leadership' where org_id = v_org and role = 'owner';

  insert into public.legal_entities (org_id, name, jurisdiction, entity_type, hub_label, is_primary) values
    (v_org, 'Acme Global Technologies Ltd', 'Kenya', 'Private Limited Company', 'Nairobi HQ', true),
    (v_org, 'Acme Tech Systems UK Ltd', 'United Kingdom', 'Private Limited Company', 'London · EMEA Operations', false),
    (v_org, 'Acme Pacific Ventures Pte.', 'Singapore', 'Private Company', 'Marina · APAC Hub', false);

  -- ── sprints & tasks ──
  insert into public.sprints (org_id, name, goal, starts_on, ends_on, committed_points)
  values (v_org, 'Sprint 41 — Payments Hardening', 'Ship IntaSend billing + receipts', current_date - 21, current_date - 8, 46)
  returning id into v_sprint_prev;
  insert into public.sprints (org_id, name, goal, starts_on, ends_on, committed_points)
  values (v_org, 'Sprint 42 — Core Engine & Mobile API', 'Multi-region sync and the mobile API', current_date - 7, current_date + 6, 50)
  returning id into v_sprint_cur;

  insert into public.tasks (org_id, sprint_id, title, description, assignee_id, created_by, priority, status, points, due_on, tags, blocked_reason)
  values
    (v_org, v_sprint_cur, 'Multi-region Redis sync', 'Partition clustering latency reduction across AP-South & EU-Central.', '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', 'high', 'in_progress', 8, current_date + 2, '{infra}', null),
    (v_org, v_sprint_cur, 'IntaSend billing v2 migration', 'Update webhook consumers and tiered seat billing.', '10000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', 'high', 'in_review', 5, current_date + 5, '{finance}', null),
    (v_org, v_sprint_cur, 'SOC 2 evidence capture', 'Automated audit bucket sync failed — rotate the replication role credential.', '10000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', 'critical', 'blocked', 3, current_date + 1, '{compliance}', 'Replication role credential expired'),
    (v_org, v_sprint_cur, 'Mobile API: auth endpoints', null, '10000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000002', 'medium', 'done', 5, current_date - 2, '{mobile}', null),
    (v_org, v_sprint_cur, 'Mobile wireframes for Q4', null, '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'medium', 'done', 5, current_date - 3, '{design}', null),
    (v_org, v_sprint_cur, 'Design token spec for mobile shell v2', null, '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'medium', 'done', 3, current_date - 1, '{design}', null),
    (v_org, v_sprint_cur, 'Edge cache warmup job', null, '10000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000002', 'medium', 'done', 8, current_date - 4, '{infra}', null),
    (v_org, v_sprint_cur, 'Rate-limit public webhooks', null, '10000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000002', 'high', 'done', 3, current_date - 2, '{security}', null),
    (v_org, v_sprint_cur, 'APAC onboarding demo script', null, '10000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000007', 'low', 'done', 2, current_date - 5, '{growth}', null),
    (v_org, v_sprint_cur, 'Customer health dashboard', null, '10000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000005', 'medium', 'in_progress', 5, current_date + 4, '{data}', null),
    (v_org, v_sprint_cur, 'Push notifications for mobile', null, '10000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000002', 'medium', 'todo', 3, current_date + 6, '{mobile}', null),
    (v_org, v_sprint_cur, 'Renewal email templates', null, '10000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000005', 'low', 'todo', 1, current_date + 6, '{ops}', null),
    (v_org, v_sprint_prev, 'IntaSend STK push flow', null, '10000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', 'high', 'done', 8, current_date - 10, '{finance}', null),
    (v_org, v_sprint_prev, 'Receipt PDF generator', null, '10000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000005', 'medium', 'done', 5, current_date - 9, '{finance}', null),
    (v_org, v_sprint_prev, 'Webhook replay protection', null, '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', 'high', 'done', 5, current_date - 12, '{security}', null),
    (v_org, v_sprint_prev, 'Billing settings UI', null, '10000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000002', 'medium', 'done', 8, current_date - 11, '{frontend}', null),
    (v_org, v_sprint_prev, 'Seat auto-scale threshold', null, '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', 'medium', 'done', 5, current_date - 9, '{finance}', null),
    (v_org, v_sprint_prev, 'Plan feature gates', null, '10000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000002', 'medium', 'done', 5, current_date - 9, '{platform}', null),
    (v_org, v_sprint_prev, 'Billing QA pass', null, '10000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000002', 'low', 'done', 3, current_date - 8, '{qa}', null),
    (v_org, null, 'Quarterly board pack', null, '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'high', 'todo', 3, current_date + 9, '{exec}', null);
  -- completion timestamps spread over the sprint so velocity charts look real
  update public.tasks set completed_at = (due_on::timestamptz + interval '15 hours') where org_id = v_org and status = 'done';
  update public.tasks set created_at = coalesce(due_on, current_date)::timestamptz - interval '6 days' where org_id = v_org;

  -- ── finance (6 months, KES minor units) ──
  insert into public.finance_entries (org_id, kind, amount_minor, currency, category, vendor, occurred_on, note, created_by)
  values (v_org, 'cash_balance', 6200000000, 'KES', 'Treasury', 'Bank statement', (date_trunc('month', current_date) - interval '5 months')::date, 'Opening balance', '10000000-0000-0000-0000-000000000005');
  for m in 0..5 loop
    insert into public.finance_entries (org_id, kind, amount_minor, currency, category, vendor, occurred_on, created_by) values
      (v_org, 'expense', 120000000 + m * 3500000, 'KES', 'Cloud', 'AWS', least((date_trunc('month', current_date) - make_interval(months => m))::date + 3, current_date), '10000000-0000-0000-0000-000000000005'),
      (v_org, 'expense', 42000000, 'KES', 'Software', 'Tooling subscriptions', least((date_trunc('month', current_date) - make_interval(months => m))::date + 5, current_date), '10000000-0000-0000-0000-000000000005'),
      (v_org, 'expense', 18000000 + (m % 2) * 6000000, 'KES', 'Travel', 'Team travel', least((date_trunc('month', current_date) - make_interval(months => m))::date + 12, current_date), '10000000-0000-0000-0000-000000000005'),
      (v_org, 'payroll', 1250000000, 'KES', 'Payroll', 'Recorded payroll', least((date_trunc('month', current_date) - make_interval(months => m))::date + 25, current_date), '10000000-0000-0000-0000-000000000005'),
      (v_org, 'revenue', 1180000000 + (5 - m) * 45000000, 'KES', 'Subscriptions', 'Customers', least((date_trunc('month', current_date) - make_interval(months => m))::date + 1, current_date), '10000000-0000-0000-0000-000000000005');
  end loop;
  -- this month's cloud bill spiked (drives the "cost variance" urgent action)
  insert into public.finance_entries (org_id, kind, amount_minor, currency, category, vendor, occurred_on, note, created_by)
  values (v_org, 'expense', 48000000, 'KES', 'Cloud', 'AWS', current_date, 'Staging load tests — eu-west-1 auto-scaling', '10000000-0000-0000-0000-000000000005');
  insert into public.finance_entries (org_id, kind, amount_minor, currency, category, vendor, occurred_on, note, approval_status, created_by)
  values (v_org, 'expense', 310000000, 'KES', 'Software', 'Datadog', current_date, 'Annual observability contract', 'pending', '10000000-0000-0000-0000-000000000005');
  insert into public.finance_entries (org_id, kind, amount_minor, currency, category, vendor, occurred_on, note, created_by)
  values (v_org, 'cash_balance', 4950000000, 'KES', 'Treasury', 'Bank statement', current_date - 1, 'Month-to-date balance', '10000000-0000-0000-0000-000000000005');

  insert into public.payroll_runs (org_id, period, country_count, total_minor, currency, provider_label, status, paid_on)
  select v_org, to_char(date_trunc('month', current_date) - make_interval(months => gm), 'YYYY-MM'), 9, 1250000000, 'KES',
         case when gm % 2 = 0 then 'Deel' else 'Wise' end, 'settled',
         (date_trunc('month', current_date) - make_interval(months => gm))::date + 25
  from generate_series(1, 3) gm;

  insert into public.invoices (org_id, number, client_name, client_email, description, amount_minor, currency, terms_days, issued_on, due_on, status, created_by) values
    (v_org, 'INV-2026-0141', 'Savannah Logistics Ltd', 'ap@savannah.example', 'Enterprise licence Q4', 240000000, 'KES', 30, current_date - 30, current_date, 'sent', '10000000-0000-0000-0000-000000000005'),
    (v_org, 'INV-2026-0142', 'Kilimo Fresh Co.', 'finance@kilimo.example', 'Implementation services', 156000000, 'KES', 30, current_date - 20, current_date + 10, 'sent', '10000000-0000-0000-0000-000000000005'),
    (v_org, 'INV-2026-0139', 'Lakeside Health', 'accounts@lakeside.example', 'Seats expansion', 84000000, 'KES', 14, current_date - 25, current_date - 11, 'sent', '10000000-0000-0000-0000-000000000005'),
    (v_org, 'INV-2026-0135', 'Pwani Retail Group', 'pay@pwani.example', 'Annual plan', 520000000, 'KES', 30, current_date - 60, current_date - 30, 'paid', '10000000-0000-0000-0000-000000000005');
  update public.invoices set paid_at = now() - interval '28 days' where org_id = v_org and status = 'paid';

  -- ── meetings: past 14 days + upcoming ──
  for i in 1..12 loop
    insert into public.meetings (org_id, title, starts_at, duration_min, organizer_id, mode)
    values (v_org, (array['Architecture sync', 'Design review', 'Finance weekly', 'APAC handoff', 'Customer call prep', 'Security standup'])[1 + i % 6],
      date_trunc('day', now()) - make_interval(days => i) + interval '14 hours', (array[30, 45, 60])[1 + i % 3],
      '10000000-0000-0000-0000-000000000002', case when i % 3 = 0 then 'async_first' else 'sync' end);
  end loop;
  insert into public.meetings (org_id, title, description, starts_at, duration_min, organizer_id, mode, video_url)
  values (v_org, 'Core Architecture RFC Sync', 'Review the multi-region RFC.', date_trunc('hour', now()) + interval '3 hours', 45, '10000000-0000-0000-0000-000000000002', 'sync', null),
         (v_org, 'APAC–EMEA Gateway Handoff', 'Async-first handoff; Loom backup posted in #engineering.', date_trunc('day', now()) + interval '1 day 7 hours 30 minutes', 30, '10000000-0000-0000-0000-000000000007', 'async_first', null);
  update public.meetings set video_url = 'https://meet.jit.si/orbitos-acme-global-' || left(id::text, 8) where org_id = v_org;
  insert into public.meeting_participants (meeting_id, org_id, user_id, rsvp)
  select mt.id, v_org, ('10000000-0000-0000-0000-0000000000' || lpad(p::text, 2, '0'))::uuid, 'yes'
  from public.meetings mt, generate_series(1, 12) p
  where mt.org_id = v_org and (p % 3 = (extract(day from mt.starts_at)::int % 3) or p in (1, 2));

  -- ── check-ins (last 14 days) ──
  for i in 0..13 loop
    insert into public.check_ins (org_id, user_id, for_date, shipped, blockers, mood)
    select v_org, ('10000000-0000-0000-0000-0000000000' || lpad(p::text, 2, '0'))::uuid, current_date - i,
      (array['Merged the sync PR', 'Wireframes for mobile settings', 'Closed 4 support tickets', 'Rotated staging credentials', 'Drafted the board update', 'Reviewed 3 RFCs'])[1 + (p + i) % 6],
      case when (p + i) % 7 = 0 then 'Waiting on credentials from AWS' end,
      3 + ((p * 7 + i) % 3)
    from generate_series(1, 12) p
    where (p + i) % 4 <> 0 and not (i = 0 and p > 8);
  end loop;

  -- ── channels & messages ──
  select id into v_ann from public.channels where org_id = v_org and slug = 'announcements';
  select id into v_general from public.channels where org_id = v_org and slug = 'general';
  select id into v_random from public.channels where org_id = v_org and slug = 'random-watercooler';
  insert into public.channels (org_id, slug, name, topic) values (v_org, 'product-design', 'product-design', 'Design system and product UX') returning id into v_design;
  insert into public.channels (org_id, slug, name, topic) values (v_org, 'engineering-async', 'engineering-async', 'RFCs, infra and releases') returning id into v_eng;
  insert into public.messages (org_id, channel_id, author_id, body, pinned, created_at) values
    (v_org, v_ann, '10000000-0000-0000-0000-000000000001', 'Quarterly remote retreat voting is live! 🎉 Options for the Q4 all-hands: Lisbon coast vs. Kyoto gardens. Vote closes Friday 17:00 UTC.', true, now() - interval '2 hours'),
    (v_org, v_design, '10000000-0000-0000-0000-000000000003', 'Design token spec for mobile shell v2 is up for review.', false, now() - interval '8 minutes'),
    (v_org, v_eng, '10000000-0000-0000-0000-000000000004', 'Edge-compute replication latency down 40ms in AP-South.', false, now() - interval '24 minutes'),
    (v_org, v_random, '10000000-0000-0000-0000-000000000010', 'Show us your home office plants and desk pets 🪴🐾', false, now() - interval '1 hour'),
    (v_org, v_general, '10000000-0000-0000-0000-000000000009', 'Mobile auth endpoints are live in staging.', false, now() - interval '3 hours');
  insert into public.messages (org_id, channel_id, author_id, parent_id, body, created_at)
  select v_org, v_design, ('10000000-0000-0000-0000-0000000000' || lpad(p::text, 2, '0'))::uuid, m.id,
         (array['Looks great', 'Can we bump contrast on the muted labels?', 'Approved from my side'])[1 + p % 3], now() - interval '5 minutes'
  from public.messages m, generate_series(2, 4) p where m.channel_id = v_design and m.parent_id is null;

  -- ── polls ──
  insert into public.polls (org_id, question, anonymous, kind, created_by, closes_at)
  values (v_org, 'How manageable was your cross-timezone coordination this week?', true, 'pulse', '10000000-0000-0000-0000-000000000001', now() + interval '3 days')
  returning id into v_poll;
  insert into public.poll_options (poll_id, org_id, label, position) values
    (v_poll, v_org, '🟢 Very smooth', 0), (v_poll, v_org, '🟡 Manageable', 1), (v_poll, v_org, '🔴 Too many late calls', 2);
  insert into public.poll_votes (poll_id, option_id, org_id, user_id)
  select v_poll, (select id from public.poll_options where poll_id = v_poll and position = case when p <= 7 then 0 when p <= 10 then 1 else 2 end),
         v_org, ('10000000-0000-0000-0000-0000000000' || lpad(p::text, 2, '0'))::uuid
  from generate_series(2, 12) p;

  insert into public.polls (org_id, question, anonymous, kind, created_by, closes_at)
  values (v_org, 'Q4 retreat location', false, 'announcement', '10000000-0000-0000-0000-000000000001', date_trunc('week', now()) + interval '4 days 17 hours')
  returning id into v_retreat;
  insert into public.poll_options (poll_id, org_id, label, position) values (v_retreat, v_org, '🏝️ Lisbon', 0), (v_retreat, v_org, '⛩️ Kyoto', 1);
  insert into public.poll_votes (poll_id, option_id, org_id, user_id)
  select v_retreat, (select id from public.poll_options where poll_id = v_retreat and position = p % 2), v_org,
         ('10000000-0000-0000-0000-0000000000' || lpad(p::text, 2, '0'))::uuid
  from generate_series(2, 11) p;

  -- ── kudos ──
  insert into public.kudos (org_id, from_id, to_id, badge, message, created_at) values
    (v_org, '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006', 'firefighter', 'Huge kudos for the seamless database failover at 3 AM with zero lost transactions. Absolute lifesaver!', now() - interval '3 hours')
    returning id into v_k;
  insert into public.kudos_reactions (kudos_id, org_id, user_id, emoji)
  select v_k, v_org, ('10000000-0000-0000-0000-0000000000' || lpad(p::text, 2, '0'))::uuid, '👏' from generate_series(2, 9) p;
  insert into public.kudos (org_id, from_id, to_id, badge, message, created_at) values
    (v_org, '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000007', 'team_glue', 'Props for hosting the APAC onboarding demo and staying late so the London cohort felt at home.', now() - interval '1 day'),
    (v_org, '10000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000012', 'ship_it', 'Receipt PDFs shipped two days early.', now() - interval '3 days');

  -- ── compliance ──
  insert into public.compliance_frameworks (org_id, key, name, description, target_date, policy_version) values
    (v_org, 'soc2', 'SOC 2 Type II', 'Trust Services Criteria — security, availability, confidentiality', current_date + 18, '3.1') returning id into v_soc2;
  insert into public.compliance_frameworks (org_id, key, name, description, target_date, policy_version) values
    (v_org, 'gdpr', 'GDPR (EU & UK)', 'Data protection regulation', null, '4.2') returning id into v_gdpr;
  insert into public.compliance_frameworks (org_id, key, name, description, target_date, policy_version) values
    (v_org, 'iso27001', 'ISO/IEC 27001:2022', 'Information security management system', current_date + 90, '1.4') returning id into v_iso;
  insert into public.compliance_frameworks (org_id, key, name, description, target_date, policy_version) values
    (v_org, 'hipaa', 'HIPAA Security Rule', 'Safeguards for protected health information', null, '1.0') returning id into v_hipaa;
  insert into public.compliance_controls (org_id, framework_id, ref, title, owner_id, status, last_reviewed_at)
  select v_org, v_soc2, 'CC' || (1 + g / 5) || '.' || (1 + g % 5), 'SOC 2 control ' || g, '10000000-0000-0000-0000-000000000008',
         case when g = 7 then 'in_review' when g = 13 then 'failing' else 'passing' end, now() - make_interval(days => g)
  from generate_series(0, 24) g;
  insert into public.compliance_controls (org_id, framework_id, ref, title, owner_id, status, last_reviewed_at)
  select v_org, v_gdpr, 'Art.' || (5 + g), 'GDPR requirement ' || g, '10000000-0000-0000-0000-000000000001', 'passing', now() - make_interval(days => g * 2)
  from generate_series(0, 14) g;
  insert into public.compliance_controls (org_id, framework_id, ref, title, owner_id, status, last_reviewed_at)
  select v_org, v_iso, 'A.' || (5 + g / 10) || '.' || (1 + g % 10), 'Annex A control ' || g, '10000000-0000-0000-0000-000000000008',
         case when g % 9 = 0 then 'in_review' when g % 11 = 0 then 'not_started' else 'passing' end, now() - make_interval(days => g)
  from generate_series(0, 29) g;
  insert into public.compliance_controls (org_id, framework_id, ref, title, owner_id, status, last_reviewed_at)
  select v_org, v_hipaa, '164.3' || (08 + g), 'HIPAA safeguard ' || g, '10000000-0000-0000-0000-000000000008', 'passing', now() - make_interval(days => g)
  from generate_series(0, 9) g;
  insert into public.dsar_requests (org_id, requester_email, type, status, due_on) values
    (v_org, 'former.customer@example.com', 'access', 'closed', current_date - 4);
  insert into public.devices (org_id, owner_id, name, os, encrypted, agent_installed, last_seen_on)
  select v_org, ('10000000-0000-0000-0000-0000000000' || lpad(p::text, 2, '0'))::uuid,
         (array['MacBook Pro 14"', 'ThinkPad X1', 'MacBook Air', 'Dell XPS 13'])[1 + p % 4],
         (array['macOS', 'Windows', 'macOS', 'Ubuntu'])[1 + p % 4], p <> 10, p not in (10, 12), current_date - (p % 3)
  from generate_series(1, 12) p;
  insert into public.training_campaigns (org_id, title, due_on) values (v_org, 'Q4 Security Awareness', current_date + 10) returning id into v_campaign;
  insert into public.training_assignments (campaign_id, org_id, user_id, completed_at)
  select v_campaign, v_org, ('10000000-0000-0000-0000-0000000000' || lpad(p::text, 2, '0'))::uuid,
         case when p <= 10 then now() - make_interval(days => p) end
  from generate_series(1, 12) p;
  insert into public.policies (org_id, title, version, body_md, published_at) values
    (v_org, 'Information Security Policy', '4.2', '# Information Security Policy\n\nAll staff must use MFA…', now() - interval '40 days'),
    (v_org, 'Acceptable Use Policy', '2.0', '# Acceptable Use\n\nCompany devices must be encrypted…', now() - interval '90 days');

  -- ── reports, snapshots ──
  insert into public.report_schedules (org_id, name, cadence, weekday, hour_utc, destination, recipients, enabled) values
    (v_org, 'Executive telemetry digest', 'weekly', 1, 7, 'email', '{elena@acme-global.demo}', true),
    (v_org, 'Board of Directors packet', 'monthly', null, 6, 'email', '{elena@acme-global.demo,devon@acme-global.demo}', false);
  update public.report_schedules set month_day = 1 where org_id = v_org and cadence = 'monthly';
  insert into public.health_snapshots (org_id, taken_on, score, components)
  select v_org, current_date - d, 80 + (d % 5), '{}' from generate_series(1, 14) d;
end $$;

-- Demo people have already seen the product tour (new sign-ups get the prompt).
update public.profiles set tour_done_at = now();
