import { useEffect, useState } from 'react'
import { Plus, Edit2, Trash2, X, Loader2 } from 'lucide-react'
import { dizquetv } from '../api/dizquetv'
import { useToast } from '../components/Toast'
import PlexLibrary from '../components/channel/PlexLibrary'
import type { Filler, FillerInfo, Program } from '../types'

function msToTime(ms: number) {
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

interface FillerConfigProps {
  filler?: Filler
  onSave: () => void
  onClose: () => void
}

function FillerConfig({ filler, onSave, onClose }: FillerConfigProps) {
  const { addToast } = useToast()
  const [name, setName] = useState(filler?.name ?? '')
  const [programs, setPrograms] = useState<Program[]>(filler?.content ?? [])
  const [showLibrary, setShowLibrary] = useState(false)
  const [saving, setSaving] = useState(false)

  const totalMs = programs.reduce((s, p) => s + (p.duration ?? 0), 0)

  const save = async () => {
    if (!name.trim()) { addToast('Name is required', 'warning'); return }
    setSaving(true)
    try {
      const payload = { name: name.trim(), content: programs } as Filler
      if (filler) {
        await dizquetv.updateFiller(filler.id, payload)
        addToast('Filler collection updated', 'success')
      } else {
        await dizquetv.createFiller(payload)
        addToast('Filler collection created', 'success')
      }
      onSave()
    } catch {
      addToast('Failed to save filler collection', 'error')
    }
    setSaving(false)
  }

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
        <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 w-full max-w-2xl h-[80vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
            <h2 className="text-lg font-semibold">{filler ? 'Edit' : 'New'} Filler Collection</h2>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-700 rounded"><X size={18} /></button>
          </div>

          <div className="flex-1 flex flex-col min-h-0 p-6 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm"
                placeholder="Filler collection name"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">
                {programs.length} items · {msToTime(totalMs)} total
              </span>
              <button
                onClick={() => setShowLibrary(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-sm"
              >
                <Plus size={14} /> Add Content
              </button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin border border-gray-700 rounded-lg">
              {programs.length === 0 && (
                <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
                  No content yet — add from your Plex library
                </div>
              )}
              {programs.map((p, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 border-b border-gray-700/50 hover:bg-gray-700/30">
                  {p.icon && (
                    <img src={p.icon} alt="" className="w-8 h-8 rounded object-cover shrink-0"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-100 truncate">{p.title}</div>
                    {p.showTitle && p.showTitle !== p.title && (
                      <div className="text-xs text-gray-400 truncate">{p.showTitle}</div>
                    )}
                  </div>
                  {p.duration > 0 && (
                    <span className="text-xs text-gray-500 shrink-0">{msToTime(p.duration)}</span>
                  )}
                  <button
                    onClick={() => setPrograms(prev => prev.filter((_, idx) => idx !== i))}
                    className="p-1 text-red-400 hover:text-red-300 rounded shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-700 flex gap-3 justify-end">
            <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-sm">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {showLibrary && (
        <PlexLibrary
          onAdd={items => setPrograms(prev => [...prev, ...items])}
          onClose={() => setShowLibrary(false)}
        />
      )}
    </>
  )
}

export default function FillerPage() {
  const { addToast } = useToast()
  const [fillers, setFillers] = useState<FillerInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [editingFiller, setEditingFiller] = useState<Filler | null | 'new'>(null)

  const load = async () => {
    try {
      setFillers(await dizquetv.getAllFillersInfo())
    } catch {
      addToast('Failed to load filler collections', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openEdit = async (info: FillerInfo) => {
    try {
      const full = await dizquetv.getFiller(info.id)
      setEditingFiller(full)
    } catch {
      addToast('Failed to load filler', 'error')
    }
  }

  const deleteFiller = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return
    try {
      await dizquetv.deleteFiller(id)
      addToast('Filler collection deleted', 'success')
      load()
    } catch {
      addToast('Failed to delete filler collection', 'error')
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Filler Collections</h1>
        <button
          onClick={() => setEditingFiller('new')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> New Collection
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-48 text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Loading…
        </div>
      )}

      {!loading && fillers.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-gray-500 gap-2">
          <p>No filler collections yet.</p>
          <p className="text-xs">Filler plays between programs to pad time slots.</p>
        </div>
      )}

      {!loading && fillers.length > 0 && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase">
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left hidden sm:table-cell">Items</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {fillers.map(f => (
                <tr key={f.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                  <td className="px-4 py-3 font-medium text-gray-100">{f.name}</td>
                  <td className="px-4 py-3 hidden sm:table-cell text-gray-400">{f.count}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(f)}
                        className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-600 rounded"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => deleteFiller(f.id, f.name)}
                        className="p-1.5 text-red-400 hover:text-red-300 hover:bg-gray-600 rounded"
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

      {editingFiller !== null && (
        <FillerConfig
          filler={editingFiller === 'new' ? undefined : editingFiller}
          onSave={() => { setEditingFiller(null); load() }}
          onClose={() => setEditingFiller(null)}
        />
      )}
    </div>
  )
}
