import { Routes, Route, Navigate } from 'react-router-dom'
import RootLayout from './components/layout/RootLayout.jsx'
import HomePage from './pages/HomePage.jsx'
import OpenTrade from './pages/OpenTrade.jsx'
import ManagePositions from './pages/ManagePositions.jsx'
import FuturePage from './pages/FuturePage.jsx'
import Configuration from './pages/Configuration.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route index                   element={<HomePage />} />
        <Route path="open-trade"       element={<OpenTrade />} />
        <Route path="manage-positions" element={<ManagePositions />} />
        <Route path="future"           element={<FuturePage />} />
        <Route path="configuration"    element={<Configuration />} />
        <Route path="*"                element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
