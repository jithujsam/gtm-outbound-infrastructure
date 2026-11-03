#!/usr/bin/env bash
# Applies stub + baseline + all migrations to throw-away databases and runs the
# SQL tests. Needs a local PostgreSQL 14+ you can create databases in:
#     PGHOST=localhost PGUSER=postgres supabase/tests/run.sh
# Never point this at a real project.
set -euo pipefail
cd "$(dirname "$0")/.."

DB="klaroh_test_$$"
DB2="klaroh_drift_$$"
DB3="klaroh_parts_$$"
DB4="klaroh_partsdrift_$$"
DB5="klaroh_backfill_$$"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)
BASELINE=migrations/20260101000000_baseline_v1.sql
SECURITY=migrations/20260101000100_security_hardening_v1.sql
# every migration after the baseline, in order
LATER=($(ls migrations/2*.sql | grep -v "$BASELINE"))
# the V2 migrations (everything after the V1 security hardening)
V2=($(ls migrations/2*.sql | grep -v "$BASELINE" | grep -v "$SECURITY"))

cleanup() { for d in "$DB" "$DB2" "$DB3" "$DB4" "$DB5"; do dropdb --if-exists "$d" >/dev/null 2>&1 || true; done; }
trap cleanup EXIT
filter() { grep -E "^(psql:.*)?(NOTICE|ERROR)|PASSED|FAIL" | sed -E 's/^psql:[^ ]+ //'; }
apply() { local db=$1; shift; for f in "$@"; do "${PSQL[@]}" -d "$db" -f "$f"; done; }
run_test() {
  # fails the script when the test file errors (psql exit code is kept through the pipe)
  local db=$1 file=$2 out
  if ! out="$("${PSQL[@]}" -d "$db" -f "$file" 2>&1)"; then echo "$out" | filter; echo "FAIL: $file"; exit 1; fi
  echo "$out" | filter
}

# Scenario 1: a brand-new database, every migration applied twice (idempotency)
createdb "$DB"
"${PSQL[@]}" -d "$DB" -f tests/stub_supabase.sql
for f in "$BASELINE" "${LATER[@]}"; do echo "applying $f"; "${PSQL[@]}" -d "$DB" -f "$f"; done
echo "re-applying migrations to prove they are idempotent"
apply "$DB" "${LATER[@]}" 2>/dev/null
run_test "$DB" tests/security.test.sql
run_test "$DB" tests/v2.test.sql
run_test "$DB" tests/portal.test.sql
run_test "$DB" tests/replies.test.sql

# Scenario 2: the schema as it really is on production (differences found by fingerprint)
createdb "$DB2"
"${PSQL[@]}" -d "$DB2" -f tests/stub_supabase.sql
apply "$DB2" "$BASELINE" tests/prod_drift_fixture.sql "${LATER[@]}"
echo "--- scenario 2: production-drift schema"
run_test "$DB2" tests/security.test.sql | grep -E "PASSED|FAIL|ERROR"
run_test "$DB2" tests/prod_drift.test.sql
run_test "$DB2" tests/v2.test.sql | grep -E "PASSED|FAIL|ERROR"
run_test "$DB2" tests/portal.test.sql | grep -E "PASSED|FAIL|ERROR"
run_test "$DB2" tests/replies.test.sql | grep -E "PASSED|FAIL|ERROR"

# Scenario 3: production-drift schema WITH realistic V1 data, then the V2
# migrations (twice): proves the back-fill preserves customer data.
createdb "$DB5"
"${PSQL[@]}" -d "$DB5" -f tests/stub_supabase.sql
apply "$DB5" "$BASELINE" tests/prod_drift_fixture.sql "$SECURITY" tests/v1_fixture.sql
echo "--- scenario 3: V1 data → V2 back-fill"
apply "$DB5" "${V2[@]}"
apply "$DB5" "${V2[@]}" 2>/dev/null
run_test "$DB5" tests/v2_backfill.test.sql

# Scenario 4: the SQL-editor parts (manual-apply/ for V1, manual-apply/v2/ for V2) must give exactly
# the same result as the migrations, one part at a time, twice each, on both the baseline and the
# production-drift schema.
expected="$(psql -X -At -d "$DB" -f verify/fingerprint.sql)"
expected_drift="$(psql -X -At -d "$DB2" -f verify/fingerprint.sql)"
for target in "$DB3" "$DB4"; do
  createdb "$target"
  "${PSQL[@]}" -d "$target" -f tests/stub_supabase.sql
  "${PSQL[@]}" -d "$target" -f "$BASELINE"
  [ "$target" = "$DB4" ] && "${PSQL[@]}" -d "$target" -f tests/prod_drift_fixture.sql
  for p in manual-apply/v1/part*.sql manual-apply/v2/[0-9]*.sql; do "${PSQL[@]}" -d "$target" -f "$p"; "${PSQL[@]}" -d "$target" -f "$p"; done 2>/dev/null
done
# the V1 parts refuse to run once V2 is installed (they would undo V2 changes)
if "${PSQL[@]}" -d "$DB3" -f manual-apply/v1/part3_public_page_functions.sql >/dev/null 2>&1; then
  echo "FAIL: a V1 manual-apply part ran on a V2 database"; exit 1
fi
echo "V1 manual-apply parts refuse to run on V2: OK"
[ "$(psql -X -At -d "$DB3" -f verify/fingerprint.sql)" = "$expected" ] && echo "manual-apply parts (V1 + V2) == migrations (baseline schema): OK" || { echo "FAIL: parts differ from migration (baseline)"; exit 1; }
[ "$(psql -X -At -d "$DB4" -f verify/fingerprint.sql)" = "$expected_drift" ] && echo "manual-apply parts (V1 + V2) == migrations (production-drift schema): OK" || { echo "FAIL: parts differ from migration (drift)"; exit 1; }

echo "schema fingerprint after all migrations: $(psql -X -At -d "$DB" -f verify/fingerprint.sql | wc -l) lines"
