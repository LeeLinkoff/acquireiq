/*
 * MainContentCard provides the visual container for AcquireIQ's primary
 * application workflow. The actual acquisition behavior lives in focused
 * child components so this file remains a simple composition boundary.
 */

import React from 'react'
import AcquisitionPipeline from './AcquisitionPipeline.jsx'

export default function MainContentCard() {
  return (
    <main className="app-card main-content-card">
      <AcquisitionPipeline />
    </main>
  )
}