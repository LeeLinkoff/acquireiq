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
        </div>

		<div className="card-actions">
		  <button type="button" className="btn-secondary" onClick={() => setShowDetails(true)} disabled={!health || loading}  >Details</button>
		  <button type="button" className="btn-secondary" onClick={checkHealth} disabled={loading} >{loading ? 'Checking…' : 'Refresh'}</button>
		</div>
      </div>

      {!loading && !error && (
        <div className={`health-status ${healthy ? 'is-healthy' : 'is-unhealthy'}`}>
          <span className="status-dot" aria-hidden="true" />
          <div>
            <strong>{healthy ? 'Backend connected' : 'Backend responded with a problem'}</strong>
            <span>{healthy ? 'The API health check completed successfully.' : 'The API is reachable, but health is not OK.'}</span>
          </div>
        </div>
      )}

      {error && (
       <Message type="error"
				message="The backend health check failed."
				details={{message: error.message, status: error.status, response: error.details }}
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
