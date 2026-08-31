/*
 * ApprovalStage displays one approval stage in an acquisition request.
 *
 * Multiple approval records can share the same stageSequence. Those records
 * represent approvers working in parallel within the same workflow stage, so
 * this component receives and displays the complete group together.
 */

import React from 'react'


export default function ApprovalStage({ approvals })
{
  // Every approval in this group has the same stage sequence. The first record
  // therefore provides the stage name and sequence used for the group heading.
  const stage = approvals[0]

  return (
    <div className="approval-stage">
      <div className="approval-stage-heading">
        <strong>
          Stage {stage.stageSequence} — {stage.stageName}
        </strong>

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