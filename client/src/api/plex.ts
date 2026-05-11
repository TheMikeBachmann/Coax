import type { PlexLibrarySection, PlexPlaylist, PlexResource, PlexServer, Program } from '../types'

const PLEX_HEADERS = {
  Accept: 'application/json',
  'X-Plex-Product': 'dizqueTV',
  'X-Plex-Version': 'Plex OAuth',
  'X-Plex-Client-Identifier': 'rg14zekk3pa5zp4safjwaa8z',
  'X-Plex-Model': 'Plex OAuth',
}

async function plexFetch<T>(url: string, headers?: Record<string, string>, method = 'GET'): Promise<T> {
  const res = await fetch(url, { method, headers: { ...PLEX_HEADERS, ...headers } })
  if (!res.ok) throw new Error(`Plex ${res.status}: ${res.statusText}`)
  return res.json()
}

export interface PlexLoginResult {
  servers: PlexResource[]
  authToken: string
}

export const plexApi = {
  login: (): Promise<PlexLoginResult> => {
    return new Promise((resolve, reject) => {
      plexFetch<{ id: string; code: string }>('https://plex.tv/api/v2/pins?strong=true', {
        'Content-Type': 'application/json',
      }, 'POST').then(pin => {
        const w = 800, h = 700
        const left = window.innerWidth / 2 - w / 2
        const top = window.innerHeight / 2 - h / 2
        const authUrl = `https://app.plex.tv/auth/#!?clientID=${PLEX_HEADERS['X-Plex-Client-Identifier']}&context[device][version]=Plex OAuth&context[device][model]=Plex OAuth&code=${pin.code}&context[device][product]=Plex Web`
        const popup = window.open(authUrl, '_blank', `width=${w},height=${h},top=${top},left=${left}`)

        let elapsed = 0
        const interval = setInterval(async () => {
          elapsed += 2000
          if (elapsed >= 120000) {
            clearInterval(interval)
            popup?.close()
            reject(new Error('Timed out waiting for Plex login'))
            return
          }
          try {
            const result = await plexFetch<{ authToken: string | null }>(
              `https://plex.tv/api/v2/pins/${pin.id}`,
              PLEX_HEADERS as Record<string, string>
            )
            if (result.authToken) {
              clearInterval(interval)
              popup?.close()
              const resources = await plexFetch<PlexResource[]>(
                'https://plex.tv/api/v2/resources?includeHttps=1',
                { ...PLEX_HEADERS, 'X-Plex-Token': result.authToken } as Record<string, string>
              )
              resolve({
                authToken: result.authToken,
                servers: resources.filter(r => r.provides === 'server'),
              })
            }
          } catch {
            // poll silently
          }
        }, 2000)
      }).catch(reject)
    })
  },

  check: async (server: PlexServer): Promise<number> => {
    try {
      const res = await fetch(`${server.uri}/`, {
        headers: { ...PLEX_HEADERS, 'X-Plex-Token': server.accessToken } as Record<string, string>,
      })
      return res.ok ? 1 : -1
    } catch {
      return -1
    }
  },

  getLibrary: async (server: PlexServer): Promise<PlexLibrarySection[]> => {
    const res = await plexFetch<{ MediaContainer: { Directory?: Array<Record<string, string>> } }>(
      `${server.uri}/library/sections`,
      { 'X-Plex-Token': server.accessToken }
    )
    const dirs = res.MediaContainer?.Directory ?? []
    const sections: PlexLibrarySection[] = []
    for (const dir of dirs) {
      if (!['movie', 'show', 'artist'].includes(dir.type)) continue
      let genres: { title: string; key: string; type: string }[] = []
      if (dir.type === 'movie') {
        try {
          const gr = await plexFetch<{ MediaContainer: { Directory?: Array<Record<string, string>> } }>(
            `${server.uri}/library/sections/${dir.key}/genre`,
            { 'X-Plex-Token': server.accessToken }
          )
          genres = (gr.MediaContainer?.Directory ?? [])
            .filter(d => d.type === 'genre')
            .map(d => ({ title: `Genre: ${d.title}`, key: d.fastKey, type: 'genre' }))
        } catch { /* ignore */ }
      }
      sections.push({
        title: dir.title,
        key: `/library/sections/${dir.key}/all`,
        icon: `${server.uri}${dir.composite}?X-Plex-Token=${server.accessToken}`,
        type: dir.type,
        genres,
      })
    }
    return sections
  },

  getPlaylists: async (server: PlexServer): Promise<PlexPlaylist[]> => {
    const res = await plexFetch<{ MediaContainer: { Metadata?: Array<Record<string, string & number>> } }>(
      `${server.uri}/playlists`,
      { 'X-Plex-Token': server.accessToken }
    )
    return (res.MediaContainer?.Metadata ?? [])
      .filter(m => ['video', 'audio'].includes(m.playlistType as string))
      .map(m => ({
        title: m.title as string,
        key: m.key as string,
        icon: `${server.uri}${m.composite}?X-Plex-Token=${server.accessToken}`,
        duration: m.duration as number,
      }))
  },

  getNested: async (
    server: PlexServer,
    lib: { key: string; genres?: PlexLibrarySection['genres'] },
    includeCollections: boolean,
    errors: string[]
  ): Promise<Program[]> => {
    const res = await plexFetch<{ MediaContainer: { Metadata?: Array<Record<string, unknown>>; librarySectionID?: string; viewGroup?: string; size?: number } }>(
      `${server.uri}${lib.key}`,
      { 'X-Plex-Token': server.accessToken }
    )
    const mc = res.MediaContainer
    const items = mc.Metadata ?? []
    const nested: Program[] = []

    if (lib.genres) nested.push(...(lib.genres as unknown as Program[]))

    const seenFiles: Record<string, boolean> = {}

    // Pre-fetch albums for tracks
    const albumKeys: string[] = []
    for (const meta of items) {
      if (meta.type === 'track' && meta.parentKey) albumKeys.push(meta.parentKey as string)
    }
    const albums: Record<string, Record<string, unknown>> = {}
    await Promise.all([...new Set(albumKeys)].map(async key => {
      try {
        const ar = await plexFetch<{ MediaContainer: { Metadata?: Array<Record<string, unknown>>; size?: number } }>(
          `${server.uri}${key}`,
          { 'X-Plex-Token': server.accessToken }
        )
        if (ar.MediaContainer?.size === 1) albums[key] = ar.MediaContainer.Metadata![0]
      } catch { /* ignore */ }
    }))

    for (const meta of items) {
      try {
        if (meta.duration === undefined && (meta.type === 'episode' || meta.type === 'movie')) continue
        if ((meta.duration as number) <= 0 && (meta.type === 'episode' || meta.type === 'movie')) continue

        let year = meta.year as string | undefined
        let date = meta.originallyAvailableAt as string | undefined
        const album = meta.type === 'track' ? albums[meta.parentKey as string] : undefined
        if (album) {
          year = album.year as string
          date = album.originallyAvailableAt as string
        }
        if (!date && year) date = `${year}-01-01`

        const program: Program = {
          title: meta.title as string,
          key: (meta.key as string).replace(/\/children$/, ''),
          ratingKey: String(meta.ratingKey),
          serverKey: server.name,
          icon: `${server.uri}${meta.thumb}?X-Plex-Token=${server.accessToken}`,
          type: meta.type as string,
          duration: meta.duration as number,
          date,
          year: year ? parseInt(year) : undefined,
          summary: meta.summary as string,
          rating: meta.contentRating as string,
        }

        const mediaParts = ((meta.Media as Array<{ Part: Array<{ key: string; file: string }> }>)?.[0]?.Part) ?? []
        if (['episode', 'movie', 'track'].includes(meta.type as string)) {
          program.plexFile = mediaParts[0]?.key
          program.file = mediaParts[0]?.file
        }

        if (meta.type === 'episode') {
          let anyNew = false
          for (const m of (meta.Media as Array<{ Part: Array<{ file: string }> }>) ?? []) {
            for (const p of m.Part ?? []) {
              if (!seenFiles[p.file]) { seenFiles[p.file] = true; anyNew = true }
            }
          }
          if (!anyNew) continue
          program.showTitle = meta.grandparentTitle as string
          program.episode = meta.index as number
          program.season = meta.parentIndex as number
          program.icon = `${server.uri}${meta.grandparentThumb}?X-Plex-Token=${server.accessToken}`
          program.episodeIcon = `${server.uri}${meta.thumb}?X-Plex-Token=${server.accessToken}`
          program.seasonIcon = `${server.uri}${meta.parentThumb}?X-Plex-Token=${server.accessToken}`
          program.showIcon = program.icon
        } else if (meta.type === 'track') {
          program.showTitle = album ? (album.title as string) : (meta.title as string)
          program.episode = meta.index as number
          program.season = meta.parentIndex as number
        } else if (meta.type === 'movie') {
          program.showTitle = meta.title as string
          program.episode = 1
          program.season = 1
        }
        nested.push(program)
      } catch (err) {
        const msg = `Error reading ${lib.key} ${meta.title}`
        errors.push(msg)
        console.error(msg, err)
      }
    }

    if (includeCollections && mc.librarySectionID) {
      try {
        const colKey = `/library/sections/${mc.librarySectionID}/collections`
        const cols = await plexFetch<{ MediaContainer: { Metadata?: Array<Record<string, unknown>> } }>(
          `${server.uri}${colKey}`,
          { 'X-Plex-Token': server.accessToken }
        )
        const collectionItems: Program[] = (cols.MediaContainer?.Metadata ?? []).map(d => ({
          title: mc.viewGroup === 'show' ? `${d.title} Collection` : d.title as string,
          key: d.key as string,
          type: 'collection',
          duration: 0,
        }))
        return [...collectionItems, ...nested]
      } catch { /* ignore */ }
    }

    return nested
  },

  // Fetch raw Plex metadata items from any URL
  fetchItems: async (server: PlexServer, url: string): Promise<PlexMeta[]> => {
    const res = await plexFetch<{ MediaContainer: { Metadata?: PlexMeta[] } }>(
      `${server.uri}${url}`,
      { 'X-Plex-Token': server.accessToken }
    )
    return res.MediaContainer?.Metadata ?? []
  },

  // Fetch all leaf items (episodes/tracks) under any container via /allLeaves
  fetchAllLeaves: async (server: PlexServer, ratingKey: string): Promise<PlexMeta[]> => {
    const res = await plexFetch<{ MediaContainer: { Metadata?: PlexMeta[] } }>(
      `${server.uri}/library/metadata/${ratingKey}/allLeaves`,
      { 'X-Plex-Token': server.accessToken }
    )
    return res.MediaContainer?.Metadata ?? []
  },

  // Convert a raw PlexMeta item to a Program
  metaToProgram: (server: PlexServer, meta: PlexMeta): Program | null => {
    if (!meta.ratingKey) return null
    const mediaParts = meta.Media?.[0]?.Part ?? []
    const program: Program = {
      title: meta.title,
      key: (meta.key ?? '').replace(/\/children$/, ''),
      ratingKey: String(meta.ratingKey),
      serverKey: server.name,
      icon: meta.thumb ? `${server.uri}${meta.thumb}?X-Plex-Token=${server.accessToken}` : undefined,
      type: meta.type,
      duration: meta.duration ?? 0,
      date: meta.originallyAvailableAt,
      year: meta.year,
      summary: meta.summary,
      rating: meta.contentRating,
      plexFile: mediaParts[0]?.key,
      file: mediaParts[0]?.file,
    }
    if (meta.type === 'episode') {
      program.showTitle = meta.grandparentTitle
      program.episode = meta.index
      program.season = meta.parentIndex
      program.icon = meta.grandparentThumb
        ? `${server.uri}${meta.grandparentThumb}?X-Plex-Token=${server.accessToken}`
        : program.icon
      program.episodeIcon = meta.thumb
        ? `${server.uri}${meta.thumb}?X-Plex-Token=${server.accessToken}`
        : undefined
    } else if (meta.type === 'track') {
      program.showTitle = meta.parentTitle
      program.episode = meta.index
      program.season = meta.parentIndex
    } else if (meta.type === 'movie') {
      program.showTitle = meta.title
      program.episode = 1
      program.season = 1
    }
    return program
  },
}

export interface PlexMeta {
  ratingKey: string
  key: string
  title: string
  type: string
  thumb?: string
  parentThumb?: string
  grandparentThumb?: string
  duration?: number
  leafCount?: number
  childCount?: number
  index?: number
  parentIndex?: number
  grandparentTitle?: string
  grandparentRatingKey?: string
  parentTitle?: string
  parentRatingKey?: string
  year?: number
  originallyAvailableAt?: string
  summary?: string
  contentRating?: string
  Media?: Array<{ Part: Array<{ key: string; file: string }> }>
}
