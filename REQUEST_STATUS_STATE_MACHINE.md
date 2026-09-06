# AcquireIQ Request Status State Machine

This document defines the acquisition-request status values and the legal status transitions implemented by AcquireIQ.

The challenge requires a fixed set of valid request-status transitions but does not specify the status values or transition graph. The values and transitions below are therefore AcquireIQ design decisions.

Approval-stage progression is a separate state machine documented in `APPROVAL_STAGE_STATE_MACHINE.md`. Approval-stage progression does not implicitly change acquisition-request `status`.

------------------------------------------------------------------------

## 1. Request Statuses

AcquireIQ defines the following acquisition-request statuses:

```text
draft
submitted
in_review
approved
awarded
rejected
```

`awarded` and `rejected` are terminal statuses.

------------------------------------------------------------------------

## 2. State Transition Diagram

```text
draft ------> submitted ------> in_review ------> approved ------> awarded
                   |                 |
                   |                 |
                   v                 v
                rejected          rejected
```

There are no transitions out of `awarded` or `rejected`.

------------------------------------------------------------------------

## 3. Allowed Status Transitions

| Current Status | Allowed Next Status |
| --- | --- |
| `draft` | `submitted` |
| `submitted` | `in_review`, `rejected` |
| `in_review` | `approved`, `rejected` |
| `approved` | `awarded` |
| `awarded` | None |
| `rejected` | None |

The server enforces this state machine. A request to perform a transition not listed above is rejected with HTTP `422`.

------------------------------------------------------------------------

## 4. Invalid Transition Examples

The following are representative invalid transitions:

```text
draft      -> approved
draft      -> awarded
submitted  -> awarded
in_review  -> submitted
approved   -> submitted
rejected   -> submitted
awarded    -> approved
```

These transitions are invalid because they skip defined states, move backward, or attempt to transition from a terminal status.
