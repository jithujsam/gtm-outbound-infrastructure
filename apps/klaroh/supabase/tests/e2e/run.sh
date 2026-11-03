#!/usr/bin/env bash
# End-to-end test of the V2 sync against a real database through PostgREST:
#   PostgreSQL (production-drift schema + realistic V1 data + all migrations)
#   → PostgREST (the same API Supabase exposes)
#   → the application's own sync/attach code (supabase-js query builder)
# Only the Instantly HTTP API is faked.
#
# Needs a local PostgreSQL you can create databases in, and a PostgREST binary
# (https://github.com/PostgREST/postgrest/releases):
#     POSTGREST_BIN=/path/to/postgrest PGHOST=/var/run/postgresql supabase/tests/e2e/run.sh
# Never point this at a real project.
set -euo pipefail
cd "$(dirname "$0")/../.."

: "${POSTGREST_BIN:?set POSTGREST_BIN to a postgrest binary}"
DB="klaroh_e2e_$$"
PORT="${E2E_PORT:-3999}"
SECRET="e2e-jwt-secret-for-local-tests-only-0123456789"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)
BASELINE=migrations/20260101000000_baseline_v1.sql
SECURITY=migrations/20260101000100_security_hardening_v1.sql
V2=($(ls migrations/2*.sql | grep -v "$BASELINE" | grep -v "$SECURITY"))

CONF="$(mktemp)"
cleanup() {
  [ -n "${PGRST_PID:-}" ] && kill "$PGRST_PID" 2>/dev/null || true
  rm -f "$CONF"
  dropdb --if-exists "$DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

createdb "$DB"
for f in tests/stub_supabase.sql "$BASELINE" tests/prod_drift_fixture.sql "$SECURITY" tests/v1_fixture.sql "${V2[@]}"; do
  "${PSQL[@]}" -d "$DB" -f "$f" 2>/dev/null
done

cat > "$CONF" <<EOF
db-uri = "postgres:///$DB?host=${PGHOST:-/var/run/postgresql}"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-port = $PORT
log-level = "crit"
EOF
"$POSTGREST_BIN" "$CONF" &
PGRST_PID=$!
for _ in $(seq 1 50); do curl -s "http://localhost:$PORT/" >/dev/null 2>&1 && break; sleep 0.2; done

cd ..
E2E_URL="http://localhost:$PORT" E2E_JWT_SECRET="$SECRET" \
ENCRYPTION_KEY="e2e-encryption-key-not-a-real-secret" \
  node --test supabase/tests/e2e/*.e2e.test.ts
