import { Routes, Route, Navigate } from 'react-router-dom'
import RootLayout from './components/layout/RootLayout.jsx'
import HomePage from './pages/HomePage.jsx'
import OpenTrade from './pages/OpenTrade.jsx'
import ManagePositions from './pages/ManagePositions.jsx'
import StatsPage from './pages/StatsPage.jsx'
import Configuration from './pages/Configuration.jsx'
import SettingKeys from './pages/SettingKeys.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route index                   element={<HomePage />} />
        <Route path="open-trade"       element={<OpenTrade />} />
        <Route path="manage-positions" element={<ManagePositions />} />
        <Route path="stats"            element={<StatsPage />} />
        <Route path="configuration"    element={<Configuration />} />
        <Route path="setting-keys"     element={<SettingKeys />} />
        <Route path="*"                element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
