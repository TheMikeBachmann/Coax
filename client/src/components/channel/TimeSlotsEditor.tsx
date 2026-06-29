import { useState } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { coax } from '../../api/coax'
import { useToast } from '../Toast'
import type { Program } from '../../types'

interface TimeSlot {
  time: string
  showId: string
  order: 'next' | 'shuffle' | 'random'
  flex: boolean
  flexDuration: number
  days: boolean[]
}

interface Props {
  programs: Program[]
  onApply: (programs: Program[]) => void
  onClose: () => void
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getUniqueShows(programs: Program[]) {
  const shows = new Map<string, string>()
  for (const p of programs) {
    const key = p.showTitle ?? p.title ?? 'Unknown'
    if (!shows.has(key)) shows.set(key, key)
  }
  return [...shows.keys()]
}

const defaultSlot = (): TimeSlot => ({
  time: '00:00',
  showId: '',
  order: 'next',
  flex: false,
  flexDuration: 30,
  days: Array(7).fill(true),
})

export default function TimeSlotsEditor({ programs, onApply, onClose }: Props) {
  const { addToast } = useToast()
  const shows = getUniqueShows(programs)
  const [slots, setSlots] = useState<TimeSlot[]>([{ ...defaultSlot(), showId: shows[0] ?? '' }])
  const [startTime, setStartTime] = useState(new Date().toISOString().slice(0, 16))
  const [calculating, setCalculating] = useState(false)

  const updateSlot = (i: number, patch: Partial<TimeSlot>) =>
    setSlots(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))

  const addSlot = () => setSlots(prev => [...prev, { ...defaultSlot(), showId: shows[0] ?? '' }])
  const removeSlot = (i: number) => setSlots(prev => prev.filter((_, idx) => idx !== i))

  const calculate = async () => {
    setCalculating(true)
    try {
      const schedule = {
        startTime: new Date(startTime).getTime(),
        slots: slots.map(s => ({
          time: s.time,
          showId: s.showId,
          order: s.order,
          flex: s.flex ? s.flexDuration * 60 * 1000 : 0,
          days: s.days,
        })),
      }
      const result = await coax.calculateTimeSlots(programs, schedule)
      onApply(result as Program[])
      addToast('Schedule applied', 'success')
      onClose()
    } catch { addToast('Failed to calculate schedule', 'error') }
    setCalculating(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold">Time Slots Schedule</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-700 rounded"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Schedule Start</label>
            <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)}
              className="bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm" />
          </div>

          <div className="space-y-4">
            {slots.map((slot, i) => (
              <div key={i} className="bg-gray-750 border border-gray-600 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Time</label>
                    <input type="time" value={slot.time} onChange={e => updateSlot(i, { time: e.target.value })}
                      className="bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm w-28" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-400 mb-1">Show</label>
                    <select value={slot.showId} onChange={e => updateSlot(i, { showId: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm">
                      {shows.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Order</label>
                    <select value={slot.order} onChange={e => updateSlot(i, { order: e.target.value as TimeSlot['order'] })}
                      className="bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm">
                      <option value="next">Next</option>
                      <option value="shuffle">Shuffle</option>
                      <option value="random">Random</option>
                    </select>
                  </div>
                  <button onClick={() => removeSlot(i)} className="mt-4 p-1.5 text-red-400 hover:text-red-300 hover:bg-gray-700 rounded">
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {DAYS.map((day, di) => (
                    <label key={day} className="flex items-center gap-1 text-xs cursor-pointer">
                      <input type="checkbox" checked={slot.days[di]} onChange={e => {
                        const days = [...slot.days]; days[di] = e.target.checked; updateSlot(i, { days })
                      }} className="rounded" />
                      {day}
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={slot.flex} onChange={e => updateSlot(i, { flex: e.target.checked })} className="rounded" />
                  Add flex padding
                  {slot.flex && (
                    <input type="number" value={slot.flexDuration} onChange={e => updateSlot(i, { flexDuration: Number(e.target.value) })}
                      className="w-20 bg-gray-700 border border-gray-600 text-white rounded px-2 py-1 text-sm" />
                  )}
                  {slot.flex && <span className="text-xs text-gray-400">min</span>}
                </label>
              </div>
            ))}
          </div>

          <button onClick={addSlot} className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-sm">
            <Plus size={16} /> Add Time Slot
          </button>
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
