# Design Considerations

Running log of engineering decisions made while building AcquireIQ, why those decisions were made, and what they trade off. This document is intended to evolve with the implementation rather than be reconstructed after the fact.

## Build approach: baseline first, incrementally

AcquireIQ is being built from a previously proven React, Node/Express, and TypeScript project skeleton rather than starting with an empty repository.

The baseline already provides a working frontend/backend development loop, health endpoint, Swagger/OpenAPI support, centralized logging, TypeScript strict mode, CI infrastructure, and a service-oriented backend structure. The acquisition-specific behavior is then added incrementally on top of that verified foundation.

The implementation order is intentionally risk-driven:

1. Preserve and verify the frontend/backend baseline.
2. Replace generic template behavior with the AcquireIQ domain.
3. Establish the PostgreSQL schema, migrations, constraints, seed data, and indexes.
4. Implement read APIs and dashboard aggregation.
5. Implement acquisition creation and status transitions.
6. Implement parallel approval workflow and concurrency protection.
7. Add the AI query path behind a provider abstraction.
8. Validate AI-generated structured filters before database access.
9. Build the React workflow and AI-search experience against the real API.
10. Add focused tests around the highest-risk behavior.
11. Complete the Lead Design Note and final documentation from the actual implementation.

Reasoning: the challenge has several independent correctness boundaries. Building them incrementally makes failures easier to isolate and keeps infrastructure, persistence, workflow, AI, and UI problems from being debugged simultaneously.

Tradeoff: this approach spends some time maintaining a clean baseline and explicit boundaries instead of immediately producing visible features. The benefit is lower integration risk and a codebase whose behavior is easier to explain and defend.

## Backend language: TypeScript

The backend uses Node.js, Express, and TypeScript with `strict: true`.

TypeScript is used to define and enforce contracts across the backend, including request and response DTOs, approval records, workflow statuses and transitions, AI structured filters, service boundaries, and database results.

Reasoning: AcquireIQ has several contracts where accidental shape drift would be costly. TypeScript provides compile-time checking across those boundaries and helps keep the implemented API, business logic, and generated OpenAPI schemas consistent.

Tradeoff: TypeScript adds build and type-definition overhead compared with plain JavaScript, but that cost is justified by the number of explicit contracts in the application.

## PostgreSQL as the authoritative state store

PostgreSQL is the authoritative source for acquisition requests, vendors, contracts, approvals, protests, and users.

Application code enforces business rules, while persistent invariants are also protected by PostgreSQL constraints where practical.

The schema uses explicit relational modeling rather than storing workflow state in opaque JSON structures.

Reasoning: acquisition workflow state is transactional business data. PostgreSQL provides the relational constraints, transactions, locking behavior, and aggregation capabilities needed by the challenge without introducing additional infrastructure.

Tradeoff: a normalized relational model requires more joins than a denormalized document model, but it makes relationships and workflow invariants substantially clearer.

## Parallel approval modeling

Parallel approval is modeled using individual approval records. Multiple approvers can share the same `stage_sequence`, which means they belong to the same logical approval stage.

A request does not advance merely because one approval at the current sequence has completed. Every approval assigned to the current `stage_sequence` must reach the required decision state before the workflow can advance.

Reasoning: representing each approver as an independent row preserves who decided what and allows the application to determine stage completion with a database query rather than encoding a list of approvers inside one mutable field.

Tradeoff: determining whether a stage is complete requires querying the set of approvals for the current stage. That is preferable to duplicating aggregate approval state that could become inconsistent.

A request advances toward approval only after every required approver in the current stage has approved. A pending or rejected decision in the current stage blocks approval. Later-stage approvals do not affect completion of the current stage.

## Status transitions are a business rule, not arbitrary CRUD

`PATCH /requests/:id/status` is not treated as a generic update endpoint.

The server owns the set of valid state transitions. A client may request a transition, but it cannot directly overwrite workflow state or skip required stages.

Invalid jumps must be rejected. Rejected requests must not be silently revived through an arbitrary status update.

Reasoning: the current status is part of the acquisition workflow, not merely editable display data. Centralizing transition rules gives every caller the same behavior and makes the rules testable.

Tradeoff: adding a new workflow state requires intentionally updating transition logic rather than simply accepting a new string. That additional friction is desirable for workflow-critical state.

## Concurrency-safe workflow transitions

The challenge explicitly requires status updates to remain correct when two updates arrive at nearly the same time.

The transition check and state update execute within the same PostgreSQL transaction. The acquisition request row is locked with `SELECT ... FOR UPDATE` before the current state is validated and the transition is applied.

The important invariant is that two callers must not both observe the same stale state and independently perform transitions that should have been mutually exclusive.

A representative race is:

```text
Request currently in state A

Caller 1 reads A
Caller 2 reads A

Caller 1 attempts A -> B
Caller 2 attempts A -> B

Only behavior consistent with the committed database state
may be accepted.
```

This row-level locking strategy serializes competing transitions against the same acquisition request. After the first transaction commits, a waiting transaction re-evaluates the newly committed state rather than validating against stale state.

Testing should deliberately create competing updates rather than relying only on sequential unit tests.

## Recovery options considered

Kafka with a dead-letter queue was considered as an option for handling failed work and recovery.

I decided not to use it for this version of AcquireIQ because PostgreSQL already holds the authoritative state of the acquisition workflow. If something fails, the application can determine what successfully completed and what state the request is actually in, then recover or retry from that known state.

Adding Kafka would introduce another system that has to be configured, operated, monitored, and kept consistent with the database. AcquireIQ does not currently have a requirement that justifies that additional complexity.

Kafka and a dead-letter queue would become more attractive if AcquireIQ grew into a system with large amounts of asynchronous work, several independent systems consuming the same events, or a need to replay events later.

Reasoning: recovery does not automatically require a message broker. The recovery mechanism should fit the way the application actually works. For the current system, PostgreSQL already provides the durable state needed to recover safely.

Tradeoff: this keeps the architecture simpler, but it does not provide Kafka's event-streaming and replay capabilities. If those capabilities become useful as AcquireIQ grows, Kafka remains a deliberate future option rather than a technology that was simply overlooked.

## API contract

Required acquisition endpoints are:

```text
GET    /requests
GET    /requests/:id
POST   /requests
PATCH  /requests/:id/status
GET    /dashboard
POST   /assist/query
```

`GET /requests` supports filtering by status and priority.

`GET /requests/:id` returns the acquisition detail together with its approval chain and associated contract information.

`GET /dashboard` performs real database aggregation rather than loading the complete request set and calculating dashboard values in application memory.

Reasoning: keeping aggregation and filtering close to the database reduces unnecessary data movement and makes the API contract reflect the questions the UI actually needs answered.

The implemented API uses explicit request and response contracts, deterministic validation, and HTTP status codes that distinguish validation errors, missing resources, invalid workflow transitions, and server failures. Pagination is not included in the current challenge implementation.

## OpenAPI schemas: generated where practical

AcquireIQ generates OpenAPI component schemas from exported TypeScript interfaces rather than maintaining a second handwritten copy of every response shape.

Route metadata such as paths, methods, request bodies, and status codes remains explicitly documented.

Reasoning: generated schemas reduce drift between TypeScript contracts and API documentation while avoiding a framework rewrite solely for fully generated OpenAPI.

Tradeoff: generation adds a build step and still leaves route-level documentation to maintain. It solves schema-shape drift without pretending that the entire HTTP contract can be inferred automatically from the current Express structure.

## AI-assisted search: interpretation, not authority

The AI feature is deliberately narrow.

The LLM receives natural language and returns a structured representation of the requested acquisition filters. It does not receive authority to construct or execute SQL.

The implemented trust boundary is:

```text
User natural language
        |
        v
LLM provider
        |
        v
Untrusted structured filter
        |
        v
Application schema/domain validation
        |
        v
Validated internal filter
        |
        v
Server-owned parameterized query
        |
        v
PostgreSQL
```

Reasoning: model output can be malformed, hallucinated, unsupported, or simply wrong. Treating it as untrusted input keeps probabilistic interpretation separate from deterministic application behavior.

This is also why a successful JSON parse is not sufficient validation. Fields and values must be checked against the application's supported filter contract.

## AI provider isolation

LLM-provider-specific code is isolated behind a small application boundary rather than embedded directly in `/assist/query`.

The route and query service operate on an internal structured-filter contract. Provider-specific request formatting, response extraction, and provider errors remain inside the provider integration.

Reasoning: the acquisition search behavior should not depend on the details of one vendor's SDK or response envelope.

Tradeoff: a provider abstraction introduces another interface in a small prototype. It is justified here because provider separation is directly relevant to reliability, testability, and the challenge requirements.

The implemented provider is OpenAI, configured through the backend-only `OPENAI_API_KEY` environment variable with optional `OPENAI_MODEL`, which defaults to `gpt-5.4-mini`.

## AI hallucination and malformed-output handling

AI responses are deterministically validated before they can influence database access.

Examples of invalid output include:

```text
Unknown filter field
Unsupported status value
Unsupported priority value
Wrong data type
Malformed JSON
Missing required structure
Unexpected operator
Out-of-range numeric value
```

Invalid model output is never silently converted into an unrestricted query.

The API returns an explicit fallback or low-confidence state when provider output cannot be safely used, rather than allowing uncertain or invalid AI output to influence database access.

Reasoning: a plausible-looking but incorrect acquisition result is more dangerous than an explicit statement that the system could not confidently interpret the request.

## AI confidence and fallback are user-visible

AI uncertainty is part of the product behavior, not merely a server-log concern.

The React interface must distinguish a normal interpreted query from a low-confidence or fallback result. Users should be able to tell when the system did not confidently understand their request.

Reasoning: hiding uncertainty would encourage users to treat probabilistic interpretation as deterministic search behavior.

The exact presentation will be reconciled with the final React implementation before submission.

## No direct LLM-to-database path

There is intentionally no architectural path from the LLM provider directly to PostgreSQL.

All database access remains owned by the application.

This means:

```text
LLM -> SQL execution
```

is not an allowed path.

The allowed path is:

```text
LLM
 |
 v
Structured filter
 |
 v
Application validation
 |
 v
Parameterized SQL owned by the API
 |
 v
PostgreSQL
```

This boundary remains true even if the LLM provider changes.

## Dashboard aggregation belongs in PostgreSQL

Dashboard metrics are produced through PostgreSQL aggregation rather than by retrieving every acquisition request and reducing the data in Node.js.

Reasoning: PostgreSQL is designed to filter and aggregate relational data efficiently. It also avoids transferring rows the dashboard does not need.

Tradeoff: dashboard SQL may be more specialized than generic repository methods, but that specialization reflects an actual API use case.

## Frontend architecture

The React application uses the existing centralized API-client pattern and reusable components rather than issuing ad hoc `fetch` calls throughout the component tree.

The UI must consume the real backend API.

The primary user-facing areas are expected to include:

```text
Acquisition pipeline
Acquisition request detail
Approval chain
Status actions
Dashboard information
AI-assisted search
AI confidence/fallback state
Loading state
Error state
```

Reasoning: API access and error handling are cross-cutting behavior. Keeping transport concerns centralized makes UI components easier to reason about and keeps backend contract changes localized.

The exact component breakdown will be documented as the interface is implemented.

## Error handling

Expected operational failures are represented intentionally by the backend.

Examples include invalid request data, missing acquisition requests, invalid workflow transitions, concurrent update conflicts, database failures, LLM-provider failures, malformed model responses, and low-confidence AI interpretation.

Reasoning: returning a generic `500` for every failure hides distinctions the frontend and reviewer need to understand.

The implemented API distinguishes validation failures, missing resources, invalid workflow transitions, and unexpected server failures through explicit HTTP status codes and structured error responses.

## Testing priorities and verification

Backend testing is weighted toward behavior whose failure could produce incorrect acquisition state or misleading AI results.

The completed backend regression suite verifies the highest-risk areas, including:

```text
Status-transition rules
Parallel-stage completion
Concurrent status updates
Request validation
Database constraints
AI structured-filter validation
Hallucinated AI fields
Malformed provider output
AI fallback behavior
API/database integration
```

Reasoning: a prototype does not need equal test density everywhere. Workflow correctness and the AI trust boundary carry more risk than static presentation code.

## Scope and time constraint

The challenge specifies approximately 4–6 hours of focused implementation effort.

Scope decisions therefore prioritize a narrow, complete, defensible vertical slice over implementing every possible acquisition-management feature.

Authentication and production deployment are explicitly skippable challenge concerns and are not priorities for the core implementation.

Optional stretch work is deferred until after the employer challenge submission so the remaining effort stays focused on completing and verifying the required end-to-end implementation.

Post-submission development candidates include:

```text
Protest resolution endpoint
AI query evaluation set
Pagination
API versioning
```

Anything not completed will be identified explicitly rather than implied to exist.

## AI-assisted development workflow

AI tools may be used during development, but generated output is not assumed to be correct.

Code, documentation, architecture descriptions, and generated artifacts must be reviewed against the actual challenge requirements and the running application.

The development experience itself reinforces the same reliability principle used inside AcquireIQ: AI can accelerate work, but its output requires verification.

When AI-generated work introduces errors or rework, that is treated as a tooling and validation problem rather than hidden from the engineering record. In a production environment, model choice and AI-assisted development tooling would be evaluated empirically based on accuracy, rework, latency, cost, and developer productivity rather than assumed from brand or familiarity.

## Scale consideration

The challenge does not require large-scale production architecture, so the prototype should avoid speculative infrastructure.

At roughly 10x the prototype workload, likely areas to revisit include database indexing based on observed query plans, pagination for request listings, dashboard-query cost, connection-pool sizing, and external LLM latency/rate limits.

The final Lead Design Note will select one concrete 10x concern from the implemented system and explain the first production change that should address it.

## Lead Design Note

The final 300–500 word Lead Design Note will be written after implementation so that it reflects actual engineering decisions rather than hypothetical ones.

It must address:

1. the most important schema-modeling decision and its tradeoff
2. one API contract decision that would change with additional time
3. AI hallucination/provider-failure handling and how reliability would be measured in production
4. one concern at approximately 10x scale and how it would be addressed
5. the single highest-value next improvement for a real contracting office

This running document provides the implementation history from which that shorter final note can be derived.

## Documentation discipline

This file distinguishes between decisions already made, behavior already implemented, and intended implementation.

Statements about implementation status should be updated only after the corresponding behavior has been verified, with frontend behavior remaining an implementation target until the React workflow is complete.

The goal is for the repository documentation to describe the system that actually exists, not the system that was originally imagined.
