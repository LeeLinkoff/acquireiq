/*
 * Schema evolution note:
 *
 * This script intentionally uses simple, idempotent object-existence checks.
 * A production enhancement would use an application-aware update process that
 * detects destructive schema changes, scans source code for dependencies, and
 * requires explicit confirmation before removing data-bearing objects.
 */
 
 
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
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('requestor', 'approver', 'contracting_officer'))
);


\echo Checking/creating vendors...
CREATE TABLE IF NOT EXISTS vendors (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    cage_code VARCHAR(5) NOT NULL UNIQUE,
    contact_email TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT vendors_cage_code_format CHECK (cage_code ~ '^[A-Z0-9]{5}$')
);

\echo Checking/creating acquisition_requests...
CREATE TABLE IF NOT EXISTS acquisition_requests (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    requestor_id INTEGER NOT NULL REFERENCES users(id),
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
    id SERIAL PRIMARY KEY,
    acquisition_request_id INTEGER NOT NULL REFERENCES acquisition_requests(id) ON DELETE CASCADE,
    approver_id INTEGER NOT NULL REFERENCES users(id),
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
    id SERIAL PRIMARY KEY,
    acquisition_request_id INTEGER  NOT NULL UNIQUE REFERENCES acquisition_requests(id),
    vendor_id INTEGER NOT NULL REFERENCES vendors(id),
    award_date DATE NOT NULL,
    contract_value NUMERIC(14, 2) NOT NULL CHECK (contract_value >= 0),
    period_of_performance_end DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'terminated')),
    CONSTRAINT contracts_period_after_award CHECK (period_of_performance_end >= award_date)
);

\echo Checking/creating protests...
CREATE TABLE IF NOT EXISTS protests (
    id SERIAL PRIMARY KEY,
    acquisition_request_id INTEGER  NOT NULL REFERENCES acquisition_requests(id) ON DELETE CASCADE,
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


 
/*
 * Summary:
 * Defines the authoritative database function used to derive the current
 * approval stage for an acquisition request.
 *
 * Approval rows remain the single persisted source of truth. The current
 * stage is the lowest existing stage_sequence that still contains at least
 * one pending decision. NULL means no incomplete approval stage remains.
 *
 * The function is created only when it does not already exist so the setup/update process remains safe to rerun.
 */

\echo Checking/creating current approval stage sequence function...

DO $do$
BEGIN
    IF to_regprocedure(
        'public.get_current_approval_stage_sequence(integer)'
    ) IS NULL THEN

        EXECUTE $function$
            CREATE FUNCTION public.get_current_approval_stage_sequence(
                p_acquisition_request_id INTEGER
            )
            RETURNS INTEGER
            LANGUAGE sql
            STABLE
            AS $body$
                SELECT MIN(a.stage_sequence)
                FROM approvals a
                WHERE a.acquisition_request_id = p_acquisition_request_id
                  AND a.decision = 'pending';
            $body$;
        $function$;

    END IF;
END
$do$;

COMMENT ON FUNCTION public.get_current_approval_stage_sequence(INTEGER) IS
'Returns the lowest approval stage sequence containing at least one pending individual approval for an acquisition request. Returns NULL when no pending approvals remain. This value is derived from authoritative approval records and is not stored separately.';


/*
 * Summary:
 * Defines the authoritative database function used to derive the presentation
 * state of an individual approval stage.
 *
 * Approval-stage state is derived entirely from the authoritative approval
 * records stored in PostgreSQL. The state is not persisted separately and is
 * not independently determined by the backend or frontend.
 *
 * The current approval stage is determined by
 * get_current_approval_stage_sequence(), which returns the lowest stage
 * sequence containing at least one pending individual approval.
 *
 * Given that authoritative current stage:
 *
 *   complete
 *     The stage occurs before the current approval stage. Because the current
 *     stage is the lowest stage containing a pending approval, an earlier stage
 *     cannot contain a pending approval and is therefore complete.
 *
 *     If no pending approvals remain anywhere in the request,
 *     get_current_approval_stage_sequence() returns NULL and every existing
 *     approval stage is complete.
 *
 *   current
 *     The stage sequence equals the authoritative current approval stage.
 *
 *   future
 *     The stage occurs after the authoritative current approval stage.
 *
 * Example:
 *
 *   Current approval stage = 3
 *
 *   Stage 1 -> complete
 *   Stage 2 -> complete
 *   Stage 3 -> current
 *   Stage 4 -> future
 *
 * The function is created only when it does not already exist so the
 * setup/update process remains safe to rerun.
 */

\echo Checking/creating approval stage state function...

DO $do$
BEGIN
    IF to_regprocedure(
        'public.get_approval_stage_state(integer,integer)'
    ) IS NULL THEN

        EXECUTE $function$
            CREATE FUNCTION public.get_approval_stage_state(
                p_acquisition_request_id INTEGER,
                p_stage_sequence INTEGER
            )
            RETURNS TEXT
            LANGUAGE sql
            STABLE
            AS $body$
                SELECT
                    CASE
                        WHEN public.get_current_approval_stage_sequence(
                            p_acquisition_request_id
                        ) IS NULL
                            THEN 'complete'

                        WHEN p_stage_sequence <
                             public.get_current_approval_stage_sequence(
                                 p_acquisition_request_id
                             )
                            THEN 'complete'

                        WHEN p_stage_sequence =
                             public.get_current_approval_stage_sequence(
                                 p_acquisition_request_id
                             )
                            THEN 'current'

                        ELSE 'future'
                    END;
            $body$;
        $function$;

    END IF;
END
$do$;

COMMENT ON FUNCTION public.get_approval_stage_state(INTEGER, INTEGER) IS
'Derives the authoritative workflow state of an approval stage from the acquisition request''s approval records. Returns complete when the stage precedes the lowest stage containing a pending approval, current when it equals that stage, and future when it follows that stage. If no pending approvals remain, every existing stage is complete. The derived state is not stored separately.';


/*
 * Summary:
 * Records an approval decision only when the approval belongs to the
 * authoritative current approval stage.
 *
 * PostgreSQL owns enforcement of the persistent approval-stage write rule.
 * The approval must:
 *
 *   - belong to the specified acquisition request,
 *   - still have a pending decision, and
 *   - belong to the current approval stage derived by
 *     get_current_approval_stage_sequence().
 *
 * If any of those conditions are not satisfied, no row is updated and the
 * function returns no rows.
 *
 * The function is created only when it does not already exist so the
 * setup/update process remains safe to rerun.
 */

\echo Checking/creating approval decision function...

DO $do$
BEGIN
    IF to_regprocedure(
        'public.record_approval_decision(integer,integer,text,text)'
    ) IS NULL THEN

        EXECUTE $function$
            CREATE FUNCTION public.record_approval_decision(
                p_approval_id INTEGER,
                p_acquisition_request_id INTEGER,
                p_decision TEXT,
                p_notes TEXT
            )
            RETURNS SETOF public.approvals
            LANGUAGE plpgsql
            AS $body$
            BEGIN
                RETURN QUERY
                UPDATE public.approvals AS a
                SET
                    decision = p_decision,
                    decided_at = CURRENT_TIMESTAMP,
                    notes = p_notes
                WHERE a.id = p_approval_id
                  AND a.acquisition_request_id =
                      p_acquisition_request_id
                  AND a.decision = 'pending'
                  AND a.stage_sequence =
                      public.get_current_approval_stage_sequence(
                          p_acquisition_request_id
                      )
                RETURNING a.*;
            END;
            $body$;
        $function$;

    END IF;
END
$do$;

COMMENT ON FUNCTION public.record_approval_decision(
    INTEGER,
    INTEGER,
    TEXT,
    TEXT
) IS
'Records an individual approval decision only when the approval belongs to the specified acquisition request, is still pending, and belongs to the authoritative current approval stage. The current stage is derived by get_current_approval_stage_sequence(). Returns the updated approval row when successful and no rows when the decision cannot be recorded.';


RESET ROLE;


\echo
\echo AcquireIQ database setup/update complete.
