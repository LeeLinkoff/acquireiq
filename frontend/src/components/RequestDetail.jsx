/*
 * RequestDetail displays the complete information for one acquisition request.
 *
 * The pipeline list intentionally loads only request summaries. When the user
 * opens a request, this component retrieves the full record from GET
 * /requests/:id, including its description, approval chain, contract, and
 * protest information.
 *
 * Approval-stage presentation will be delegated to ApprovalStage so parallel
 * approvals can be displayed clearly without putting all detail logic here.
 */

import React, { useEffect, useState } from 'react'

import { getRequestById, updateRequestStatus, updateApprovalDecision } from '../api/client.js'

import Message from './Message.jsx'
import ApprovalStage from './ApprovalStage.jsx'
import { logVerbose, logError } from '../logging/logger.js'
import '../styles/request-detail.css'


/*
 * Defines which workflow actions the UI should offer for each current status.
 *
 * This mirrors the backend workflow only for presentation purposes. 
 * The backend remains authoritative and validates every requested transition,including approval requirements and concurrency protection.
 *
 * This configuration is defined outside RequestDetail because it is static.
 * It is static because it does not depend on component props or state and therefore does not need to be recreated each time the component renders.
 */
const STATUS_TRANSITIONS = {
  draft: ['submitted'],
  submitted: ['in_review', 'rejected'],
  in_review: ['approved', 'rejected'],
  approved: ['awarded'],
  awarded: [],
  rejected: [],
}

export default function RequestDetail({ requestId, onRequestUpdated })
{
  // null distinguishes a request that has not finished loading from a
  // successfully loaded detail object.
  const [request, setRequest] = useState(null)

  // Preserve the actual API error so Message can expose diagnostic
  // information without making technical details the primary UI message.
  const [error, setError] = useState(null)

  // A new detail request begins whenever the selected request ID changes.
  const [loading, setLoading] = useState(true)

  // Tracks whether a workflow status transition is currently being submitted.
  // This prevents the user from sending the same transition multiple times while
  // the backend is validating and applying the requested workflow change.
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // Stores a workflow-update failure separately from the request-loading error.
  // This allows the existing request detail to remain visible when the backend
  // rejects a transition, such as an invalid request-status transition.
  const [statusError, setStatusError] = useState(null)

  // Tracks the individual approval currently being updated so approval actions
  // cannot be submitted repeatedly while the backend request is in progress.
  const [updatingApprovalId, setUpdatingApprovalId] = useState(null)

  // Stores approval-decision failures separately so the existing request detail
  // remains visible when the backend rejects an approval update.
  const [approvalError, setApprovalError] = useState(null)
  
  useEffect(() => {
    // Prevent an older asynchronous request from updating this component after
    // the user closes the detail or React has already cleaned up this effect.
    let active = true

    async function loadRequest() {
      setLoading(true)
      setError(null)

      try {
        const result = await getRequestById(requestId)
		
		// Log the complete detail response only in verbose mode. This is useful for
		// verifying approval, contract, and protest data without permanently adding
		// direct console logging to the component.
		logVerbose('Acquisition request detail response', {
		  requestId,
		  result,
		})


        if (active) {
          setRequest(result)
        }
      } catch (err) {
		 logError('Acquisition request detail request failed', err) 
         if (active) {
          setRequest(null)
          setError(err)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadRequest()

    // Mark this request as inactive when the component is removed or when a
    // different request ID causes the effect to run again.
    return () => {
      active = false
    }
  }, [requestId])

  /*
   * Requests a workflow transition and replaces the currently displayed request
   * with the updated record returned by the backend.
   *
   * Workflow validity remains entirely server-owned. If the backend rejects the
   * transition, the existing request stays visible and the rejection is exposed
   * separately through statusError.
   */
  async function handleStatusUpdate(nextStatus)
  {
    setUpdatingStatus(true)
    setStatusError(null)
  
    try
    {
      const updatedRequest = await updateRequestStatus(requestId, nextStatus)

      // Merge the updated base request fields into the existing detail object.
      // The PATCH response does not include approvals, contract, or protests, so
      // replacing the entire object would remove those already-loaded detail fields.
      setRequest((currentRequest) => ({
      ...currentRequest,
      ...updatedRequest,
      }))
  
	  // Notify the parent that this request changed so the pipeline summary can
	  // synchronize its copy of the request with the successful backend update.
	  if (onRequestUpdated) {
	    onRequestUpdated(updatedRequest)
	  }

      logVerbose('Acquisition request status updated', {
        requestId,
        nextStatus,
        result: updatedRequest,
      })
    }
    catch (err)
    {
      setStatusError(err)
      logError('Acquisition request status update failed', err)
    }
    finally
    {
      setUpdatingStatus(false)
    }
  }

    /*
   * Records one individual approval decision and then reloads the complete
   * request detail from the backend.
   *
   * PostgreSQL owns the authoritative approval data and derives approval-stage
   * state from those records. Reloading the request therefore gives the frontend
   * the newly derived stageState values without duplicating workflow logic in
   * React.
   */
  async function handleApprovalDecision(approvalId, decision, notes = null)
  {
    setUpdatingApprovalId(approvalId)
    setApprovalError(null)

    try
    {
      await updateApprovalDecision(requestId, approvalId, decision, notes)

      // Reload the complete request because the approval decision may cause
      // PostgreSQL to derive different states for multiple approval stages.
      const updatedRequest = await getRequestById(requestId)
      setRequest(updatedRequest)

      logVerbose('Acquisition approval decision updated', {
        requestId,
        approvalId,
        decision,
        result: updatedRequest,
      })
    }
    catch (err)
    {
      setApprovalError(err)
      logError('Acquisition approval decision update failed', err)
    }
    finally
    {
      setUpdatingApprovalId(null)
    }
  }

  if (loading) {
    return (
      <div className="request-detail">
        <p>Loading request details…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="request-detail">
        <Message type="error"
				  message="The acquisition request details could not be loaded."
				  details={{
				  message: error.message,
				  status: error.status,
				  response: error.details,
				  }}
				 onClose={() => setError(null)}
        />
      </div>
    )
  }

  if (!request) {
    return null
  }

  // Determine which workflow actions should be displayed for the request's
  // current status. Unknown statuses safely produce no available actions.
  const availableTransitions = STATUS_TRANSITIONS[request.status] ?? []

  /*
   * Group approval records by stageSequence.
   *
   * Approvals with the same stageSequence belong to the same workflow stage.
   * Keeping them in the same group allows parallel approvers to be displayed
   * together instead of incorrectly presenting them as sequential stages.
   */
  const approvalStages = new Map()

  for (const approval of request.approvals ?? []) {
    // Create a collection for this stage the first time it is encountered.
    if (!approvalStages.has(approval.stageSequence)) {
      approvalStages.set(approval.stageSequence, [])
    }

    // Add this approval to the collection for its workflow stage.
    approvalStages.get(approval.stageSequence).push(approval)
  }

  return ( 
  <div className="request-detail">
      <div className="app-eyebrow">REQUEST DETAIL</div>

      <h4>Description</h4>
      <p>{request.description}</p>

	  <h4>Workflow Actions</h4>

	  {availableTransitions.length > 0 ? (
		  <div className="request-workflow-actions">
			<select
			  className="request-workflow-select"
			  value=""
			  disabled={updatingStatus}
			  onChange={(event) => {
				const nextStatus = event.target.value

				if (nextStatus) {
				  handleStatusUpdate(nextStatus)
				}
			  }}
			  aria-label="Select workflow action"
			>
			  <option value="">
				{updatingStatus ? 'Updating...' : 'Select action...'}
			  </option>

			  {availableTransitions.map((nextStatus) => (
				<option key={nextStatus} value={nextStatus}>
				  {`Move to ${nextStatus
					.replaceAll('_', ' ')
					.replace(/\b\w/g, (letter) => letter.toUpperCase())}`}
				</option>
			  ))}
			</select>
		  </div>
		) : (
		  <p>No further workflow actions are available.</p>
	  )}

  
	 {/* 
	   * Display workflow update failures through the application's reusable error
	   * modal rather than implementing modal behavior inside RequestDetail.
	   */}
	  {statusError && (
	    <Message type="error"
				 title="Status Update Blocked"
				 message={statusError.details?.error ?? statusError.message}
				 onClose={() => setStatusError(null)}
	    />
	  )}

	 {/* Display approval-decision failures while leaving the request detail visible. */}
	 {approvalError && 
	 (
		  <Message type="error"
				   title="Approval Decision Blocked"
				   message={approvalError.details?.error ?? approvalError.message}
				   onClose={() => setApprovalError(null)}
		  />
	  )}

      <h4>Approval Chain</h4>

      {approvalStages.size > 0 ? (
        <div className="approval-stages">
          {[...approvalStages.entries()]
            // Sort by the numeric stage sequence so the approval chain is displayed in the same order that the workflow executes.
            .sort(([stageA], [stageB]) => stageA - stageB)
			/*
			 * Generate an ApprovalStage React component for each approval stage in approvalStages array.
			 *
			 * Each Map entry has the form [stageSequence, approvals].
			 * Take each entry from approvalStages array and turn it into one visual <ApprovalStage /> React component.
			 *
			 * stageSequence is the key originally created from approval.stageSequence when
			 * approvalStages was built above. It identifies this workflow stage and is
			 * passed to React as key={stageSequence}.
			 *
			 * approvals is the array of individual approval records grouped into that
			 * stage and is passed to ApprovalStage as approvals={approvals}.
			 *
			 * React consumes key internally; key is NOT passed to ApprovalStage as a prop.
			 */
			.map(([stageSequence, approvals]) => (
			/*
			 * Pass the data and behavior needed by each ApprovalStage React component.
			 *
			 * Value props:
			 *   approvals -> The array of approval records belonging to this stage.
			 *   updatingApprovalId -> The ID of the approval currently being updated, or null when no approval update is in progress.
			 *
			 * Function prop:
			 *   onApprovalDecision
			 *     A reference to RequestDetail's handleApprovalDecision function. The
			 *     function is not executed when it is passed. ApprovalStage can call this
			 *     function later when the user chooses an approval decision.
			 *
			 * This allows ApprovalStage to display stage data and initiate an approval
			 * decision while RequestDetail remains responsible for performing the API
			 * operation and refreshing the authoritative request data.
			 *
			 * React's special key attribute used to identify an element within a dynamically rendered list.
			 * Its different from the approvals, onApprovalDecision, updatingApprovalId normal React props.
			 *
			 * React requires a stable key for each component in a dynamically rendered list. 
			 * The key uniquely identifies this ApprovalStage across re-renders so React can correctly track which stage was added, removed, changed, or reordered. 
			 * stageSequence is used because it uniquely identifies each approval stage.
			 *
			 * The key is used internally by React and is not passed to ApprovalStage as a prop.
			*/
			<ApprovalStage
			  key={stageSequence}       // Use the stage sequence as React's unique key for this rendered ApprovalStage component in the collection 
			  approvals={approvals}
			  onApprovalDecision={handleApprovalDecision}
			  updatingApprovalId={updatingApprovalId}
			/>
            ))}
        </div>
      ) : (
        <p>No approval stages.</p>
      )}

	  <h4>Contract</h4>

	  {request.contract ?
		(
		  <div className="request-related-record">
			<div>
			  <span className="request-label">Vendor</span>
			  <strong>{request.contract.vendorName}</strong>
			</div>
			<div>
			  <span className="request-label">Contract Value</span>
			  <strong>
				{new Intl.NumberFormat('en-US', {
				  style: 'currency',
				  currency: 'USD',
				  maximumFractionDigits: 0,
				}).format(Number(request.contract.contractValue))}
			  </strong>
			</div>
			<div>
			  <span className="request-label">Award Date</span>
			  <strong>
				{new Date(request.contract.awardDate).toLocaleDateString()}
			  </strong>
			</div>
			<div>
			  <span className="request-label">Performance End</span>
			  <strong>
				{new Date(
				  request.contract.periodOfPerformanceEnd
				).toLocaleDateString()}
			  </strong>
			</div>
			<div>
			  <span className="request-label">Status</span>
			  <strong>{request.contract.status.replaceAll('_', ' ')}</strong>
			</div>
		  </div>
		) :
		(
		  <p>No contract awarded.</p>
		)
	  }

	  <h4>Protests</h4>

	  {Array.isArray(request.protests) && request.protests.length > 0 ?
	    (
		  <div className="request-related-records">
				  {request.protests.map
				   (
					   (protest) =>
					   (
						  <div key={protest.id} className="request-related-record">
							<div>
							  <span className="request-label">Filed</span>
							  <strong>{new Date(protest.filedAt).toLocaleDateString()}</strong>
							</div>
							<div>
							  <span className="request-label">Reason</span>
							  <strong>{protest.reason}</strong>
							</div>
							<div>
							  <span className="request-label">Status</span>
							  <strong>{protest.resolvedAt ? 'Resolved' : 'Open'}</strong>
							</div>
							{protest.resolvedAt && (
							  <div>
								<span className="request-label">Resolved</span>
								<strong>
								  {new Date(protest.resolvedAt).toLocaleDateString()}
								</strong>
							  </div>
							)}
							{protest.resolution && (
							  <div>
								<span className="request-label">Resolution</span>
								<span>{protest.resolution}</span>
							  </div>
							)}
						  </div>
						)
					)
				}
	      </div>
	    ) : 
		(
		  <p>No protests.</p>
		)
	  }
	  
    </div>
  )
}