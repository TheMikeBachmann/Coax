const { spawn } = require('child_process')
const { createCanvas, loadImage } = require('@napi-rs/canvas')
const http = require('http')
const fs = require('fs')
const os = require('os')
const path = require('path')

const W = 704
const H = 480
const CH_COL = 96
const HDR_H = 30
const TIME_H = 22
const HEADER_H = HDR_H + TIME_H   // 52
const VISIBLE_CH_H = H - HEADER_H // 428
const ROW_H = 38
const N_SLOTS = 4
const SLOT_W = Math.floor((W - CH_COL) / N_SLOTS)
const SCROLL_PX_PER_SEC = 38
const FPS = 25

function hhmm(date, tz) {
    const fmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz })
    return fmt.format(date).replace(':00', '').replace(' ', ' ')
}

function getSlotsAt(date, tz) {
    const parts = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric', minute: 'numeric', hour12: false, timeZone: tz
    }).formatToParts(date)
    const minutes = parseInt(parts.find(p => p.type === 'minute').value)
    const t0 = new Date(date)
    t0.setSeconds(0, 0)
    t0.setMilliseconds(0)
    t0.setTime(t0.getTime() - (minutes % 30) * 60 * 1000)
    return Array.from({ length: N_SLOTS }, (_, i) =>
        new Date(t0.getTime() + i * 30 * 60 * 1000)
    )
}

// Returns the next :00 or :30 boundary strictly after now.
function getNextHalfHour(now, tz) {
    const slots = getSlotsAt(now, tz)
    return new Date(slots[0].getTime() + 30 * 60 * 1000)
}

function drawTimeLabels(ctx, slots, midY, tz) {
    for (let i = 0; i < N_SLOTS; i++) {
        ctx.fillStyle = 'cyan'
        ctx.font = '12px monospace'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(hhmm(slots[i], tz), CH_COL + i * SLOT_W + 4, midY)
    }
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            let data = ''
            res.on('data', d => { data += d })
            res.on('end', () => {
                try { resolve(JSON.parse(data)) }
                catch (e) { reject(e) }
            })
        }).on('error', reject)
    })
}

function resolveIcon(icon, port) {
    if (!icon) return null
    if (icon.startsWith('http://') || icon.startsWith('https://')) return icon
    return `http://localhost:${port}${icon.startsWith('/') ? '' : '/'}${icon}`
}

// Draws one channel row at absolute canvas Y position `y`.
// windowStartMs / windowEndMs define the visible time window for program cells.
function drawChannelRow(ctx, ch, lineups, y, windowStartMs, windowEndMs, iconMap, rowIdx) {
    const windowDurMs = windowEndMs - windowStartMs
    const contentW = W - CH_COL

    ctx.fillStyle = rowIdx % 2 === 0 ? '#0f0f50' : '#080840'
    ctx.fillRect(0, y, W, ROW_H)
    ctx.fillStyle = '#3344aa'
    ctx.fillRect(0, y + ROW_H - 1, W, 1)

    const img = iconMap[ch.number]
    if (img) {
        const pad = 2
        const maxW = CH_COL - pad * 2
        const maxH = ROW_H - pad * 2
        const scale = Math.min(maxW / img.width, maxH / img.height)
        const iw = Math.round(img.width * scale)
        const ih = Math.round(img.height * scale)
        ctx.drawImage(img, Math.round(pad + (maxW - iw) / 2), Math.round(y + pad + (maxH - ih) / 2), iw, ih)
    } else {
        ctx.textBaseline = 'top'
        ctx.textAlign = 'left'
        ctx.fillStyle = '#aaddff'
        ctx.font = '10px monospace'
        ctx.fillText(String(ch.number).substring(0, 4), 3, y + 4)
        ctx.fillStyle = 'white'
        ctx.fillText(String(ch.name || '').substring(0, 9), 3, y + 18)
    }

    const lineup = (lineups[ch.number] || []).filter(p => !p.isOffline)
    const visibleProgs = lineup.filter(p => {
        const ps = new Date(p.start).getTime()
        const pe = new Date(p.stop).getTime()
        return ps < windowEndMs && pe > windowStartMs
    })

    for (const prog of visibleProgs) {
        const ps = new Date(prog.start).getTime()
        const pe = new Date(prog.stop).getTime()
        const x1 = CH_COL + Math.round((Math.max(ps, windowStartMs) - windowStartMs) / windowDurMs * contentW)
        const x2 = CH_COL + Math.round((Math.min(pe, windowEndMs)   - windowStartMs) / windowDurMs * contentW)
        const cellW = x2 - x1
        if (cellW < 2) continue

        ctx.fillStyle = '#3344aa'
        ctx.fillRect(x1, y, 1, ROW_H - 1)

        const textW = cellW - 4
        if (textW < 8) continue

        ctx.fillStyle = 'white'
        ctx.font = '11px monospace'
        ctx.textBaseline = 'top'
        ctx.textAlign = 'left'
        ctx.fillText(String(prog.title || '').substring(0, Math.floor(textW / 6.6)), x1 + 3, y + 8)

        if (prog.sub?.season && textW > 50) {
            ctx.fillStyle = '#888888'
            ctx.font = '9px monospace'
            ctx.fillText(
                `S${prog.sub.season}E${prog.sub.episode}`.substring(0, Math.floor(textW / 6)),
                x1 + 3, y + 22
            )
        }
    }
}

function drawTimeBar(ctx, y, slots, tz) {
    ctx.fillStyle = '#0a0a50'
    ctx.fillRect(0, y, W, TIME_H)
    drawTimeLabels(ctx, slots, y + TIME_H / 2, tz)
}

function drawGridLines(ctx, startY, height) {
    ctx.fillStyle = '#3344aa'
    ctx.fillRect(CH_COL, startY, 1, height)
    for (let i = 1; i < N_SLOTS; i++) {
        ctx.fillRect(CH_COL + i * SLOT_W, startY, 1, height)
    }
}

// Renders a set of channel rows (reps × channels) starting at absolute Y offset `startY`.
function drawChannelRows(ctx, channels, lineups, startY, rowsH, windowStartMs, windowEndMs, iconMap) {
    const cycleH = channels.length * ROW_H
    const reps = Math.ceil(rowsH / cycleH)
    for (let rep = 0; rep < reps; rep++) {
        for (let r = 0; r < channels.length; r++) {
            const y = startY + rep * cycleH + r * ROW_H
            if (y >= startY + rowsH) break
            drawChannelRow(ctx, channels[r], lineups, y, windowStartMs, windowEndMs, iconMap, r)
        }
    }
}

// Builds the normal (non-transition) guide PNG for the time window containing `now`.
async function buildGuideCanvas(channels, lineups, now, tz, iconMap) {
    const slots = getSlotsAt(now, tz)
    const windowStartMs = slots[0].getTime()
    const windowEndMs   = windowStartMs + N_SLOTS * 30 * 60 * 1000

    const cycleH = channels.length > 0 ? channels.length * ROW_H : VISIBLE_CH_H
    const reps   = channels.length > 0
        ? Math.max(2, Math.ceil((VISIBLE_CH_H + cycleH) / cycleH) + 1)
        : 1
    const rowsH  = reps * cycleH
    const totalH = HEADER_H + rowsH

    const canvas = createCanvas(W, totalH)
    const ctx    = canvas.getContext('2d')

    ctx.fillStyle = '#0a0a3a'
    ctx.fillRect(0, 0, W, totalH)

    ctx.fillStyle = '#1a1a6a'
    ctx.fillRect(0, 0, W, HDR_H)
    ctx.fillStyle = 'yellow'
    ctx.font = 'bold 15px monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('PROGRAM GUIDE', 8, HDR_H / 2)

    drawTimeBar(ctx, HDR_H, slots, tz)
    drawGridLines(ctx, HDR_H, totalH - HDR_H)

    if (channels.length > 0) {
        drawChannelRows(ctx, channels, lineups, HEADER_H, rowsH, windowStartMs, windowEndMs, iconMap)
    }

    const pngBuf = canvas.toBuffer('image/png')
    const base   = path.join(os.tmpdir(), `coax-guide-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    fs.writeFileSync(base + '.png', pngBuf)
    return { base, rowsH, cycleH }
}

// Builds the transition PNG.
//
// For the animation to work — old time bar scrolling OFF the top, new one
// scrolling IN from below — the old time bar must be part of the scrolling
// content rather than pinned.  During the transition video we therefore pin
// only the 30px title (HDR_H) and scroll everything below it (450px viewport).
//
// Scrolling content layout (Y offsets relative to top of scrolling area, i.e.
// absolute Y = HDR_H + offset):
//   [old time bar  22px]        ← first thing in scroll; exits top as it plays
//   [old-window channel rows]   ← oldRowsH px (multiple of cycleH)
//   [new time bar  22px]        ← scrolls in; arrives at top at the half-hour
//   [new-window channel rows]   ← seamlessly loops into next.ts afterward
//
// pinnedH for this video is HDR_H (30), not HEADER_H (52).
async function buildTransitionCanvas(channels, lineups, currentSlots, nextSlots, oldRowsH, tz, iconMap) {
    const windowOldStartMs = currentSlots[0].getTime()
    const windowOldEndMs   = windowOldStartMs + N_SLOTS * 30 * 60 * 1000
    const windowNewStartMs = nextSlots[0].getTime()
    const windowNewEndMs   = windowNewStartMs + N_SLOTS * 30 * 60 * 1000

    const cycleH     = channels.length > 0 ? channels.length * ROW_H : VISIBLE_CH_H
    const newReps    = Math.max(2, Math.ceil((VISIBLE_CH_H + cycleH) / cycleH) + 1)
    const newRowsH   = newReps * cycleH
    // Total scrollable height seen by the FFmpeg scroll filter (pinnedH = HDR_H = 30)
    const totalRowsH = TIME_H + oldRowsH + TIME_H + newRowsH
    const totalH     = HDR_H + totalRowsH

    const canvas = createCanvas(W, totalH)
    const ctx    = canvas.getContext('2d')

    ctx.fillStyle = '#0a0a3a'
    ctx.fillRect(0, 0, W, totalH)

    // Title bar — the only pinned element for this video
    ctx.fillStyle = '#1a1a6a'
    ctx.fillRect(0, 0, W, HDR_H)
    ctx.fillStyle = 'yellow'
    ctx.font = 'bold 15px monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('PROGRAM GUIDE', 8, HDR_H / 2)

    drawGridLines(ctx, HDR_H, totalH - HDR_H)

    // Old time bar: first item in scrolling content — scrolls off the top as the
    // video plays, creating the "pushed out" effect.
    drawTimeBar(ctx, HDR_H, currentSlots, tz)

    // Old-window channel rows
    if (oldRowsH > 0 && channels.length > 0) {
        drawChannelRows(ctx, channels, lineups, HDR_H + TIME_H, oldRowsH,
            windowOldStartMs, windowOldEndMs, iconMap)
    }

    // New time bar: scrolls in from below; reaches the top at the half-hour mark
    const newBarY = HDR_H + TIME_H + oldRowsH
    drawTimeBar(ctx, newBarY, nextSlots, tz)

    // New-window channel rows
    if (channels.length > 0) {
        drawChannelRows(ctx, channels, lineups, newBarY + TIME_H, newRowsH,
            windowNewStartMs, windowNewEndMs, iconMap)
    }

    const pngBuf = canvas.toBuffer('image/png')
    const base   = path.join(os.tmpdir(), `coax-guide-trans-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    fs.writeFileSync(base + '.png', pngBuf)
    return { base, rowsH: totalRowsH, cycleH }
}

// Encodes a guide PNG to an MPEG-TS file of exactly `duration` seconds.
// pinnedH: pixels pinned at the top (default HEADER_H=52; transition uses HDR_H=30).
// The scroll filter advances the rows area at SCROLL_PX_PER_SEC px/sec.
function encodeVideo({ pngPath, tsPath, rowsH, duration, pinnedH = HEADER_H, ffmpegPath, vEncoder, aEncoder }) {
    const visibleH     = H - pinnedH
    const scrollSpeed  = (SCROLL_PX_PER_SEC / (FPS * rowsH)).toFixed(8)
    const filterGraph  = [
        `[0:v]split=2[a][b]`,
        `[a]crop=${W}:${pinnedH}:0:0[hdr]`,
        `[b]crop=${W}:${rowsH}:0:${pinnedH},scroll=v=${scrollSpeed}:h=0,crop=${W}:${visibleH}:0:0[rows]`,
        `[hdr][rows]vstack[out]`,
    ].join(';')

    return new Promise((resolve, reject) => {
        const ff = spawn(ffmpegPath, [
            '-r', String(FPS),
            '-loop', '1',
            '-i', pngPath,
            '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
            '-filter_complex', filterGraph,
            '-map', '[out]', '-map', '1:a',
            '-c:v', vEncoder,
            '-preset', 'ultrafast',
            ...(vEncoder === 'libx264' ? ['-tune', 'zerolatency'] : []),
            '-g', String(FPS),
            '-maxrate', '2000k', '-bufsize', '4000k',
            '-c:a', aEncoder,
            '-t', String(duration),
            '-y', tsPath,
        ], { stdio: ['pipe', 'pipe', 'pipe'] })

        let stderr = ''
        ff.stderr.on('data', d => { stderr += d; if (stderr.length > 5000) stderr = stderr.slice(-2500) })
        ff.on('close', code => code === 0 ? resolve() : reject(new Error(`encode failed (${code}): ${stderr.slice(-300)}`)))
        ff.on('error', reject)
    })
}

module.exports = function guideChannelHandler(channelService, db, port) {
    return async function(req, res) {
        res.writeHead(200, {
            'Content-Type': 'video/mp2t',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Range',
        })

        const tz = req.query.tz || 'UTC'
        const ffmpegSettings = db['ffmpeg-settings'].find()[0] || {}
        const ffmpegPath = ffmpegSettings.ffmpegPath || 'ffmpeg'
        const vEncoder   = ffmpegSettings.videoEncoder || 'libx264'
        const aEncoder   = ffmpegSettings.audioEncoder || 'aac'

        const tmpFiles = []
        const cleanup  = () => { for (const f of tmpFiles) { try { fs.unlinkSync(f) } catch {} } }

        try {
            const now          = new Date()
            const nextHalfHour = getNextHalfHour(now, tz)
            const currentSlots = getSlotsAt(now, tz)
            const nextSlots    = getSlotsAt(nextHalfHour, tz)

            // Fetch lineup data covering both the current and next time windows
            const from = new Date(now.getTime() - 30 * 60 * 1000).toISOString()
            const to   = new Date(nextHalfHour.getTime() + N_SLOTS * 30 * 60 * 1000).toISOString()

            let channels = []
            let lineups  = {}
            try {
                const nums = await channelService.getAllChannelNumbers()
                channels = (await Promise.all(nums.map(n => channelService.getChannel(n))))
                    .filter(Boolean).sort((a, b) => a.number - b.number)
                await Promise.all(channels.map(async ch => {
                    try {
                        const data = await fetchJson(
                            `http://localhost:${port}/api/guide/channels/${ch.number}` +
                            `?dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}`
                        )
                        lineups[ch.number] = data.programs || []
                    } catch { lineups[ch.number] = [] }
                }))
            } catch (e) {
                console.error('[guide-channel] data fetch failed:', e.message)
            }

            const iconCache = {}
            await Promise.allSettled(
                channels.filter(ch => ch.icon).map(async ch => {
                    const url = resolveIcon(ch.icon, port)
                    if (!url) return
                    try { iconCache[ch.number] = await loadImage(url) } catch {}
                })
            )

            const cycleH      = channels.length > 0 ? channels.length * ROW_H : VISIBLE_CH_H
            const loopDuration = cycleH / SCROLL_PX_PER_SEC

            // ── Transition timing ────────────────────────────────────────────────
            // The new time bar takes VISIBLE_CH_H/SCROLL_PX_PER_SEC ≈ 11.3 seconds
            // to travel from the bottom of the channel area to the top.
            // We switch from the current loop to the transition video at the first
            // full-cycle boundary after (halfHour - travelTime). This guarantees
            // the scroll phase at the switch is always 0, so the transition video's
            // first frame matches the loop's last frame exactly.
            const secUntilHalfHour   = (nextHalfHour.getTime() - now.getTime()) / 1000
            const secUntilTransStart = secUntilHalfHour - VISIBLE_CH_H / SCROLL_PX_PER_SEC
            const numCurrentLoops    = Math.ceil(Math.max(0, secUntilTransStart) / loopDuration)
            const timeFromSwitchToHalf = secUntilHalfHour - numCurrentLoops * loopDuration

            // The new time bar reaches the top of the scrolling viewport when:
            //   (TIME_H + oldRowsH) / SCROLL_PX_PER_SEC = timeFromSwitchToHalf
            //   oldRowsH = timeFromSwitchToHalf * SCROLL_PX_PER_SEC - TIME_H
            // Round DOWN to the nearest cycle boundary so the bar arrives at or
            // before the half-hour (the old code used ceil and arrived late).
            const targetOldPx = Math.max(0, timeFromSwitchToHalf * SCROLL_PX_PER_SEC - TIME_H)
            const oldReps     = Math.floor(targetOldPx / cycleH)
            const oldRowsH    = oldReps * cycleH
            // Transition ends when scroll position = TIME_H + oldRowsH (new time bar
            // at top of viewport), which is exactly where next.ts starts.
            const transitionDuration = (TIME_H + oldRowsH) / SCROLL_PX_PER_SEC

            // ── Build and encode all three video segments ────────────────────────
            const cur = await buildGuideCanvas(channels, lineups, now, tz, iconCache)
            tmpFiles.push(cur.base + '.png', cur.base + '.ts')
            await encodeVideo({ pngPath: cur.base + '.png', tsPath: cur.base + '.ts',
                rowsH: cur.rowsH, duration: loopDuration, ffmpegPath, vEncoder, aEncoder })

            const nxt = await buildGuideCanvas(channels, lineups, nextHalfHour, tz, iconCache)
            tmpFiles.push(nxt.base + '.png', nxt.base + '.ts')
            await encodeVideo({ pngPath: nxt.base + '.png', tsPath: nxt.base + '.ts',
                rowsH: nxt.rowsH, duration: loopDuration, ffmpegPath, vEncoder, aEncoder })

            let transTsPath = null
            if (transitionDuration > 0.5) {
                const trn = await buildTransitionCanvas(
                    channels, lineups, currentSlots, nextSlots, oldRowsH, tz, iconCache
                )
                tmpFiles.push(trn.base + '.png', trn.base + '.ts')
                transTsPath = trn.base + '.ts'
                await encodeVideo({ pngPath: trn.base + '.png', tsPath: transTsPath,
                    rowsH: trn.rowsH, duration: transitionDuration, pinnedH: HDR_H,
                    ffmpegPath, vEncoder, aEncoder })
            }

            // ── Write concat playlist ────────────────────────────────────────────
            const playlistPath = path.join(os.tmpdir(),
                `coax-guide-pl-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`)
            tmpFiles.push(playlistPath)

            const lines = ['ffconcat version 1.0']
            for (let i = 0; i < numCurrentLoops; i++) lines.push(`file '${cur.base}.ts'`)
            if (transTsPath) lines.push(`file '${transTsPath}'`)
            // 500 repetitions of next.ts covers hundreds of minutes for any channel count
            for (let i = 0; i < 500; i++) lines.push(`file '${nxt.base}.ts'`)
            fs.writeFileSync(playlistPath, lines.join('\n'))

            // ── Stream via concat demuxer — still -c copy, near-zero CPU ─────────
            const ff = spawn(ffmpegPath, [
                '-re',
                '-f', 'concat', '-safe', '0',
                '-i', playlistPath,
                '-c', 'copy',
                '-f', 'mpegts', 'pipe:1',
            ], { stdio: ['pipe', 'pipe', 'pipe'] })

            ff.stdout.pipe(res, { end: false })

            let stderrBuf = ''
            ff.stderr.on('data', d => { stderrBuf += d; if (stderrBuf.length > 5000) stderrBuf = stderrBuf.slice(-2500) })
            ff.on('close', code => {
                if (code !== 0 && stderrBuf) console.error('[guide-channel] stream exit', code, stderrBuf.slice(-300))
            })
            ff.on('error', err => console.error('[guide-channel] stream error:', err.message))

            res.on('close', () => { try { ff.kill() } catch {} cleanup() })

        } catch (e) {
            console.error('[guide-channel] startup error:', e.message)
            cleanup()
            res.end()
        }
    }
}
