import { useEffect, useState, useCallback } from 'react'
import { X, Search, Plus, ChevronRight, ArrowLeft, Loader2, ChevronsRight, Trash2 } from 'lucide-react'
import { coax } from '../../api/coax'
import { plexApi } from '../../api/plex'
import type { PlexMeta } from '../../api/plex'
import { useToast } from '../Toast'
import type { PlexServer, PlexLibrarySection, Program, CustomShowInfo } from '../../types'

interface Props {
  programs?: Program[]
  onAdd: (programs: Program[]) => void
  onRemoveWhere?: (pred: (p: Program) => boolean) => void
  onClear?: () => void
  onClose: () => void
}

type ManageView =
  | { type: 'top' }
  | { type: 'show'; showTitle: string }
  | { type: 'season'; showTitle: string; season: number }

function programLabel(p: Program) {
  if (p.isOffline) return p.flex ? 'Flex' : 'Offline'
  if (p.isRedirect) return `→ Ch ${p.channel}`
  if (p.type === 'episode') return `${p.showTitle} S${p.season}E${p.episode} – ${p.title}`
  if (p.type === 'track') return `♪ ${p.showTitle} – ${p.title}`
  return p.title ?? 'Unknown'
}

function msToHMS(ms: number) {
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`
}

function epKey(p: Program) {
  return p.ratingKey ?? `${p.file ?? ''}.${p.season ?? 0}.${p.episode ?? 0}`
}

type Source = { type: 'plex'; server: PlexServer } | { type: 'show'; id: string; name: string }

interface NavLevel {
  title: string
  url: string          // relative URL to fetch items from
  ratingKey?: string   // for allLeaves expansion
  sectionType?: string // 'show' | 'movie' | 'artist'
}

const DRILLABLE = new Set(['show', 'season', 'artist', 'album', 'collection'])
const LEAF_TYPES = new Set(['episode', 'movie', 'track'])

function msToTime(ms: number) {
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

function itemSubtitle(meta: PlexMeta, sectionType?: string) {
  if (meta.type === 'show') {
    const parts = []
    if (meta.year) parts.push(String(meta.year))
    if (meta.leafCount) parts.push(`${meta.leafCount} episode${meta.leafCount !== 1 ? 's' : ''}`)
    return parts.join(' · ')
  }
  if (meta.type === 'season') return meta.parentTitle ?? ''
  if (meta.type === 'episode') return `${meta.grandparentTitle} · S${meta.parentIndex} E${meta.index}`
  if (meta.type === 'artist') return `${meta.childCount ?? ''} album${meta.childCount !== 1 ? 's' : ''}`
  if (meta.type === 'album') return meta.parentTitle ?? ''
  if (meta.type === 'track') return meta.parentTitle ?? ''
  if (meta.type === 'movie') return meta.year ? String(meta.year) : ''
  return sectionType ?? ''
}

function itemIcon(server: PlexServer, meta: PlexMeta): string | undefined {
  const thumb = meta.type === 'episode'
    ? (meta.grandparentThumb ?? meta.thumb)
    : meta.thumb
  return thumb ? `${server.uri}${thumb}?X-Plex-Token=${server.accessToken}` : undefined
}

export default function PlexLibrary({ programs = [], onAdd, onRemoveWhere, onClear, onClose }: Props) {
  const { addToast } = useToast()
  const [tab, setTab] = useState<'browse' | 'manage'>('browse')
  const [manageView, setManageView] = useState<ManageView>({ type: 'top' })
  const [servers, setServers] = useState<PlexServer[]>([])
  const [shows, setShows] = useState<CustomShowInfo[]>([])
  const [source, setSource] = useState<Source | null>(null)
  const [libraries, setLibraries] = useState<PlexLibrarySection[]>([])
  const [selectedLib, setSelectedLib] = useState<PlexLibrarySection | null>(null)

  // Navigation
  const [navStack, setNavStack] = useState<NavLevel[]>([])
  const [items, setItems] = useState<PlexMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)

  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<Map<string, PlexMeta>>(new Map())

  useEffect(() => {
    Promise.all([coax.getPlexServers(), coax.getAllShowsInfo()]).then(([srvs, shws]) => {
      setServers(srvs)
      setShows(shws)
      if (srvs.length > 0) setSource({ type: 'plex', server: srvs[0] })
    }).catch(console.error)
  }, [])

  useEffect(() => {
    if (!source) return
    setSelectedLib(null)
    setNavStack([])
    setItems([])
    setSelected(new Map())
    if (source.type === 'plex') {
      setLoading(true)
      plexApi.getLibrary(source.server)
        .then(setLibraries)
        .catch(() => addToast('Failed to load Plex library', 'error'))
        .finally(() => setLoading(false))
    }
  }, [source])

  const fetchLevel = useCallback(async (url: string) => {
    if (!source || source.type !== 'plex') return
    setLoading(true)
    setItems([])
    setSelected(new Map())
    setFilter('')
    try {
      const metas = await plexApi.fetchItems(source.server, url)
      setItems(metas)
    } catch { addToast('Failed to load content', 'error') }
    setLoading(false)
  }, [source])

  const loadLibrary = useCallback(async (lib: PlexLibrarySection) => {
    setSelectedLib(lib)
    const level: NavLevel = { title: lib.title, url: lib.key, sectionType: lib.type }
    setNavStack([level])
    fetchLevel(lib.key)
  }, [fetchLevel])

  const drillInto = useCallback((meta: PlexMeta) => {
    if (!source || source.type !== 'plex') return
    const url = `/library/metadata/${meta.ratingKey}/children`
    const level: NavLevel = {
      title: meta.title,
      url,
      ratingKey: meta.ratingKey,
      sectionType: navStack[0]?.sectionType,
    }
    setNavStack(prev => [...prev, level])
    fetchLevel(url)
  }, [source, navStack, fetchLevel])

  const navigateTo = useCallback((idx: number) => {
    const newStack = navStack.slice(0, idx + 1)
    setNavStack(newStack)
    fetchLevel(newStack[newStack.length - 1].url)
  }, [navStack, fetchLevel])

  const loadShow = useCallback(async (id: string) => {
    setLoading(true)
    try {
      const show = await coax.getShow(id)
      setItems(show.content as unknown as PlexMeta[])
    } catch { addToast('Failed to load custom show', 'error') }
    setLoading(false)
  }, [])

  const toggleSelect = (meta: PlexMeta) => {
    setSelected(prev => {
      const next = new Map(prev)
      if (next.has(meta.ratingKey)) next.delete(meta.ratingKey)
      else next.set(meta.ratingKey, meta)
      return next
    })
  }

  const selectAll = () => {
    const vis = filteredItems
    setSelected(prev => {
      const next = new Map(prev)
      vis.forEach(m => next.set(m.ratingKey, m))
      return next
    })
  }

  const expandToLeaves = async (server: PlexServer, meta: PlexMeta): Promise<PlexMeta[]> => {
    if (LEAF_TYPES.has(meta.type)) return [meta]
    if (meta.type === 'show') {
      const seasons = await plexApi.fetchItems(server, `/library/metadata/${meta.ratingKey}/children`)
      const all: PlexMeta[] = []
      for (const season of seasons) {
        const eps = await plexApi.fetchItems(server, `/library/metadata/${season.ratingKey}/children`)
        all.push(...eps)
      }
      return all
    }
    if (meta.type === 'collection') {
      const children = await plexApi.fetchItems(server, `/library/metadata/${meta.ratingKey}/children`)
      const all: PlexMeta[] = []
      for (const child of children) {
        if (LEAF_TYPES.has(child.type)) {
          all.push(child)
        } else {
          // collection of shows — expand each show's episodes
          const leaves = await expandToLeaves(server, child)
          all.push(...leaves)
        }
      }
      return all
    }
    // season, album, artist
    return plexApi.fetchItems(server, `/library/metadata/${meta.ratingKey}/children`)
  }

  const addSelected = async () => {
    if (!source || source.type !== 'plex') return
    const server = (source as { type: 'plex'; server: PlexServer }).server
    setAdding(true)
    const programs: Program[] = []
    for (const [, meta] of selected) {
      try {
        const leaves = await expandToLeaves(server, meta)
        for (const leaf of leaves) {
          const p = plexApi.metaToProgram(server, leaf)
          if (p) programs.push(p)
        }
      } catch {
        addToast(`Failed to expand ${meta.title}`, 'error')
      }
    }
    setAdding(false)
    if (programs.length === 0) { addToast('No playable items found', 'warning'); return }
    onAdd(programs)
    setSelected(new Map())
    addToast(`Added ${programs.length} item${programs.length !== 1 ? 's' : ''}`, 'success')
  }

  const sectionType = navStack[0]?.sectionType
  const filteredItems = filter
    ? items.filter(m =>
        m.title?.toLowerCase().includes(filter.toLowerCase()) ||
        m.grandparentTitle?.toLowerCase().includes(filter.toLowerCase()) ||
        m.parentTitle?.toLowerCase().includes(filter.toLowerCase())
      )
    : items

  const currentServer = source?.type === 'plex' ? (source as { type: 'plex'; server: PlexServer }).server : null

  const totalDuration = programs.reduce((s, p) => s + p.duration, 0)

  // Grouped data for the manage hierarchy
  const manageShowMap = new Map<string, Program[]>()
  const manageMoviesAll: Program[] = []
  const manageOthers: Program[] = []
  for (const p of programs) {
    if (p.type === 'episode' && p.showTitle) {
      const arr = manageShowMap.get(p.showTitle) ?? []; manageShowMap.set(p.showTitle, arr); arr.push(p)
    } else if (p.type === 'movie') {
      manageMoviesAll.push(p)
    } else {
      manageOthers.push(p)
    }
  }
  const seenMovieKeys = new Set<string>()
  const manageUniqueMovies = manageMoviesAll.filter(m => { const k = epKey(m); if (seenMovieKeys.has(k)) return false; seenMovieKeys.add(k); return true })

  // Season list when drilling into a show
  const manageSeasons: Array<[number, Program[]]> = manageView.type === 'show'
    ? (() => {
        const seasonMap = new Map<number, Program[]>()
        for (const ep of manageShowMap.get(manageView.showTitle) ?? []) {
          const s = ep.season ?? 0; const arr = seasonMap.get(s) ?? []; seasonMap.set(s, arr); arr.push(ep)
        }
        return Array.from(seasonMap.entries()).sort(([a], [b]) => a - b)
      })()
    : []

  // Episode list when drilling into a season
  const manageEpisodes: Program[] = manageView.type === 'season'
    ? (() => {
        const { showTitle, season } = manageView
        const seenEp = new Set<string>()
        return (manageShowMap.get(showTitle) ?? [])
          .filter(p => p.season === season)
          .filter(p => { const k = epKey(p); if (seenEp.has(k)) return false; seenEp.add(k); return true })
          .sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0))
      })()
    : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 w-full max-w-4xl h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold">Content</h2>
            {onRemoveWhere && (
              <div className="flex rounded border border-gray-600 overflow-hidden text-sm">
                <button
                  onClick={() => setTab('browse')}
                  className={`px-3 py-1 ${tab === 'browse' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                >Browse</button>
                <button
                  onClick={() => { setTab('manage'); setManageView({ type: 'top' }) }}
                  className={`px-3 py-1 border-l border-gray-600 ${tab === 'manage' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                >Manage · {programs.length}</button>
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-700 rounded"><X size={18} /></button>
        </div>

        {/* Manage tab — hierarchical show → season → episode browser */}
        {tab === 'manage' && onRemoveWhere && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Navigation bar */}
            <div className="px-4 py-2 border-b border-gray-700 flex items-center gap-2 min-h-[41px]">
              {manageView.type !== 'top' && (
                <button
                  onClick={() => setManageView(
                    manageView.type === 'season'
                      ? { type: 'show', showTitle: manageView.showTitle }
                      : { type: 'top' }
                  )}
                  className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white shrink-0">
                  <ArrowLeft size={14} />
                </button>
              )}
              {manageView.type === 'top' ? (
                <>
                  <span className="text-sm text-gray-400 flex-1">{programs.length} programs · {msToHMS(totalDuration)}</span>
                  {programs.length > 0 && onClear && (
                    <button onClick={onClear} className="text-xs text-red-400 hover:text-red-300 shrink-0">Clear all</button>
                  )}
                </>
              ) : (
                <div className="flex-1 min-w-0 text-sm">
                  {manageView.type === 'season' && (
                    <span className="text-gray-400">{manageView.showTitle} / </span>
                  )}
                  <span className="font-medium text-gray-100">
                    {manageView.type === 'show' ? manageView.showTitle : `Season ${manageView.season}`}
                  </span>
                </div>
              )}
            </div>

            {/* Content list */}
            <div className="flex-1 overflow-y-auto">

              {/* Top level: shows, movies, other */}
              {manageView.type === 'top' && (
                <>
                  {programs.length === 0 && (
                    <div className="flex items-center justify-center h-32 text-gray-500 text-sm">No programs yet</div>
                  )}

                  {manageShowMap.size > 0 && (
                    <>
                      {(manageShowMap.size > 1 || manageUniqueMovies.length > 0 || manageOthers.length > 0) && (
                        <div className="px-4 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-900/30">Shows</div>
                      )}
                      {Array.from(manageShowMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([showTitle, eps]) => {
                        const uniqueCount = new Set(eps.map(epKey)).size
                        return (
                          <div key={showTitle} className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-700/50 hover:bg-gray-700/30 group">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-gray-100 truncate">{showTitle}</div>
                              <div className="text-xs text-gray-500">{uniqueCount} episode{uniqueCount !== 1 ? 's' : ''}</div>
                            </div>
                            <button
                              onClick={() => onRemoveWhere(p => p.showTitle === showTitle && p.type === 'episode')}
                              className="p-1.5 text-red-400 opacity-0 group-hover:opacity-100 hover:text-red-300 shrink-0"
                              title="Remove all episodes">
                              <Trash2 size={14} />
                            </button>
                            <button
                              onClick={() => setManageView({ type: 'show', showTitle })}
                              className="p-1.5 text-gray-400 hover:text-white shrink-0">
                              <ChevronRight size={16} />
                            </button>
                          </div>
                        )
                      })}
                    </>
                  )}

                  {manageUniqueMovies.length > 0 && (
                    <>
                      {(manageShowMap.size > 0 || manageOthers.length > 0) && (
                        <div className="px-4 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-900/30">Movies</div>
                      )}
                      {manageUniqueMovies.map(m => (
                        <div key={epKey(m)} className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-700/50 hover:bg-gray-700/30 group">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-gray-100 truncate">{m.title ?? 'Unknown'}</div>
                            <div className="text-xs text-gray-500">{msToHMS(m.duration)}</div>
                          </div>
                          <button
                            onClick={() => { const k = epKey(m); onRemoveWhere(p => p.type === 'movie' && epKey(p) === k) }}
                            className="p-1.5 text-red-400 opacity-0 group-hover:opacity-100 hover:text-red-300 shrink-0">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </>
                  )}

                  {manageOthers.length > 0 && (
                    <>
                      {(manageShowMap.size > 0 || manageUniqueMovies.length > 0) && (
                        <div className="px-4 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-900/30">Other</div>
                      )}
                      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-700/50 text-sm">
                        <span className="flex-1 text-gray-400">{manageOthers.length} flex / offline block{manageOthers.length !== 1 ? 's' : ''}</span>
                        <button onClick={() => onRemoveWhere(p => !!p.isOffline)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Show level: season list */}
              {manageView.type === 'show' && (
                manageSeasons.length === 0
                  ? <div className="flex items-center justify-center h-32 text-gray-500 text-sm">No seasons found</div>
                  : manageSeasons.map(([season, sEps]) => {
                    const uniqueCount = new Set(sEps.map(epKey)).size
                    const { showTitle } = manageView
                    return (
                      <div key={season} className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-700/50 hover:bg-gray-700/30 group">
                        <div className="flex-1">
                          <div className="text-sm text-gray-100">Season {season}</div>
                          <div className="text-xs text-gray-500">{uniqueCount} episode{uniqueCount !== 1 ? 's' : ''}</div>
                        </div>
                        <button
                          onClick={() => onRemoveWhere(p => p.showTitle === showTitle && p.season === season && p.type === 'episode')}
                          className="p-1.5 text-red-400 opacity-0 group-hover:opacity-100 hover:text-red-300 shrink-0"
                          title="Remove season">
                          <Trash2 size={14} />
                        </button>
                        <button
                          onClick={() => setManageView({ type: 'season', showTitle, season })}
                          className="p-1.5 text-gray-400 hover:text-white shrink-0">
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    )
                  })
              )}

              {/* Season level: episode list */}
              {manageView.type === 'season' && (
                manageEpisodes.length === 0
                  ? <div className="flex items-center justify-center h-32 text-gray-500 text-sm">No episodes found</div>
                  : manageEpisodes.map(ep => {
                    const k = epKey(ep)
                    return (
                      <div key={k} className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-700/50 hover:bg-gray-700/30 group">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-100 truncate">
                            S{ep.season}E{String(ep.episode ?? 0).padStart(2, '0')}{ep.title ? ` – ${ep.title}` : ''}
                          </div>
                          <div className="text-xs text-gray-500">{msToHMS(ep.duration)}</div>
                        </div>
                        <button
                          onClick={() => onRemoveWhere(p => p.type === 'episode' && epKey(p) === k)}
                          className="p-1.5 text-red-400 opacity-0 group-hover:opacity-100 hover:text-red-300 shrink-0">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )
                  })
              )}

            </div>
          </div>
        )}

        {/* Browse tab */}
        {tab === 'browse' && <div className="flex flex-1 min-h-0">
          {/* Left: source + library selector */}
          <div className="w-52 shrink-0 border-r border-gray-700 flex flex-col overflow-y-auto">
            {servers.length > 0 && (
              <div className="p-2">
                <div className="text-xs font-semibold text-gray-400 uppercase px-2 py-1">Plex Servers</div>
                {servers.map(srv => (
                  <button key={srv.name}
                    onClick={() => setSource({ type: 'plex', server: srv })}
                    className={`w-full text-left px-3 py-2 rounded text-sm ${source?.type === 'plex' && (source as { server: PlexServer }).server.name === srv.name ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
                    {srv.name}
                  </button>
                ))}
              </div>
            )}
            {shows.length > 0 && (
              <div className="p-2 border-t border-gray-700">
                <div className="text-xs font-semibold text-gray-400 uppercase px-2 py-1">Custom Shows</div>
                {shows.map(sh => (
                  <button key={sh.id}
                    onClick={() => { setSource({ type: 'show', id: sh.id, name: sh.name }); loadShow(sh.id) }}
                    className={`w-full text-left px-3 py-2 rounded text-sm ${source?.type === 'show' && (source as { id: string }).id === sh.id ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
                    {sh.name}
                  </button>
                ))}
              </div>
            )}
            {source?.type === 'plex' && libraries.length > 0 && (
              <div className="p-2 border-t border-gray-700">
                <div className="text-xs font-semibold text-gray-400 uppercase px-2 py-1">Libraries</div>
                {libraries.map(lib => (
                  <button key={lib.key}
                    onClick={() => loadLibrary(lib)}
                    className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 ${selectedLib?.key === lib.key ? 'bg-blue-600/30 text-blue-300' : 'text-gray-300 hover:bg-gray-700'}`}>
                    <ChevronRight size={14} className="shrink-0" />
                    <span className="truncate">{lib.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: content */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Breadcrumb */}
            {navStack.length > 0 && (
              <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-700 text-sm overflow-x-auto">
                {navStack.length > 1 && (
                  <button onClick={() => navigateTo(navStack.length - 2)}
                    className="p-1 hover:bg-gray-700 rounded shrink-0">
                    <ArrowLeft size={14} />
                  </button>
                )}
                {navStack.map((level, i) => (
                  <span key={i} className="flex items-center gap-1 shrink-0">
                    {i > 0 && <ChevronRight size={12} className="text-gray-500" />}
                    <button
                      onClick={() => i < navStack.length - 1 && navigateTo(i)}
                      className={i === navStack.length - 1 ? 'text-white font-medium' : 'text-gray-400 hover:text-white'}>
                      {level.title}
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Filter + controls */}
            <div className="p-3 border-b border-gray-700 flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={filter} onChange={e => setFilter(e.target.value)}
                  placeholder="Filter…"
                  className="w-full bg-gray-700 border border-gray-600 text-white rounded pl-8 pr-3 py-1.5 text-sm" />
              </div>
              <button onClick={selectAll} className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded">All</button>
              <button onClick={() => setSelected(new Map())} className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded">None</button>
            </div>

            {/* Item list */}
            <div className="flex-1 overflow-y-auto">
              {loading && (
                <div className="flex items-center justify-center h-32 text-gray-400">
                  <Loader2 size={24} className="animate-spin mr-2" /> Loading…
                </div>
              )}
              {!loading && filteredItems.length === 0 && (
                <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
                  {navStack.length > 0 ? 'No items found' : 'Select a library'}
                </div>
              )}
              {!loading && filteredItems.map(meta => {
                const isSelected = selected.has(meta.ratingKey)
                const canDrill = DRILLABLE.has(meta.type)
                const icon = currentServer ? itemIcon(currentServer, meta) : undefined
                const subtitle = itemSubtitle(meta, sectionType)
                return (
                  <div key={meta.ratingKey}
                    className={`flex items-center gap-3 px-3 py-2 border-b border-gray-700/50 cursor-pointer ${isSelected ? 'bg-blue-600/20' : 'hover:bg-gray-700/50'}`}
                    onClick={() => toggleSelect(meta)}>
                    <input type="checkbox" checked={isSelected} onChange={() => {}} className="shrink-0" />
                    {icon && (
                      <img src={icon} alt="" className="w-9 h-9 rounded object-cover shrink-0"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-100 truncate">{meta.title}</div>
                      {subtitle && <div className="text-xs text-gray-400 truncate">{subtitle}</div>}
                    </div>
                    {meta.duration && meta.duration > 0 && (
                      <span className="text-xs text-gray-500 shrink-0">{msToTime(meta.duration)}</span>
                    )}
                    {canDrill && (
                      <button
                        onClick={e => { e.stopPropagation(); drillInto(meta) }}
                        className="p-1.5 hover:bg-gray-600 rounded shrink-0 text-gray-400 hover:text-white"
                        title={`Browse ${meta.type === 'show' ? 'seasons' : meta.type === 'collection' ? 'contents' : 'episodes'}`}>
                        <ChevronsRight size={14} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-gray-700 flex items-center justify-between">
              <span className="text-sm text-gray-400">{selected.size} selected</span>
              <button onClick={addSelected}
                disabled={selected.size === 0 || adding}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium disabled:opacity-40">
                {adding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {adding ? 'Expanding…' : 'Add Selected'}
              </button>
            </div>
          </div>
        </div>}
      </div>
    </div>
  )
}
