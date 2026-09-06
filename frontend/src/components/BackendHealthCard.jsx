import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleCheck, faCircleXmark } from '@fortawesome/free-solid-svg-icons'
import React, { useCallback, useEffect, useState } from 'react'
import { getHealth } from '../api/client.js'
import Message from './Message.jsx'

export default function BackendHealthCard() {
  const [health, setHealth] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showDetails, setShowDetails] = useState(false)

  const checkHealth = useCallback(async () => {

    setLoading(true)
    setError(null)

    try {
      const result = await getHealth()
      setHealth(result)
    } catch (err) {
      setHealth(null)
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    checkHealth()
  }, [checkHealth])

  const healthy = Boolean(health?.ok)
	
  return (
    <section className="app-card health-card" aria-labelledby="backend-health-title">
      <div className="card-heading-row">
        <div>
          <div className="app-eyebrow">SYSTEM</div>

          <h2 id="backend-health-title">Backend Health</h2>

	{!loading && (
	  <div
		className={`health-status ${
		  error || !health?.ok ? 'is-unhealthy' : 'is-healthy'
		}`}
	  >
		<div className="health-status-content">

		  <div className="health-status-heading">
			<FontAwesomeIcon
			  icon={error || !health?.ok ? faCircleXmark : faCircleCheck}
			  className={`health-status-icon ${
				error || !health?.ok ? 'is-error' : 'is-success'
			  }`}
			  aria-hidden="true"
			/>

			<strong>
			  { error ? 'Backend unavailable' : health?.ok ? 'Backend connected' : health ? 'Backend health problem' : 'Backend status unavailable'}
			</strong>
		  </div>

		  <span>
			{error
			  ? 'The AcquireIQ backend could not be reached. Verify that the backend server is running.'
			  : health?.ok
				? 'The API health check completed successfully.'
				: health
				  ? 'The backend responded, but its health check reported a problem.'
				  : 'No backend health information is available.'}
		  </span>

		</div>
	  </div>
	)}

        </div>

		<div className="card-actions">
		  <button type="button" className="btn-secondary" onClick={() => setShowDetails(true)} disabled={!health || loading}  >Details</button>
		  <button type="button" className="btn-secondary" onClick={checkHealth} disabled={loading} >{loading ? 'Checking…' : 'Refresh'}</button>
		</div>
      </div>

     {error && (
	  <Message type="error"
			   title="Backend unavailable"
			   message="Unable to reach the AcquireIQ API. Verify that the backend service is running."
			   details={{
				  message: error.message,
				  status: error.status,
				  response: error.details
			   }}
			   onClose={() => setError(null)}
	  />
	 )}
	  
	  {showDetails && health && (
		  <Message
			type="info"
			title="Backend Health Details"
			message={
			  <>
				<p>
				  <strong>Status:</strong>{' '}
				  {health.ok ? 'Healthy' : 'Problem detected'}
				</p>

				{health.service && (
				  <p>
					<strong>Service:</strong> {health.service}
				  </p>
				)}

				{health.status && (
				  <p>
					<strong>Service Status:</strong> {health.status}
				  </p>
				)}

				{health.timestamp && (
				  <p>
					<strong>Checked:</strong>{' '}
					{new Date(health.timestamp).toLocaleString()}
				  </p>
				)}
			  </>
			}
			onClose={() => setShowDetails(false)}
		  />
	  )}

    </section>
  )
}
