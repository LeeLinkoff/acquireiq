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
    to the same stage. A request advances only after every approver in
    the current stage has recorded a decision.
-   **AI-assisted pipeline search** --- contracting officers can search
    the acquisition pipeline using natural language instead of manually
    constructing filters.

The central design principle is simple: **AI output is useful input, but
it is not trusted application state.** LLM-generated filters are
validated by deterministic application logic before they can affect a
database query.

------------------------------------------------------------------------

## Architecture

``` text
+---------------------------+
|         React UI          |
|                           |
|  Acquisition Pipeline     |
|  Request Detail           |
|  Status Actions           |
|  AI Search                |
+-------------+-------------+
              |
              | REST / JSON
              v
+---------------------------+
|    Node / Express API     |
|                           |
|  Request Validation       |
|  Business Rules           |
|  Approval Workflow        |
|  Status Transitions       |
|  AI Filter Validation     |
+----------+-------------+--+
           |             |
           | SQL         | Natural-language query
           |             v
           |     +-----------------------+
           |     |     LLM Provider      |
           |     |                       |
           |     | Natural Language      |
           |     |        ->             |
           |     | Structured Filter     |
           |     +-----------+-----------+
           |                 |
           |                 | Untrusted structured filter
           |                 v
           |        Node / Express API
           |        validates filter
           |
           | Parameterized SQL only
           v
+---------------------------+
|        PostgreSQL         |
|                           |
|  Acquisition Requests     |
|  Users                    |
|  Vendors                  |
|  Contracts                |
|  Approvals                |
|  Protests                 |
+---------------------------+
```

![AcquireIQ Architecture](docs/images/acquireiq-architecture.png)

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

The completed project is organized around the following structure:

``` text
acquireiq/
|
+-- backend/
|   +-- scripts/
|   |   +-- create-database.bat
|   |   +-- create-database.sql
|   |   +-- generate-openapi-schemas.ts
|   |   +-- seed.ts
|   |
|   +-- seeds/
|   |   +-- 001_acquireiq_seed.sql
|   |
|   +-- src/
|   |   +-- db/
|   |   +-- logging/
|   |   +-- routes/
|   |   +-- services/
|   |   +-- schemas.generated.ts
|   |   +-- server.ts
|   |   +-- swagger-spec.ts
|   |
|   +-- tests/
|   +-- .env.example
|   +-- Dockerfile
|   +-- package.json
|   +-- package-lock.json
|   +-- tsconfig.json
|
+-- frontend/
|   +-- src/
|   |   +-- api/
|   |   |   +-- client.js
|   |   +-- components/
|   |   +-- logging/
|   |   |   +-- logger.js
|   |   +-- App.jsx
|   |   +-- App.css
|   |   +-- main.jsx
|   |
|   +-- package.json
|   +-- package-lock.json
|   +-- vite.config.js
|
+-- docs/
|   +-- images/
|       +-- acquireiq-architecture.png
|
+-- README.md
```

Exact service, route, component, and test filenames may be split further
as implementation is completed; the architectural boundaries above
remain the intended final structure.

------------------------------------------------------------------------

## Core Domain

AcquireIQ contains six primary domain tables:

``` text
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

A request may advance beyond a stage only after every approver assigned
to that stage has recorded the required decision. A rejection prevents
the workflow from being incorrectly advanced.

### Database integrity

Persistent invariants are enforced as close to the data as practical.
The schema includes primary keys, foreign keys, uniqueness rules, CHECK
constraints, and indexes for common workflow access patterns.

------------------------------------------------------------------------

## REST API

AcquireIQ provides the challenge API:

``` text
GET    /requests
GET    /requests/:id
POST   /requests
PATCH  /requests/:id/status
GET    /dashboard
POST   /assist/query
```

Infrastructure endpoints are also available:

``` text
GET    /api/health
GET    /api/docs
```

Swagger / OpenAPI documentation is exposed through `/api/docs`.

HTTP routes remain thin: they parse and validate requests, invoke
application services, select HTTP status codes, and format responses.
Workflow and acquisition business rules live outside the route layer.

------------------------------------------------------------------------

## Concurrency Safety

Acquisition-request status changes are a correctness boundary.

Status transitions are performed inside a PostgreSQL transaction with
concurrency control around the current request state. The API
re-evaluates the authoritative database state before applying a
transition so that two simultaneous requests cannot both advance stale
workflow state.

The workflow rejects invalid state jumps, skipped approval stages,
attempts to advance before required parallel approvals are complete, and
invalid attempts to revive terminal/rejected state.

Concurrency behavior is verified at the service/database boundary rather
than relying only on UI behavior.

------------------------------------------------------------------------

## AI-Assisted Search

AcquireIQ exposes natural-language pipeline search through:

``` text
POST /assist/query
```

Example:

``` text
overdue high-priority requests over $250k from inactive vendors
```

Processing flow:

``` text
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

If the provider fails or the response cannot be trusted, the API returns
an explicit fallback/low-confidence result rather than silently treating
uncertain AI output as valid. The React UI distinguishes that state from
a normal successful AI-assisted result.

------------------------------------------------------------------------

## Database Setup

AcquireIQ uses PostgreSQL's native `psql` tooling for initial database
and schema setup rather than an additional TypeScript migration runner.

From the repository root on Windows:

``` bat
backend\scripts\create-database.bat
```

The launcher:

1.  locates the installed PostgreSQL `bin\psql.exe`
2.  prompts once for the PostgreSQL administrator password
3.  executes `backend/scripts/create-database.sql`

The SQL bootstrap idempotently checks and creates the application role,
`acquireiq` database, required tables, constraints, foreign keys, and
indexes. Existing objects are checked before creation so the setup can
be safely rerun.

This is the project's runnable migration-equivalent mechanism. A BAT
launcher with native `psql` execution is used because the bootstrap is
entirely SQL-native and requires no application-layer logic. This avoids
unnecessary Node imports, dependencies, migration-runner code, and an
additional abstraction layer.

### Seed data

After the schema is ready:

``` bash
cd backend
npm run seed
```

The seed runner executes:

``` text
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
-   an API key for the configured LLM provider

### 1. Create the database and schema

From the repository root:

``` bat
backend\scripts\create-database.bat
```

### 2. Configure and seed the backend

``` bash
cd backend
npm install
npm run generate:schemas
npm run seed
npm run dev
```

Backend:

``` text
http://localhost:3002
```

Health:

``` text
http://localhost:3002/api/health
```

Swagger / OpenAPI:

``` text
http://localhost:3002/api/docs
```

### 3. Start the frontend

In another terminal:

``` bash
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

``` env
DATABASE_URL=postgresql://acquireiq_app:<password>@localhost:5432/acquireiq
```

Backend logging supports:

``` env
LOG_LEVEL=none
LOG_LEVEL=summary
LOG_LEVEL=verbose
```

Frontend logging supports:

``` env
VITE_LOG_LEVEL=none
VITE_LOG_LEVEL=summary
VITE_LOG_LEVEL=verbose
```

Logging defaults to `none`.

The configured LLM provider's API key is supplied through the backend
environment. Reviewers can provide their own key without modifying
source code.

Because Vite exposes `VITE_*` environment variables to browser code,
secrets are never stored in a `VITE_*` variable.

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

-   valid status transitions
-   invalid status transitions
-   parallel approval completion
-   concurrent status-update attempts
-   request validation
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

### Implemented scope

The completed challenge implementation covers:

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

**Challenge implementation target**

This README describes the intended completed backend and frontend state
for the AcquireIQ challenge submission. During implementation,
individual source files may still be in progress, but the architecture,
required behavior, setup model, and implementation boundaries documented
here represent the completed target.
