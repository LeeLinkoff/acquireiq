import React from 'react'

export default function AppHeaderCard({
  title = 'AcquireIQ',
  description = 'Government Acquisition Pipeline',
}) {
  return (
    <header className="app-card app-header-card">
      <div className="app-eyebrow">ACQUISITION MANAGEMENT</div>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  )
}