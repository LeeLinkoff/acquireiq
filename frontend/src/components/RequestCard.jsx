/*
 * RequestCard renders the required summary information for one acquisition
 * request in the pipeline.
 *
 * Detail loading and status changes stay outside this component for now.
 * Keeping the summary focused makes it reusable when filtering or AI search
 * changes which requests are displayed.
 */

import React from 'react'

export default function RequestCard({ request }) {
  // budget_ceiling is returned by PostgreSQL as a numeric value represented
  // as a string, so convert it only for display formatting.
  const budget = Number(request.budgetCeiling)

  const formattedBudget = Number.isFinite(budget)
    ? budget.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      })
    : request.budgetCeiling

  return (
    <article className="request-card">
      <div className="request-card-heading">
        <h3>{request.title}</h3>

        <span className="request-status">
          {request.status.replaceAll('_', ' ')}
        </span>
      </div>

      <div className="request-card-summary">
        <div>
          <span className="request-label">Priority</span>
          <strong>{request.priority}</strong>
        </div>

        <div>
          <span className="request-label">Budget Ceiling</span>
          <strong>{formattedBudget}</strong>
        </div>
      </div>

      <button type="button" className="btn-secondary">
        View Details
      </button>
    </article>
  )
}