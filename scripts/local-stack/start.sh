#!/usr/bin/env bash
# Local Supabase-compatible stack for end-to-end tests: Postgres + GoTrue (auth) + PostgREST + gateway.
# Requires: a running Postgres (PGHOST/PGPORT), and the postgrest + auth binaries in $BIN.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"; ROOT="$DIR/../.."
BIN="${BIN:-/home/pgrun/bin}"; DB="${DB:-orbitos_e2e}"
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-54329}" PGUSER="${PGUSER:-postgres}"
SECRET="${JWT_SECRET:-local-dev-jwt-secret-at-least-32-characters-long}"
pkill -x auth 2>/dev/null || true; pkill -x postgrest 2>/dev/null || true; pkill -f "local-stack/proxy.mjs" 2>/dev/null || true
sleep 0.5
psql -q -d postgres -c "drop database if exists $DB with (force)" -c "create database $DB" >/dev/null
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$DIR/bootstrap.sql" >/dev/null
DBURL="postgres://supabase_auth_admin@localhost:$PGPORT/$DB?host=$PGHOST&sslmode=disable"
(cd "$BIN" && GOTRUE_DB_DRIVER=postgres DATABASE_URL="$DBURL" GOTRUE_DB_NAMESPACE=auth API_EXTERNAL_URL=http://localhost:54321/auth/v1 \
  GOTRUE_API_HOST=127.0.0.1 PORT=9999 GOTRUE_SITE_URL=http://localhost:3000 GOTRUE_URI_ALLOW_LIST='http://localhost:3000/**' \
  GOTRUE_JWT_SECRET="$SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role \
  GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=true GOTRUE_DISABLE_SIGNUP=false GOTRUE_LOG_LEVEL=warn \
  GOTRUE_MFA_TOTP_ENROLL_ENABLED=true GOTRUE_MFA_TOTP_VERIFY_ENABLED=true GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 \
  setsid nohup ./auth < /dev/null > /tmp/gotrue.log 2>&1 &)
for i in $(seq 1 40); do curl -sf http://127.0.0.1:9999/health >/dev/null && break; sleep 0.5; done
curl -sf http://127.0.0.1:9999/health >/dev/null || { echo "GoTrue failed"; tail -20 /tmp/gotrue.log; exit 1; }
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$DIR/post-auth.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "migration failed: $f"; psql -d "$DB" -v ON_ERROR_STOP=1 -f "$f" 2>&1 | grep -i error | head; exit 1; }; done
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/seed.sql" >/dev/null
PGRST_DB_URI="postgres://authenticator@localhost:$PGPORT/$DB?host=$PGHOST" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon \
  PGRST_JWT_SECRET="$SECRET" PGRST_SERVER_PORT=3001 PGRST_SERVER_HOST=127.0.0.1 PGRST_DB_POOL=10 \
  setsid nohup "$BIN/postgrest" < /dev/null > /tmp/postgrest.log 2>&1 &
rm -rf /tmp/orbit-storage
DB="$DB" JWT_SECRET="$SECRET" setsid nohup node "$DIR/proxy.mjs" < /dev/null > /tmp/gateway.log 2>&1 &
for i in $(seq 1 40); do curl -sf http://127.0.0.1:3001/ >/dev/null && break; sleep 0.5; done
ANON=$(node "$DIR/jwt.mjs" anon "$SECRET"); SERVICE=$(node "$DIR/jwt.mjs" service_role "$SECRET")
cat > "$ROOT/.env.local" <<ENV
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON
SUPABASE_SERVICE_ROLE_KEY=$SERVICE
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=local-cron-secret
INTASEND_WEBHOOK_CHALLENGE=local-challenge
INTASEND_TEST_MODE=true
WEBAUTHN_RP_ID=localhost
FOUNDER_EMAILS=priya@acme-global.demo
ENV
if [ "${WITH_INTASEND_MOCK:-1}" = "1" ]; then
  pkill -f "local-stack/intasend-mock.mjs" 2>/dev/null || true
  INTASEND_MOCK_FAIL_PHONE="${INTASEND_MOCK_FAIL_PHONE:-254700000000}" setsid nohup node "$DIR/intasend-mock.mjs" < /dev/null > /tmp/intasend-mock.log 2>&1 &
  printf 'INTASEND_PUBLISHABLE_KEY=ISPubKey_test_mock\nINTASEND_SECRET_KEY=ISSecretKey_test_mock\nINTASEND_BASE_URL=http://localhost:54400\n' >> "$ROOT/.env.local"
fi
if [ "${WITH_WHATSAPP_MOCK:-1}" = "1" ]; then
  pkill -f "local-stack/whatsapp-mock.mjs" 2>/dev/null || true
  setsid nohup node "$DIR/whatsapp-mock.mjs" < /dev/null > /tmp/whatsapp-mock.log 2>&1 &
  printf 'WHATSAPP_TOKEN=local-wa-token\nWHATSAPP_PHONE_NUMBER_ID=MOCKPHONE\nWHATSAPP_APP_SECRET=local-wa-app-secret\nWHATSAPP_VERIFY_TOKEN=local-wa-verify\nWHATSAPP_API_BASE=http://localhost:54410/v21.0\n' >> "$ROOT/.env.local"
fi
if [ "${WITH_AI_MOCK:-1}" = "1" ]; then
  pkill -f "local-stack/ai-mock.mjs" 2>/dev/null || true
  setsid nohup node "$DIR/ai-mock.mjs" < /dev/null > /tmp/ai-mock.log 2>&1 &
  printf 'ANTHROPIC_API_KEY=local-anthropic-key\nANTHROPIC_BASE_URL=http://localhost:54420\nANTHROPIC_MODEL=claude-haiku-5-5\n' >> "$ROOT/.env.local"
fi
# Credentials at rest (eTIMS keys, calendar tokens) are encrypted with this test-only key.
printf 'ENCRYPTION_KEY=%s\n' "$(printf 'local-test-encryption-key' | sha256sum | cut -c1-64)" >> "$ROOT/.env.local"
if [ "${WITH_ETIMS_MOCK:-1}" = "1" ]; then
  pkill -f "local-stack/etims-mock.mjs" 2>/dev/null || true
  setsid nohup node "$DIR/etims-mock.mjs" < /dev/null > /tmp/etims-mock.log 2>&1 &
  # OrbitOS's own (platform) eTIMS device, so plan payments get fiscal receipts in the tests too.
  printf 'ETIMS_BASE_URL=http://localhost:54430/etims-api\nETIMS_ENV=sandbox\nETIMS_TIN=P051234567X\nETIMS_BHF_ID=00\nETIMS_DEVICE_SERIAL=ORBITOS-PLATFORM-1\nETIMS_ITEM_CLS_CD=8111150000\n' >> "$ROOT/.env.local"
fi
if [ "${WITH_CALENDAR_MOCK:-1}" = "1" ]; then
  pkill -f "local-stack/calendar-mock.mjs" 2>/dev/null || true
  setsid nohup node "$DIR/calendar-mock.mjs" < /dev/null > /tmp/calendar-mock.log 2>&1 &
  printf 'GOOGLE_CALENDAR_CLIENT_ID=local-google-client\nGOOGLE_CALENDAR_CLIENT_SECRET=local-google-secret\nGOOGLE_OAUTH_BASE=http://localhost:54440\nGOOGLE_TOKEN_BASE=http://localhost:54440\nGOOGLE_API_BASE=http://localhost:54440\n' >> "$ROOT/.env.local"
  printf 'MICROSOFT_CALENDAR_CLIENT_ID=local-ms-client\nMICROSOFT_CALENDAR_CLIENT_SECRET=local-ms-secret\nMICROSOFT_LOGIN_BASE=http://localhost:54440/ms\nMICROSOFT_GRAPH_BASE=http://localhost:54440/graph\n' >> "$ROOT/.env.local"
fi
if [ "${WITH_PUSH_MOCK:-1}" = "1" ]; then
  # A push service stand-in over HTTPS with a throwaway certificate. Start the app with
  # NODE_EXTRA_CA_CERTS=/tmp/orbit-push/cert.pem so it trusts it (see README → Local development).
  mkdir -p /tmp/orbit-push
  [ -f /tmp/orbit-push/cert.pem ] || openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost" \
    -keyout /tmp/orbit-push/key.pem -out /tmp/orbit-push/cert.pem >/dev/null 2>&1
  pkill -f "local-stack/push-mock.mjs" 2>/dev/null || true
  setsid nohup node "$DIR/push-mock.mjs" < /dev/null > /tmp/push-mock.log 2>&1 &
  # Same keys every run: NEXT_PUBLIC_VAPID_PUBLIC_KEY is built into the app.
  [ -f /tmp/orbit-push/vapid.txt ] || (cd "$ROOT" && node -e "const w=require('web-push');const k=w.generateVAPIDKeys();console.log(k.publicKey+' '+k.privateKey)") > /tmp/orbit-push/vapid.txt
  keys=$(cat /tmp/orbit-push/vapid.txt)
  printf 'NEXT_PUBLIC_VAPID_PUBLIC_KEY=%s\nVAPID_PRIVATE_KEY=%s\nVAPID_SUBJECT=mailto:test@orbitos.local\nPUSH_WEBHOOK_SECRET=local-push-secret\n' ${keys% *} ${keys#* } >> "$ROOT/.env.local"
fi
echo "stack up: gateway http://localhost:54321 (auth + rest + storage), db=$DB; wrote .env.local"
