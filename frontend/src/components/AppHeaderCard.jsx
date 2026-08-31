import React from 'react'


export default function AppHeaderCard({
  title = 'AcquireIQ',
  description = 'Government Acquisition Pipeline',
  user
}) {
  return (
    <header className="app-card app-header-card">
	  <div className="app-header-top">
		<div className="header-context-label">ACQUISITION MANAGEMENT</div>
		<div className="current-user-badge">
			CURRENT USER: <strong>{user || 'Not specified'}</strong>
		</div>
	  </div>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  )
}