/*
 * Message provides the application's reusable message popup.
 *
 * Modal owns the generic popup infrastructure while this component owns only specific content: the title, message, and Close action.
 *
 * Any feature can display an error without knowing anything about modal overlays, positioning, accessibility, or presentation.
 *
 * Optional technical details, such as the HTTP status and API response of a
 * failed request, are shown in a collapsed "Technical details" section so the
 * primary message stays readable.
 */

import React from 'react'
import Modal from './Modal.jsx'


function Message({ type = 'info', title, message, details, onClose })
{
  const defaultTitles = {
    info: 'Information',
    success: 'Success',
    warning: 'Warning',
    error: 'Error'
  }
  const resolvedTitle = title || defaultTitles[type] || 'Message'
  // Show the details section only when at least one detail value is present.
  const hasDetails = details && Object.values(details).some((value) => value !== undefined && value !== null)
  return (
    <Modal
      onClose={onClose}
      ariaLabel={resolvedTitle}
    >
	  <div className={`message message-${type}`}>
		<h4>{resolvedTitle}</h4>
		<div className="message-content">
		  {message}
		</div>
		{hasDetails && (
		  <details className="message-details">
			<summary>Technical details</summary>
			<pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '12rem', overflow: 'auto' }}>
			  {JSON.stringify(details, null, 2)}
			</pre>
		  </details>
		)}
		 <button type="button" className="btn-secondary" onClick={onClose} >Close</button>
	  </div>
    </Modal>
  )
}

export default Message