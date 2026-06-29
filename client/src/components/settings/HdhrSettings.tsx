import { useEffect, useState } from 'react'
import { Save, RotateCcw } from 'lucide-react'
import { coax } from '../../api/coax'
import { useToast } from '../Toast'
import type { HdhrSettings } from '../../types'

export default function HdhrSettings() {
  const { addToast } = useToast()
  const [settings, setSettings] = useState<HdhrSettings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    coax.getHdhrSettings().then(setSettings).catch(() => addToast('Failed to load HDHR settings', 'error'))
  }, [])

  if (!settings) return <div className="text-gray-400">Loading…</div>

  const update = (patch: Partial<HdhrSettings>) => setSettings(s => s ? { ...s, ...patch } : s)

  const save = async () => {
    setSaving(true)
    try {
      await coax.updateHdhrSettings(settings)
      addToast('HDHR settings saved', 'success')
    } catch { addToast('Failed to save', 'error') }
    setSaving(false)
  }

  const reset = async () => {
    try {
      const res = await coax.resetHdhrSettings()
      setSettings(res)
      addToast('HDHR settings reset', 'info')
    } catch { addToast('Failed to reset', 'error') }
  }

  return (
    <div className="space-y-4 max-w-md">
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">Tuner Count</label>
        <input
          type="number"
          min={1}
          max={16}
          value={settings.tunerCount}
          onChange={e => update({ tunerCount: Number(e.target.value) })}
          className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2"
        />
      </div>
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.autoDiscovery}
          onChange={e => update({ autoDiscovery: e.target.checked })}
          className="rounded"
        />
        <span className="text-sm text-gray-300">Enable HDHR auto-discovery (SSDP)</span>
      </label>
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
