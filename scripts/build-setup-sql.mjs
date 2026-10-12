// Regenerates supabase/setup_all.sql (new projects), supabase/update_differentiators.sql (projects set up
// before October 9, 2026) and supabase/update_etims_calendar.sql (projects set up before October 11, 2026)
// from supabase/migrations.
// Usage: node scripts/build-setup-sql.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../supabase/', import.meta.url).pathname;
const files = readdirSync(join(dir, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
const rule = '═'.repeat(76);
const section = (f) => `-- ${'─'.repeat(28)} ${f} ${'─'.repeat(28)}\n${readFileSync(join(dir, 'migrations', f), 'utf8').trim()}\n`;
const record = (list) => `-- ${'─'.repeat(28)} record as applied (Supabase CLI bookkeeping) ${'─'.repeat(28)}
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
${list.map((f) => { const [v, ...n] = f.replace('.sql', '').split('_'); return `  ('${v}', '${n.join('_')}')`; }).join(',\n')}
on conflict (version) do nothing;
`;

writeFileSync(join(dir, 'setup_all.sql'), `-- ${rule}
-- OrbitOS — complete database setup for a NEW, EMPTY Supabase project.
-- Paste this whole file into Supabase → SQL Editor → New query, and click Run once.
--
-- • It is the ${files.length} files in supabase/migrations/ joined in order, inside one transaction:
--   if anything fails, nothing is applied and you can fix it and run it again.
-- • It records the migrations as applied, so \`supabase db push\` later won't re-run them.
-- • Already have OrbitOS? Run the update files instead: update_differentiators.sql (if set up before
--   October 9, 2026), then update_etims_calendar.sql, update_founder_console.sql, update_security.sql, update_comments_undo.sql update_leave_push.sql and update_polish.sql, in that order.
-- • Do NOT run supabase/seed.sql on a real project (demo users with a public password).
-- Generated from supabase/migrations by scripts/build-setup-sql.mjs — edit those files, not this one.
-- ${rule}

begin;

do $guard$
begin
  if to_regclass('public.organizations') is not null then
    raise exception 'OrbitOS tables already exist in this project. This setup file is only for an empty project — nothing was changed. To upgrade an existing project, run supabase/update_differentiators.sql.';
  end if;
end $guard$;

${files.map(section).join('\n')}
${record(files)}
commit;

-- Done. Check it worked with supabase/verify_setup.sql
`);

const upd = files.filter((f) => f >= '20261009000007' && f < '20261011000008');
writeFileSync(join(dir, 'update_differentiators.sql'), `-- ${rule}
-- OrbitOS — UPDATE for a project that already ran an older setup_all.sql (before October 9, 2026).
-- Adds WhatsApp, M-Pesa payouts, languages, data saver and the AI chief of staff.
-- Paste this whole file into Supabase → SQL Editor → New query, and click Run once.
-- One transaction: if anything fails, nothing changes. Safe to run only once (it checks).
-- Generated from supabase/migrations by scripts/build-setup-sql.mjs.
-- ${rule}

begin;

do $guard$
begin
  if to_regclass('public.organizations') is null then
    raise exception 'OrbitOS is not set up in this project yet. Run supabase/setup_all.sql instead — nothing was changed.';
  end if;
  if to_regclass('public.ai_briefs') is not null then
    raise exception 'This update has already been applied — nothing was changed.';
  end if;
end $guard$;

${upd.map(section).join('\n')}
${record(upd)}
commit;

-- Done. Check it worked with supabase/verify_setup.sql
`);
const upd2 = files.filter((f) => f >= '20261011000008' && f < '20261011000010');
writeFileSync(join(dir, 'update_etims_calendar.sql'), `-- ${rule}
-- OrbitOS — UPDATE for a project that already has OrbitOS (setup_all.sql + update_differentiators.sql) from
-- before October 11, 2026. Adds KRA eTIMS fiscal invoicing and Google Calendar / Outlook two-way sync.
-- Paste this whole file into Supabase → SQL Editor → New query, and click Run once.
-- One transaction: if anything fails, nothing changes. Safe to run only once (it checks).
-- Generated from supabase/migrations by scripts/build-setup-sql.mjs.
-- ${rule}

begin;

do $guard$
begin
  if to_regclass('public.organizations') is null then
    raise exception 'OrbitOS is not set up in this project yet. Run supabase/setup_all.sql instead — nothing was changed.';
  end if;
  if to_regclass('public.ai_briefs') is null then
    raise exception 'Run supabase/update_differentiators.sql first, then this file — nothing was changed.';
  end if;
  if to_regclass('public.etims_configs') is not null then
    raise exception 'This update has already been applied — nothing was changed.';
  end if;
end $guard$;

${upd2.map(section).join('\n')}
${record(upd2)}
commit;

-- Done. Check it worked with supabase/verify_setup.sql
`);
const upd3 = files.filter((f) => f >= '20261011000010' && f < '20261012000011');
writeFileSync(join(dir, 'update_founder_console.sql'), `-- ${rule}
-- OrbitOS — UPDATE that adds the Founder Console data (people online, background job runs, delivery failures).
-- For a project that already ran update_etims_calendar.sql. Paste this whole file into Supabase → SQL Editor →
-- New query, and click Run once. One transaction: if anything fails, nothing changes. Safe to run only once.
-- Generated from supabase/migrations by scripts/build-setup-sql.mjs.
-- ${rule}

begin;

do $guard$
begin
  if to_regclass('public.organizations') is null then
    raise exception 'OrbitOS is not set up in this project yet. Run supabase/setup_all.sql instead — nothing was changed.';
  end if;
  if to_regclass('public.etims_configs') is null then
    raise exception 'Run supabase/update_etims_calendar.sql first, then this file — nothing was changed.';
  end if;
  if to_regclass('public.user_activity') is not null then
    raise exception 'This update has already been applied — nothing was changed.';
  end if;
end $guard$;

${upd3.map(section).join('\n')}
${record(upd3)}
commit;

-- Done. Check it worked with supabase/verify_setup.sql
`);
const upd4 = files.filter((f) => f >= '20261012000011' && f < '20261012000012');
writeFileSync(join(dir, 'update_security.sql'), `-- ${rule}
-- OrbitOS — SECURITY UPDATE (October 12, 2026): file size and type limits on uploads, two-factor required to add or
-- delete vault documents, and failed sign-in counts in the Founder Console.
-- For a project that already ran update_founder_console.sql. Paste this whole file into Supabase → SQL Editor →
-- New query, and click Run. One transaction: if anything fails, nothing changes. Safe to run again.
-- Generated from supabase/migrations by scripts/build-setup-sql.mjs.
-- ${rule}

begin;

do $guard$
begin
  if to_regclass('public.organizations') is null then
    raise exception 'OrbitOS is not set up in this project yet. Run supabase/setup_all.sql instead — nothing was changed.';
  end if;
  if to_regclass('public.user_activity') is null then
    raise exception 'Run supabase/update_founder_console.sql first, then this file — nothing was changed.';
  end if;
end $guard$;

${upd4.map(section).join('\n')}
${record(upd4)}
commit;

-- Done. Check it worked with supabase/verify_setup.sql
`);
const upd5 = files.filter((f) => f >= '20261012000012' && f < '20261012000013');
writeFileSync(join(dir, 'update_comments_undo.sql'), `-- ${rule}
-- OrbitOS — UPDATE (October 12, 2026): comments with @mentions on tasks, and Undo for deleted tasks.
-- For a project that already ran update_security.sql. Paste this whole file into Supabase → SQL Editor →
-- New query, and click Run once. One transaction: if anything fails, nothing changes. Safe to run only once.
-- Generated from supabase/migrations by scripts/build-setup-sql.mjs.
-- ${rule}

begin;

do $guard$
begin
  if to_regclass('public.organizations') is null then
    raise exception 'OrbitOS is not set up in this project yet. Run supabase/setup_all.sql instead — nothing was changed.';
  end if;
  if to_regclass('public.user_activity') is null then
    raise exception 'Run supabase/update_founder_console.sql and supabase/update_security.sql first — nothing was changed.';
  end if;
  if to_regclass('public.task_comments') is not null then
    raise exception 'This update has already been applied — nothing was changed.';
  end if;
end $guard$;

${upd5.map(section).join('\n')}
${record(upd5)}
commit;

-- Done. Check it worked with supabase/verify_setup.sql
`);
const upd6 = files.filter((f) => f >= '20261012000013' && f < '20261012000014');
writeFileSync(join(dir, 'update_leave_push.sql'), `-- ${rule}
-- OrbitOS — UPDATE (October 12, 2026): leave and time off, phone notifications, and job title/department on imported invites.
-- For a project that already ran update_comments_undo.sql. Paste this whole file into Supabase → SQL Editor →
-- New query, and click Run once. One transaction: if anything fails, nothing changes. Safe to run only once.
-- Generated from supabase/migrations by scripts/build-setup-sql.mjs.
-- ${rule}

begin;

do $guard$
begin
  if to_regclass('public.organizations') is null then
    raise exception 'OrbitOS is not set up in this project yet. Run supabase/setup_all.sql instead — nothing was changed.';
  end if;
  if to_regclass('public.task_comments') is null then
    raise exception 'Run supabase/update_comments_undo.sql first, then this file — nothing was changed.';
  end if;
  if to_regclass('public.leave_requests') is not null then
    raise exception 'This update has already been applied — nothing was changed.';
  end if;
end $guard$;

${upd6.map(section).join('\n')}
${record(upd6)}
commit;

-- Done. Check it worked with supabase/verify_setup.sql
`);
const upd7 = files.filter((f) => f >= '20261012000014');
writeFileSync(join(dir, 'update_polish.sql'), `-- ${rule}
-- OrbitOS — UPDATE (October 12, 2026): product tour, and workspace branding (logo and accent colour).
-- For a project that already ran update_leave_push.sql. Paste this whole file into Supabase → SQL Editor →
-- New query, and click Run once. One transaction: if anything fails, nothing changes. Safe to run only once.
-- Generated from supabase/migrations by scripts/build-setup-sql.mjs.
-- ${rule}

begin;

do $guard$
begin
  if to_regclass('public.organizations') is null then
    raise exception 'OrbitOS is not set up in this project yet. Run supabase/setup_all.sql instead — nothing was changed.';
  end if;
  if to_regclass('public.leave_requests') is null then
    raise exception 'Run supabase/update_leave_push.sql first, then this file — nothing was changed.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'tour_done_at') then
    raise exception 'This update has already been applied — nothing was changed.';
  end if;
end $guard$;

${upd7.map(section).join('\n')}
${record(upd7)}
commit;

-- Done. Check it worked with supabase/verify_setup.sql
`);
console.log(`setup_all.sql: ${files.length} migrations; update_differentiators.sql: ${upd.join(', ')}; update_etims_calendar.sql: ${upd2.join(', ')}; update_founder_console.sql: ${upd3.join(', ')}; update_security.sql: ${upd4.join(', ')}; update_comments_undo.sql: ${upd5.join(', ')}; update_leave_push.sql: ${upd6.join(', ')}; update_polish.sql: ${upd7.join(', ')}`);
