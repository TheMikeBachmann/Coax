import { useEffect, useState } from 'react'
import { Save, RotateCcw } from 'lucide-react'
import { dizquetv } from '../../api/dizquetv'
import { useToast } from '../Toast'
import type { XmltvSettings } from '../../types'

export default function XmltvSettings() {
  const { addToast } = useToast()
  const [settings, setSettings] = useState<XmltvSettings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    dizquetv.getXmltvSettings().then(setSettings).catch(() => addToast('Failed to load XMLTV settings', 'error'))
  }, [])

  if (!settings) return <div className="text-gray-400">Loading…</div>

  const update = (patch: Partial<XmltvSettings>) => setSettings(s => s ? { ...s, ...patch } : s)

  const save = async () => {
    setSaving(true)
    try {
      const res = await dizquetv.updateXmltvSettings(settings)
      setSettings(res)
      addToast('XMLTV settings saved', 'success')
    } catch { addToast('Failed to save', 'error') }
    setSaving(false)
  }

  const reset = async () => {
    try {
      const res = await dizquetv.resetXmltvSettings()
      setSettings(res)
      addToast('XMLTV settings reset', 'info')
    } catch { addToast('Failed to reset', 'error') }
  }

  return (
    <div className="space-y-4 max-w-md">
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">Cache Duration (hours)</label>
        <input
          type="number"
          min={1}
          value={settings.cache}
          onChange={e => update({ cache: Number(e.target.value) })}
          className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2"
        />
        <p className="text-xs text-gray-500 mt-1">How many hours of guide data to cache</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">Refresh Interval (hours)</label>
        <input
          type="number"
          min={1}
          value={settings.refresh}
          onChange={e => update({ refresh: Number(e.target.value) })}
          className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">XMLTV File Path</label>
        <input readOnly value={settings.file} className="w-full bg-gray-800 border border-gray-700 text-gray-400 rounded px-3 py-2 font-mono text-sm" />
      </div>
      <div className="flex gap-3 pt-2">
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded font-medium text-sm disabled:opacity-50">
          <Save size={16} /> {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={reset} className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded font-medium text-sm">
          <RotateCcw size={16} /> Reset
        </button>
      </div>
    </div>
  )
}
