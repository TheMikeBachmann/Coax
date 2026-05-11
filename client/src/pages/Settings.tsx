import { useState } from 'react'
import type { Tab } from '../types'
import FfmpegSettings from '../components/settings/FfmpegSettings'
import XmltvSettings from '../components/settings/XmltvSettings'
import HdhrSettings from '../components/settings/HdhrSettings'
import PlexSettings from '../components/settings/PlexSettings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'plex', label: 'Plex' },
  { id: 'ffmpeg', label: 'FFmpeg' },
  { id: 'xmltv', label: 'XMLTV' },
  { id: 'hdhr', label: 'HDHR' },
]

export default function Settings() {
  const [tab, setTab] = useState<Tab>('plex')

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <div className="flex gap-1 mb-6 border-b border-gray-700">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'plex' && <PlexSettings />}
      {tab === 'ffmpeg' && <FfmpegSettings />}
      {tab === 'xmltv' && <XmltvSettings />}
      {tab === 'hdhr' && <HdhrSettings />}
    </div>
  )
}
