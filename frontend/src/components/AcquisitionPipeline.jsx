/*
 * AcquisitionPipeline is the main data-driven view for AcquireIQ.
 *
 * It loads acquisition requests from the real backend API and owns the
 * loading and error states for the pipeline. Request filtering, request
 * detail, status updates, and AI-assisted search will be added as focused
 * child components as we build out the required frontend workflow.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { getRequests } from '../api/client.js'
import ErrorMessage from './ErrorMessage.jsx'
import RequestCard from './RequestCard.jsx'
import PipelineFilters from './PipelineFilters.jsx'

export default function AcquisitionPipeline() 
{
  // null distinguishes "nothing has been loaded yet" from a successful
  // response containing an empty request list.
  const [requests, setRequests] = useState(null)

  // Keep the actual request error so ErrorMessage can expose technical
  // details without showing them as the primary user-facing message.
  const [error, setError] = useState(null)

  // Start in the loading state because the initial API request is made
  // immediately after this component mounts.
  const [loading, setLoading] = useState(true)

  const [selectedStatus, setSelectedStatus] = useState('all')

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

  const visibleRequests = Array.isArray(requests) && selectedStatus !== 'all' ? requests.filter((request) => request.status === selectedStatus) : requests

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

	  <PipelineFilters
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
      />
	  
      {loading && (
        <div className="placeholder-panel">
          <h3>Loading acquisition requests…</h3>
          <p>Retrieving the current acquisition pipeline.</p>
        </div>
      )}

      {error && (
        <ErrorMessage
          message="The acquisition pipeline could not be loaded."
          details={{
            message: error.message,
            status: error.status,
            response: error.details,
          }}
        />
      )}

      {!loading && !error && Array.isArray(visibleRequests) && visibleRequests.length === 0 && (
        <div className="placeholder-panel">
          <h3>No matching acquisition requests</h3>
          <p>No requests match the selected status.</p>
        </div>
      )}

      {!loading && !error && Array.isArray(visibleRequests) && visibleRequests.length > 0 && (
        <div className="request-list">
          {visibleRequests.map((request) => (
            <RequestCard key={request.id} request={request} />
          ))}
        </div>
      )}
    </section>
  )
}