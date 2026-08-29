import React from 'react'
import AppHeaderCard from './components/AppHeaderCard.jsx'
import BackendHealthCard from './components/BackendHealthCard.jsx'
import MainContentCard from './components/MainContentCard.jsx'
import './App.css'

const APP = {
  title: 'AcquireIQ',
  description: 'Government Acquisition Pipeline',
}

export default function App() {
  return (
    <div className="app-shell">
      <AppHeaderCard title={APP.title} description={APP.description} />
      <BackendHealthCard />
      <MainContentCard />
    </div>
  )
}