import React, { useState } from 'react'
import AppHeaderCard from './components/AppHeaderCard.jsx'
import BackendHealthCard from './components/BackendHealthCard.jsx'
import MainContentCard from './components/MainContentCard.jsx'
import './styles/App.css'


const APP = {
  title: 'AcquireIQ',
  description: 'Government Acquisition Pipeline',
}

export default function App() {
  const [user] = useState(() => new URLSearchParams(window.location.search).get('user'))
  return (
    <div className="app-shell">
      <AppHeaderCard title={APP.title} description={APP.description} user={user} />
      <BackendHealthCard />
      <MainContentCard />
    </div>
  )
}