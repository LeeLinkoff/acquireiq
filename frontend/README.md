# AcquireIQ Frontend

React and Vite frontend for AcquireIQ, a government IT acquisition pipeline application.

The frontend provides the user-facing acquisition workflow experience and communicates with the AcquireIQ backend through the centralized API client. Presentation and user interaction remain client-side, while request-status rules remain application-owned and PostgreSQL derives approval-stage state and enforces approval-decision eligibility at the database write boundary.

## Technology

- React
- Vite
- JavaScript
- Radix UI tabs
- Centralized frontend API client
- Configurable centralized logging

## Application Features

The AcquireIQ frontend provides:

- acquisition request creation
- acquisition pipeline/list view
- status and priority filtering
- request detail
- approval stages with parallel approver grouping
- approval decision display and decision actions for eligible current-stage approvers
- contract information
- protest information
- contracting-officer status actions
- dashboard metrics
- natural-language AI-assisted search
- visibly distinct confident and fallback AI states
- loading and human-readable error states

The frontend consumes real backend APIs rather than hardcoded acquisition data.

## Current User

Authentication is intentionally not implemented because the challenge explicitly permits it to be skipped.

AcquireIQ supports a current-user ID through the `user` query parameter.

Example:

```text
http://localhost:5174/acquireiq/?user=<user-id>
```

The current-user mechanism provides application context without pretending to implement authentication or authorization.

## API Boundary

Frontend API access is centralized in:

```text
src/api/client.js
```

For local development, leave `VITE_API_BASE` unset. The Vite dev server proxies `/api`, `/requests`, `/dashboard`, and `/assist` to the backend on `localhost:3002`, so the browser calls the API on the same origin.

At build time, two variables control where the app is served:

```env
VITE_BASE_PATH=/mvps/acquireiq/
VITE_API_BASE=/mvps/acquireiq
```

`VITE_BASE_PATH` sets the public path of the built app and defaults to `/acquireiq/`. `VITE_API_BASE` is prepended to every API call and defaults to empty. The VPS deployment sets both to `/mvps/acquireiq`; the AWS deployment uses the defaults.

The backend exposes the AcquireIQ application APIs used by the frontend, including request collection/detail/create/status operations, approval decision operations, dashboard aggregation, AI-assisted search, and the backend health endpoint.

The browser never communicates directly with PostgreSQL or the LLM provider.

## Running Locally

Start the AcquireIQ backend first.

Then, from `frontend`:

```bash
npm install
npm run dev
```

Open the Vite URL shown by the development server.

The default local application URL is:

```text
http://localhost:5174/acquireiq/
```

A current user can be supplied with:

```text
http://localhost:5174/acquireiq/?user=<user-id>
```

## AI-Assisted Search

The AI search interface sends natural-language acquisition queries to:

```text
POST /assist/query
```

The frontend does not execute or interpret model-generated SQL.

The backend converts the natural-language request into a structured filter, validates the LLM output, maps validated values to server-owned parameterized SQL, and returns the resulting matches.

The frontend visibly distinguishes a normal confident interpretation from the backend's explicit fallback/low-confidence state.

## Request Detail

Request detail displays the acquisition information returned by the backend, including:

- description
- approval stages
- multiple approvers grouped within the same parallel stage
- individual approval decisions
- associated contract information when present
- protest information when present

Parallel grouping is a representation and display concern. The frontend presents the PostgreSQL-derived approval-stage state and decision eligibility exposed by the backend and does not independently implement approval-stage advancement rules.

## Status Updates

Contracting-officer status actions call the backend request-status transition API.

Valid transition rules are owned by the backend rather than duplicated as authoritative business logic in the browser. Successful writes refresh the displayed application state, while rejected transitions are surfaced to the user.

## Dashboard

The dashboard consumes backend aggregation results rather than calculating authoritative pipeline metrics from frontend request data.

The backend provides counts by status, total pipeline value, and the count of requests with an open protest.

## Loading and Error Handling

Live API operations expose user-visible loading and error behavior.

User-facing errors remain separate from diagnostic logging so failures can be communicated clearly without requiring users to inspect the browser console.

## Logging

Frontend logging is centralized in:

```text
src/logging/logger.js
```

Supported levels:

```text
none
summary
verbose
```

Logging defaults to `none`.

Configure the level through:

```env
VITE_LOG_LEVEL=none
```

`summary` enables important application-event logging. `verbose` adds additional diagnostic information.

Frontend modules should use the centralized logger rather than scattering direct `console.log()` and `console.error()` calls throughout components and API code.

## Frontend Environment Variables

Example local configuration:

```env
VITE_LOG_LEVEL=none
```

`VITE_BASE_PATH` and `VITE_API_BASE` are build-time settings described under API Boundary.

Because Vite exposes `VITE_*` environment variables to browser code, passwords, database credentials, LLM API keys, access tokens, and other secrets must never be stored in `VITE_*` variables.

The OpenAI API key belongs exclusively to the backend configuration.

## Design Boundary

The frontend is responsible for presentation, user interaction, API invocation, and clearly communicating application state.

The backend remains authoritative for:

- request validation
- request-status transition rules
- invoking PostgreSQL approval-decision operations and exposing PostgreSQL-derived approval-stage state
- concurrency safety
- PostgreSQL persistence
- dashboard aggregation
- AI structured-filter validation
- parameterized database queries

This separation prevents UI behavior from becoming the authoritative implementation of acquisition business rules.

## Challenge Scope

This implementation intentionally does not model distinctions between contracting officers and approvers beyond the workflow information required by the challenge. In a production acquisition system, these would likely be distinct roles with separate permissions, responsibilities, and authorization rules. The current implementation focuses on representing and exercising the workflow behavior required by the challenge rather than introducing additional role and authorization complexity that the requirements do not define.

Similarly, the challenge defines request creation as the primary write operation. The frontend therefore supports adding acquisition requests but does not provide general editing of existing request, contract, protest, or approval records. Those capabilities would require additional business rules, permissions, and lifecycle requirements that are outside the defined scope.