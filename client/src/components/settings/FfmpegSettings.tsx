import { useEffect, useState } from 'react'
import { Lock, Unlock, RotateCcw, Save } from 'lucide-react'
import { dizquetv } from '../../api/dizquetv'
import { useToast } from '../Toast'
import type { FfmpegSettings } from '../../types'
import { RESOLUTION_OPTIONS } from '../../types'

const ERROR_SCREEN_OPTIONS = ['kill', 'pic', 'static', 'testsrc', 'text']
const ERROR_AUDIO_OPTIONS = ['silent', 'whitenoise', 'sine']
const DEINTERLACE_OPTIONS = ['none', '', 'yadif=mode=0', 'yadif=mode=1', 'bwdif=mode=0', 'bwdif=mode=1']

const VIDEO_ENCODER_OPTIONS = [
  { value: 'libx264',        label: 'H.264 — libx264 (browser compatible)' },
  { value: 'libx265',        label: 'H.265 — libx265' },
  { value: 'mpeg2video',     label: 'MPEG-2 — mpeg2video (HDHR default)' },
  { value: 'h264_videotoolbox', label: 'H.264 — VideoToolbox (macOS HW)' },
  { value: 'hevc_videotoolbox', label: 'H.265 — VideoToolbox (macOS HW)' },
  { value: 'h264_nvenc',     label: 'H.264 — NVENC (NVIDIA HW)' },
  { value: 'hevc_nvenc',     label: 'H.265 — NVENC (NVIDIA HW)' },
]

const AUDIO_ENCODER_OPTIONS = [
  { value: 'aac',   label: 'AAC — aac (browser compatible)' },
  { value: 'ac3',   label: 'AC3 — ac3 (HDHR default)' },
  { value: 'mp2',   label: 'MP2 — mp2' },
  { value: 'libmp3lame', label: 'MP3 — libmp3lame' },
  { value: 'copy',  label: 'Copy (no re-encode)' },
]

export default function FfmpegSettings() {
  const { addToast } = useToast()
  const [settings, setSettings] = useState<FfmpegSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [unlocking, setUnlocking] = useState(false)

  const load = () => dizquetv.getFfmpegSettings().then(setSettings).catch(() => addToast('Failed to load FFmpeg settings', 'error'))

  useEffect(() => { load() }, [])

  if (!settings) return <div className="text-gray-400">Loading…</div>

  const update = (patch: Partial<FfmpegSettings>) => setSettings(s => s ? { ...s, ...patch } : s)

  const save = async () => {
    setSaving(true)
    try {
      const res = await dizquetv.updateFfmpegSettings(settings)
      setSettings(res)
      addToast('FFmpeg settings saved', 'success')
    } catch { addToast('Failed to save', 'error') }
    setSaving(false)
  }

  const reset = async () => {
    try {
      const res = await dizquetv.resetFfmpegSettings()
      setSettings(res)
      addToast('FFmpeg settings reset', 'info')
    } catch { addToast('Failed to reset', 'error') }
  }

  const unlock = async () => {
    setUnlocking(true)
    try {
      await fetch('/api/ffmpeg-settings/unlock', { method: 'POST' })
      await load()
      addToast('FFmpeg path unlocked for 24 hours', 'info')
    } catch { addToast('Failed to unlock', 'error') }
    setUnlocking(false)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">FFmpeg Path</label>
        <div className="flex gap-2">
          <input
            value={settings.ffmpegPath}
            onChange={e => update({ ffmpegPath: e.target.value })}
            disabled={settings.lock}
            className="flex-1 bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm font-mono disabled:opacity-50"
          />
          <button
            onClick={unlock}
            disabled={unlocking || !settings.lock}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded flex items-center gap-1 text-sm disabled:opacity-50"
            title={settings.lock ? 'Unlock path' : 'Path is unlocked'}
          >
            {settings.lock ? <Lock size={16} /> : <Unlock size={16} />}
          </button>
        </div>
        {settings.lock && <p className="text-xs text-yellow-400 mt-1">Path is locked for security. Click the lock to unlock for 24h.</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {([
          ['Max FPS', 'maxFPS'],
          ['Min FPS', 'minFPS'],
          ['Video Bitrate (kbps)', 'videoBitrate'],
          ['Video Buffer Size (kbps)', 'videoBufferSize'],
          ['Audio Bitrate (kbps)', 'audioBitrate'],
          ['Audio Buffer (kbps)', 'audioBufferSize'],
          ['Audio Sample Rate (Hz)', 'audioSampleRate'],
          ['Audio Channels', 'audioChannels'],
        ] as [string, keyof FfmpegSettings][]).map(([label, key]) => (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-400 mb-1">{label}</label>
            <input
              type="number"
              value={(settings[key] as number) ?? ''}
              onChange={e => update({ [key]: e.target.value === '' ? undefined : Number(e.target.value) })}
              className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm"
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Video Encoder</label>
          <select
            value={settings.videoEncoder ?? 'mpeg2video'}
            onChange={e => update({ videoEncoder: e.target.value })}
            className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm"
          >
            {VIDEO_ENCODER_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Audio Encoder</label>
          <select
            value={settings.audioEncoder ?? 'ac3'}
            onChange={e => update({ audioEncoder: e.target.value })}
            className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm"
          >
            {AUDIO_ENCODER_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Target Resolution</label>
          <select value={settings.targetResolution ?? ''} onChange={e => update({ targetResolution: e.target.value })} className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm">
            {RESOLUTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Error Screen</label>
          <select value={settings.errorScreen ?? 'kill'} onChange={e => update({ errorScreen: e.target.value })} className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm">
            {ERROR_SCREEN_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Error Audio</label>
          <select value={settings.errorAudio ?? 'silent'} onChange={e => update({ errorAudio: e.target.value })} className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm">
            {ERROR_AUDIO_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Deinterlace Filter</label>
          <select value={settings.deinterlaceFilter ?? ''} onChange={e => update({ deinterlaceFilter: e.target.value })} className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm">
            {DEINTERLACE_OPTIONS.map(o => <option key={o} value={o}>{o || 'None'}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-2">
        {([
          ['Normalize Video Codec', 'normalizeVideoCodec'],
          ['Normalize Audio Codec', 'normalizeAudioCodec'],
          ['Normalize Resolution', 'normalizeResolution'],
          ['Normalize Audio', 'normalizeAudio'],
        ] as [string, keyof FfmpegSettings][]).map(([label, key]) => (
          <label key={key} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(settings[key])}
              onChange={e => update({ [key]: e.target.checked })}
              className="rounded"
            />
            {label}
          </label>
        ))}
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
