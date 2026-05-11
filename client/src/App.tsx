import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import { ToastProvider } from './components/Toast'
import Guide from './pages/Guide'
import Channels from './pages/Channels'
import Filler from './pages/Filler'
import CustomShows from './pages/CustomShows'
import Settings from './pages/Settings'
import Player from './pages/Player'
import Version from './pages/Version'

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/guide" element={<Guide />} />
            <Route path="/channels" element={<Channels />} />
            <Route path="/filler" element={<Filler />} />
            <Route path="/custom-shows" element={<CustomShows />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/player" element={<Player />} />
            <Route path="/version" element={<Version />} />
            <Route path="*" element={<Navigate to="/guide" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}
