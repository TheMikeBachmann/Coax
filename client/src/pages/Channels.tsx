import { useEffect, useState } from 'react'
import { Plus, Edit2, Trash2, Tv } from 'lucide-react'
import { dizquetv } from '../api/dizquetv'
import { useToast } from '../components/Toast'
import ChannelConfig from '../components/channel/ChannelConfig'
import type { Channel } from '../types'

function msToTime(ms: number) {
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function Channels() {
  const { addToast } = useToast()
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Channel | null | 'new'>(null)

  const load = async () => {
    try {
      const data = await dizquetv.getChannels()
      setChannels(data.sort((a, b) => a.number - b.number))
    } catch {
      addToast('Failed to load channels', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openEdit = async (ch: Channel) => {
    try {
      const full = await dizquetv.getChannel(ch.number)
      setEditing(full)
    } catch {
      addToast('Failed to load channel', 'error')
    }
  }

  const deleteChannel = async (number: number) => {
    if (!confirm(`Delete channel ${number}?`)) return
    try {
      await dizquetv.removeChannel({ number })
      addToast('Channel deleted', 'success')
      load()
    } catch {
      addToast('Failed to delete channel', 'error')
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Channels</h1>
        <button
          onClick={() => setEditing('new')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> New Channel
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-48 text-gray-400">Loading…</div>
      )}

      {!loading && channels.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-gray-500 gap-3">
          <Tv size={40} className="opacity-30" />
          <p>No channels yet. Create one to get started.</p>
        </div>
      )}

      {!loading && channels.length > 0 && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase">
                <th className="px-4 py-3 text-left w-16">#</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left hidden sm:table-cell">Programs</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">Duration</th>
                <th className="px-4 py-3 text-left hidden lg:table-cell">Transcoding</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {channels.map(ch => (
                <tr key={ch.number} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                  <td className="px-4 py-3 font-mono text-gray-300">{ch.number}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {ch.icon && (
                        <img src={ch.icon} alt="" className="w-8 h-8 rounded object-cover shrink-0"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      )}
                      <span className="font-medium text-gray-100">{ch.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-gray-400">
                    {ch.programs?.length ?? 0}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-400">
                    {ch.duration ? msToTime(ch.duration) : '—'}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-gray-400">
                    {ch.transcoding?.targetResolution ?? 'default'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(ch)}
                        className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-600 rounded"
                        title="Edit"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => deleteChannel(ch.number)}
                        className="p-1.5 text-red-400 hover:text-red-300 hover:bg-gray-600 rounded"
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing !== null && (
        <ChannelConfig
          channel={editing === 'new' ? null : editing}
          channels={channels}
          onSave={_ch => { setEditing(null); load() }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
