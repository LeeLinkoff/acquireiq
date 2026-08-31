/*
 * AcquisitionPipeline is the main data-driven view for AcquireIQ.
 *
 * It loads acquisition requests from the real backend API and owns the
 * loading and error states for the pipeline. Request filtering, request
 * detail, status updates, and AI-assisted search will be added as focused
 * child components as we build out the required frontend workflow.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { getRequests, queryAcquisitions } from '../api/client.js'
import Message from './Message.jsx'
import RequestDetail from './RequestDetail.jsx'
import Modal from './Modal.jsx'
import '../styles/pipeline.css'


export default function AcquisitionPipeline() 
{
  // null distinguishes "nothing has been loaded yet" from a successful
  // response containing an empty request list.
  const [requests, setRequests] = useState(null)

  // Keep the actual request error Message can expose technical
  // details without showing them as the primary user-facing message.
  const [error, setError] = useState(null)

  // Start in the loading state because the initial API request is made
  // immediately after this component mounts.
  const [loading, setLoading] = useState(true)

  // Tracks the status currently selected by the user for filtering the pipeline.
  // "all" displays every acquisition request regardless of workflow status.
  const [selectedStatus, setSelectedStatus] = useState('all')

  // Stores the priority selected in the deterministic priority filter.
  const [selectedPriority, setSelectedPriority] = useState('all')

  // Stores the user's natural-language acquisition search and tracks whether
  // an AI-assisted search request is currently being processed.
  const [aiQuery, setAiQuery] = useState('')
  const [aiSearching, setAiSearching] = useState(false)

  // Stores the request selected from the table for display in the detail modal.
  const [selectedRequestId, setSelectedRequestId] = useState(null)

  // Stores metadata returned by the AI endpoint so the UI can visibly
  // distinguish confident results from low-confidence or fallback responses.
  const [aiResult, setAiResult] = useState(null)

  const loadRequests = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await getRequests()
      setRequests(result)
    } catch (err) {
      setRequests(null)
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRequests()  }, [loadRequests])

  /*
   * Synchronizes the pipeline summary after a request is successfully updated.
   *
   * The detail component receives the updated request from the backend and sends
   * it here. Only the matching request is replaced, allowing the pipeline card
   * and status filtering to immediately reflect the new workflow state.
   */
  function handleRequestUpdated(updatedRequest)
  {
    setRequests((currentRequests) =>
      currentRequests.map((currentRequest) =>
        currentRequest.id === updatedRequest.id
          ? { ...currentRequest, ...updatedRequest }
          : currentRequest
      )
    )
  }
  
  const visibleRequests = Array.isArray(requests) ? requests.filter((request) => (selectedStatus === 'all' || request.status === selectedStatus) && (selectedPriority === 'all' || request.priority === selectedPriority)  ) : requests

  /*
   * Clears the AI-assisted search and restores the complete acquisition
   * request list from the standard requests endpoint.
  */
  async function handleClearAiSearch()
  {
    setAiQuery('')
	setAiResult(null)
    setSelectedStatus('all')
    setSelectedPriority('all')
    await loadRequests()
  }

  /*
  * Executes an AI-assisted acquisition search using the user's natural-language
  * query. The backend interprets the query, validates the generated filters,
  * and returns only the acquisition requests matching those validated filters.
  *
  * After an AI search, the manual status and priority filters are reset so they
  * do not unintentionally hide results returned by the AI-assisted search.
  */
  async function handleAiSearch()
  {
	  const query = aiQuery.trim()

	  if (!query)
	  {
		return
	  }

	  setAiSearching(true)
	  setError(null)

	  try
	  {
		const result = await queryAcquisitions(query)

		setRequests(result.results)
		setAiResult(result)
		setSelectedStatus('all')
		setSelectedPriority('all')
	  }
	  catch (err)
	  {
		setError(err)
	  }
	  finally
	  {
		setAiSearching(false)
	  }
  }

  return (
    <section className="acquisition-pipeline">
      <div className="card-heading-row">
        <div>
          <div className="app-eyebrow">ACQUISITION PIPELINE</div>
          <h2>Acquisition Requests</h2>
        </div>

        <button
          type="button"
          className="btn-secondary"
          onClick={loadRequests}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <p className="card-description">
        Review acquisition requests, approval progress, and current acquisition status.
      </p>

	  <div className="ai-search-panel">
		  <div className="ai-search-heading">
			<div>
			  <div className="app-eyebrow">AI ASSISTED SEARCH</div>
			  <h3>Ask AcquireIQ</h3>
			</div>
		  </div>

		  <div className="ai-search-controls">
			<input
			  type="text"
			  className="ai-search-input"
			  placeholder="Ask about acquisition requests in natural language..."
			  aria-label="Ask AcquireIQ"
			  value={aiQuery}
			  onChange={(event) => setAiQuery(event.target.value)}
			  onKeyDown={(event) => {
				if (event.key === 'Enter')
				{
				  handleAiSearch()
				}
			  }}
			/>
			<button type="button" className="btn-primary" onClick={handleAiSearch} disabled={aiSearching || !aiQuery.trim()} >{aiSearching ? 'Searching...' : 'Search'}</button>
			<button type="button" className="btn-secondary" onClick={handleClearAiSearch} disabled={aiSearching} >Clear</button>
		  </div>
		  {/* Makes AI uncertainty explicit rather than presenting every response as an equally confident search result. */}
		  {aiResult && (
			  <div
				className={`ai-search-result ${
				  aiResult.mode === 'fallback'
					? 'ai-search-result-fallback'
					: 'ai-search-result-confident'
				}`}
			    >

				<strong>
				  {aiResult.mode === 'fallback'
					? 'Search not applied'
					: 'Search results'}
				</strong>

				<span>
				  {aiResult.mode === 'fallback'
					? "I couldn't confidently interpret this request. Try rephrasing your search."
					: 'AcquireIQ confidently interpreted your search.'}
				</span>

				{typeof aiResult.confidence === 'number' && (
				  <span className="ai-search-confidence">
					Confidence: {Math.round(aiResult.confidence * 100)}%
				  </span>
				)}
			  </div>
		  )}
	  </div>


	 <div className="pipeline-filters">
		  <label className="pipeline-filter">
			<span>Status</span>

			<select
			  value={selectedStatus}
			  onChange={(event) => setSelectedStatus(event.target.value)}
			>
			  <option value="all">All Statuses</option>
			  <option value="draft">Draft</option>
			  <option value="submitted">Submitted</option>
			  <option value="in_review">In Review</option>
			  <option value="approved">Approved</option>
			  <option value="awarded">Awarded</option>
			  <option value="rejected">Rejected</option>
			</select>
		  </label>

		  <label className="pipeline-filter">
			<span>Priority</span>

			<select
			  value={selectedPriority}
			  onChange={(event) => setSelectedPriority(event.target.value)}
			>
			  <option value="all">All Priorities</option>
			  <option value="low">Low</option>
			  <option value="medium">Medium</option>
			  <option value="high">High</option>
			</select>
		  </label>
	  </div>

      {loading && (
        <div className="placeholder-panel">
          <h3>Loading acquisition requests…</h3>
          <p>Retrieving the current acquisition pipeline.</p>
        </div>
      )}

      {error && (
        <Message type="error"
				 message="The acquisition pipeline could not be loaded."
				 details={{message: error.message,status: error.status,response: error.details}}
				 onClose={() => setError(null)}
        />
      )}

      {!loading && !error && Array.isArray(visibleRequests) && visibleRequests.length === 0 && (
        <div className="placeholder-panel">
          <h3>No matching acquisition requests</h3>
          <p>No requests match the selected status.</p>
        </div>
      )}

	  {!loading && !error && Array.isArray(visibleRequests) && visibleRequests.length > 0 && (
		  <div className="request-table-container">
			<table className="request-table">
			  <thead>
				<tr>
				  <th>ID</th>
				  <th>Title</th>
				  <th>Department</th>
				  <th>Priority</th>
				  <th>Status</th>
				  <th>Fiscal Year</th>
				  <th>Actions</th>
				</tr>
			  </thead>

			  <tbody>
				{visibleRequests.map((request) => (
				  <tr key={request.id}>
					<td>{request.id}</td>

					<td>
					  <strong>{request.title}</strong>
					</td>

					<td>{request.department}</td>

					<td>
					  {request.priority
						?.replaceAll('_', ' ')
						.replace(/\b\w/g, (letter) => letter.toUpperCase())}
					</td>

					<td>
					  {request.status
						?.replaceAll('_', ' ')
						.replace(/\b\w/g, (letter) => letter.toUpperCase())}
					</td>

					<td>{request.fiscalYear}</td>

					<td>
					  <button
						type="button"
						className="btn-secondary"
						onClick={() => setSelectedRequestId(request.id)}
					  >
						Details
					  </button>
					</td>
				  </tr>
				))}
			  </tbody>
			</table>
		  </div>
	  )}

	  {selectedRequestId && (
		  <Modal
		    size="large"
			onClose={() => setSelectedRequestId(null)}
			ariaLabel="Acquisition Request Details"
		  >
			<div className="request-detail-modal">
			  <div className="request-detail-modal-header">
				<h3>Acquisition Request Details</h3>
			  </div>

			  <RequestDetail
				requestId={selectedRequestId}
				onRequestUpdated={handleRequestUpdated}
			  />
  
			  <div className="request-detail-modal-actions">
				  <button
					type="button"
					className="btn-secondary"
					onClick={() => setSelectedRequestId(null)}
				  >
					Close
				  </button>
			  </div>
			</div>
		  </Modal>
	  )}

    </section>
  )
}