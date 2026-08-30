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
import { getRequestById } from '../api/client.js'
import ErrorMessage from './ErrorMessage.jsx'
import ApprovalStage from './ApprovalStage.jsx'
import { logVerbose, logError } from '../logging/logger.js'
import '../styles/request-detail.css'


export default function RequestDetail({ requestId })
{
  // null distinguishes a request that has not finished loading from a
  // successfully loaded detail object.
  const [request, setRequest] = useState(null)

  // Preserve the actual API error so ErrorMessage can expose diagnostic
  // information without making technical details the primary UI message.
  const [error, setError] = useState(null)

  // A new detail request begins whenever the selected request ID changes.
  const [loading, setLoading] = useState(true)

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
        <ErrorMessage
          message="The acquisition request details could not be loaded."
          details={{
            message: error.message,
            status: error.status,
            response: error.details,
          }}
        />
      </div>
    )
  }

  if (!request) {
    return null
  }

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

      <h4>Approval Chain</h4>

      {approvalStages.size > 0 ? (
        <div className="approval-stages">
          {[...approvalStages.entries()]
            // Sort by the numeric stage sequence so the approval chain is
            // displayed in the same order that the workflow executes.
            .sort(([stageA], [stageB]) => stageA - stageB)
            .map(([stageSequence, approvals]) => (
              <ApprovalStage
                key={stageSequence}
                approvals={approvals}
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