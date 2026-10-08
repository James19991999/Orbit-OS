#!/usr/bin/env bash
# Applies every migration to a throwaway database on a local Postgres and runs the RLS test suite.
# Usage: PGHOST=/tmp PGPORT=54329 PGUSER=postgres npm run test:db
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
DB="orbitos_test_$$"
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-54329}" PGUSER="${PGUSER:-postgres}"
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
# roles are cluster-wide; create once
psql -q -d "$DB" -v ON_ERROR_STOP=1 -c "do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  end if; end \$\$;" >/dev/null
sed -e '/^create role /d' "$DIR/supabase_stub.sql" | psql -q -d "$DB" -v ON_ERROR_STOP=1 >/dev/null
for f in "$DIR"/../migrations/*.sql; do
  psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done
echo "migrations: OK ($(ls "$DIR"/../migrations/*.sql | wc -l) files)"
if [ -f "$DIR/../seed.sql" ]; then psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$DIR/../seed.sql" >/dev/null; echo "seed: OK"; fi
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$DIR/rls.test.sql"
