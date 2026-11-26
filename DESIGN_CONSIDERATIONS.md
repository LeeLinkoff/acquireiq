# Design Considerations

## 1. Approach

AcquireIQ was implemented as a deliberately focused solution to the Full-Stack Engineering Lead Challenge. The goal was to implement the required behavior with a small, understandable architecture rather than expand the exercise with unnecessary frameworks, abstractions, or optional features.

The implementation uses React for the frontend, Node.js with TypeScript and Express for the API, PostgreSQL for persistence and transactional concurrency control, and an LLM provider for natural-language acquisition search.

The challenge clearly intends to evaluate production-oriented engineering judgment, including data integrity, concurrency safety, parallel approvals, status advancement, and AI reliability. However, the supplied requirements fall short of defining the complete acquisition workflow needed to implement all of those behaviors coherently.

That gap became apparent when the individually specified requirements were integrated and exercised together through the application, exposing the most significant design issue in the exercise: individually understandable requirements do not necessarily define a complete or coherent workflow when combined.

---

## 2. The Most Important Thing I Would Change: Validate the Workflow Before Production Implementation

The biggest change I would make if beginning this project again would happen **before writing production code**.

I would first validate the complete acquisition workflow with contracting officers, acquisition-domain subject-matter experts, end users, and product stakeholders. I would then build a rapid workflow prototype and have those users exercise the complete process before treating the workflow rules as sufficiently defined for implementation.

This is particularly important for AcquireIQ because concepts such as request `status`, approval stage, approval decision, rejection, and advancement represent business rules rather than implementation details. An engineer can make a technically reasonable assumption about any of them and still implement the wrong acquisition process.

In a normal production engagement, I would expect substantial interaction with users and SMEs before these rules were finalized. I would walk through concrete scenarios such as:

- What happens when a request enters the approval process?
- Who records an approver's decision?
- Can several approvers act simultaneously?
- What exactly constitutes completion of an approval stage?
- What happens when one approver rejects and another approves?
- What causes the request to move to another approval stage?
- What causes the request's overall status to change?
- Does completing an approval stage automatically change request status, or does it merely allow a contracting officer to change it?
- What should the contracting officer see and be allowed to do at each point in that workflow?

I would put a lightweight prototype in front of those users as early as possible. Asking someone to describe a workflow and asking that same person to use a prototype are often very different forms of requirements validation. The latter frequently exposes assumptions and edge cases that are difficult to discover from written requirements alone.

The challenge format does not provide those feedback mechanisms. There is no ongoing access to end users or acquisition SMEs with whom workflow assumptions can be validated, and there is no iterative prototype-review cycle in which behavior can be demonstrated and corrected before implementation continues.

That limitation became important during development of AcquireIQ.

---

## 3. Workflow Ambiguity Discovered During End-to-End UI Validation

The most significant requirements ambiguity was not apparent to me during my initial reading of the challenge. It became apparent after implementing the API and UI and then exercising the application end to end as an actual user.

During the initial implementation, I attempted to fill in unspecified workflow details with reasonable assumptions so that the written requirements could be translated into a functioning application. Once I exercised the complete workflow through the UI, it became clear that some of those missing details were not implementation choices that should be inferred by the developer. They were unresolved business rules.

The challenge states that more than one approver may be assigned to the same `stage_sequence` and that:

> a request advances to the next stage once every approver at the current stage has recorded a decision.

The challenge separately requires a contracting officer to advance a request's `status`, requires the operation to write through `PATCH /requests/:id/status`, and requires the UI to reflect the resulting status change.

Those requirements establish two important concepts:

1. Approval-stage progression based on `stage_sequence` and recorded approval decisions.
2. Request-status progression through a concurrency-safe status-update operation.

What the requirements do **not** define is the relationship between them.

Once the workflow was exercised through the UI, several questions became unavoidable:

- How does an approval `stage_sequence` correspond to an acquisition request `status`?
- Which request-status transition, if any, represents advancement from one approval stage to another?
- How is an approver's decision recorded when the required API contract does not specify an approval-decision write operation?
- Does completion of an approval stage automatically advance something, or does it only permit a contracting officer to advance the request?
- If the contracting officer controls request-status advancement, what exactly triggers approval-stage advancement?
- What effect does a rejecting approval decision have when the stated stage-completion rule only requires every approver to have "recorded a decision"?
- Is a stage containing both an `approved` and a `rejected` decision considered complete, blocked, or rejected?
- If approval progression and request-status progression are intentionally separate concepts, how should their relationship be represented to the user?

Had these issues been apparent during my initial requirements review, I would have raised them for clarification before implementation.

They became obvious when I stopped evaluating the individual requirements independently and instead exercised the completed workflow in real time from the contracting officer's perspective. At that point, continuing to fill in the blanks would have meant inventing consequential acquisition business rules.

I deliberately chose not to do that.

---

## 4. Deliberate Scope Decision

AcquireIQ therefore distinguishes between behavior explicitly defined by the challenge and workflow behavior that would require additional domain clarification.

The application implements the required request-status workflow through `PATCH /requests/:id/status`. Request status follows a fixed transition graph, invalid jumps are rejected, terminal states cannot be revived, and the operation is protected against concurrent writes.

AcquireIQ also implements the challenge-required approval behavior. Multiple approvers can belong to the same `stage_sequence`, approval decisions can be recorded through the API, and PostgreSQL derives whether each stage is `current`, `complete`, or `future` from the authoritative approval records. A current stage remains active until every approver at that stage has recorded a decision; once complete, the next incomplete stage becomes current through derived state. PostgreSQL permits an approval decision to be recorded only when the specified approval is still pending and belongs to the current approval stage.

What AcquireIQ deliberately does **not** do is invent a relationship between approval-stage progression and request-status progression that the challenge does not specify.

In particular, the implementation does not assume an undocumented mapping such as:

```text
stage_sequence 1 = submitted
stage_sequence 2 = in_review
stage_sequence 3 = approved
```

The React UI handles presentation and user interaction, and the API provides the contract between the UI and backend. For approval decisions, the backend invokes PostgreSQL's authoritative approval operation, interprets its result, and exposes PostgreSQL-derived stage state. The API/service remains authoritative for the separate request-status transition graph.

Broader approval-lifecycle rules remain intentionally undefined where the challenge provides no business rule, including approver assignment or reassignment and the effect of rejected or mixed decisions beyond satisfying the stated requirement that every approver at the current stage has recorded a decision.

---

## 5. Request Status State Machine

The challenge requires a fixed set of valid request-status transitions but does not enumerate the statuses or provide the transition graph.

AcquireIQ therefore defines the following request-level state machine as an explicit application design decision:

```text
                         ┌──────────┐
                         │  draft   │
                         └────┬─────┘
                              │
                              ▼
                       ┌─────────────┐
                       │  submitted  │
                       └──────┬──────┘
                              │
                              ▼
                       ┌─────────────┐
                       │  in_review  │
                       └──────┬──────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
              ┌──────────┐        ┌──────────┐
              │ approved │        │ rejected │
              └────┬─────┘        └──────────┘
                   │                 TERMINAL
                   ▼
              ┌──────────┐
              │ awarded  │
              └──────────┘
                TERMINAL

submitted ───────────────────────► rejected
```

The valid transitions are:

```text
draft       -> submitted
submitted   -> in_review
submitted   -> rejected
in_review   -> approved
in_review   -> rejected
approved    -> awarded
```

`awarded` and `rejected` are terminal states.

The important distinction is that this is the **request-status state machine**. It should not be interpreted as an undocumented mapping to approval `stage_sequence` values.

---

## 6. Server-Owned Request-Status Rules

Request-status transition validity is enforced by the backend rather than trusted to the frontend.

The UI can present only valid next-status options for usability, but that is not the security or integrity boundary. A caller can bypass the React application and invoke the API directly.

For that reason, the API independently validates every requested status transition against the server-owned transition map.

This provides two benefits:

1. All clients receive the same request-status behavior.
2. Invalid transitions cannot be introduced simply by bypassing or modifying the frontend.

The frontend's transition information exists to improve the user experience. The backend remains authoritative.

---

## 7. Request-Status Validation and Concurrency

The challenge requires `PATCH /requests/:id/status` to enforce fixed valid status transitions, reject invalid jumps, and remain correct when multiple callers attempt to update the same request concurrently.

AcquireIQ meets these requirements by separating three responsibilities: PostgreSQL protects the valid status-value domain, the API/service enforces the request-status transition rules, and PostgreSQL row locking ensures those rules are evaluated against the authoritative current status during concurrent updates.

### Valid Status Values

PostgreSQL defines a `CHECK` constraint on `acquisition_requests.status`.

The constraint prevents an undefined status value from being persisted. For example, `draft`, `submitted`, and `awarded` are valid stored values, while an undefined value such as `cancelled` would be rejected by the database.

This protects the status-value domain, but it does not determine whether a transition between two valid statuses is allowed.

For example, both `draft` and `awarded` are valid database values, but `draft -> awarded` is not a valid AcquireIQ transition.

### Fixed Valid Transitions

The API/service owns the fixed request-status state machine required by the challenge.

After obtaining the current request status, it checks the requested next status against the allowed transitions.

For example:

```text
draft -> submitted       VALID
draft -> awarded         INVALID
submitted -> in_review   VALID
submitted -> rejected    VALID
```

An invalid jump is rejected with HTTP `422` and the request status is not changed.

This directly satisfies the requirement for fixed valid transitions and rejection of invalid jumps.

### Concurrency-Safe Status Updates

The challenge also requires the status update to be concurrency-safe.

AcquireIQ satisfies this by performing the read, transition validation, and update within a PostgreSQL transaction while locking the acquisition-request row with `SELECT ... FOR UPDATE`.

The important point is that `SELECT ... FOR UPDATE` does not determine whether a transition is valid. The API/service still makes that decision. The row lock ensures that the API/service makes that decision using the current authoritative status rather than a stale status read by two callers at the same time.

The operation executes in this order:

```text
PATCH /requests/:id/status
          |
          v
        BEGIN
          |
          v
SELECT request row
   FOR UPDATE
          |
          v
Read authoritative
 current status
          |
          v
API/service validates
 requested transition
          |
      +---+---+
      |       |
   invalid   valid
      |       |
      v       v
  ROLLBACK   UPDATE
              |
              v
            COMMIT
```

### Clear Concurrency Example

Assume acquisition request `42` currently has this status:

```text
Request 42
status = draft
```

Two users click **Submit** at almost exactly the same time.

Both API requests therefore ask AcquireIQ to change the same request to `submitted`:

```text
Request A: PATCH /requests/42/status -> submitted
Request B: PATCH /requests/42/status -> submitted
```

Without concurrency protection, both callers could read `draft` before either update completes. The API/service could therefore independently evaluate the same transition twice:

```text
Request A sees: draft -> submitted = VALID
Request B sees: draft -> submitted = VALID
```

AcquireIQ prevents that race by locking the request row before reading and validating its status.

The actual sequence becomes:

```text
Request A                         Request B
    |                                 |
    v                                 v
BEGIN                             BEGIN
    |                                 |
    v                                 v
SELECT ... FOR UPDATE            SELECT ... FOR UPDATE
    |                                 |
    v                                 |
LOCK ACQUIRED                        WAITS
    |                                 |
    v                                 |
Reads status = draft                  |
    |                                 |
    v                                 |
API/service checks                    |
draft -> submitted                    |
    |                                 |
    v                                 |
VALID                                 |
    |                                 |
    v                                 |
UPDATE status = submitted             |
    |                                 |
    v                                 |
COMMIT                                |
                                      |
                                      v
                                LOCK ACQUIRED
                                      |
                                      v
                                Reads status = submitted
                                      |
                                      v
                                API/service checks
                                submitted -> submitted
                                      |
                                      v
                                INVALID
                                      |
                                      v
                                ROLLBACK / HTTP 422
```

Request A succeeds because `draft -> submitted` is a valid transition.

Request B cannot continue using the old `draft` value. It waits for Request A to commit, acquires the row lock, and then reads the newly committed value of `submitted`.

The API/service therefore evaluates Request B as:

```text
submitted -> submitted
```

That transition is not in the AcquireIQ state machine, so Request B is rejected with HTTP `422`.

This is how the implementation satisfies the concurrency requirement: competing status updates cannot independently validate themselves against the same stale request state.

### Requirement-to-Implementation Summary

| Requirement | AcquireIQ implementation |
| --- | --- |
| Persist only defined status values | PostgreSQL `CHECK` constraint |
| Enforce fixed valid transitions | API/service request-status state machine |
| Reject invalid jumps | API/service returns HTTP `422` without changing the request |
| Make status updates concurrency-safe | PostgreSQL transaction with `SELECT ... FOR UPDATE` |
| Prevent validation against stale status | Competing caller waits for the row lock and then reads the newly committed status |
| Keep validation and update together | Row remains locked through transition validation and `UPDATE` until `COMMIT` |


---

## 8. API Contract

The API is intentionally small and centered on the operations required by the challenge:

```text
GET    /requests
GET    /requests/:id
POST   /requests
PATCH  /requests/:id/status
PATCH  /requests/:requestId/approvals/:approvalId/decision
GET    /dashboard
POST   /assist/query
```

The API avoids exposing generic CRUD operations merely because additional operations could be imagined from the data model. An API should represent understood business capabilities rather than simply expose every table.

For approvals, AcquireIQ provides `PATCH /requests/:requestId/approvals/:approvalId/decision` because recording approval decisions and advancing once every approver at the current stage has recorded a decision are explicitly required behaviors. The route accepts the user action through the API contract, while the backend invokes PostgreSQL's authoritative approval operation and interprets its result. PostgreSQL enforces pending/current-stage eligibility and derives approval-stage progression from the authoritative approval records. The implementation deliberately does not couple approval-stage progression to request-status progression because that relationship is not defined by the challenge.

With more time, I would extend the approval-decision contract only after clarifying the remaining approval-lifecycle rules with domain stakeholders, particularly rejection semantics, authorization, approver assignment or reassignment, and any relationship between approval-stage progression and request-status progression.

---

## 9. User Identity

The challenge explicitly states that authentication is not required and permits a user ID to be passed as a query parameter.

AcquireIQ uses the query-string approach:

```text
/acquireiq/?user=3
```

The frontend reads the `user` value and retains it as application-level UI state representing the current user.

No additional behavior is assigned to this value because the challenge does not specify what application behavior should depend on the supplied user ID. In particular, AcquireIQ does not infer request ownership, approval authority, authorization, data visibility, or status-transition permissions from requirements that do not define those relationships.

The user ID is not propagated through the backend merely to create behavior for an otherwise unspecified identity contract.

This is intentionally a challenge-level implementation. An application-wide hardcoded user ID would not represent a meaningful production identity model for a multi-user application, while a query-string user ID is sufficient to represent the challenge's explicitly permitted simplified user context without pretending that it provides authentication.

In a production system, identity would require an explicitly defined contract covering the identity source, its relationship to application users and roles, and the operations those identities are permitted to perform. I would establish those requirements with the appropriate stakeholders before designing the authentication and authorization boundary.

---

## 10. AI Reliability and Trust Boundary

The `/assist/query` endpoint uses an LLM to translate a natural-language acquisition query into structured filtering criteria.

The LLM is not treated as a trusted source of executable database behavior.

The boundary is:

```text
Natural-language query
        │
        ▼
       LLM
        │
        ▼
Structured candidate filter
        │
        ▼
Application validation
        │
        ▼
Validated database query
        │
        ▼
Matching acquisition requests
```

Model output is validated before it is allowed to influence database access. Unknown fields, unsupported structures, malformed output, and other out-of-schema responses are rejected rather than passed through to SQL.

Provider availability is handled conservatively. If the LLM provider is unavailable, AcquireIQ does not attempt to fabricate an AI interpretation or silently substitute another behavior. The AI-assisted search is treated as unavailable and the user should receive a clear indication that the AI operation could not be completed. Production resilience behavior such as retries, provider failover, or other availability mechanisms would require operational requirements that are outside the scope of this challenge.

This design deliberately separates **language interpretation** from **application authority**.

The model proposes an interpretation. The application decides whether that interpretation is valid.

Low-confidence or malformed AI behavior is surfaced visibly rather than silently presented as an authoritative result. This is important because a plausible-looking AI response is not necessarily a correct one.

In a production system, I would extend the AI reliability boundary with structured observability and measure real-world reliability using:

- **Evaluation and correctness:** Maintain a labeled evaluation set derived from real contracting-office queries and compare the AI-produced validated filters with the expected filters. Track the percentage interpreted correctly, validation-rejection rate, low-confidence rate, fallback rate, and provider-failure rate.

- **False-confidence and change monitoring:** Review cases where the system produced a confident but incorrect interpretation, because those failures present greater risk than an explicit fallback. Track results by model and prompt version so changes can be evaluated against the same baseline before deployment.

---

## 11. Data Modeling

The relational model follows the entities required by the challenge: acquisition requests, vendors, contracts, approvals, protests, and users.

PostgreSQL is a good fit because the application contains strongly related domain entities, benefits from referential integrity, and requires transactional concurrency behavior for request-status updates.

Parallel approvals are represented by allowing multiple approval records to share the same `stage_sequence`. This avoids embedding individual approvers into request records and allows the approval chain to represent both sequential stages and parallel participants.

The model intentionally does not persist a separate `current_stage` field. PostgreSQL derives approval-stage state from `stage_sequence` and the recorded approval decisions. I consider deriving this state preferable to storing a separate mutable value because the underlying approval records already contain the information needed to determine the current stage. Persisting the same state separately would introduce another value that must be kept synchronized and could become inconsistent with the approval records. This derived stage progression remains independent of acquisition-request status because the challenge does not define a relationship between the two.

---

## 12. Protest Scope

Protests are modeled because they are part of the required data model and are relevant to acquisition-request detail and dashboard information.

The required API, however, does not specify a protest lifecycle operation. Protest resolution is identified separately as an optional stretch capability.

I therefore did not expand protests into a complete filing/resolution workflow.

This is another example of intentionally avoiding functionality that would require additional business rules beyond the required implementation. The application can represent and expose the required protest information without pretending to implement a lifecycle contract that was not part of the core scope.

---

## 13. Frontend Design

The frontend is intentionally centered on one meaningful contracting-officer workflow rather than being expanded into a large multi-page application.

The interface provides the required pipeline visibility, status grouping/filtering, request detail, approval-chain information including parallel groupings and PostgreSQL-derived stage state, approval-decision actions for the current stage, contract/protest context, request-status advancement, and natural-language assisted search. The React UI handles presentation and user interaction, while the API provides the contract to backend services. For approval decisions, PostgreSQL owns persistent pending/current-stage enforcement and stage-state derivation, while the backend owns API orchestration and result mapping. The API/service separately owns the request-status transition rules.

Real API calls are used throughout the workflow. Loading and error conditions are represented explicitly, and successful status updates are reflected back into the UI rather than requiring a page reload.

Keeping the frontend relatively small also made it possible to exercise the workflow end to end. That end-to-end interaction was ultimately what exposed the approval-stage/request-status ambiguity described earlier.

This reinforces why I consider executable prototypes and user interaction part of requirements discovery rather than merely a presentation step after requirements have supposedly been completed.

---

## 14. What Would Break at Scale

The scale concern I would address first is the current unbounded `GET /requests` operation. At 10× the data volume, continuing to return the complete matching request collection would significantly increase database query work, response payload size, network transfer, and frontend rendering work.

My proposed fix would be server-side pagination, with filtering and sorting remaining server-side so that each request operates on a bounded result set.

Other parts of the architecture could also become scaling concerns depending on the actual production workload, including database query performance and contention, LLM-provider latency and rate limits, and application infrastructure. Those are plausible concerns, but the challenge does not provide enough workload or operational data to determine which would become a bottleneck first. I would measure those areas under representative production load before prescribing additional architectural changes.

For that reason, my answer to scale is not a speculative infrastructure diagram. My first step would be to establish the actual production requirements and workload, measure the existing system, identify the first real bottleneck, and then optimize that bottleneck.

The most important prerequisite remains the same as elsewhere in this design. The baseline business workflow must first be clearly understood and validated. There is little value in scaling infrastructure for a workflow whose behavior is still not fully defined.

---

## 15. What I Would Do Next

My first next step would **not** be adding more code.

The single most important next improvement would be to complete and validate the approval workflow with actual contracting-office users and acquisition-domain SMEs.

I would use the existing application as a working prototype and walk through concrete scenarios until the relationship among request status, approval stages, approval decisions, rejection, and advancement was unambiguous. The resulting decisions would be captured as explicit acceptance criteria and workflow diagrams before implementation continued.

Only then would I extend the implemented approval workflow with the clarified broader lifecycle rules. AcquireIQ already implements the challenge-required approval decision recording and stage advancement behavior; the remaining questions concern business behavior the challenge does not define, particularly the consequences of rejected or mixed decisions, approver assignment or reassignment, authorization, and any relationship between approval-stage progression and request-status progression. Resolving those questions with the people who perform and understand the acquisition process would establish the business contract needed to make subsequent API, data-model, authorization, and UI decisions without guessing.

---

## 16. Stretch Goals

Optional stretch functionality was not a primary implementation goal.

The challenge explicitly identifies its stretch items as optional, and I prioritized completing, exercising, validating, and documenting the required scope rather than expanding the implementation for breadth. Where additional work directly strengthened confidence in required behavior, I included it. For example, AcquireIQ includes an automated simultaneous-update concurrency test, part of the backend regression suite in `dev_scripts/test-all-workflows.bat`, in addition to the required concurrency verification explanation.

I did not pursue the broader optional capabilities, such as protest resolution, as substitutes for completing the core application. The optional VPS and AWS deployments documented in `ARCHITECTURE_AND_DEPLOYMENT.md` are separate from the core implementation and are not required to run the application. The required exercise already spans data modeling, database setup and seed data, concurrency-safe request-status behavior, REST APIs, LLM integration and validation, frontend integration, testing, and design documentation.

This was also consistent with the most important issue discovered during implementation. Extending the approval workflow beyond the challenge-required behavior is less valuable than first resolving the remaining business-rule ambiguities with actual users and domain SMEs. Given additional time, that validation would take priority over implementing optional features simply to increase the amount of code delivered.

---

## 17. Final Design Takeaway

The most important lesson from this implementation is not about React, Express, PostgreSQL, or an LLM.

It is that ambiguous domain behavior should not be resolved by increasingly elaborate developer assumptions.

My initial mistake was attempting to fill in missing workflow semantics while implementing individual requirements rather than first validating the complete workflow as a user would experience it. The ambiguity became clear once I exercised that complete flow through the UI.

In a production engagement, I would address that much earlier through substantial end-user and SME interaction and rapid prototyping. Those activities are not overhead surrounding software development; for a domain workflow such as acquisition management, they are part of determining what software should actually be built.

Where the challenge provides an explicit requirement, AcquireIQ implements it. Where the challenge leaves a technical implementation choice, AcquireIQ makes and documents that choice. Where the challenge leaves a consequential business rule unresolved, I would seek clarification rather than guess.