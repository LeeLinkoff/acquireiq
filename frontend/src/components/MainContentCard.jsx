/*
 * MainContentCard provides the primary AcquireIQ application workspace
 * and composes the request creation, request list, and dashboard views
 * within the application's tabbed navigation.
 */

import React from 'react'
import AcquisitionPipeline from './AcquisitionPipeline.jsx'
import CreateRequest from './CreateRequest.jsx'
import Dashboard from './Dashboard.jsx'
import GenericTabs from './GenericTabs.jsx'


export default function MainContentCard()
{
  return (
    <main className="app-card main-content-card">
      <GenericTabs
        createRequestContent={<CreateRequest />}
        requestListContent={<AcquisitionPipeline />}
        dashboardContent={<Dashboard />}
      />
    </main>
  )
}