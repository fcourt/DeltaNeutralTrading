import { Routes, Route, Navigate } from 'react-router-dom'
import { Suspense } from 'react'
import HomePage from './pages/HomePage.jsx'
import AppLayout from './components/layout/AppLayout.jsx'
import OpenTrade from './pages/OpenTrade.jsx'
import ManagePositions from './pages/ManagePositions.jsx'
import FuturePage from './pages/FuturePage.jsx'
import Configuration from './pages/Configuration.jsx'
import LoadingSpinner from './components/ui/LoadingSpinner.jsx'

export default function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        {/* Home page (language selector lives here) */}
        <Route path="/" element={<HomePage />} />

        {/* App with persistent tab navigation */}
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<Navigate to="open-trade" replace />} />
          <Route path="open-trade" element={<OpenTrade />} />
          <Route path="manage-positions" element={<ManagePositions />} />
          <Route path="future" element={<FuturePage />} />
          <Route path="configuration" element={<Configuration />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
