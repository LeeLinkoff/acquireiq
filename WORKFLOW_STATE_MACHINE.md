# AcquireIQ Workflow State Machine

This document explains the acquisition-request workflow, valid status transitions, parallel-approval behavior, and concurrency guarantees used by AcquireIQ.

The challenge requires `PATCH /requests/:id/status` to advance requests through a fixed set of valid transitions, reject invalid jumps such as skipping stages or reviving a rejected request, and remain correct under concurrent writes.

> **Implementation note**
>
> The challenge defines the required behavior but does not prescribe every individual transition edge. The transition graph below is an AcquireIQ design decision chosen to keep the workflow conservative, explicit, and easy to validate.

---

## 1. Request Statuses

AcquireIQ uses these request statuses:

```text
draft
submitted
in_review
approved
awarded
rejected
```

`awarded` and `rejected` are terminal states.

---

## 2. State Transition Diagram

```text
                +----------------------+
                |                      |
                v                      |
draft ------> submitted ------> in_review ------> approved ------> awarded
                                |
                                |
                                +-------------------------------> rejected

Terminal states:
  awarded   -> no further transition
  rejected  -> no further transition
```

The server owns this transition graph. A client may request a transition, but it cannot directly overwrite workflow state.

---

## 3. Valid Transition Map

| Current Status | Requested Status | Result |
|---|---|---|
| `draft` | `submitted` | Allowed |
| `draft` | any other status | Rejected |
| `submitted` | `in_review` | Allowed |
| `submitted` | `rejected` | Allowed |
| `submitted` | any other status | Rejected |
| `in_review` | `approved` | Allowed only when approval requirements are satisfied |
| `in_review` | `rejected` | Allowed |
| `in_review` | any other status | Rejected |
| `approved` | `awarded` | Allowed |
| `approved` | any other status | Rejected |
| `awarded` | any status | Rejected — terminal state |
| `rejected` | any status | Rejected — terminal state |

Representative invalid transitions:

```text
draft      -> approved     rejected: skips workflow stages
draft      -> awarded      rejected: skips workflow stages
submitted  -> awarded      rejected: skips workflow stages
rejected   -> submitted    rejected: terminal state cannot be revived
rejected   -> in_review    rejected: terminal state cannot be revived
awarded    -> approved     rejected: terminal state cannot move backward
```

---

## 4. Parallel Approval Model

Parallel approval is represented by multiple approval rows sharing the same `stage_sequence`.

Example:

```text
Request 42

Stage 1 — Technical Review
  Approver A ---- approved
  Approver B ---- approved

Stage 2 — Contracting Review
  Approver C ---- pending
  Approver D ---- pending
```

Each approver retains an independent decision record. The stage is evaluated as a group.

A request does **not** advance because one approver in a stage has acted.

```text
Stage 2

Approver C ---- approved
Approver D ---- pending
                     |
                     X
              stage incomplete
```

Only after every required approver in the active stage has approved may the workflow continue toward `approved`. A `pending` or `rejected` decision in the current stage blocks the `in_review` → `approved` transition.

```text
Stage 2

Approver C ---- approved
Approver D ---- approved
                     |
                     v
               stage complete
```

If the workflow contains another approval stage, that next stage becomes active. The request may reach `approved` only after the required approval stages are complete.

---

## 5. Rejection Semantics

A rejection prevents an acquisition request from being incorrectly advanced through the normal approval path.

```text
Stage 2

Approver C ---- approved
Approver D ---- rejected
                     |
                     v
          request cannot become approved
```

`rejected` is terminal in the AcquireIQ state machine. The generic status endpoint cannot revive a rejected request.

A future product could introduce an explicit reopen/resubmission workflow, but that would be a separate business operation with its own authorization, audit, and validation rules rather than an arbitrary status overwrite.

---

## 6. Concurrency-Safe Status Update

Status transitions are evaluated and written inside one PostgreSQL transaction.

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
Validate requested
   transition
          |
          v
Evaluate approval
stage requirements
          |
     +----+----+
     |         |
 invalid     valid
     |         |
     v         v
 ROLLBACK    UPDATE
               |
               v
             COMMIT
```

The critical rule is that the request row is locked **before** the state-machine decision is made.

---

## 7. Why `SELECT ... FOR UPDATE`

Without a row lock, two callers could observe the same status and independently make decisions from stale state.

Unsafe example:

```text
Initial status: draft

Caller A reads draft
Caller B reads draft

Caller A validates draft -> submitted
Caller B validates draft -> submitted

Both callers act from the same stale state.
```

AcquireIQ instead serializes transitions around the authoritative request row:

```text
Initial status: draft

Caller A
  BEGIN
  SELECT ... FOR UPDATE
  sees draft

Caller B
  BEGIN
  SELECT ... FOR UPDATE
  waits for Caller A

Caller A
  validates draft -> submitted
  UPDATE status = submitted
  COMMIT

Caller B
  lock acquired
  now sees submitted
  re-evaluates requested transition
  accepts or rejects based on the committed state
```

This ensures that transition validation is based on the current committed database state rather than an earlier application read.

---

## 8. Transaction Boundary

The transition check and update are one logical operation:

```text
BEGIN

1. Lock acquisition request
2. Confirm request exists
3. Read current status
4. Validate requested transition
5. Evaluate active approval-stage requirements
6. Apply status update
7. Read updated representation

COMMIT
```

Any validation or domain failure causes:

```text
ROLLBACK
```

The application does not validate outside the transaction and then perform an unprotected update later.

---

## 9. HTTP Behavior

Expected status-update outcomes:

| Condition | HTTP Status |
|---|---:|
| Valid transition completed | `200` |
| Malformed request ID or body | `400` |
| Request does not exist | `404` |
| Valid request shape but illegal workflow transition | `422` |
| Unexpected server/database failure | `500` |

Error responses should explain the domain failure without exposing internal database details.

Examples:

```json
{
  "error": "Invalid status transition from draft to approved."
}
```

```json
{
  "error": "Request cannot advance until all approvers in the current stage have decided."
}
```

---

## 10. Server-Owned Workflow Rule

The client never sends an instruction equivalent to:

```text
set status = whatever I supplied
```

Instead, it asks:

```text
please transition request 42 to approved
```

The server then decides whether that transition is legal.

This keeps workflow correctness independent of the React UI. Even if a client is buggy, outdated, or bypasses the UI entirely, the API still enforces the same acquisition rules.

---

## 11. Test Cases

The backend regression suite verifies these workflow behaviors:

```text
draft -> submitted                          succeeds
draft -> approved                           fails
submitted -> in_review                      succeeds
submitted -> rejected                       succeeds
rejected -> submitted                       fails
approved -> awarded                         succeeds
awarded -> approved                         fails
in_review -> approved with pending approval fails
in_review -> approved with completed stage  succeeds
```

Concurrency verification should issue simultaneous updates against the same request and verify that the final result is consistent with the state machine.

Example:

```text
Starting state: draft

Concurrent request A: draft -> submitted
Concurrent request B: draft -> submitted

Expected:
  only behavior valid against the serialized committed state succeeds;
  no corrupted or impossible state is produced.
```

The final backend regression suite also covers concurrent status writes, approval-stage behavior, request detail, API integration, AI safety and fallback behavior, and PostgreSQL sequence integrity.

Current verified result:

```text
PASS: 98
FAIL: 0
TOTAL: 98
ALL BACKEND REGRESSION TESTS PASSED.
```

---

## 12. Design Tradeoff

AcquireIQ intentionally uses an explicit allow-list transition graph instead of permitting arbitrary status updates.

The tradeoff is that adding a new workflow state requires updating the transition logic deliberately. That is desirable for workflow-critical government acquisition state because new transitions should be reviewed as business rules rather than silently becoming legal because a new string was added to a database constraint.

Similarly, parallel stages are derived from approval records rather than stored as duplicated aggregate stage state. This requires querying the approval set to determine stage completion, but it avoids maintaining a second source of truth that could drift from the underlying approver decisions.
