import { useState, useCallback } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { X, Plus, Trash2, GripVertical, Shuffle, Copy, Tv, Clock, Sliders, Settings, Film, Tv2 } from 'lucide-react'
import { useToast } from '../Toast'
import PlexLibrary from './PlexLibrary'
import TimeSlotsEditor from './TimeSlotsEditor'
import RandomSlotsEditor from './RandomSlotsEditor'
import type { Channel, Program, FillerInfo, Watermark, FillerCollection } from '../../types'
import { RESOLUTION_OPTIONS } from '../../types'
import { dizquetv } from '../../api/dizquetv'

const TABS = [
  { id: 'programming', label: 'Programming', icon: Tv },
  { id: 'filler', label: 'Filler', icon: Film },
  { id: 'offline', label: 'Offline', icon: Tv2 },
  { id: 'epg', label: 'EPG', icon: Clock },
  { id: 'general', label: 'General', icon: Settings },
  { id: 'transcoding', label: 'Transcoding', icon: Sliders },
]

function msToHMS(ms: number) {
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`
}

function programLabel(p: Program) {
  if (p.isOffline) return p.flex ? 'Flex' : 'Offline'
  if (p.isRedirect) return `→ Ch ${p.channel}`
  if (p.type === 'episode') return `${p.showTitle} S${p.season}E${p.episode} – ${p.title}`
  if (p.type === 'track') return `♪ ${p.showTitle} – ${p.title}`
  return p.title ?? 'Unknown'
}

function defaultWatermark(): Watermark {
  return { enabled: false, position: 'bottom-right', width: 10, verticalMargin: 5, horizontalMargin: 5, duration: -1, fixedSize: false, animated: false }
}

function nextStartTime() {
  const d = new Date()
  d.setSeconds(0, 0)
  if (d.getMinutes() < 30) d.setMinutes(0)
  else d.setMinutes(30)
  return d
}

function initChannel(existing: Channel | null, channels: Channel[]): Channel {
  if (existing) return { ...existing, programs: existing.programs ?? [] }
  const num = channels.length > 0 ? channels[channels.length - 1].number + 1 : 1
  return {
    number: num,
    name: `Channel ${num}`,
    icon: `${window.location.origin}/images/dizquetv.png`,
    startTime: nextStartTime().toISOString(),
    programs: [],
    watermark: defaultWatermark(),
    fillerCollections: [],
    fallback: [],
    guideFlexPlaceholder: '',
    fillerRepeatCooldown: 30 * 60 * 1000,
    guideMinimumDurationSeconds: 5 * 60,
    offlineMode: 'pic',
    offlinePicture: `${window.location.origin}/images/generic-offline-screen.png`,
    offlineSoundtrack: '',
    groupTitle: 'dizqueTV',
    transcoding: { targetResolution: '' },
    onDemand: { isOnDemand: false, modulo: 1 },
    disableFillerOverlay: true,
    iconWidth: 120,
    iconDuration: 60,
    iconPosition: '2',
  }
}

interface SortableProgramProps {
  id: string
  program: Program
  index: number
  onRemove: () => void
}

function SortableProgram({ id, program, index, onRemove }: SortableProgramProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-700 hover:bg-gray-700/50 group">
      <button {...attributes} {...listeners} className="p-0.5 text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing">
        <GripVertical size={14} />
      </button>
      <span className="text-xs text-gray-500 w-6 shrink-0">{index + 1}</span>
      <span className="flex-1 text-sm text-gray-200 truncate">{programLabel(program)}</span>
      <span className="text-xs text-gray-500 shrink-0">{msToHMS(program.duration)}</span>
      <button onClick={onRemove} className="p-1 text-red-400 opacity-0 group-hover:opacity-100 hover:text-red-300">
        <Trash2 size={12} />
      </button>
    </div>
  )
}

interface Props {
  channel: Channel | null
  channels: Channel[]
  onSave: (ch: Channel) => void
  onClose: () => void
}

export default function ChannelConfig({ channel: initialChannel, channels, onSave, onClose }: Props) {
  const { addToast } = useToast()
  const isNew = !initialChannel
  const [ch, setCh] = useState<Channel>(() => initChannel(initialChannel, channels))
  const [tab, setTab] = useState(isNew ? 'general' : 'programming')
  const [saving, setSaving] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [showTimeSlots, setShowTimeSlots] = useState(false)
  const [showRandomSlots, setShowRandomSlots] = useState(false)
  const [fillerInfos, setFillerInfos] = useState<FillerInfo[]>([])
  const [fillerLoaded, setFillerLoaded] = useState(false)

  const update = (patch: Partial<Channel>) => setCh(c => ({ ...c, ...patch }))

  const totalDuration = ch.programs.reduce((sum, p) => sum + p.duration, 0)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIdx = ch.programs.findIndex((_, i) => `prog-${i}` === active.id)
      const newIdx = ch.programs.findIndex((_, i) => `prog-${i}` === over.id)
      update({ programs: arrayMove(ch.programs, oldIdx, newIdx) })
    }
  }

  const removeProgram = (idx: number) =>
    update({ programs: ch.programs.filter((_, i) => i !== idx) })

  const shuffle = () => {
    const arr = [...ch.programs]
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]]
    }
    update({ programs: arr })
  }

  const removeDuplicates = () => {
    const seen = new Set<string>()
    update({ programs: ch.programs.filter(p => {
      const key = `${p.serverKey}-${p.ratingKey}-${p.file}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })})
  }

  const addPrograms = useCallback((programs: Program[]) => {
    update({ programs: [...ch.programs, ...programs] })
  }, [ch.programs])

  const loadFillers = async () => {
    if (fillerLoaded) return
    const infos = await dizquetv.getAllFillersInfo()
    setFillerInfos(infos)
    setFillerLoaded(true)
  }

  const save = async () => {
    if (!ch.name.trim()) { addToast('Channel name is required', 'error'); return }
    if (!Number.isInteger(ch.number) || ch.number < 1) { addToast('Channel number must be a positive integer', 'error'); return }
    setSaving(true)
    try {
      if (isNew) {
        await dizquetv.addChannel(ch)
        addToast('Channel created', 'success')
      } else {
        await dizquetv.updateChannel(ch)
        addToast('Channel updated', 'success')
      }
      onSave(ch)
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Failed to save channel', 'error')
    }
    setSaving(false)
  }

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
        <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 w-full max-w-5xl h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-700">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm text-gray-400 font-medium">Ch.</span>
              <input
                type="number" min={1} value={ch.number}
                onChange={e => update({ number: parseInt(e.target.value) })}
                className="w-16 bg-gray-700 border border-gray-600 text-white rounded px-2 py-1.5 text-sm"
              />
            </div>
            <input
              value={ch.name}
              onChange={e => update({ name: e.target.value })}
              placeholder="Channel name"
              className="flex-1 bg-gray-700 border border-gray-600 text-white rounded px-3 py-1.5 text-sm font-medium"
            />
            <button onClick={onClose} className="p-1.5 hover:bg-gray-700 rounded shrink-0"><X size={18} /></button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-700 px-4">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); if (t.id === 'filler') loadFillers() }}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}
              >
                <t.icon size={14} />
                {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {/* Programming tab */}
            {tab === 'programming' && (
              <div className="flex flex-col h-full">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-700 bg-gray-800/50">
                  <button onClick={() => setShowLibrary(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm">
                    <Plus size={14} /> Add Content
                  </button>
                  <button onClick={() => setShowTimeSlots(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-sm">
                    <Clock size={14} /> Time Slots
                  </button>
                  <button onClick={() => setShowRandomSlots(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-sm">
                    <Shuffle size={14} /> Random
                  </button>
                  <button onClick={shuffle} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-sm">
                    <Shuffle size={14} /> Shuffle
                  </button>
                  <button onClick={removeDuplicates} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-sm">
                    <Copy size={14} /> Deduplicate
                  </button>
                  <div className="ml-auto text-xs text-gray-400">
                    {ch.programs.length} items · {msToHMS(totalDuration)}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-thin">
                  {ch.programs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-gray-500 text-sm">
                      <Plus size={24} className="mb-2 opacity-30" />
                      No programs yet — add content above
                    </div>
                  ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={ch.programs.map((_, i) => `prog-${i}`)} strategy={verticalListSortingStrategy}>
                        {ch.programs.map((prog, i) => (
                          <SortableProgram
                            key={`prog-${i}`}
                            id={`prog-${i}`}
                            program={prog}
                            index={i}
                            onRemove={() => removeProgram(i)}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              </div>
            )}

            {/* Filler tab */}
            {tab === 'filler' && (
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-400">Filler content is inserted when there's a gap in programming.</p>
                <div className="space-y-3">
                  {(ch.fillerCollections ?? []).map((fc, i) => {
                    const info = fillerInfos.find(f => f.id === fc.id)
                    return (
                      <div key={i} className="bg-gray-750 border border-gray-600 rounded-lg p-3 flex items-center gap-4">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{info?.name ?? fc.id}</div>
                          <div className="text-xs text-gray-400">{info?.count ?? 0} items</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-400">Weight</label>
                          <input type="number" min={1} value={fc.weight} onChange={e => {
                            const cols = [...(ch.fillerCollections ?? [])]; cols[i] = { ...cols[i], weight: Number(e.target.value) }; update({ fillerCollections: cols })
                          }} className="w-16 bg-gray-700 border border-gray-600 text-white rounded px-2 py-1 text-sm" />
                        </div>
                        <button onClick={() => update({ fillerCollections: (ch.fillerCollections ?? []).filter((_, idx) => idx !== i) })} className="p-1.5 text-red-400 hover:text-red-300">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )
                  })}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Add Filler Collection</label>
                  <select
                    onChange={e => {
                      if (!e.target.value) return
                      const existing = (ch.fillerCollections ?? []).find(f => f.id === e.target.value)
                      if (existing) return
                      const fc: FillerCollection = { id: e.target.value, weight: 1, cooldown: 0 }
                      update({ fillerCollections: [...(ch.fillerCollections ?? []), fc] })
                      e.target.value = ''
                    }}
                    className="bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm"
                    defaultValue=""
                  >
                    <option value="" disabled>Select filler…</option>
                    {fillerInfos.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={!ch.disableFillerOverlay} onChange={e => update({ disableFillerOverlay: !e.target.checked })} className="rounded" />
                  Show filler in overlay
                </label>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Filler Repeat Cooldown (minutes)</label>
                  <input type="number" min={0} value={Math.floor((ch.fillerRepeatCooldown ?? 0) / 60000)} onChange={e => update({ fillerRepeatCooldown: Number(e.target.value) * 60000 })}
                    className="w-32 bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm" />
                </div>
              </div>
            )}

            {/* Offline tab */}
            {tab === 'offline' && (
              <div className="p-6 space-y-4 max-w-lg">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Offline Mode</label>
                  <select value={ch.offlineMode ?? 'pic'} onChange={e => update({ offlineMode: e.target.value })} className="bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm">
                    <option value="pic">Static Image</option>
                    <option value="clip">Video Clip</option>
                    <option value="flex">Flex (Skip)</option>
                  </select>
                </div>
                {ch.offlineMode !== 'flex' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Offline Picture URL</label>
                    <input value={ch.offlinePicture ?? ''} onChange={e => update({ offlinePicture: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm" />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Offline Soundtrack URL</label>
                  <input value={ch.offlineSoundtrack ?? ''} onChange={e => update({ offlineSoundtrack: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm" />
                </div>
              </div>
            )}

            {/* EPG tab */}
            {tab === 'epg' && (
              <div className="p-6 space-y-4 max-w-lg">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Minimum Program Duration in Guide (seconds)</label>
                  <input type="number" min={0} value={ch.guideMinimumDurationSeconds ?? 300}
                    onChange={e => update({ guideMinimumDurationSeconds: Number(e.target.value) })}
                    className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm" />
                  <p className="text-xs text-gray-500 mt-1">Programs shorter than this are grouped as flex in the guide</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Flex Placeholder Title</label>
                  <input value={ch.guideFlexPlaceholder ?? ''} onChange={e => update({ guideFlexPlaceholder: e.target.value })}
                    placeholder="Leave blank to hide flex in guide"
                    className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm" />
                </div>
                <div className="border-t border-gray-700 pt-4">
                  <div className="text-sm font-medium text-gray-300 mb-3">On-Demand</div>
                  <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer mb-3">
                    <input type="checkbox" checked={ch.onDemand?.isOnDemand ?? false} onChange={e => update({ onDemand: { ...(ch.onDemand ?? { isOnDemand: false, modulo: 1 }), isOnDemand: e.target.checked } })} className="rounded" />
                    Enable on-demand mode
                  </label>
                  {ch.onDemand?.isOnDemand && (
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Play every Nth episode</label>
                      <input type="number" min={1} value={ch.onDemand?.modulo ?? 1} onChange={e => update({ onDemand: { ...(ch.onDemand ?? { isOnDemand: true, modulo: 1 }), modulo: Number(e.target.value) } })}
                        className="w-24 bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* General tab */}
            {tab === 'general' && (
              <div className="p-6 space-y-4 max-w-lg">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Channel Number</label>
                    <input type="number" min={1} value={ch.number} onChange={e => update({ number: parseInt(e.target.value) })}
                      className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Group</label>
                    <input value={ch.groupTitle ?? ''} onChange={e => update({ groupTitle: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Channel Name</label>
                  <input value={ch.name} onChange={e => update({ name: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Icon URL</label>
                  <input value={ch.icon} onChange={e => update({ icon: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm" />
                  {ch.icon && <img src={ch.icon} alt="" className="mt-2 h-12 rounded object-contain bg-gray-700 p-1" />}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Start Time</label>
                  <input type="datetime-local" value={ch.startTime?.slice(0, 16) ?? ''} onChange={e => update({ startTime: new Date(e.target.value).toISOString() })}
                    className="bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm" />
                </div>
              </div>
            )}

            {/* Transcoding tab */}
            {tab === 'transcoding' && (
              <div className="p-6 space-y-4 max-w-lg">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Target Resolution</label>
                  <select value={ch.transcoding?.targetResolution ?? ''} onChange={e => update({ transcoding: { ...ch.transcoding, targetResolution: e.target.value } })}
                    className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm">
                    {RESOLUTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Overrides global FFmpeg resolution for this channel</p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700">
            <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-sm">Cancel</button>
            <button onClick={save} disabled={saving} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium disabled:opacity-50">
              {saving ? 'Saving…' : isNew ? 'Create Channel' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      {showLibrary && <PlexLibrary onAdd={progs => { addPrograms(progs); setShowLibrary(false) }} onClose={() => setShowLibrary(false)} />}
      {showTimeSlots && <TimeSlotsEditor programs={ch.programs} onApply={progs => update({ programs: progs })} onClose={() => setShowTimeSlots(false)} />}
      {showRandomSlots && <RandomSlotsEditor programs={ch.programs} onApply={progs => update({ programs: progs })} onClose={() => setShowRandomSlots(false)} />}
    </>
  )
}
