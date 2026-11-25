#!/bin/sh
# Creates or updates the AcquireIQ schema on RDS. Safe to run on
# every deploy: setup-database.sql only creates what is missing.
#
# Connection comes from standard libpq env vars set by the ECS
# task: PGHOST, PGUSER, PGPASSWORD, PGSSLMODE.
# DB_APP_PASSWORD is the password the backend connects with.
set -eu

# 1. Create the app role with the real password before the
#    bootstrap script runs, so its hardcoded local password is
#    never used (the script skips an existing role).
# 2. Let the RDS admin act as that role. RDS "postgres" is not a
#    true superuser, and PostgreSQL 16+ requires this for
#    CREATE DATABASE ... OWNER and SET ROLE in the script.
psql -X -v ON_ERROR_STOP=1 -d postgres -v app_pw="$DB_APP_PASSWORD" <<'SQL'
SELECT 'CREATE ROLE acquireiq_app LOGIN'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'acquireiq_app')
\gexec
ALTER ROLE acquireiq_app PASSWORD :'app_pw';
GRANT acquireiq_app TO CURRENT_USER WITH SET TRUE;
SQL

psql -X -v ON_ERROR_STOP=1 -d postgres -f /setup-database.sql

echo "Database setup complete."
