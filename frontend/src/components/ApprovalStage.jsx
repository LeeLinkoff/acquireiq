/*
 * ApprovalStage displays one approval stage in an acquisition request.
 *
 * Multiple approval records can share the same stageSequence. Those records
 * represent approvers working in parallel within the same workflow stage, so
 * this component receives and displays the complete group together.
 */

import React from 'react'


/*
 * Props received from RequestDetail:
 *
 * Value props:
 *   approvals
 *     Array of approval records belonging to this stage.
 *
 *   updatingApprovalId
 *     ID of the approval currently being updated, or null when no approval
 *     decision is being submitted.
 *
 * Function prop:
 *   onApprovalDecision
 *     Reference to RequestDetail's handleApprovalDecision function.
 *     Passing the function as a prop does not execute it. ApprovalStage calls
 *     it later when the user chooses Approve or Reject.
 *
 * Props are properties of a single object, so they are matched by name rather
 * than by their order in this function signature.
 */
export default function ApprovalStage({ approvals, onApprovalDecision, updatingApprovalId })
{
  // Every approval in this group has the same stage sequence. The first record
  // therefore provides the stage name and sequence used for the group heading.
  const stage = approvals[0]
  
  /*
   * Approval-stage state is derived by PostgreSQL from the authoritative
   * approval records and returned through the API. The frontend does not
   * determine whether a stage is complete, current, or future; it only
   * displays the state supplied by the backend.
   *
   * All approvals in the same stage receive the same PostgreSQL-derived
   * stageState, so the first approval can supply the state for the stage
   * represented by this component.
  */
  const stageState = stage.stageState

  return (
    <div className="approval-stage">
      <div className="approval-stage-heading">
        <strong>
          Stage {stage.stageSequence}: {stage.stageName}
        </strong>
		<span className={`approval-stage-state approval-stage-state-${stageState}`}>
			{stageState.toUpperCase()}
		</span>
		<div className="approval-stage-summary">
			 {approvals.length} {approvals.length === 1 ? 'approver' : 'approvers'}
			 {approvals.length > 1 && ' · Parallel approval'}
		</div>
      </div>

      <div className="approval-list">
        {approvals.map((approval) => (
          <div key={approval.id} className="approval-item">
            <div>
              <span className="request-label">Approver</span>
              <strong>{approval.approverName}</strong>
            </div>

            <div>
              <span className="request-label">Decision</span>
              <strong>
                {approval.decision
                  ? approval.decision.replaceAll('_', ' ')
                  : 'Pending'}
              </strong>
            </div>

			{approval.decision === 'pending' && stageState === 'current' && (
			  <div className="approval-actions">
				<button
				  type="button"
				  className="btn-primary"
				  disabled={updatingApprovalId === approval.id}
				  onClick={() => onApprovalDecision(approval.id, 'approved')} //onApprovalDecision is a prop containing a reference to the handleApprovalDecision function passed from RequestDetail
				>
				  { (updatingApprovalId === approval.id) ? 'Updating...' : 'Approve'}
				</button>

				<button
				  type="button"
				  className="btn-secondary"
				  disabled={updatingApprovalId === approval.id}
				  onClick={() => onApprovalDecision(approval.id, 'rejected')}  //onApprovalDecision is a prop containing a reference to the handleApprovalDecision function passed from RequestDetail
				>
				  { (updatingApprovalId === approval.id) ? 'Updating...' : 'Reject'}
				</button>
			  </div>
			)}

            {approval.notes && (
              <div>
                <span className="request-label">Notes</span>
                <span>{approval.notes}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}