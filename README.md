# AcquireIQ

AI-assisted government IT acquisition pipeline tracker built for the iAdeptive Full-Stack Engineering Lead Challenge.

## Overview

AcquireIQ models a government IT acquisition pipeline covering acquisition requests, users, vendors, contracts, approvals, and protests.

The application implements acquisition-request tracking and status advancement, dashboard reporting, request creation and detail, and AI-assisted natural-language pipeline search.

Parallel approvals are supported at the data-model and read/display levels. Multiple approvers can be assigned to the same `stage_sequence`, and existing approval stages and decisions are returned by the API and displayed in the UI. **I initially attempted to implement the approval workflow more completely by filling in behavior that appeared reasonable from the written requirements. However, once the API and UI were integrated and I exercised the workflow end to end from a user's perspective, inconsistencies in those assumptions became apparent.** The challenge does not fully define how approval decisions are recorded, how mixed approved/rejected decisions affect progression, or how approval-stage progression relates to request status. Had those gaps been apparent during my initial requirements review, I would have sought clarification before implementation. Given the challenge timebox and lack of access to end users or acquisition-domain SMEs, I ultimately removed the assumed workflow behavior rather than present invented business rules as requirements.

The central design principle is simple: **AI output is useful input, but it is not trusted application state.** LLM-generated filters are validated by deterministic application logic before they can affect a database query.

------------------------------------------------------------------------

## Architecture

```text
+-------------------------------------------------------------------------+
|                               React UI                                  |
|                                                                         |
|  Acquisition Pipeline     Create Request   Request Detail   AI Search   |
|  Request Filtering        Request Status Actions                        |
+----------------------------------+--------------------------------------+
                                   |
                                   | REST / JSON
                                   v
+-----------------------------------------------------------------------+
|                         Node / Express API                            |
|                                                                       |
|  Request Validation        Request Filtering                          |
|  Request Status Updates    Request Detail                             |
|  Dashboard                 AI Search                                  |
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

The LLM never connects directly to PostgreSQL and never supplies executable SQL.

------------------------------------------------------------------------

## Technology Stack

### Frontend

-   React
-   Vite
-   centralized API client
-   reusable components for pipeline, request creation, request detail, request status actions, dashboard data, and AI search
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
-   service-layer request-status and validation rules
-   deterministic request and AI-output validation
-   parameterized PostgreSQL queries
-   The challenge permits Node, Python, or Go for the API. AcquireIQ uses Node.js with TypeScript and Express. I chose Node because it keeps the backend in the same JavaScript/TypeScript ecosystem as the React frontend while remaining well suited to the challenge's REST API and PostgreSQL integration. TypeScript strict mode adds compile-time checking around API contracts, service boundaries, and database-facing application logic.

### Database

-   PostgreSQL
-   native `psql` database/schema bootstrap
-   idempotent database and schema creation
-   six required domain tables
-   foreign keys and CHECK constraints
-   production-relevant indexes
-   demonstration seed data
-   transaction-based concurrency protection for request-status updates

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
|   +-- Requirements_Full.docx
|
+-- frontend/
|   +-- src/
|   |   +-- api/
|   |   |   +-- client.js
|   |   |
|   |   +-- components/
|   |   |   +-- AcquisitionPipeline.jsx
|   |   |   +-- AppHeaderCard.jsx
|   |   |   +-- ApprovalStage.jsx
|   |   |   +-- BackendHealthCard.jsx
|   |   |   +-- CreateRequest.jsx
|   |   |   +-- Dashboard.jsx
|   |   |   +-- GenericTabs.jsx
|   |   |   +-- MainContentCard.jsx
|   |   |   +-- Message.jsx
|   |   |   +-- Modal.jsx
|   |   |   +-- PipelineFilters.jsx
|   |   |   +-- RequestCard.jsx
|   |   |   +-- RequestDetail.jsx
|   |   |
|   |   +-- logging/
|   |   |   +-- logger.js
|   |   |
|   |   +-- styles/
|   |   |   +-- App.css
|   |   |   +-- create-request.css
|   |   |   +-- dashboard.css
|   |   |   +-- error-message.css
|   |   |   +-- modal.css
|   |   |   +-- pipeline.css
|   |   |   +-- request-detail.css
|   |   |
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
+-- REQUIREMENTS_TO_DESIGN_VERIFICATION.md
+-- REQUEST_STATUS_STATE_MACHINE.md
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

Multiple approval records may share the same `stage_sequence`. Those records represent parallel approvers within the same approval stage.

AcquireIQ supports this structure at the data-model and read/display levels. Existing approval records and decisions can be stored, retrieved, grouped by `stage_sequence`, and displayed in request detail.

The application does not provide operations for assigning approvers, recording approval decisions, or advancing approval stages. The challenge does not fully define those operations or how approval-stage progression relates to acquisition-request status, so that behavior is intentionally not inferred or implemented.

### Database integrity

Rules that must always be true about stored data should be enforced by PostgreSQL itself when possible, rather than relying only on application code.

The schema includes primary keys, foreign keys, uniqueness rules, CHECK constraints, and indexes for common application access patterns.

For example, the schema requires a contract's `period_of_performance_end` to be on or after its `award_date` and requires approval decision timestamps to remain consistent with the recorded approval decision.

The `idx_acquisition_requests_status_priority` index supports the pipeline's common filtering of acquisition requests by status and priority.

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

`GET /requests/:id` returns the acquisition request together with its approval records, contract when one exists, and protests. Approval records include `stageSequence`, allowing parallel approvers assigned to the same stage to be identified by the client.

HTTP routes remain thin: they parse and validate requests, invoke application services, select HTTP status codes, and format responses.

Request-status and acquisition business rules live outside the route layer.

------------------------------------------------------------------------

## Request Status and Concurrency Safety

Acquisition-request status changes are controlled by a fixed request-status state machine:

`draft → submitted → in_review → approved → awarded`

Requests may also transition from `submitted` to `rejected` or from `in_review` to `rejected`. `awarded` and `rejected` are terminal statuses.

The complete acquisition-request status transition rules are documented in [REQUEST_STATUS_STATE_MACHINE.md](REQUEST_STATUS_STATE_MACHINE.md).

Status transitions are concurrency-safe. `PATCH /requests/:id/status` executes the operation inside a PostgreSQL transaction and locks the acquisition-request row with `SELECT ... FOR UPDATE` before the API/service validates the requested transition. The API/service owns the fixed transition rules; the database row lock ensures those rules are evaluated against the authoritative current status when concurrent callers attempt to update the same request.

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

The LLM prompt used for this integration is checked into the repository at [`backend/src/services/ai/prompt.ts`](backend/src/services/ai/prompt.ts).

Only supported filter fields, operators, and values are accepted.
Hallucinated fields, unsupported values, malformed responses, and other
out-of-schema model output are rejected before database access.

The validated AI filter allow-list currently supports:
-   fields: `status`, `priority`, `fiscalYear`, `budgetCeiling`
-   operators: `eq`, `gt`, `gte`, `lt`, `lte`

If the provider fails or the response cannot be trusted, the API returns
an explicit fallback/low-confidence result rather than silently treating
uncertain AI output as valid. The React UI distinguishes that state from
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

After the schema is ready, from the repository root:

```bat
backend\scripts\seed-database.bat
```

The seed launcher locates PostgreSQL `psql.exe`, prompts for the PostgreSQL
administrator password, and executes:

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

Copy the backend environment template:
```bat
copy backend\.env.example backend\.env
```

The database bootstrap creates the local `acquireiq_app` application role using the development credentials represented in `.env.example`.

To use live AI-assisted search, replace the `OPENAI_API_KEY` placeholder in `backend/.env` with your OpenAI API key.

See [Configuration](#configuration) below for the supported environment variables and example values.

From the repository root, seed the demonstration data:

```bat
backend\scripts\seed-database.bat
```

The seed launcher prompts for the PostgreSQL administrator password.

Then configure and start the backend:

```bash
cd backend
npm install
npm run generate:schemas
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

Because authentication is outside the challenge scope, the frontend accepts the acting user ID through the `user` query parameter. For example:

```text
http://localhost:5173/acquireiq/?user=<user-id>
```

This query parameter is the challenge-permitted substitute for an authentication flow in the local implementation.

------------------------------------------------------------------------

## Configuration

Backend configuration is supplied through environment variables. Secrets
remain backend-only and are never committed to the repository.

Database configuration uses `DATABASE_URL` for normal application connections.

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

AcquireIQ currently uses OpenAI as its LLM provider. Reviewers supply their own API key in the backend `.env` file without modifying source code:

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

The React application provides the user-facing interface for:

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

The frontend does not duplicate authoritative request-status transition rules. It uses API responses to determine and display valid state, while the backend remains responsible for enforcing request-status transitions and database integrity.

------------------------------------------------------------------------

## Design Principles

### Keep HTTP routes thin

Routes handle HTTP concerns. Business behavior belongs in services and database-aware application logic.

### Let PostgreSQL protect persistent state

PostgreSQL constraints protect persisted data rules such as the valid request-status value domain, while transactions and row locking provide concurrency protection. Request-status transition rules remain application-owned and are enforced by the API/service.

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

API failures, request-status conflicts, loading states, and AI uncertainty are represented explicitly rather than silently hidden.

------------------------------------------------------------------------

## Testing

Testing focuses on the behavior with the greatest correctness risk:

```text
PASS: 106
FAIL: 0
TOTAL: 106
ALL BACKEND REGRESSION TESTS PASSED.
```

-   valid status transitions
-   invalid status transitions
-   concurrent status-update attempts
-   request validation
-   request-detail behavior, including approvals, contract, and protests
-   PostgreSQL primary-key sequence integrity
-   database enforcement of valid request statuses
-   AI structured-filter validation
-   hallucinated or malformed AI output
-   AI provider/fallback behavior

Tests exercise backend business behavior independently of the React UI wherever practical.

------------------------------------------------------------------------

### Parallel approvals

The PostgreSQL data model supports parallel approvals by allowing multiple approval records to share the same `stage_sequence`.

This is a data-model and read/display capability only. AcquireIQ can store, retrieve, and display existing parallel approval records, but the API and UI do not provide a mechanism for recording approval decisions or advancing approval stages.

The challenge states that a request advances to the next approval stage once every approver at the current stage has recorded a decision, but it does not define how those decisions are recorded, how mixed approved/rejected decisions affect progression, or how approval-stage progression relates to acquisition-request `status`. Those gaps became apparent during end-to-end testing of the integrated UI and API. Given the challenge timebox, I removed the initially assumed behavior rather than invent consequential business rules that were not defined by the requirements.

### Target implementation scope

The completed challenge implementation covers:

-   PostgreSQL domain schema and demonstration data
-   parallel approval data modeling and read/display support
-   acquisition-request REST API
-   request creation and detail
-   request filtering
-   concurrency-safe request-status transitions
-   dashboard data
-   AI-assisted natural-language pipeline search
-   deterministic validation of AI output
-   React acquisition pipeline view with request creation, request detail, filtering, and request-status updates
-   explicit loading, error, and AI-fallback states
-   Swagger / OpenAPI documentation
-   targeted tests around correctness-sensitive behavior

### With more time

The highest-priority next step would be to clarify the approval lifecycle with contracting-office users and acquisition-domain subject-matter experts, then implement that clarified workflow. Specifically, I would define how approval decisions are recorded, how rejected or mixed decisions affect stage progression, and how approval-stage progression relates to acquisition-request status before adding the corresponding API and UI operations.

### Intentionally out of scope

Authentication and production deployment are outside the challenge's required implementation scope. Because authentication is not implemented, the frontend uses a user ID query parameter to identify the acting user, as permitted by the challenge requirements.

A complete approval workflow is also intentionally **not implemented**. The data model supports approval stages and parallel approvers, and existing approval data can be retrieved and displayed, but AcquireIQ does not provide operations for assigning approvers, recording approval decisions, advancing approval stages, or coupling approval-stage progression to acquisition-request status.

In a real production environment, these capabilities would not simply be omitted. I would work with end users, acquisition-domain subject-matter experts, and product stakeholders to clarify the intended workflow before implementing them. That process would define how approvers are assigned, how decisions are recorded, how rejected or mixed decisions affect progression, and how approval stages relate to request status. The challenge does not provide enough information to define those consequential business rules without making assumptions.

Optional stretch functionality was not a primary implementation goal. Given the challenge timebox, I prioritized completing, exercising, validating, and documenting the required implementation. Where additional work directly strengthened required behavior, such as the automated simultaneous-update concurrency test, I included it rather than pursuing broader optional features.

------------------------------------------------------------------------

## Key Design Decisions and Tradeoffs

### Parallel approvals

Parallel approvals are represented in the data model by multiple approval records sharing the same `stage_sequence`. This allows the database to represent parallel approvers without introducing a separate stage table solely for the challenge. Approval data is retrieved and displayed by the application, but approval assignment, decision entry, stage progression, and its relationship to request status are intentionally not implemented because those business rules are not fully defined by the challenge.

### Database bootstrap

The initial database/schema setup is executed directly by native PostgreSQL tooling. The BAT launcher is the runnable migration equivalent and keeps SQL setup independent from Node application code.

### Concurrency control

Request-status changes are protected at the database transaction boundary because correctness must hold even when multiple API requests arrive simultaneously.

### AI boundary

The LLM is limited to interpreting natural language into a structured filter. The backend owns validation and SQL construction, reducing the blast radius of hallucinated or malformed model output.

### Frontend responsibility

The React UI displays application state and the actions actually supported by the implementation, including request creation and request-status updates. The backend remains the source of truth for validating and enforcing request-status transitions.

------------------------------------------------------------------------

## Lead Design Note

The Lead Design Note is [`DESIGN_CONSIDERATIONS.md`](DESIGN_CONSIDERATIONS.md). It documents the key design decisions, tradeoffs, deliberate scope limitations, production considerations, and unresolved business requirements identified during implementation and end-to-end validation.

It also addresses the five areas requested by the challenge:

1. the most important schema-modeling decision and its tradeoff
2. an API contract decision that would change with additional time
3. AI hallucination and provider-failure handling, including production reliability measurement
4. a design concern at approximately 10x scale and the proposed solution
5. the single highest-value next improvement for a real contracting office

------------------------------------------------------------------------

## Documentation

Supporting challenge materials are maintained under `docs/`. `Requirements_Full.docx` is a reference copy of the original iAdeptive challenge requirements captured from the challenge website because PDF/export methods did not preserve the source content and formatting reliably. The requirement text has been preserved, while highlighting, underlining, and other visual annotations were added during requirements review. The folder also contains the AcquireIQ implementation specification/checklist used to track the implementation against those requirements.

The following repository documents describe the implemented system and the decisions made during the challenge:

- [`DESIGN_CONSIDERATIONS.md`](DESIGN_CONSIDERATIONS.md) — the Lead Design Note, documenting key design decisions, tradeoffs, production considerations, deliberate scope limitations, and unresolved business requirements.
- [`ARCHITECTURE_AND_DEPLOYMENT.md`](ARCHITECTURE_AND_DEPLOYMENT.md) — supplemental architecture and public deployment documentation. Public deployment is not required by the challenge; this document describes the implemented architecture and optional portfolio deployment.
- [`REQUIREMENTS_TO_DESIGN_VERIFICATION.md`](REQUIREMENTS_TO_DESIGN_VERIFICATION.md) — concise requirement-by-requirement verification of how the implementation and design address the challenge requirements.
- [`REQUEST_STATUS_STATE_MACHINE.md`](REQUEST_STATUS_STATE_MACHINE.md) — the implemented acquisition-request status state machine, including valid transitions and terminal states.

Together, these documents distinguish implemented behavior from deliberate design choices and functionality that would require additional business clarification before implementation.