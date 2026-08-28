-- AcquireIQ initial PostgreSQL schema
-- PostgreSQL is the authoritative store for acquisition workflow state.

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('requestor', 'approver', 'contracting_officer'))
);

CREATE TABLE vendors (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    cage_code VARCHAR(5) NOT NULL UNIQUE,
    contact_email TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT vendors_cage_code_format CHECK (cage_code ~ '^[A-Z0-9]{5}$')
);

CREATE TABLE acquisition_requests (
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

CREATE TABLE approvals (
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

CREATE TABLE contracts (
    id BIGSERIAL PRIMARY KEY,
    acquisition_request_id BIGINT NOT NULL UNIQUE REFERENCES acquisition_requests(id),
    vendor_id BIGINT NOT NULL REFERENCES vendors(id),
    award_date DATE NOT NULL,
    contract_value NUMERIC(14, 2) NOT NULL CHECK (contract_value >= 0),
    period_of_performance_end DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'terminated')),
    CONSTRAINT contracts_period_after_award CHECK (period_of_performance_end >= award_date)
);

CREATE TABLE protests (
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

-- GET /requests filters by status and priority. This index avoids scanning the
-- full request table as the acquisition pipeline grows.
CREATE INDEX idx_acquisition_requests_status_priority
    ON acquisition_requests (status, priority);

-- Approval-chain and workflow checks repeatedly look up a request's approvals
-- in stage order, including parallel approvers that share stage_sequence.
CREATE INDEX idx_approvals_request_stage
    ON approvals (acquisition_request_id, stage_sequence);

-- Open-protest counts and request-detail lookups benefit from locating protests
-- by request while only indexing unresolved rows for the dashboard case.
CREATE INDEX idx_protests_open_request
    ON protests (acquisition_request_id)
    WHERE resolved_at IS NULL;
