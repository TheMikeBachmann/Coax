import { useCallback, useEffect, useRef, useState } from 'react'
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { coax } from '../api/coax'

const MINUTE = 60 * 1000

interface TimeSlot { label?: string; duration: number }
interface GuideProgram { duration: number; showTitle?: string; subTitle?: string; episodeTitle?: string; altTitle?: string; start: boolean; end: boolean }
interface GuideChannel { number: number; name: string; icon: string; altTitle: string; programs: GuideProgram[]; loading?: boolean }

const ZOOM_CONFIG: Record<number, { T: number; M: number; before: number }> = {
  1: { T: 50 * MINUTE, M: 10 * MINUTE, before: 5 * MINUTE },
  2: { T: 100 * MINUTE, M: 15 * MINUTE, before: 10 * MINUTE },
  3: { T: 190 * MINUTE, M: 30 * MINUTE, before: 15 * MINUTE },
  4: { T: 270 * MINUTE, M: 60 * MINUTE, before: 15 * MINUTE },
  5: { T: 380 * MINUTE, M: 90 * MINUTE, before: 15 * MINUTE },
}

const timeFormat = new Intl.DateTimeFormat('default', { hour12: true, hour: 'numeric', minute: 'numeric' })
const fmt = (d: Date) => timeFormat.format(d)

const CHANNEL_COL_PCT = 13

export default function Guide() {
  const [zoomLevel, setZoomLevel] = useState(3)
  const [offset, setOffset] = useState(0)
  const [times, setTimes] = useState<TimeSlot[]>([])
  const [channelNumbers, setChannelNumbers] = useState<number[]>([])
  const [channels, setChannels] = useState<Record<number, GuideChannel>>({})
  const [enableBack, setEnableBack] = useState(false)
  const [enableNext, setEnableNext] = useState(false)
  const [showNow, setShowNow] = useState(false)
  const [nowPct, setNowPct] = useState(0)
  const [lastUpdate, setLastUpdate] = useState(-1)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshingRef = useRef(false)

  const cfg = ZOOM_CONFIG[zoomLevel]
  const programColPct = 100 - CHANNEL_COL_PCT
  const minutePct = programColPct / (cfg.T / MINUTE)

  const buildTimes = useCallback((t0: number, T: number, M: number) => {
    const slots: TimeSlot[] = []
    let pending = 0
    let rem = T
    let t = t0

    const addDuration = (d: number) => {
      const m = (pending + d) % MINUTE
      const r = pending + d - m
      pending = m
      return Math.floor(r / MINUTE)
    }

    if (t % M !== 0) {
      const dif = M - (t % M)
      const dur = addDuration(dif)
      if (dur >= 1) slots.push({ duration: dur })
      t += dif; rem -= dif
    }
    while (rem > 0) {
      const d = Math.min(rem, M)
      slots.push({ duration: addDuration(d), label: fmt(new Date(t)) })
      t += d; rem -= d
    }
    return slots
  }, [])

  const updateNow = useCallback((t0: number, T: number) => {
    const now = Date.now()
    if (t0 <= now && now < t0 + T) {
      const n = (now - t0) / MINUTE
      setNowPct(CHANNEL_COL_PCT + n * minutePct)
      setShowNow(true)
    } else {
      setShowNow(false)
    }
  }, [minutePct])

  const loadChannel = useCallback(async (number: number, t0: number, T: number) => {
    const d0 = new Date(t0), d1 = new Date(t0 + T)
    const lineup = await coax.getChannelLineup(number, d0, d1)
    const programs: GuideProgram[] = []
    let pending = 0
    let totalAdded = 0
    let localEnableBack = false, localEnableNext = false

    const addDuration = (d: number) => {
      totalAdded += d
      const m = (pending + d) % MINUTE
      const r = pending + d - m
      pending = m
      return Math.floor(r / MINUTE)
    }
    const trimZero = () => {
      if (programs.length > 0 && programs[programs.length - 1].duration < 1) programs.pop()
    }

    for (let i = 0; i < lineup.programs.length; i++) {
      const prog = lineup.programs[i]
      let a = new Date(prog.start).getTime()
      let b = new Date(prog.stop).getTime()
      let hasStart = true, hasStop = true

      if (a < t0) { a = t0; hasStart = false; localEnableBack = true }
      else if (a > t0 && i === 0) {
        const dur = addDuration(a - t0)
        if (dur >= 1) programs.push({ duration: dur, showTitle: '', start: false, end: true })
        trimZero()
      }
      if (b > t0 + T) { b = t0 + T; hasStop = false; localEnableNext = true }

      const ad = new Date(prog.start), bd = new Date(prog.stop)
      let altTitle = `${fmt(ad)}–${fmt(bd)}`
      if (prog.title) altTitle += ` · ${prog.title}`

      let subTitle: string | undefined
      let episodeTitle: string | undefined
      if (prog.sub) {
        const ps = String(prog.sub.season).padStart(2, '0')
        const pe = String(prog.sub.episode).padStart(2, '0')
        subTitle = `S${ps}·E${pe}`
        altTitle += ` ${subTitle}`
        episodeTitle = prog.sub.title
      } else if (!prog.date) {
        subTitle = '·'
      } else {
        subTitle = prog.date.slice(0, 4)
      }

      const dur = addDuration(b - a)
      if (dur >= 1) {
        programs.push({ duration: dur, altTitle, showTitle: prog.title, subTitle, episodeTitle, start: hasStart, end: hasStop })
      }
      trimZero()
    }

    if (totalAdded < T) {
      const dur = addDuration(T - totalAdded)
      if (dur >= 1) programs.push({ duration: dur, showTitle: '', start: false, end: true })
      trimZero()
    }

    setChannels(prev => ({
      ...prev,
      [number]: {
        number,
        name: lineup.name,
        icon: lineup.icon,
        altTitle: `${lineup.number} – ${lineup.name}`,
        programs,
        loading: false,
      },
    }))
    setEnableBack(b => b || localEnableBack)
    setEnableNext(n => n || localEnableNext)
  }, [])

  const refresh = useCallback(async (skipStatus = false) => {
    if (refreshingRef.current) return
    refreshingRef.current = true

    const { T, M, before } = ZOOM_CONFIG[zoomLevel]
    const now = Date.now()
    const t1 = now - (now % MINUTE)
    const t0 = t1 - before + offset

    setTimes(buildTimes(t0, T, M))
    updateNow(t0, T)
    setEnableBack(false)
    setEnableNext(false)

    try {
      let nums = channelNumbers
      if (!skipStatus) {
        setChannelNumbers([0])
        setChannels({ 0: { number: 0, name: '', icon: '', altTitle: '', programs: [], loading: true } })
        const status = await coax.getGuideStatus()
        setLastUpdate(new Date(status.lastUpdate).getTime())
        nums = status.channelNumbers
        setChannelNumbers(nums)
        setChannels({})
      }
      setChannels(prev => {
        const next = { ...prev }
        for (const n of nums) {
          if (!next[n]) next[n] = { number: n, name: '', icon: '', altTitle: '', programs: [], loading: true }
          else next[n] = { ...next[n], loading: true }
        }
        return next
      })
      await Promise.all(nums.map(n => loadChannel(n, t0, T)))
    } catch (err) {
      console.error('Guide refresh failed', err)
    }
    refreshingRef.current = false

    timerRef.current = setTimeout(async () => {
      try {
        const status = await coax.getGuideStatus()
        const t = new Date(status.lastUpdate).getTime()
        if (t > lastUpdate) await refresh()
        else timerRef.current = setTimeout(() => refresh(true), 60000)
      } catch { /* ignore */ }
    }, 60000)
  }, [zoomLevel, offset, channelNumbers, lastUpdate, buildTimes, updateNow, loadChannel])

  useEffect(() => {
    refresh()
    const nowInterval = setInterval(() => {
      const { T, before } = ZOOM_CONFIG[zoomLevel]
      const now = Date.now()
      const t0 = now - (now % MINUTE) - before + offset
      updateNow(t0, T)
    }, 10000)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      clearInterval(nowInterval)
    }
  }, [zoomLevel, offset])

  const zoomIn = () => setZoomLevel(z => Math.max(1, z - 1))
  const zoomOut = () => setZoomLevel(z => Math.min(5, z + 1))
  const back = () => setOffset(o => o - cfg.M * 7 / 8)
  const next = () => setOffset(o => o + cfg.M * 7 / 8)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0">
        <button onClick={() => { setOffset(0); refresh() }} className="p-1.5 rounded hover:bg-gray-700" title="Refresh">
          <RefreshCw size={16} />
        </button>
        <div className="w-px h-5 bg-gray-600 mx-1" />
        <button onClick={back} disabled={!enableBack} className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30" title="Back">
          <ChevronLeft size={16} />
        </button>
        <button onClick={next} disabled={!enableNext} className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30" title="Forward">
          <ChevronRight size={16} />
        </button>
        <div className="w-px h-5 bg-gray-600 mx-1" />
        <button onClick={zoomIn} disabled={zoomLevel <= 1} className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30" title="Zoom in">
          <ZoomIn size={16} />
        </button>
        <span className="text-xs text-gray-400 w-4 text-center">{zoomLevel}</span>
        <button onClick={zoomOut} disabled={zoomLevel >= 5} className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30" title="Zoom out">
          <ZoomOut size={16} />
        </button>
      </div>

      {/* Guide grid */}
      <div className="flex-1 overflow-auto scrollbar-thin">
        <div className="min-w-full" style={{ position: 'relative' }}>
          {/* Now indicator */}
          {showNow && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none"
              style={{ left: `${nowPct}%` }}
            />
          )}

          {/* Time header */}
          <div className="flex sticky top-0 z-20 bg-gray-800 border-b border-gray-700">
            <div style={{ width: `${CHANNEL_COL_PCT}%` }} className="shrink-0 px-2 py-1.5 text-xs text-gray-400 border-r border-gray-700" />
            <div className="flex flex-1">
              {times.map((slot, i) => (
                <div
                  key={i}
                  style={{ width: `${slot.duration * minutePct}%` }}
                  className="shrink-0 overflow-hidden px-1 py-1.5 text-xs text-gray-300 border-r border-gray-700"
                >
                  {slot.label}
                </div>
              ))}
            </div>
          </div>

          {/* Channel rows */}
          {channelNumbers.map(num => {
            const ch = channels[num]
            if (!ch) return null
            return (
              <div key={num} className="flex border-b border-gray-700 hover:bg-gray-800/50">
                {/* Channel label */}
                <div
                  style={{ width: `${CHANNEL_COL_PCT}%` }}
                  className="shrink-0 flex items-center gap-2 px-2 py-1 border-r border-gray-700 bg-gray-850"
                >
                  {ch.icon && (
                    <img src={ch.icon} alt="" className="w-6 h-6 rounded object-contain shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  )}
                  {ch.loading
                    ? <div className="h-3 bg-gray-700 rounded animate-pulse w-16" />
                    : (
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-gray-200 truncate" title={ch.altTitle}>{ch.number}</div>
                        <div className="text-xs text-gray-400 truncate">{ch.name}</div>
                      </div>
                    )
                  }
                </div>

                {/* Programs */}
                <div className="flex flex-1 min-h-[48px]">
                  {ch.loading
                    ? <div className="flex-1 animate-pulse bg-gray-700/30" />
                    : ch.programs.map((prog, pi) => (
                      <div
                        key={pi}
                        style={{ width: `${prog.duration * minutePct}%` }}
                        className={`guide-program ${prog.showTitle ? 'bg-blue-900/40 hover:bg-blue-800/50' : 'bg-gray-800/20'} ${!prog.start ? 'border-l-2 border-l-gray-500' : ''} ${!prog.end ? 'border-r-2 border-r-gray-500' : ''}`}
                        title={prog.altTitle ?? prog.showTitle}
                      >
                        {prog.showTitle && (
                          <div className="leading-tight py-0.5">
                            <div className="text-xs font-medium text-gray-100 truncate">{prog.showTitle}</div>
                            {prog.subTitle && <div className="text-xs text-gray-400 truncate">{prog.subTitle}</div>}
                          </div>
                        )}
                      </div>
                    ))
                  }
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
