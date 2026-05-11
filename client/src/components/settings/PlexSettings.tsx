import { useEffect, useState } from 'react'
import { Plus, Trash2, CheckCircle, XCircle, Save, RotateCcw, LogIn } from 'lucide-react'
import { dizquetv } from '../../api/dizquetv'
import { plexApi } from '../../api/plex'
import { useToast } from '../Toast'
import type { PlexServer, PlexSettings } from '../../types'
import { RESOLUTION_OPTIONS } from '../../types'

interface ServerStatus { [name: string]: number | null }

function ServerForm({ initial, onSave, onCancel }: {
  initial?: PlexServer
  onSave: (s: PlexServer) => void
  onCancel: () => void
}) {
  const { addToast } = useToast()
  const [form, setForm] = useState<PlexServer>(
    initial ?? { name: '', uri: '', accessToken: '', arGuide: false, arChannels: false }
  )
  const [checking, setChecking] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)

  const update = (p: Partial<PlexServer>) => setForm(f => ({ ...f, ...p }))

  const check = async () => {
    setChecking(true)
    try {
      const r = initial
        ? await dizquetv.checkExistingPlexServer(form.name)
        : await dizquetv.checkNewPlexServer(form)
      addToast(r.status === 1 ? 'Connection successful' : 'Connection failed', r.status === 1 ? 'success' : 'error')
    } catch { addToast('Check failed', 'error') }
    setChecking(false)
  }

  const login = async () => {
    setLoginLoading(true)
    try {
      const res = await plexApi.login()
      if (res.servers.length > 0) {
        const srv = res.servers[0]
        const conn = srv.connections.find(c => !c.local) ?? srv.connections[0]
        update({ uri: conn?.uri ?? '', accessToken: res.authToken })
        addToast('Plex login successful', 'success')
      }
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Plex login failed', 'error')
    }
    setLoginLoading(false)
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Name</label>
          <input value={form.name} onChange={e => update({ name: e.target.value })} disabled={!!initial} className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm disabled:opacity-60" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">URI</label>
          <input value={form.uri} onChange={e => update({ uri: e.target.value })} placeholder="http://192.168.1.x:32400" className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">Access Token</label>
        <div className="flex gap-2">
          <input value={form.accessToken} onChange={e => update({ accessToken: e.target.value })} type="password" className="flex-1 bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm" />
          <button onClick={login} disabled={loginLoading} className="px-3 py-2 bg-yellow-600 hover:bg-yellow-500 rounded text-sm flex items-center gap-1 disabled:opacity-50">
            <LogIn size={14} /> {loginLoading ? '…' : 'Login'}
          </button>
        </div>
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input type="checkbox" checked={form.arGuide} onChange={e => update({ arGuide: e.target.checked })} className="rounded" />
          Auto-refresh guide
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input type="checkbox" checked={form.arChannels} onChange={e => update({ arChannels: e.target.checked })} className="rounded" />
          Auto-refresh channels
        </label>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={() => onSave(form)} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium">Save</button>
        <button onClick={check} disabled={checking} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-sm font-medium disabled:opacity-50">
          {checking ? 'Checking…' : 'Test'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-sm font-medium">Cancel</button>
      </div>
    </div>
  )
}

export default function PlexSettings() {
  const { addToast } = useToast()
  const [servers, setServers] = useState<PlexServer[]>([])
  const [statuses, setStatuses] = useState<ServerStatus>({})
  const [settings, setSettings] = useState<PlexSettings | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [editingServer, setEditingServer] = useState<PlexServer | null>(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const [srvs, cfg] = await Promise.all([dizquetv.getPlexServers(), dizquetv.getPlexSettings()])
    setServers(srvs)
    setSettings(cfg)
  }

  useEffect(() => { load().catch(console.error) }, [])

  const checkStatus = async (server: PlexServer) => {
    setStatuses(s => ({ ...s, [server.name]: null }))
    const status = await plexApi.check(server)
    setStatuses(s => ({ ...s, [server.name]: status }))
  }

  const addServer = async (s: PlexServer) => {
    try {
      await dizquetv.addPlexServer(s)
      setShowAdd(false)
      await load()
      addToast('Plex server added', 'success')
    } catch { addToast('Failed to add server', 'error') }
  }

  const updateServer = async (s: PlexServer) => {
    try {
      await dizquetv.updatePlexServer(s)
      setEditingServer(null)
      await load()
      addToast('Plex server updated', 'success')
    } catch { addToast('Failed to update server', 'error') }
  }

  const removeServer = async (name: string) => {
    if (!confirm(`Remove server "${name}"?`)) return
    try {
      await dizquetv.removePlexServer(name)
      await load()
      addToast('Server removed', 'info')
    } catch { addToast('Failed to remove server', 'error') }
  }

  const saveSettings = async () => {
    if (!settings) return
    setSaving(true)
    try {
      await dizquetv.updatePlexSettings(settings)
      addToast('Plex settings saved', 'success')
    } catch { addToast('Failed to save', 'error') }
    setSaving(false)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Plex Servers</h3>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium">
            <Plus size={14} /> Add Server
          </button>
        </div>
        {showAdd && <div className="mb-3"><ServerForm onSave={addServer} onCancel={() => setShowAdd(false)} /></div>}
        {servers.length === 0 && !showAdd && <p className="text-gray-500 text-sm">No Plex servers configured</p>}
        <div className="space-y-2">
          {servers.map(srv => (
            editingServer?.name === srv.name
              ? <ServerForm key={srv.name} initial={editingServer} onSave={updateServer} onCancel={() => setEditingServer(null)} />
              : (
                <div key={srv.name} className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{srv.name}</div>
                    <div className="text-xs text-gray-400 truncate">{srv.uri}</div>
                  </div>
                  <button onClick={() => checkStatus(srv)} className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded">
                    {statuses[srv.name] === null ? '…' : statuses[srv.name] === 1
                      ? <CheckCircle size={14} className="text-green-400" />
                      : statuses[srv.name] === -1
                        ? <XCircle size={14} className="text-red-400" />
                        : 'Test'}
                  </button>
                  <button onClick={() => setEditingServer(srv)} className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded">Edit</button>
                  <button onClick={() => removeServer(srv.name)} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-gray-700 rounded">
                    <Trash2 size={14} />
                  </button>
                </div>
              )
          ))}
        </div>
      </div>

      {settings && (
        <div className="space-y-4 border-t border-gray-700 pt-6">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Playback Settings</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Stream Protocol</label>
              <select value={settings.streamProtocol ?? 'http'} onChange={e => setSettings(s => s ? { ...s, streamProtocol: e.target.value } : s)} className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm">
                <option value="http">HTTP</option>
                <option value="https">HTTPS</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Max Direct Stream Resolution</label>
              <select value={settings.maxDirectStreamResolution ?? ''} onChange={e => setSettings(s => s ? { ...s, maxDirectStreamResolution: e.target.value } : s)} className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm">
                {RESOLUTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Direct Stream Bitrate (kbps)</label>
              <input type="number" value={settings.directStreamBitrate ?? ''} onChange={e => setSettings(s => s ? { ...s, directStreamBitrate: Number(e.target.value) } : s)} className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Transcode Bitrate (kbps)</label>
              <input type="number" value={settings.transcodeBitrate ?? ''} onChange={e => setSettings(s => s ? { ...s, transcodeBitrate: Number(e.target.value) } : s)} className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2">
            {([
              ['Force Direct Play', 'forceDirectPlay'],
              ['Enable Subtitles', 'enableSubtitles'],
              ['Update Play Status', 'updatePlayStatus'],
              ['Debug Logging', 'debugLogging'],
            ] as [string, keyof PlexSettings][]).map(([label, key]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={Boolean(settings[key])} onChange={e => setSettings(s => s ? { ...s, [key]: e.target.checked } : s)} className="rounded" />
                {label}
              </label>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={saveSettings} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded font-medium text-sm disabled:opacity-50">
              <Save size={16} /> {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => dizquetv.resetPlexSettings().then(setSettings)} className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded font-medium text-sm">
              <RotateCcw size={16} /> Reset
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
