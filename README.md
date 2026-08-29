# AcquireIQ

AI-assisted government IT acquisition pipeline tracker built for the
iAdeptive Full-Stack Engineering Lead Challenge.

## Overview

AcquireIQ models a government IT acquisition pipeline covering
acquisition requests, users, vendors, contracts, approvals, and
protests.

The application adds two important capabilities to a traditional
acquisition tracker:

-   **Parallel approval stages** --- multiple approvers can be assigned
    to the same stage. A request advances toward approval only after every
    required approver in the current stage has approved. A pending or
    rejected decision in the current stage blocks approval.
-   **AI-assisted pipeline search** --- contracting officers can search
    the acquisition pipeline using natural language instead of manually
    constructing filters.

The central design principle is simple: **AI output is useful input, but
it is not trusted application state.** LLM-generated filters are
validated by deterministic application logic before they can affect a
database query.

------------------------------------------------------------------------

## Architecture

```text
+-----------------------------------------------------------------------+
|                               React UI                                |
|                                                                       |
|  Acquisition Pipeline   Request Detail   Status Actions   AI Search   |
+----------------------------------+------------------------------------+
                                   |
                                   | REST / JSON
                                   v
+-----------------------------------------------------------------------+
|                         Node / Express API                            |
|                                                                       |
|  Request Validation        Business Rules                             |
|  Approval Workflow         Status Transitions                         |
|  AI Search                                                            |
+----------------------+-------------------------------+----------------+
                       |                               |
                       |                               | Natural-language
                       |                               | query
                       |                               v
                       |                    +--------------------------+
                       |                    |       LLM Provider       |
                       |                    |                          |
                       |                    |  Natural Language        |
                       |                    |         |                |
                       |                    |         | Convert to     |
                       |                    |         v                |
                       |                    |  Structured Filter       |
                       |                    +------------+-------------+
                       |                                 |
                       |                                 | Structured Filter
                       |                                 v
                       |                    +--------------------------+
                       |                    |    Node / Express API    |
                       |                    |   AI Filter Validation   |
                       |                    |                          |
                       |                    |  Structured Filter       |
                       |                    |         |                |
                       |                    |         | Validate       |
                       |                    |         | allowed fields,|
                       |                    |         | operators,     |
                       |                    |         | and values     |
                       |                    |         v                |
                       |                    |  Validated Filter        |
                       |                    |         |                |
                       |                    |         | Map validated  |
                       |                    |         | fields and     |
                       |                    |         | operators to   |
                       |                    |         | backend-owned  |
                       |                    |         | SQL            |
                       |                    |         v                |
                       |                    |  Parameterized SQL       |
                       |                    +------------+-------------+
                       |                                 |
                       |                                 |
                       |                                 |
                       | Backend constructs              |
                       | Parameterized SQL               |
                       |                                 |
                       v                                 v
             +---------------------------------------------------------+
             |                       PostgreSQL                        |
             |                                                         |
             | Acquisition Requests   Users       Vendors              |
             | Contracts              Approvals   Protests             |
             +---------------------------------------------------------+
```

The LLM never connects directly to PostgreSQL and never supplies
executable SQL.

------------------------------------------------------------------------

## Technology Stack

### Frontend

-   React
-   Vite
-   centralized API client
-   reusable components for pipeline, request detail, workflow actions,
    dashboard data, and AI search
-   explicit loading, error, conflict, and AI-confidence/fallback states
-   configurable client-side logging

### Backend

-   Node.js
-   Express
-   TypeScript
-   TypeScript strict mode
-   REST API
-   Swagger / OpenAPI
-   centralized request and application logging
-   service-layer business rules
-   deterministic request and AI-output validation
-   parameterized PostgreSQL queries

### Database

-   PostgreSQL
-   native `psql` database/schema bootstrap
-   idempotent database and schema creation
-   six required domain tables
-   foreign keys and CHECK constraints
-   production-relevant indexes
-   demonstration seed data
-   transaction-based concurrency protection for workflow state

### AI

-   LLM-backed natural-language query interpretation
-   structured filter output rather than generated SQL
-   deterministic application-side validation
-   explicit malformed-output, low-confidence, and provider-failure
    handling
-   provider integration isolated from endpoint and database logic

------------------------------------------------------------------------

## Repository Structure

The project is organized around the following structure:

```text
acquireiq/
|
+-- .githooks/
|   +-- pre-commit
|
+-- .github/
|   +-- workflows/
|       +-- code-checks.yml
|       +-- deploy-to-vps.yml
|
+-- backend/
|   +-- migrations/
|   |   +-- 001_initial_schema.sql
|   |
|   +-- scripts/
|   |   +-- create-database.bat
|   |   +-- create-database.sql
|   |   +-- generate-openapi-schemas.ts
|   |   +-- seed-database.bat
|   |
|   +-- seeds/
|   |   +-- 001_acquireiq_seed.sql
|   |
|   +-- src/
|   |   +-- db/
|   |   |   +-- pool.ts
|   |   |
|   |   +-- errors/
|   |   |   +-- api-error.ts
|   |   |
|   |   +-- logging/
|   |   |   +-- logger.ts
|   |   |
|   |   +-- routes/
|   |   |   +-- api-router.ts
|   |   |   +-- assist-router.ts
|   |   |   +-- dashboard-router.ts
|   |   |   +-- request-router.ts
|   |   |
|   |   +-- services/
|   |   |   +-- ai/
|   |   |   |   +-- openai-provider.ts
|   |   |   |   +-- prompt.ts
|   |   |   |   +-- provider.ts
|   |   |   |   +-- service.ts
|   |   |   |   +-- types.ts
|   |   |   |
|   |   |   +-- requests.ts
|   |   |
|   |   +-- schemas.generated.ts
|   |   +-- server.ts
|   |   +-- swagger-spec.ts
|   |
|   +-- .env.example
|   +-- Dockerfile
|   +-- package-lock.json
|   +-- package.json
|   +-- README.md
|   +-- tsconfig.json
|
+-- dev_reports/
|
+-- dev_scripts/
|   +-- act.bat
|   +-- build_back_docker.bat
|   +-- build_back_local.bat
|   +-- build_front.bat
|   +-- clean_act.bat
|   +-- clear_actions_history.bat
|   +-- deploy_setup.bat
|   +-- docker_status.bat
|   +-- git_staged_diff_report.bat
|   +-- git_status.bat
|   +-- git_unstaged_diff_report.bat
|   +-- lint_workflows.bat
|   +-- run_back.bat
|   +-- run_front.bat
|   +-- setup_git_hooks.bat
|   +-- start_docker.bat
|   +-- test-all-workflows.bat
|   +-- test_code_checks_yml.bat
|   +-- test_deploy_yml.bat
|   +-- uninstall_act.bat
|
+-- docs/
|   +-- Program_Specification_Checklist.docx
|   +-- Requirements_Full.pdf
|
+-- frontend/
|   +-- src/
|   |   +-- api/
|   |   |   +-- client.js
|   |   |
|   |   +-- components/
|   |   |   +-- AppHeaderCard.jsx
|   |   |   +-- BackendHealthCard.jsx
|   |   |   +-- ErrorMessage.jsx
|   |   |   +-- GenericTabs.jsx
|   |   |   +-- MainContentCard.jsx
|   |   |
|   |   +-- logging/
|   |   |   +-- logger.js
|   |   |
|   |   +-- App.css
|   |   +-- App.jsx
|   |   +-- main.jsx
|   |
|   +-- index.html
|   +-- package-lock.json
|   +-- package.json
|   +-- README.md
|   +-- vite.config.js
|
+-- secrets/
|   +-- [local deployment/development secrets - not committed]
|
+-- .gitignore
+-- ARCHITECTURE_AND_DEPLOYMENT.md
+-- DESIGN_CONSIDERATIONS.md
+-- README.md
+-- WORKFLOW_STATE_MACHINE.md
```

------------------------------------------------------------------------

## Core Domain

AcquireIQ contains six primary domain tables:

```text
users
acquisition_requests
vendors
contracts
approvals
protests
```

### Parallel approvals

Multiple approval records may share the same `stage_sequence`. Those
records form a parallel approval stage.

A request advances toward approval only after every required approver
in the current stage has approved. A pending or rejected decision in
the current stage blocks approval.

### Database integrity

Rules that must always be true about stored data should be enforced by PostgreSQL itself when possible, rather than relying only on application code.

The schema includes primary keys, foreign keys, uniqueness rules, CHECK constraints, and indexes for common workflow access patterns.

------------------------------------------------------------------------

## REST API

AcquireIQ provides the challenge API:

```text
GET    /requests
GET    /requests/:id
POST   /requests
PATCH  /requests/:id/status
GET    /dashboard
POST   /assist/query
```

Infrastructure endpoints are also available:

```text
GET    /api/health
GET    /api/docs
```

Swagger / OpenAPI documentation is exposed through `/api/docs`.

`GET /requests/:id` returns the acquisition request together with its
approval records, contract when one exists, and protests. Approval
records include `stageSequence`, allowing parallel approvers assigned
to the same stage to be identified without duplicating workflow logic
in the client.

HTTP routes remain thin: they parse and validate requests, invoke
application services, select HTTP status codes, and format responses.
Workflow and acquisition business rules live outside the route layer.

------------------------------------------------------------------------

## Workflow and Concurrency Safety

Acquisition request status changes are controlled by a fixed workflow state machine:

`draft → submitted → in_review → approved → awarded`

Requests may also transition to `rejected` from supported workflow states. `awarded` and `rejected` are terminal states. Invalid jumps, skipped workflow states, and attempts to revive terminal requests are rejected with HTTP `422`.

The complete transition rules and approval semantics are documented in [WORKFLOW_STATE_MACHINE.md](WORKFLOW_STATE_MACHINE.md).

Status transitions are concurrency-safe. `PATCH /requests/:id/status` executes the transition inside a PostgreSQL transaction and locks the acquisition request row with `SELECT ... FOR UPDATE` before validating its current state. This ensures concurrent callers cannot both validate a transition against the same stale status.

For example, if two clients simultaneously attempt to transition the same request from `draft` to `submitted`, one transaction acquires the row lock first and completes the transition. The second transaction then acquires the lock and re-evaluates the now-current `submitted` state, causing the duplicate `submitted → submitted` transition to be rejected.

The automated concurrency regression test verifies this behavior by creating a fresh request and issuing two simultaneous transition requests. The expected and verified result is exactly one HTTP `200` response and one HTTP `422` response, with the request ending in `submitted`.

------------------------------------------------------------------------

## AI-Assisted Search

AcquireIQ exposes natural-language pipeline search through:

```text
POST /assist/query
```

Example:

```text
high-priority requests over $250k
```

Processing flow:

```text
Natural-language query
        |
        v
LLM provider
        |
        v
Structured filter
        |
        | untrusted input
        v
Application validation
        |
        v
Validated filter
        |
        v
Server-owned parameterized SQL
        |
        v
PostgreSQL
        |
        v
Matching acquisition requests
```

The LLM does **not** generate executable SQL.

Only supported filter fields, operators, and values are accepted.
Hallucinated fields, unsupported values, malformed responses, and other
out-of-schema model output are rejected before database access.

The validated AI filter allow-list currently supports:
-   fields: `status`, `priority`, `fiscalYear`, `budgetCeiling`
-   operators: `eq`, `gt`, `gte`, `lt`, `lte`

If the provider fails or the response cannot be trusted, the API returns
an explicit fallback/low-confidence result rather than silently treating
uncertain AI output as valid. The React UI will distinguish that state from
a normal successful AI-assisted result.

------------------------------------------------------------------------

## Database Setup

AcquireIQ uses PostgreSQL's native `psql` tooling for initial database
and schema setup rather than an additional TypeScript migration runner.

From the repository root on Windows:

```bat
backend\scripts\create-database.bat
```

The launcher:

1.  locates the installed PostgreSQL `bin\psql.exe`
2.  prompts once for the PostgreSQL administrator password
3.  executes `backend/scripts/create-database.sql`

The SQL bootstrap idempotently checks and creates the `acquireiq_app`
application role, `acquireiq` database, required tables, constraints,
foreign keys, and indexes. Existing objects are checked before creation
so the setup can be safely rerun.

This is the project's runnable migration-equivalent mechanism. A BAT
launcher with native `psql` execution is used because the bootstrap is
entirely SQL-native and requires no application-layer logic. This avoids
unnecessary Node imports, dependencies, migration-runner code, and an
additional abstraction layer.

### Seed data

After the schema is ready:

```bash
cd backend
npm run seed
```

The seed runner executes:

```text
backend/seeds/001_acquireiq_seed.sql
```

The demonstration dataset contains data across all six domain tables and
includes both a parallel approval stage and an open protest.

The seed script intentionally resets demonstration data before reloading
it, so seeding is a separate explicit step rather than part of database
bootstrap.

------------------------------------------------------------------------

## Local Development

### Prerequisites

-   Node.js
-   npm
-   PostgreSQL
-   an OpenAI API key for live AI interpretation (optional for backend startup)

### 1. Create the database and schema

From the repository root:

```bat
backend\scripts\create-database.bat
```

### 2. Configure and seed the backend

```bash
cd backend
npm install
npm run generate:schemas
npm run seed
npm run dev
```

Backend:

```text
http://localhost:3002
```

Health:

```text
http://localhost:3002/api/health
```

Swagger / OpenAPI:

```text
http://localhost:3002/api/docs
```

### 3. Start the frontend

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Vite prints the local frontend URL when the development server starts.

------------------------------------------------------------------------

## Configuration

Backend configuration is supplied through environment variables. Secrets
remain backend-only and are never committed to the repository.

Database configuration uses `DATABASE_URL` for normal application and
seed connections.

```env
DATABASE_URL=postgresql://acquireiq_app:<password>@localhost:5432/acquireiq
```

Backend logging supports:

```env
LOG_LEVEL=none
LOG_LEVEL=summary
LOG_LEVEL=verbose
```

Frontend logging supports:

```env
VITE_LOG_LEVEL=none
VITE_LOG_LEVEL=summary
VITE_LOG_LEVEL=verbose
```

Logging defaults to `none`.

AcquireIQ currently uses OpenAI as its LLM provider. Reviewers supply
their own API key through the backend environment without modifying
source code:

```env
OPENAI_API_KEY=<reviewer-api-key>
OPENAI_MODEL=gpt-5.4-mini
```

`OPENAI_API_KEY` is required for live AI interpretation. `OPENAI_MODEL`
is optional and defaults to `gpt-5.4-mini`.

Because Vite exposes `VITE_*` environment variables to browser code,
the OpenAI API key and all other secrets remain backend-only and are
never stored in a `VITE_*` variable.

**No database password, LLM API key, or other secret is committed to
this repository.**

------------------------------------------------------------------------

## Frontend Behavior

The React application provides the user-facing workflow for:

-   viewing the acquisition pipeline
-   viewing acquisition-request detail
-   creating acquisition requests
-   viewing approval and protest state
-   performing permitted status actions
-   viewing dashboard information
-   submitting natural-language AI-assisted searches
-   displaying returned acquisition matches
-   visibly distinguishing normal results from AI
    fallback/low-confidence states

The frontend does not duplicate authoritative workflow rules. It uses
API responses to determine and display valid state, while the backend
remains responsible for enforcing transitions and database integrity.

------------------------------------------------------------------------

## Design Principles

### Keep HTTP routes thin

Routes handle HTTP concerns. Business behavior belongs in services and
database-aware workflow logic.

### Let PostgreSQL protect persistent state

Constraints, transactions, and indexes provide durable guarantees that
do not depend on a particular UI or API caller behaving correctly.

### Treat AI output as untrusted input

The LLM interprets language. It does not control database access. Model
output must pass deterministic validation before it can influence a
query.

### Prefer explicit behavior over unnecessary abstraction

Dependencies and abstractions must earn their place by improving
correctness, maintainability, or clarity. SQL-native database bootstrap
therefore remains SQL-native rather than adding an application-layer
migration framework solely to execute SQL.

### Make failure visible

API failures, workflow conflicts, loading states, and AI uncertainty are
represented explicitly rather than silently hidden.

------------------------------------------------------------------------

## Testing

Testing focuses on the behavior with the greatest correctness risk:

```text
PASS: 98
FAIL: 0
TOTAL: 98
ALL BACKEND REGRESSION TESTS PASSED.
```

-   valid status transitions
-   invalid status transitions
-   parallel approval completion
-   concurrent status-update attempts
-   request validation
-   request-detail behavior, including approvals, contract, and protests
-   PostgreSQL primary-key sequence integrity
-   database-backed workflow invariants
-   AI structured-filter validation
-   hallucinated or malformed AI output
-   AI provider/fallback behavior

Tests exercise backend business behavior independently of the React UI
wherever practical.

------------------------------------------------------------------------

## Challenge Scope

The challenge prioritizes strong, defensible end-to-end behavior over
unnecessary feature count.

### Target implementation scope

The completed challenge implementation is designed to cover:

-   PostgreSQL domain schema and demonstration data
-   parallel approval modeling
-   acquisition-request REST API
-   concurrency-safe status transitions
-   dashboard data
-   AI-assisted natural-language pipeline search
-   deterministic validation of AI output
-   React acquisition workflow
-   explicit error and AI-fallback states
-   Swagger / OpenAPI documentation
-   targeted tests around correctness-sensitive behavior

### Intentionally out of scope

Authentication and production deployment are outside the challenge's
required implementation scope.

Optional stretch features are implemented only when they add more value
than strengthening required behavior, tests, or documentation.

------------------------------------------------------------------------

## Key Design Decisions and Tradeoffs

### Parallel approvals

Parallelism is represented in the data model by multiple approval
assignments sharing the same `stage_sequence`. This keeps workflow state
explicit and queryable without introducing a separate stage table solely
for the challenge.

### Database bootstrap

The initial database/schema setup is executed directly by native
PostgreSQL tooling. The BAT launcher is the runnable migration
equivalent and keeps SQL setup independent from Node application code.

### Concurrency control

Status changes are protected at the database transaction boundary
because correctness must hold even when multiple API requests arrive
simultaneously.

### AI boundary

The LLM is limited to interpreting natural language into a structured
filter. The backend owns validation and SQL construction, reducing the
blast radius of hallucinated or malformed model output.

### Frontend responsibility

The React UI communicates state and available actions but does not
become the source of truth for workflow correctness. Enforcement remains
server-side.

------------------------------------------------------------------------

## Lead Design Note

The final submission includes a 300--500 word Lead Design Note covering:

1.  the most important schema-modeling decision and its tradeoff
2.  one API contract decision that would change with additional time
3.  AI hallucination/provider-failure handling and production
    reliability measurement
4.  one design concern at approximately 10x scale and the proposed
    solution
5.  the single highest-value next improvement for a real contracting
    office

The note is maintained with the challenge documentation so reviewers can
distinguish deliberate tradeoffs from accidental omissions.

------------------------------------------------------------------------

## Documentation

Supporting challenge materials are maintained under `docs/`, including
the original iAdeptive requirements and the AcquireIQ implementation
specification/checklist.

The source requirements remain unchanged. The implementation
specification records how AcquireIQ satisfies those requirements and
captures implementation decisions and tradeoffs.

------------------------------------------------------------------------

## Project Status

**Backend implementation complete**

The AcquireIQ backend is complete and frozen for frontend integration.
The PostgreSQL schema and seed data, REST API, request-detail behavior,
workflow state machine, parallel approval enforcement, concurrency-safe
status transitions, dashboard API, AI-assisted search, deterministic
AI-output validation, safe fallback behavior, and Swagger / OpenAPI
documentation are implemented.

The backend TypeScript/OpenAPI build passes, and the complete backend
regression suite passes all 98 checks.

Frontend sections in this README describe the intended completed
challenge experience and will be reconciled with the final React
implementation before submission.