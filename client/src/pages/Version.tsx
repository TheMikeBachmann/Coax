import { useEffect, useState } from 'react'
import { coax } from '../api/coax'
import type { VersionInfo } from '../types'

export default function Version() {
  const [info, setInfo] = useState<VersionInfo | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    coax.getVersion().then(setInfo).catch(() => setError('Failed to load version info'))
  }, [])

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Version Info</h1>
      {error && <div className="text-red-400 mb-4">{error}</div>}
      {!info && !error && <div className="text-gray-400">Loading…</div>}
      {info && (
        <div className="grid gap-4 max-w-md">
          {[
            { label: 'Coax', value: info.coax },
            { label: 'FFmpeg', value: info.ffmpeg },
            { label: 'Node.js', value: info.nodejs },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-800 rounded-lg p-4 flex justify-between items-center border border-gray-700">
              <span className="text-gray-400 font-medium">{label}</span>
              <span className="text-white font-mono text-sm">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
