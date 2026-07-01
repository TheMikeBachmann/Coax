import { useEffect, useRef, useState } from 'react'
import { Copy, Play, Square } from 'lucide-react'
import mpegts from 'mpegts.js'
import { coax } from '../api/coax'
import type { ChannelDescription } from '../types'

const RECONNECT_DELAY_MS = 2000
const GUIDE_VALUE = '__guide__'

function streamUrlFor(selected: string): string {
  if (!selected) return ''
  const base = `${window.location.protocol}//${window.location.hostname}:8000`
  if (selected === GUIDE_VALUE) {
    const tz = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)
    return `${base}/guide-channel?tz=${tz}`
  }
  return `${base}/video?channel=${selected}`
}

export default function Player() {
  const [channels, setChannels] = useState<ChannelDescription[]>([])
  const [selected, setSelected] = useState<string>('')
  const [playing, setPlaying] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const playerRef = useRef<mpegts.Player | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldPlayRef = useRef(false)
  const selectedRef = useRef<string>(selected)
  selectedRef.current = selected

  useEffect(() => {
    coax.getChannels().then(chs => {
      const descs = chs.map(ch => ({ number: ch.number, name: ch.name, icon: ch.icon }))
      setChannels(descs)
      setSelected(GUIDE_VALUE)
    }).catch(console.error)
  }, [])

  const destroyPlayer = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (playerRef.current) {
      playerRef.current.destroy()
      playerRef.current = null
    }
  }

  const stop = () => {
    shouldPlayRef.current = false
    destroyPlayer()
    setPlaying(false)
    setError(null)
  }

  const startPlayer = (sel: string) => {
    if (!videoRef.current) return
    destroyPlayer()

    const url = streamUrlFor(sel)
    console.log('[Player] Connecting to', url)

    const isGuide = sel === GUIDE_VALUE
    const player = mpegts.createPlayer({
      type: 'mpegts',
      url,
      isLive: true,
    }, {
      enableWorker: true,
      liveBufferLatencyChasing: !isGuide,
      liveBufferLatencyMaxLatency: isGuide ? 8 : 3,
      liveBufferLatencyMinRemain: 0.5,
      autoCleanupSourceBuffer: true,
      autoCleanupMinBackwardDuration: 30,
      autoCleanupMaxBackwardDuration: 60,
    })

    player.on(mpegts.Events.ERROR, (type, detail) => {
      console.warn('[mpegts] error, reconnecting in', RECONNECT_DELAY_MS, 'ms', type, detail)
      destroyPlayer()
      if (shouldPlayRef.current && selectedRef.current) {
        reconnectTimerRef.current = setTimeout(() => {
          if (shouldPlayRef.current && selectedRef.current) {
            startPlayer(selectedRef.current)
          }
        }, RECONNECT_DELAY_MS)
      }
    })

    player.attachMediaElement(videoRef.current)
    player.load()
    player.play()
    playerRef.current = player
  }

  const play = () => {
    if (!videoRef.current || !selected) return
    stop()

    if (!mpegts.isSupported()) {
      setError('mpegts.js is not supported in this browser')
      return
    }

    shouldPlayRef.current = true
    setPlaying(true)
    setError(null)
    startPlayer(selected)
  }

  useEffect(() => () => stop(), [])

  const streamUrl = streamUrlFor(selected)

  const copy = () => {
    if (!streamUrl) return
    navigator.clipboard.writeText(streamUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Player</h1>

      <div className="space-y-4 mb-6">
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-400 mb-1">Channel</label>
            <select
              value={selected}
              onChange={e => { stop(); setSelected(e.target.value) }}
              className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2"
            >
              <option value={GUIDE_VALUE}>📺 Guide Channel</option>
              {channels.map(ch => (
                <option key={ch.number} value={String(ch.number)}>
                  {ch.number} — {ch.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={playing ? stop : play}
            disabled={!selected}
            className={`flex items-center gap-2 px-5 py-2 rounded font-medium text-sm disabled:opacity-40 ${playing ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'}`}
          >
            {playing ? <><Square size={15} /> Stop</> : <><Play size={15} /> Play</>}
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Stream URL (for VLC / external player)</label>
          <div className="flex gap-2">
            <input readOnly value={streamUrl}
              className="flex-1 bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm font-mono" />
            <button onClick={copy} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded border border-gray-600" title="Copy">
              <Copy size={16} className={copied ? 'text-green-400' : 'text-gray-300'} />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm font-mono break-all">
          {error}
        </div>
      )}

      <div className="bg-black rounded-lg overflow-hidden relative"
           style={{ aspectRatio: selected === GUIDE_VALUE ? '704/480' : '16/9' }}>
        <video
          ref={videoRef}
          controls
          className="w-full h-full"
          style={{ display: playing ? 'block' : 'none' }}
        />
        {!playing && (
          <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">
            Select a channel and press Play
          </div>
        )}
      </div>
    </div>
  )
}
