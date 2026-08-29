# AcquireIQ Backend

Node.js, Express, TypeScript, and PostgreSQL backend for AcquireIQ, a government IT acquisition workflow application.

The backend owns request validation, acquisition workflow rules, concurrency-safe status transitions, PostgreSQL access, dashboard aggregation, and validation of AI-generated structured search filters. The browser never communicates directly with PostgreSQL or the LLM provider.

## Technology

- Node.js
- Express
- TypeScript with `strict: true`
- PostgreSQL
- `pg` with plain parameterized SQL
- Swagger / OpenAPI
- Configurable centralized logging
- LLM provider integration behind a server-side provider boundary

## Architecture

The backend follows a thin route → service/data-access pattern.

```text
HTTP request
    |
    v
Express route
    |
    v
Validation
    |
    v
Application / service logic
    |
    +----> PostgreSQL
    |
    +----> LLM provider
    |
    v
HTTP response
```

`server.ts` is the application composition root, responsible for global middleware, mounting the category routers, centralized error handling, and application startup. 

The category routers own endpoint-specific HTTP behavior, including request parsing and validation, service invocation, HTTP status selection, and response formatting. Acquisition workflow logic, persistence behavior, dashboard queries, concurrency-sensitive status transitions, and AI interpretation remain behind service boundaries.

PostgreSQL is the authoritative state store. The LLM is used only to interpret natural-language search requests into a structured filter. LLM output is treated as untrusted input, validated by the application, and translated into server-owned parameterized SQL. There is no direct LLM-to-database path.

## Project Structure

```text
backend/
├── scripts/
│   ├── create-database.bat
│   ├── create-database.sql
│   ├── seed-database.bat
│   └── generate-openapi-schemas.ts
├── seeds/
│   └── 001_acquireiq_seed.sql
├── src/
│   ├── db/
│   ├── errors/
│   ├── logging/
│   │   └── logger.ts
│   ├── routes/
│   │   ├── api-router.ts
│   │   ├── assist-router.ts
│   │   ├── dashboard-router.ts
│   │   └── request-router.ts
│   ├── services/
│   │   ├── ai/
│   │   │   ├── openai-provider.ts
│   │   │   ├── prompt.ts
│   │   │   ├── provider.ts
│   │   │   ├── service.ts
│   │   │   └── types.ts
│   │   └── requests.ts
│   ├── schemas.generated.ts
│   ├── server.ts
│   └── swagger-spec.ts
├── .env
├── .env.example
├── package.json
└── tsconfig.json
```

`server.ts` mounts the four endpoint-category routers directly. 

The routers expose complete public endpoint paths, while acquisition, persistence, workflow, dashboard, and AI behavior remain behind service boundaries.

## PostgreSQL Model

AcquireIQ uses six primary domain tables:

```text
users
vendors
acquisition_requests
approvals
contracts
protests
```

Plain SQL is used rather than an ORM because the relational rules, constraints, indexes, and concurrency behavior are important parts of the application and should remain explicit.

Parallel approvals are represented as individual `approvals` rows. Approvers working at the same workflow step share the same `stage_sequence`. A request advances toward approval only after every required approver in the current stage has approved. A pending or rejected decision in the current stage blocks approval, while later-stage approvals do not affect completion of the current stage.

Status changes are business operations rather than arbitrary CRUD updates. Valid transitions are enforced by the application, and PostgreSQL transactions/concurrency controls protect the state used to make those decisions.

The schema includes database constraints for domain correctness and indexes supporting acquisition filtering, approval-stage lookup, and unresolved-protest queries.

## Database Setup

PostgreSQL must already be installed and running locally. PostgreSQL does not need to be added to the Windows `PATH`.

From `backend`, run:

```cmd
scripts\create-database.bat
```

The script locates the installed PostgreSQL `psql.exe`, prompts once for the local PostgreSQL administrator password, and executes:

```text
scripts\create-database.sql
```

The SQL bootstrap checks for and creates the AcquireIQ application role and database as needed, connects to the AcquireIQ database, and creates the required schema, constraints, and indexes.

The setup is designed to be rerunnable. Existing objects are checked rather than blindly recreated.

## Seed Data

From `backend`, run:

```cmd
scripts\seed-database.bat
```

This executes:

```text
seeds\001_acquireiq_seed.sql
```

The demonstration dataset covers all six domain tables and includes workflow cases needed by the application, including parallel approvals and an open protest.

The seed dataset is intended for local/demo use and replaces the existing AcquireIQ domain-table data with a known dataset.

## Database Connection

The running API connects using an application database connection string supplied through backend environment configuration.

```env
DATABASE_URL=postgresql://acquireiq_app:<password>@localhost:5432/acquireiq
```

Database credentials are server-side configuration and must never be exposed through frontend `VITE_*` variables or committed to source control.

## REST API

AcquireIQ exposes the following application endpoints:

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/requests` | List acquisition requests with supported filtering |
| `GET` | `/requests/:id` | Retrieve acquisition-request detail |
| `POST` | `/requests` | Create an acquisition request |
| `PATCH` | `/requests/:id/status` | Perform a validated, concurrency-safe status transition |
| `GET` | `/dashboard` | Return acquisition pipeline/dashboard aggregates |
| `POST` | `/assist/query` | Interpret a natural-language request and return validated acquisition search results |

Infrastructure endpoints:

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Backend health check |
| `GET` | `/api/docs` | Swagger/OpenAPI documentation |

Detailed request/response schemas, parameters, and status codes are maintained in the OpenAPI documentation rather than duplicated in this README.

## Concurrency Safety

Status transitions are performed inside PostgreSQL transactions. The acquisition request row is locked with `SELECT ... FOR UPDATE` before the current state is validated and the corresponding update is performed, preventing competing callers from successfully advancing from the same stale request state.

Parallel approval stages are evaluated from their individual approval records before a request is allowed to advance. Every required approver in the current stage must have approved before the `in_review` → `approved` transition is permitted.

The backend regression suite explicitly exercises competing transitions and verifies that exactly one competing transition succeeds with HTTP 200 while the stale competing transition is rejected with HTTP 422.

## AI-Assisted Search

`POST /assist/query` accepts a natural-language acquisition search request.

```text
Natural language
    |
    v
AcquireIQ API
    |
    v
LLM provider
    |
    v
Untrusted structured filter
    |
    v
Schema + domain validation
    |
    v
Validated internal filter
    |
    v
Server-owned parameterized SQL
    |
    v
PostgreSQL
```

The LLM does not generate executable SQL and has no database credentials.

Malformed output, unsupported fields or values, and other invalid model responses are rejected or handled through the application's explicit fallback behavior before database access.

The validated AI filter contract permits only the fields `status`, `priority`, `fiscalYear`, and `budgetCeiling` and the operators `eq`, `gt`, `gte`, `lt`, and `lte`. Field/operator combinations, domain values, numeric ranges, and confidence are validated deterministically before any database query is constructed. Empty filters, low-confidence interpretations, provider failures, and invalid provider output produce the explicit fallback response rather than an unrestricted database query.

LLM credentials and provider configuration remain server-side.

## Configuration

Backend configuration is supplied through `.env`.

Core settings include:

```env
PORT=3002
DATABASE_URL=postgresql://acquireiq_app:<password>@localhost:5432/acquireiq
OPENAI_API_KEY=<reviewer-api-key>
OPENAI_MODEL=gpt-5.4-mini
LOG_LEVEL=none
```

AcquireIQ uses OpenAI as its implemented LLM provider. `OPENAI_API_KEY` supplies the server-side provider credential and `OPENAI_MODEL` optionally selects the model, defaulting to `gpt-5.4-mini`. The API can start without an OpenAI key; an attempted AI interpretation without a usable provider configuration follows the application's explicit fallback path rather than preventing backend startup. Secrets must not be committed to source control.

Supported logging levels are:

```text
none
summary
verbose
```

`summary` enables one-line API request logging. `verbose` adds diagnostic metadata while redacting common sensitive headers and body fields such as authorization values, cookies, API keys, passwords, tokens, and secrets.

## Install and Run

From `backend`:

```bash
npm install
npm run generate:schemas
npm run dev
```

The local backend runs at:

```text
http://localhost:3002
```

Health:

```text
http://localhost:3002/api/health
```

Swagger/OpenAPI:

```text
http://localhost:3002/api/docs
```

Database creation and seed data are intentionally separate from application startup:

```cmd
scripts\create-database.bat
scripts\seed-database.bat
```

## OpenAPI Schema Generation

Reusable OpenAPI component schemas are generated from exported TypeScript interfaces.

Run:

```bash
npm run generate:schemas
```

The generator writes:

```text
src/schemas.generated.ts
```

`schemas.generated.ts` is generated output and should not be edited manually. TypeScript interfaces are the source of truth for generated component schemas.

Schema generation runs before TypeScript compilation when required by the project scripts because `swagger-spec.ts` consumes the generated schemas.

## Testing

The completed backend regression suite verifies request validation, request collection/filter/create behavior, request detail, dashboard aggregation, sequential workflow transitions, parallel approval-stage behavior, concurrency-safe competing transitions, contract/protest response shape, missing-resource handling, AI structured-filter validation, AI fallback behavior, adversarial AI output handling, database integrity after adversarial AI requests, and PostgreSQL sequence integrity.

The concurrency regression verifies that two competing transitions against the same request produce exactly one HTTP 200 response and one HTTP 422 response, with the final persisted state reflecting the successful transition.

The AI adversarial checks include SQL-like and unsupported model output and verify that the database remains intact after those requests.

Final verified backend regression result:

```text
PASS: 98
FAIL: 0
TOTAL: 98
ALL BACKEND REGRESSION TESTS PASSED.
```

The backend TypeScript/OpenAPI build also completes successfully, including generated OpenAPI schemas and final TypeScript compilation.

## Design Notes

### Why plain SQL instead of an ORM?

AcquireIQ has a small relational model, while database constraints, indexes, transactions, and concurrency are central to the challenge. Plain SQL keeps those decisions visible and avoids adding an abstraction that provides little benefit for six primary tables.

This is a project-specific choice rather than a general rule against ORMs.

### Why separate approval rows?

Each approver receives an individual row. Approvers at the same workflow step share `stage_sequence`. This represents parallel work directly and avoids maintaining a separate derived "stage complete" flag that could become inconsistent with the underlying approvals.

### Why these indexes?

The schema includes indexes aligned with actual application access patterns:

- request status/priority filtering
- approval lookup by request and stage
- unresolved protests used by dashboard/workflow queries

The database schema remains the source of truth for the exact index definitions.

### Object-oriented design approach

AcquireIQ uses object-oriented design selectively rather than applying classes to every backend component.

TypeScript interfaces define contracts and domain/data shapes. Classes are used where object-oriented design provides a concrete benefit, such as encapsulated state, object identity, lifecycle behavior, specialized types, dependency injection, or interchangeable implementations behind a common interface.

OOP is intentionally not used where those characteristics are absent. Stateless service and data-access operations are implemented as functions when introducing a class would provide no additional encapsulation, state management, polymorphism, or behavioral abstraction.

For example, `ApiError` is appropriately modeled as a class because it extends the behavior and identity of JavaScript's `Error` type. An external AI provider can also benefit from an interface with interchangeable provider implementations. In contrast, a stateless operation such as retrieving acquisition requests does not require a `RequestService` instance merely to contain a method.

This approach applies OOP principles such as abstraction, encapsulation, and polymorphism where they improve the design while favoring simpler functional modules where an object model would add ceremony without meaningful value.