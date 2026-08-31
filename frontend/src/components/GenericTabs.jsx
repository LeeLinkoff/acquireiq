/*
 * GenericTabs provides the primary navigation between AcquireIQ's
 * request creation, request list, and dashboard views.
 */

import React from 'react'
import * as Tabs from '@radix-ui/react-tabs'


export default function GenericTabs({
  createRequestContent,
  requestListContent,
  dashboardContent,
})
{
  return (
    <Tabs.Root defaultValue="requests" className="generic-tabs-root">
      <Tabs.List
        className="generic-tabs-list"
        aria-label="AcquireIQ application sections"
      >
        <Tabs.Trigger value="create" className="generic-tabs-trigger">
          Create Request
        </Tabs.Trigger>

        <Tabs.Trigger value="requests" className="generic-tabs-trigger">
          List Requests
        </Tabs.Trigger>

        <Tabs.Trigger value="dashboard" className="generic-tabs-trigger">
          Dashboard
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="create" className="generic-tabs-content">
        {createRequestContent}
      </Tabs.Content>

      <Tabs.Content value="requests" className="generic-tabs-content">
        {requestListContent}
      </Tabs.Content>

      <Tabs.Content value="dashboard" className="generic-tabs-content">
        {dashboardContent}
      </Tabs.Content>
    </Tabs.Root>
  )
}