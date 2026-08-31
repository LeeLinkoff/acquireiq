/*
 * Dashboard displays the aggregate acquisition pipeline metrics returned
 * by the GET /dashboard endpoint.
 */

import React, { useEffect, useState } from 'react'
import { getDashboard } from '../api/client.js'
import Message from './Message.jsx'
import '../styles/dashboard.css'


export default function Dashboard()
{
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadDashboard = async () =>
  {
    setLoading(true)
    setError(null)

    try
    {
      const data = await getDashboard()
      setDashboard(data)
    }
    catch (loadError)
    {
      setError(loadError)
    }
    finally
    {
      setLoading(false)
    }
  }

  useEffect(() =>
  {
    loadDashboard()
  }, [])

  if (loading)
  {
    return <p>Loading dashboard...</p>
  }

  return (
    <section className="dashboard">
      <div className="app-eyebrow">DASHBOARD</div>
      <h3>Acquisition Pipeline Dashboard</h3>

      {dashboard && (
        <>
          <div className="dashboard-summary">
            <div className="dashboard-metric">
              <span>Total Pipeline Value</span>
              <strong>{dashboard.totalPipelineValue}</strong>
            </div>

            <div className="dashboard-metric">
              <span>Open Protests</span>
              <strong>{dashboard.openProtestCount}</strong>
            </div>
          </div>

          <h4>Requests by Status</h4>

          <div className="dashboard-status-grid">
            {Object.entries(dashboard.countsByStatus).map(([status, count]) => (
              <div className="dashboard-status-card" key={status}>
                <span>
                  {status
                    .replaceAll('_', ' ')
                    .replace(/\b\w/g, (letter) => letter.toUpperCase())}
                </span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </>
      )}

      {error && (
        <Message
          type="error"
          title="Unable to Load Dashboard"
          message={error?.details?.error ?? error.message}
          onClose={() => setError(null)}
        />
      )}
    </section>
  )
}