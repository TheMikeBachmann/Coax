import { useState } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { coax } from '../../api/coax'
import { useToast } from '../Toast'
import type { Program } from '../../types'

interface RandomSlot {
  showId: string
  order: 'next' | 'shuffle' | 'random'
  weight: number
  cooldown: number
}

interface Props {
  programs: Program[]
  onApply: (programs: Program[]) => void
  onClose: () => void
}

function getUniqueShows(programs: Program[]) {
  const shows = new Map<string, string>()
  for (const p of programs) {
    const key = p.showTitle ?? p.title ?? 'Unknown'
    if (!shows.has(key)) shows.set(key, key)
  }
  return [...shows.keys()]
}

export default function RandomSlotsEditor({ programs, onApply, onClose }: Props) {
  const { addToast } = useToast()
  const shows = getUniqueShows(programs)
  const [slots, setSlots] = useState<RandomSlot[]>(
    shows.slice(0, 3).map(showId => ({ showId, order: 'next', weight: 1, cooldown: 0 }))
  )
  const [duration, setDuration] = useState(7)
  const [startTime, setStartTime] = useState(new Date().toISOString().slice(0, 16))
  const [calculating, setCalculating] = useState(false)

  const updateSlot = (i: number, patch: Partial<RandomSlot>) =>
    setSlots(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  const addSlot = () => setSlots(prev => [...prev, { showId: shows[0] ?? '', order: 'next', weight: 1, cooldown: 0 }])
  const removeSlot = (i: number) => setSlots(prev => prev.filter((_, idx) => idx !== i))

  const calculate = async () => {
    setCalculating(true)
    try {
      const schedule = {
        startTime: new Date(startTime).getTime(),
        maxDays: duration,
        slots: slots.map(s => ({
          showId: s.showId,
          order: s.order,
          weight: s.weight,
          cooldown: s.cooldown * 60 * 1000,
        })),
      }
      const result = await coax.calculateRandomSlots(programs, schedule)
      onApply(result as Program[])
      addToast('Random schedule applied', 'success')
      onClose()
    } catch { addToast('Failed to calculate schedule', 'error') }
    setCalculating(false)
  }

  const totalWeight = slots.reduce((sum, s) => sum + s.weight, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold">Random Slots Schedule</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-700 rounded"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Schedule Start</label>
              <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Duration (days)</label>
              <input type="number" min={1} max={365} value={duration} onChange={e => setDuration(Number(e.target.value))}
                className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium text-gray-300">Shows</div>
            {slots.map((slot, i) => (
              <div key={i} className="bg-gray-750 border border-gray-600 rounded-lg p-3 flex items-center gap-3">
                <div className="flex-1">
                  <select value={slot.showId} onChange={e => updateSlot(i, { showId: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm">
                    {shows.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <select value={slot.order} onChange={e => updateSlot(i, { order: e.target.value as RandomSlot['order'] })}
                    className="bg-gray-700 border border-gray-600 text-white rounded px-2 py-2 text-sm">
                    <option value="next">Next</option>
                    <option value="shuffle">Shuffle</option>
                    <option value="random">Random</option>
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <label className="text-xs text-gray-400">Weight</label>
                  <input type="number" min={1} max={100} value={slot.weight} onChange={e => updateSlot(i, { weight: Number(e.target.value) })}
                    className="w-16 bg-gray-700 border border-gray-600 text-white rounded px-2 py-2 text-sm" />
                </div>
                <div className="flex items-center gap-1">
                  <label className="text-xs text-gray-400">Cooldown</label>
                  <input type="number" min={0} value={slot.cooldown} onChange={e => updateSlot(i, { cooldown: Number(e.target.value) })}
                    className="w-16 bg-gray-700 border border-gray-600 text-white rounded px-2 py-2 text-sm" />
                  <span className="text-xs text-gray-500">min</span>
                </div>
                <div className="text-xs text-gray-400 w-10 text-right">
                  {totalWeight > 0 ? `${Math.round(slot.weight / totalWeight * 100)}%` : '—'}
                </div>
                <button onClick={() => removeSlot(i)} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-gray-700 rounded">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button onClick={addSlot} className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-sm">
              <Plus size={14} /> Add Show
            </button>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-700 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-sm">Cancel</button>
          <button onClick={calculate} disabled={calculating || slots.length === 0}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium disabled:opacity-50">
            {calculating ? 'Calculating…' : 'Apply Schedule'}
          </button>
        </div>
      </div>
    </div>
  )
}
