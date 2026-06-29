export interface Program {
  duration: number
  title?: string
  key?: string
  ratingKey?: string
  serverKey?: string
  icon?: string
  showIcon?: string
  episodeIcon?: string
  seasonIcon?: string
  type?: string
  file?: string
  plexFile?: string
  showTitle?: string
  episode?: number
  season?: number
  date?: string
  year?: number
  summary?: string
  rating?: string
  isOffline?: boolean
  isRedirect?: boolean
  channel?: number
  flex?: boolean
}

export interface Watermark {
  enabled: boolean
  position: string
  width: number
  verticalMargin: number
  horizontalMargin: number
  duration: number
  fixedSize: boolean
  animated: boolean
  url?: string
}

export interface FillerCollection {
  id: string
  weight: number
  cooldown: number
}

export interface TranscodingSettings {
  targetResolution?: string
  videoBitrate?: number
  videoBufSize?: number
}

export interface OnDemandSettings {
  isOnDemand: boolean
  modulo: number
}

export interface Channel {
  number: number
  name: string
  icon: string
  startTime: string
  programs: Program[]
  watermark?: Watermark
  fillerCollections?: FillerCollection[]
  fallback?: Program[]
  guideFlexPlaceholder?: string
  fillerRepeatCooldown?: number
  guideMinimumDurationSeconds?: number
  offlineMode?: string
  offlinePicture?: string
  offlineSoundtrack?: string
  groupTitle?: string
  padBoundary?: number
  transcoding?: TranscodingSettings
  onDemand?: OnDemandSettings
  disableFillerOverlay?: boolean
  iconWidth?: number
  iconDuration?: number
  iconPosition?: string
  duration?: number
}

export interface ChannelDescription {
  number: number
  name: string
  icon: string
}

export interface Filler {
  id: string
  name: string
  content: Program[]
}

export interface FillerInfo {
  id: string
  name: string
  count: number
}

export interface CustomShow {
  id: string
  name: string
  content: Program[]
}

export interface CustomShowInfo {
  id: string
  name: string
  count: number
}

export interface FfmpegSettings {
  ffmpegPath: string
  maxFPS: number
  concatMinSegmentDuration?: number
  minFPS?: number
  normalizeVideoCodec?: boolean
  normalizeAudioCodec?: boolean
  normalizeResolution?: boolean
  normalizeAudio?: boolean
  targetResolution?: string
  videoBitrate?: number
  videoBufferSize?: number
  audioBitrate?: number
  audioBufferSize?: number
  audioSampleRate?: number
  audioChannels?: number
  videoEncoder?: string
  audioEncoder?: string
  errorScreen?: string
  errorAudio?: string
  deinterlaceFilter?: string
  lock?: boolean
  _id?: string
}

export interface PlexServer {
  name: string
  uri: string
  accessToken: string
  arGuide?: boolean
  arChannels?: boolean
}

export interface PlexSettings {
  streamPath?: string
  debugLogging?: boolean
  directStreamBitrate?: number
  transcodeBitrate?: number
  mediaBufferSize?: number
  transcodeMediaBufferSize?: number
  maxPlayableResolution?: string
  maxDirectStreamResolution?: string
  videoCodecs?: string
  audioCodecs?: string
  maxAudioChannels?: string
  audioBoost?: number
  enableSubtitles?: boolean
  subtitleSize?: number
  updatePlayStatus?: boolean
  streamProtocol?: string
  forceDirectPlay?: boolean
  _id?: string
}

export interface XmltvSettings {
  cache: number
  refresh: number
  file: string
  _id?: string
}

export interface HdhrSettings {
  tunerCount: number
  autoDiscovery: boolean
  _id?: string
}

export interface GuideStatus {
  lastUpdate: string
  channelNumbers: number[]
}

export interface LineupItem {
  start: string
  stop: string
  title?: string
  sub?: {
    season: number
    episode: number
    title?: string
  }
  date?: string
}

export interface ChannelLineup {
  number: number
  name: string
  icon: string
  programs: LineupItem[]
}

export interface PlexLibrarySection {
  title: string
  key: string
  icon: string
  type: string
  genres?: PlexGenre[]
}

export interface PlexGenre {
  title: string
  key: string
  type: string
}

export interface PlexPlaylist {
  title: string
  key: string
  icon: string
  duration: number
}

export interface PlexResource {
  name: string
  provides: string
  connections: Array<{ uri: string; local: boolean }>
  accessToken: string
}

export interface VersionInfo {
  coax: string
  ffmpeg: string
  nodejs: string
}

export interface Toast {
  id: string
  message: string
  type: 'info' | 'success' | 'error' | 'warning'
}

export type Tab = 'xmltv' | 'ffmpeg' | 'plex' | 'hdhr'

export const RESOLUTION_OPTIONS = [
  { value: '', label: 'Same as source' },
  { value: '320x240', label: '320x240 (SD 4:3 low)' },
  { value: '640x480', label: '640x480 (SD 4:3)' },
  { value: '704x480', label: '704x480 (NTSC 4:3)' },
  { value: '720x480', label: '720x480 (DVD 4:3)' },
  { value: '768x576', label: '768x576 (PAL 4:3)' },
  { value: '480x270', label: '480x270 (SD 16:9)' },
  { value: '640x360', label: '640x360 (SD 16:9)' },
  { value: '854x480', label: '854x480 (WVGA 16:9)' },
  { value: '1280x720', label: '1280x720 (HD 16:9)' },
  { value: '1920x1080', label: '1920x1080 (FHD 16:9)' },
]
