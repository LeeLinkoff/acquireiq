/*
 * Modal provides the application's reusable modal dialog infrastructure.
 *
 * It owns the full-screen overlay, centered dialog container, accessibility
 * attributes, backdrop closing, and Escape-key closing behavior.
 *
 * Feature-specific components provide the actual content through `children`.
 * This keeps modal behavior independent from errors, forms, confirmations,
 * or any other feature that needs to display content in a popup.
 */

import React, { useEffect, useRef } from 'react'
import '../styles/modal.css'


function Modal({ children, onClose, ariaLabel = 'Dialog', size = 'default' })
{
  const overlayRef = useRef(null)

  // Register Escape only while the modal exists. The cleanup removes the
  // document-level listener when the modal is closed or unmounted.
  useEffect(() =>
  {
    function handleKeyDown(event)
    {
      if (event.key !== 'Escape' || !onClose)
      {
        return
      }

      // When modals are stacked, such as an error message over the request
      // detail, only the topmost one closes. The topmost overlay is the last
      // one in document order.
      const overlays = document.querySelectorAll('.modal-overlay')
      if (overlays[overlays.length - 1] === overlayRef.current)
      {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () =>
    {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  // Clicking the darkened area outside the dialog closes the modal. Clicks
  // inside the dialog do not reach this handler because propagation is stopped.
  function handleOverlayClick()
  {
    if (onClose)
    {
      onClose()
    }
  }

  function handleDialogClick(event)
  {
    event.stopPropagation()
  }

  return (
    <div
      ref={overlayRef}
      className="modal-overlay"
      role="presentation"
      onClick={handleOverlayClick}
    >
      <div
        className={`modal-dialog ${size === 'large' ? 'modal-large' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={handleDialogClick}
      >
        {children}
      </div>
    </div>
  )
}

export default Modal