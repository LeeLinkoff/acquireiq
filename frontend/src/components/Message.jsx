/*
 * Message provides the application's reusable message popup.
 *
 * Modal owns the generic popup infrastructure while this component owns only specific content: the title, message, and Close action.
 *
 * Any feature can display an error without knowing anything about modal overlays, positioning, accessibility, or presentation.
 */

import React from 'react'
import Modal from './Modal.jsx'


function Message({ type = 'info', title, message, onClose })
{
  const defaultTitles = {
    info: 'Information',
    success: 'Success',
    warning: 'Warning',
    error: 'Error'
  }
  const resolvedTitle = title || defaultTitles[type] || 'Message'
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
		 <button type="button" className="btn-secondary" onClick={onClose} >Close</button>
	  </div>
    </Modal>
  )
}

export default Message