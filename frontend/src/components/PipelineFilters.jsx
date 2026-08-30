/*
 * PipelineFilters controls which acquisition requests are visible by status.
 *
 * The request data still comes from the live backend API. This component only
 * changes presentation, so switching filters is immediate and does not require
 * another network request.
 */

import React from 'react'


const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'in_review', label: 'In Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'awarded', label: 'Awarded' },
  { value: 'rejected', label: 'Rejected' },
]

export default function PipelineFilters({ selectedStatus, onStatusChange })
{
  return (
    <div className="pipeline-filters" aria-label="Filter acquisition requests by status">
      {STATUS_FILTERS.map((filter) => (
        <button
          key={filter.value}
          type="button"
          className={`pipeline-filter ${selectedStatus === filter.value ? 'is-active' : ''}`}
          onClick={() => onStatusChange(filter.value)}
        >
          {filter.label}
        </button>
      ))}
    </div>
  )
}