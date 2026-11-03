#!/usr/bin/env bash
# Browser check of the analytics pages against a real (throw-away) database:
#   PostgreSQL (all migrations + tests/browser/seed.sql) → PostgREST → local gateway
#   → the production build of the app → Chromium at desktop and mobile sizes.
#
# Needs: a local PostgreSQL you can create databases in, a PostgREST binary and
# a Chromium (Playwright's, by default /opt/pw-browsers/chromium-1194):
#     POSTGREST_BIN=/path/to/postgrest PGHOST=/var/run/postgresql supabase/tests/browser/run.sh
# Screenshots: $OUT_DIR (default ./browser-check). Never point this at a real project.
set -euo pipefail
cd "$(dirname "$0")/../.."

: "${POSTGREST_BIN:?set POSTGREST_BIN to a postgrest binary}"
DB="klaroh_browser_$$"
PGRST_PORT="${PGRST_PORT:-3998}"
GATEWAY_PORT="${GATEWAY_PORT:-54321}"
APP_PORT="${APP_PORT:-3100}"
SECRET="browser-jwt-secret-for-local-checks-only-0123456789"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)
BASELINE=migrations/20260101000000_baseline_v1.sql
LATER=($(ls migrations/2*.sql | grep -v "$BASELINE"))

CONF="$(mktemp)"
PIDS=()
cleanup() {
  for p in "${PIDS[@]:-}"; do
    [ -n "$p" ] || continue
    pkill -P "$p" 2>/dev/null || true
    kill "$p" 2>/dev/null || true
  done
  rm -f "$CONF"
  dropdb --if-exists "$DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

createdb "$DB"
for f in tests/stub_supabase.sql "$BASELINE" "${LATER[@]}" tests/browser/seed.sql; do
  "${PSQL[@]}" -d "$DB" -f "$f" >/dev/null 2>&1 || { echo "failed applying $f"; "${PSQL[@]}" -d "$DB" -f "$f"; exit 1; }
done

cat > "$CONF" <<EOF
db-uri = "postgres:///$DB?host=${PGHOST:-/var/run/postgresql}"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-port = $PGRST_PORT
log-level = "crit"
EOF
"$POSTGREST_BIN" "$CONF" & PIDS+=($!)
JWT_SECRET="$SECRET" POSTGREST_URL="http://127.0.0.1:$PGRST_PORT" GATEWAY_PORT="$GATEWAY_PORT" node tests/browser/gateway.mjs & PIDS+=($!)

cd ..
b64() { printf '%s' "$1" | base64 -w0 | tr '+/' '-_' | tr -d '='; }
sign() { local body="$(b64 '{"alg":"HS256","typ":"JWT"}').$(b64 "$1")"; printf '%s.%s' "$body" "$(printf '%s' "$body" | openssl dgst -sha256 -hmac "$SECRET" -binary | base64 -w0 | tr '+/' '-_' | tr -d '=')"; }
ANON="$(sign '{"role":"anon","exp":4102444800}')"
SERVICE="$(sign '{"role":"service_role","exp":4102444800}')"

export NEXT_PUBLIC_SUPABASE_URL="http://localhost:$GATEWAY_PORT"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE"
export ENCRYPTION_KEY="browser-check-encryption-key-not-real"
if curl -s -o /dev/null "http://localhost:$APP_PORT"; then echo "port $APP_PORT is already in use"; exit 1; fi
node node_modules/next/dist/bin/next build >/dev/null
node node_modules/next/dist/bin/next start -p "$APP_PORT" >/dev/null 2>&1 & PIDS+=($!)
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$APP_PORT/auth/login" && break; sleep 0.5; done

BROWSER_DB="$DB" APP_URL="http://localhost:$APP_PORT" JWT_SECRET="$SECRET" OUT_DIR="${OUT_DIR:-browser-check}" node supabase/tests/browser/check.mjs
