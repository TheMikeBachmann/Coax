import type {
  Channel, ChannelDescription, ChannelLineup, CustomShow, CustomShowInfo,
  Filler, FillerInfo, FfmpegSettings, GuideStatus, HdhrSettings,
  PlexServer, PlexSettings, VersionInfo, XmltvSettings,
} from '../types'

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

async function apiVoid(path: string, opts?: RequestInit): Promise<void> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
}

function json(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) }
}

export const coax = {
  getVersion: () => api<VersionInfo>('/api/version'),

  // Plex servers
  getPlexServers: () => api<PlexServer[]>('/api/plex-servers'),
  addPlexServer: (s: PlexServer) => apiVoid('/api/plex-servers', json('PUT', s)),
  updatePlexServer: (s: PlexServer) => apiVoid('/api/plex-servers', json('POST', s)),
  checkExistingPlexServer: (name: string) =>
    api<{ status: number }>('/api/plex-servers/status', json('POST', { name })),
  checkNewPlexServer: (server: PlexServer) =>
    api<{ status: number }>('/api/plex-servers/foreignstatus', json('POST', server)),
  removePlexServer: (name: string) => apiVoid('/api/plex-servers', json('DELETE', { name })),

  // Settings
  getPlexSettings: () => api<PlexSettings>('/api/plex-settings'),
  updatePlexSettings: (c: PlexSettings) => api<PlexSettings>('/api/plex-settings', json('PUT', c)),
  resetPlexSettings: () => api<PlexSettings>('/api/plex-settings', { method: 'POST' }),

  getFfmpegSettings: () => api<FfmpegSettings>('/api/ffmpeg-settings'),
  updateFfmpegSettings: (c: FfmpegSettings) => api<FfmpegSettings>('/api/ffmpeg-settings', json('PUT', c)),
  resetFfmpegSettings: () => api<FfmpegSettings>('/api/ffmpeg-settings', { method: 'POST' }),

  getXmltvSettings: () => api<XmltvSettings>('/api/xmltv-settings'),
  updateXmltvSettings: (c: XmltvSettings) => api<XmltvSettings>('/api/xmltv-settings', json('PUT', c)),
  resetXmltvSettings: () => api<XmltvSettings>('/api/xmltv-settings', { method: 'POST' }),

  getHdhrSettings: () => api<HdhrSettings>('/api/hdhr-settings'),
  updateHdhrSettings: (c: HdhrSettings) => api<HdhrSettings>('/api/hdhr-settings', json('PUT', c)),
  resetHdhrSettings: () => api<HdhrSettings>('/api/hdhr-settings', { method: 'POST' }),

  // Channels
  getChannels: () => api<Channel[]>('/api/channels'),
  getChannel: (n: number) => api<Channel>(`/api/channel/${n}`),
  getChannelDescription: (n: number) => api<ChannelDescription>(`/api/channel/description/${n}`),
  getChannelProgramless: (n: number) => api<Channel>(`/api/channel/programless/${n}`),
  getChannelPrograms: (n: number) => api<Channel>(`/api/channel/programs/${n}`),
  getChannelNumbers: () => api<number[]>('/api/channelNumbers'),
  addChannel: (ch: Channel) => api<Channel>('/api/channel', json('POST', ch)),
  updateChannel: (ch: Channel) => api<Channel>('/api/channel', json('PUT', ch)),
  removeChannel: (ch: { number: number }) => apiVoid('/api/channel', json('DELETE', ch)),
  uploadImage: (form: FormData): Promise<{ status: boolean; data?: { fileUrl: string } }> =>
    fetch('/api/upload/image', { method: 'POST', body: form }).then(r => r.json()),
  addChannelWatermark: (form: FormData) =>
    fetch('/api/channel/watermark', { method: 'POST', body: form }).then(r => r.json()),

  // Filler
  getAllFillersInfo: () => api<FillerInfo[]>('/api/fillers'),
  getFiller: (id: string) => api<Filler>(`/api/filler/${id}`),
  updateFiller: (id: string, f: Filler) => apiVoid(`/api/filler/${id}`, json('POST', f)),
  createFiller: (f: Partial<Filler>) => api<Filler>('/api/filler', json('PUT', f)),
  deleteFiller: (id: string) => apiVoid(`/api/filler/${id}`, json('DELETE', {})),
  getChannelsUsingFiller: (id: string) => api<ChannelDescription[]>(`/api/filler/${id}/channels`),

  // Custom shows
  getAllShowsInfo: () => api<CustomShowInfo[]>('/api/shows'),
  getShow: (id: string) => api<CustomShow>(`/api/show/${id}`),
  updateShow: (id: string, s: CustomShow) => apiVoid(`/api/show/${id}`, json('POST', s)),
  createShow: (s: Partial<CustomShow>) => api<CustomShow>('/api/show', json('PUT', s)),
  deleteShow: (id: string) => apiVoid(`/api/show/${id}`, json('DELETE', {})),

  // Guide
  getGuideStatus: () => api<GuideStatus>('/api/guide/status'),
  getChannelLineup: (number: number, from: Date, to: Date) =>
    api<ChannelLineup>(
      `/api/guide/channels/${number}?dateFrom=${from.toISOString()}&dateTo=${to.toISOString()}`
    ),

  // Channel tools
  calculateTimeSlots: (programs: unknown[], schedule: unknown) =>
    api<unknown[]>('/api/channel-tools/time-slots', json('POST', { programs, schedule })),
  calculateRandomSlots: (programs: unknown[], schedule: unknown) =>
    api<unknown[]>('/api/channel-tools/random-slots', json('POST', { programs, schedule })),
}
