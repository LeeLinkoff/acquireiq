\set ON_ERROR_STOP on

\echo Checking application role acquireiq_app...

SELECT 'CREATE ROLE acquireiq_app LOGIN PASSWORD ''acquireUserPassword'''
WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'acquireiq_app'
)
\gexec

\echo Checking database acquireiq...

SELECT 'CREATE DATABASE acquireiq OWNER acquireiq_app'
WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_database
    WHERE datname = 'acquireiq'
)
\gexec

\echo Checking database ownership...

SELECT 'ALTER DATABASE acquireiq OWNER TO acquireiq_app'
WHERE EXISTS (
    SELECT 1
    FROM pg_catalog.pg_database
    WHERE datname = 'acquireiq'
      AND pg_catalog.pg_get_userbyid(datdba) <> 'acquireiq_app'
)
\gexec

\echo Connecting to acquireiq...
\connect acquireiq

-- Create application objects as the application role so ownership is correct.
SET ROLE acquireiq_app;

\echo Checking/creating users...
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('requestor', 'approver', 'contracting_officer'))
);

\echo Checking/creating vendors...
CREATE TABLE IF NOT EXISTS vendors (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    cage_code VARCHAR(5) NOT NULL UNIQUE,
    contact_email TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT vendors_cage_code_format CHECK (cage_code ~ '^[A-Z0-9]{5}$')
);

\echo Checking/creating acquisition_requests...
CREATE TABLE IF NOT EXISTS acquisition_requests (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    requestor_id BIGINT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'submitted', 'in_review', 'approved', 'awarded', 'rejected')),
    priority TEXT NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    budget_ceiling NUMERIC(14, 2) NOT NULL CHECK (budget_ceiling >= 0),
    fiscal_year INTEGER NOT NULL CHECK (fiscal_year BETWEEN 2000 AND 2200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

\echo Checking/creating approvals...
CREATE TABLE IF NOT EXISTS approvals (
    id BIGSERIAL PRIMARY KEY,
    acquisition_request_id BIGINT NOT NULL REFERENCES acquisition_requests(id) ON DELETE CASCADE,
    approver_id BIGINT NOT NULL REFERENCES users(id),
    stage_name TEXT NOT NULL,
    stage_sequence INTEGER NOT NULL CHECK (stage_sequence > 0),
    decision TEXT NOT NULL DEFAULT 'pending'
        CHECK (decision IN ('pending', 'approved', 'rejected')),
    decided_at TIMESTAMPTZ,
    notes TEXT,
    CONSTRAINT approvals_decision_timestamp_consistent CHECK (
        (decision = 'pending' AND decided_at IS NULL)
        OR (decision IN ('approved', 'rejected') AND decided_at IS NOT NULL)
    ),
    CONSTRAINT approvals_one_assignment_per_stage UNIQUE (
        acquisition_request_id,
        approver_id,
        stage_sequence
    )
);

\echo Checking/creating contracts...
CREATE TABLE IF NOT EXISTS contracts (
    id BIGSERIAL PRIMARY KEY,
    acquisition_request_id BIGINT NOT NULL UNIQUE REFERENCES acquisition_requests(id),
    vendor_id BIGINT NOT NULL REFERENCES vendors(id),
    award_date DATE NOT NULL,
    contract_value NUMERIC(14, 2) NOT NULL CHECK (contract_value >= 0),
    period_of_performance_end DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'terminated')),
    CONSTRAINT contracts_period_after_award CHECK (period_of_performance_end >= award_date)
);

\echo Checking/creating protests...
CREATE TABLE IF NOT EXISTS protests (
    id BIGSERIAL PRIMARY KEY,
    acquisition_request_id BIGINT NOT NULL REFERENCES acquisition_requests(id) ON DELETE CASCADE,
    filed_at TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ,
    resolution TEXT,
    reason TEXT NOT NULL,
    CONSTRAINT protests_resolution_consistent CHECK (
        (resolved_at IS NULL AND resolution IS NULL)
        OR (resolved_at IS NOT NULL AND resolution IS NOT NULL)
    ),
    CONSTRAINT protests_resolution_after_filing CHECK (
        resolved_at IS NULL OR resolved_at >= filed_at
    )
);

\echo Checking/creating indexes...
CREATE INDEX IF NOT EXISTS idx_acquisition_requests_status_priority
    ON acquisition_requests (status, priority);

CREATE INDEX IF NOT EXISTS idx_approvals_request_stage
    ON approvals (acquisition_request_id, stage_sequence);

CREATE INDEX IF NOT EXISTS idx_protests_open_request
    ON protests (acquisition_request_id)
    WHERE resolved_at IS NULL;

RESET ROLE;

\echo
\echo AcquireIQ database and schema bootstrap complete.
