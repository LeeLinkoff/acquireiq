# AcquireIQ Approval Stage State Machine

This document defines the approval-stage states and progression rules implemented by AcquireIQ.

Approval-stage progression is separate from the acquisition-request status state machine documented in `REQUEST_STATUS_STATE_MACHINE.md`. The challenge defines approval-stage advancement based on recorded approval decisions but does not define a relationship between approval-stage progression and acquisition-request `status`. AcquireIQ therefore keeps the two state machines independent.

------------------------------------------------------------------------

## 1. Approval Stage States

AcquireIQ derives the following approval-stage states:

```text
future
current
complete
```

These states are derived by PostgreSQL from approval `stage_sequence` values and recorded approval decisions. They are not persisted as a separate mutable stage-state value.

- `future` — an earlier approval stage is not yet complete.
- `current` — all preceding stages are complete and at least one approval in this stage remains pending.
- `complete` — every approval in the stage has recorded a decision.

------------------------------------------------------------------------

## 2. State Transition Diagram

```text
                    preceding stages complete
                             |
                             v
       +--------+       +---------+       +----------+
       | future | ----> | current | ----> | complete |
       +--------+       +---------+       +----------+
                            |
                            |
                   one or more approvals
                       still pending
                            |
                            +---- remains current

                   all approvals at stage
                    have a decision
                            |
                            +----> complete
```

A stage does not transition backward. Once all approvals at a stage have recorded decisions, that stage is complete and the next incomplete stage, when one exists, becomes current.

------------------------------------------------------------------------

## 3. Parallel Approval Rules

Multiple approvals may share the same `stage_sequence`. Those approvals belong to the same approval stage and may be acted upon independently while that stage is current.

For example:

```text
Stage 1
  Approver A -> approved
  Approver B -> pending

Stage state -> current
```

The stage remains `current` because at least one approval is still pending.

After the second approver records a decision:

```text
Stage 1
  Approver A -> approved
  Approver B -> rejected

Stage state -> complete
```

The stage is complete because every approver at that stage has recorded a decision.

Stage completion is based on whether all required decisions have been recorded, not on whether every decision is `approved`. The challenge does not define broader workflow consequences for rejected or mixed approval decisions, so AcquireIQ does not invent those business rules.

------------------------------------------------------------------------

## 4. Stage Advancement

Approval stages are ordered by `stage_sequence`.

PostgreSQL determines the current stage from the authoritative approval records:

```text
Stage 1 -> complete
Stage 2 -> current
Stage 3 -> future
```

When every approval in Stage 2 has recorded a decision:

```text
Stage 1 -> complete
Stage 2 -> complete
Stage 3 -> current
```

No separate `current_stage` value needs to be updated. The current stage is derived from the approval data itself.

------------------------------------------------------------------------

## 5. Decision Validation

Approval decisions may be recorded only for approvals belonging to the current stage.

```text
complete stage -> decision not allowed
current stage  -> decision allowed for pending approvals
future stage   -> decision not allowed
```

This rule is enforced at the PostgreSQL write boundary rather than relying on the React UI. PostgreSQL records a decision only when the specified approval belongs to the acquisition request, is still pending, and belongs to the current approval stage. The backend invokes the approval-decision operation, interprets its result, and maps that result to the appropriate API response.

Approval decisions are recorded through:

```text
PATCH /requests/:requestId/approvals/:approvalId/decision
```

------------------------------------------------------------------------

## 6. Relationship to Request Status

Approval-stage progression and acquisition-request status progression are intentionally separate state machines.

Completing an approval stage does **not** implicitly change the acquisition request's `status`.

Request status is governed separately by the request-status state machine and:

```text
PATCH /requests/:id/status
```

AcquireIQ does not assume an undocumented relationship such as:

```text
approval stage 1 -> submitted
approval stage 2 -> in_review
approval stage 3 -> approved
```

Any production relationship between approval-stage progression and request-status progression would first require clarification with contracting officers, acquisition-domain subject-matter experts, end users, and product stakeholders.

------------------------------------------------------------------------

## 7. Responsibility Boundary

Approval-stage behavior follows the same architectural separation used elsewhere in AcquireIQ:

```text
React UI
   |
   | user decision
   v
REST API
   |
   | HTTP input validation
   v
Backend service
   |
   | invokes approval operation
   | interprets database result
   v
PostgreSQL
   |
   | authoritative approval records
   | validates pending/current-stage eligibility
   | records decision atomically
   | derives current stage and stage state
   v
Backend service
   |
   | exposes PostgreSQL-derived stage state
   | maps operation result to API behavior
   v
React UI
```

The React UI handles presentation and user interaction. The API provides the contract between the client and backend and performs HTTP-boundary validation. The backend service invokes the PostgreSQL approval operation, interprets its result, and exposes PostgreSQL-derived stage state. PostgreSQL owns the authoritative approval records, current-stage determination, stage-state derivation, and persistent enforcement of the pending/current-stage approval-decision rule.