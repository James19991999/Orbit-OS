// Regenerates supabase/setup_all.sql (new projects) and supabase/update_differentiators.sql
// (projects that already ran an older setup_all.sql) from supabase/migrations.
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
-- • Already ran an older setup_all.sql? Run supabase/update_differentiators.sql instead.
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

const upd = files.filter((f) => f >= '20261009000007');
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
console.log(`setup_all.sql: ${files.length} migrations; update_differentiators.sql: ${upd.join(', ')}`);
