const { spawn } = require('child_process')
const { createCanvas, loadImage } = require('@napi-rs/canvas')
const http = require('http')
const fs = require('fs')
const os = require('os')
const path = require('path')

const W = 704
const H = 480
const SAFE_L = 20, SAFE_R = 20
const GW = W - SAFE_L - SAFE_R     // 664 — content width within overscan margins
const CH_COL = 96
const HDR_H = 4                     // thin top strip (title bar removed)
const TIME_H = 24
const HEADER_H = HDR_H + TIME_H    // 28
const VISIBLE_CH_H = H - HEADER_H  // 452
const ROW_H = 72
const N_SLOTS = 3                   // 1.5 hours of content
const SLOT_W = Math.floor((GW - CH_COL) / N_SLOTS)
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

function getNextHalfHour(now, tz) {
    return new Date(getSlotsAt(now, tz)[0].getTime() + 30 * 60 * 1000)
}

function drawTimeLabels(ctx, slots, midY, tz) {
    for (let i = 0; i < N_SLOTS; i++) {
        ctx.fillStyle = 'cyan'
        ctx.font = '14px monospace'
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
            res.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } })
        }).on('error', reject)
    })
}

function resolveIcon(icon, port) {
    if (!icon) return null
    if (icon.startsWith('http://') || icon.startsWith('https://')) return icon
    return `http://localhost:${port}${icon.startsWith('/') ? '' : '/'}${icon}`
}

function drawTimeBar(ctx, y, slots, tz, nowLabel = null) {
    ctx.fillStyle = '#0a0a50'
    ctx.fillRect(0, y, GW, TIME_H)
    if (nowLabel) {
        ctx.fillStyle = 'white'
        ctx.font = 'bold 14px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(nowLabel, CH_COL / 2, y + TIME_H / 2)
    }
    drawTimeLabels(ctx, slots, y + TIME_H / 2, tz)
}

function drawGridLines(ctx, startY, height) {
    ctx.fillStyle = '#3344aa'
    ctx.fillRect(CH_COL, startY, 1, height)
    for (let i = 1; i < N_SLOTS; i++) {
        ctx.fillRect(CH_COL + i * SLOT_W, startY, 1, height)
    }
}

function drawChannelRow(ctx, ch, lineups, y, windowStartMs, windowEndMs, iconMap, rowIdx) {
    const windowDurMs = windowEndMs - windowStartMs
    const contentW    = GW - CH_COL

    ctx.fillStyle = rowIdx % 2 === 0 ? '#0f0f50' : '#080840'
    ctx.fillRect(0, y, GW, ROW_H)
    ctx.fillStyle = '#3344aa'
    ctx.fillRect(0, y + ROW_H - 1, GW, 1)
    ctx.fillRect(CH_COL, y, 1, ROW_H - 1)  // logo column right edge — always fixed

    const img = iconMap[ch.number]
    if (img) {
        const pad = 4, maxW = CH_COL - pad * 2, maxH = ROW_H - pad * 2
        const scale = Math.min(maxW / img.width, maxH / img.height)
        const iw = Math.round(img.width * scale), ih = Math.round(img.height * scale)
        ctx.drawImage(img, Math.round(pad + (maxW - iw) / 2), Math.round(y + pad + (maxH - ih) / 2), iw, ih)
    } else {
        ctx.textBaseline = 'top'; ctx.textAlign = 'left'
        ctx.fillStyle = '#aaddff'; ctx.font = 'bold 13px monospace'
        ctx.fillText(String(ch.number).substring(0, 4), 4, y + 10)
        ctx.fillStyle = 'white'; ctx.font = '11px monospace'
        const name = String(ch.name || '')
        ctx.fillText(name.substring(0, 12), 4, y + 28)
        if (name.length > 12) ctx.fillText(name.substring(12, 24), 4, y + 44)
    }

    const lineup = (lineups[ch.number] || []).filter(p => !p.isOffline)
    for (const prog of lineup) {
        const ps = new Date(prog.start).getTime()
        const pe = new Date(prog.stop).getTime()
        if (ps >= windowEndMs || pe <= windowStartMs) continue
        const x1 = CH_COL + Math.round((Math.max(ps, windowStartMs) - windowStartMs) / windowDurMs * contentW)
        const x2 = CH_COL + Math.round((Math.min(pe, windowEndMs)   - windowStartMs) / windowDurMs * contentW)
        const cellW = x2 - x1
        if (cellW < 2) continue
        ctx.fillStyle = '#3344aa'; ctx.fillRect(x1, y, 1, ROW_H - 1)
        const textW = cellW - 6
        if (textW < 10) continue

        // Title — up to 2 word-wrapped lines
        const charsPerLine = Math.floor(textW / 8.4)
        if (charsPerLine >= 1) {
            const title = String(prog.title || '')
            ctx.fillStyle = 'white'; ctx.font = '14px monospace'
            ctx.textBaseline = 'top'; ctx.textAlign = 'left'
            if (title.length <= charsPerLine) {
                ctx.fillText(title, x1 + 3, y + 8)
            } else {
                let cut = title.lastIndexOf(' ', charsPerLine)
                if (cut < 1) cut = charsPerLine
                ctx.fillText(title.substring(0, cut), x1 + 3, y + 8)
                const rest = title.substring(cut + (title[cut] === ' ' ? 1 : 0))
                ctx.fillText(rest.substring(0, charsPerLine), x1 + 3, y + 25)
            }
        }

        if (textW < 48) continue

        // Episode title
        if (prog.sub?.title) {
            ctx.fillStyle = '#aaaacc'; ctx.font = '12px monospace'
            ctx.fillText(String(prog.sub.title).substring(0, Math.floor(textW / 7.2)), x1 + 3, y + 44)
        }

        // Season / episode number
        if (prog.sub?.season != null) {
            ctx.fillStyle = '#777799'; ctx.font = '11px monospace'
            ctx.fillText(`S${prog.sub.season}E${prog.sub.episode}`, x1 + 3, y + 59)
        }
    }
}

function drawChannelRows(ctx, channels, lineups, startY, rowsH, windowStartMs, windowEndMs, iconMap) {
    const cycleH = channels.length * ROW_H
    const reps   = Math.ceil(rowsH / cycleH)
    for (let rep = 0; rep < reps; rep++) {
        for (let r = 0; r < channels.length; r++) {
            const y = startY + rep * cycleH + r * ROW_H
            if (y >= startY + rowsH) break
            drawChannelRow(ctx, channels[r], lineups, y, windowStartMs, windowEndMs, iconMap, r)
        }
    }
}

// Normal guide canvas for steady-state loops. pinnedH = HEADER_H (28px).
async function buildGuideCanvas(channels, lineups, now, tz, iconMap) {
    const slots        = getSlotsAt(now, tz)
    const windowStartMs = slots[0].getTime()
    const windowEndMs   = windowStartMs + N_SLOTS * 30 * 60 * 1000
    const cycleH = channels.length > 0 ? channels.length * ROW_H : VISIBLE_CH_H
    const reps   = channels.length > 0 ? Math.max(2, Math.ceil((VISIBLE_CH_H + cycleH) / cycleH) + 1) : 1
    const rowsH  = reps * cycleH
    const totalH = HEADER_H + rowsH

    const canvas = createCanvas(W, totalH)
    const ctx    = canvas.getContext('2d')
    ctx.fillStyle = '#0a0a3a'; ctx.fillRect(0, 0, W, totalH)
    ctx.translate(SAFE_L, 0)
    drawTimeBar(ctx, HDR_H, slots, tz, hhmm(now, tz))
    drawGridLines(ctx, HDR_H, totalH - HDR_H)
    if (channels.length > 0) {
        drawChannelRows(ctx, channels, lineups, HEADER_H, rowsH, windowStartMs, windowEndMs, iconMap)
    }

    const pngBuf = canvas.toBuffer('image/png')
    const base   = path.join(os.tmpdir(), `coax-guide-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    fs.writeFileSync(base + '.png', pngBuf)
    return { base, rowsH, cycleH }
}

// Approach canvas — pinnedH = HEADER_H (28px).
// Old time bar stays LOCKED at the top throughout.
// New time bar is in the scrolling content at position oldRowsH, so it enters
// the viewport from the bottom and arrives at y=28 when scroll = oldRowsH.
// oldRowsH must be >= VISIBLE_CH_H so the new bar starts below the viewport.
async function buildApproachCanvas(channels, lineups, currentSlots, nextSlots, oldRowsH, tz, iconMap) {
    const windowOldStartMs = currentSlots[0].getTime()
    const windowOldEndMs   = windowOldStartMs + N_SLOTS * 30 * 60 * 1000
    const windowNewStartMs = nextSlots[0].getTime()
    const windowNewEndMs   = windowNewStartMs + N_SLOTS * 30 * 60 * 1000
    const cycleH   = channels.length > 0 ? channels.length * ROW_H : VISIBLE_CH_H
    const newReps  = Math.max(2, Math.ceil((VISIBLE_CH_H + cycleH) / cycleH) + 1)
    const newRowsH = newReps * cycleH
    const rowsH    = oldRowsH + TIME_H + newRowsH
    const totalH   = HEADER_H + rowsH

    const canvas = createCanvas(W, totalH)
    const ctx    = canvas.getContext('2d')
    ctx.fillStyle = '#0a0a3a'; ctx.fillRect(0, 0, W, totalH)
    ctx.translate(SAFE_L, 0)
    drawTimeBar(ctx, HDR_H, currentSlots, tz)   // old time bar — PINNED
    drawGridLines(ctx, HDR_H, totalH - HDR_H)
    if (oldRowsH > 0 && channels.length > 0) {
        drawChannelRows(ctx, channels, lineups, HEADER_H, oldRowsH, windowOldStartMs, windowOldEndMs, iconMap)
    }
    drawTimeBar(ctx, HEADER_H + oldRowsH, nextSlots, tz)  // new time bar — scrolls in
    if (channels.length > 0) {
        drawChannelRows(ctx, channels, lineups, HEADER_H + oldRowsH + TIME_H, newRowsH,
            windowNewStartMs, windowNewEndMs, iconMap)
    }

    const pngBuf = canvas.toBuffer('image/png')
    const base   = path.join(os.tmpdir(), `coax-guide-appr-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    fs.writeFileSync(base + '.png', pngBuf)
    return { base, rowsH, cycleH }
}

// Push canvas — pinnedH = HDR_H (4px). Only the thin top strip is pinned.
// Scrolling content layout (relative to top of scroll area at y=4):
//   [old time bar  24px]   ← at viewport top at t=0, exits above y=4 as video plays
//   [new time bar  24px]   ← arrives at viewport top (y=4) when scroll = TIME_H
//   [new channel rows]
//
// Duration = TIME_H / SCROLL_PX_PER_SEC ≈ 0.63s. Both bars are visible
// simultaneously as the old one slides off and the new one slides into place.
// The handoff to next.ts is seamless: new bar at y=4 in both the last push
// frame (scroll viewport top) and the first next.ts frame (pinned area).
async function buildPushCanvas(channels, lineups, currentSlots, nextSlots, tz, iconMap) {
    const windowNewStartMs = nextSlots[0].getTime()
    const windowNewEndMs   = windowNewStartMs + N_SLOTS * 30 * 60 * 1000
    const cycleH   = channels.length > 0 ? channels.length * ROW_H : VISIBLE_CH_H
    const newReps  = Math.max(2, Math.ceil((VISIBLE_CH_H + cycleH) / cycleH) + 1)
    const newRowsH = newReps * cycleH
    const rowsH    = TIME_H + TIME_H + newRowsH   // old bar + new bar + new rows
    const totalH   = HDR_H + rowsH

    const canvas = createCanvas(W, totalH)
    const ctx    = canvas.getContext('2d')
    ctx.fillStyle = '#0a0a3a'; ctx.fillRect(0, 0, W, totalH)
    ctx.translate(SAFE_L, 0)
    drawGridLines(ctx, HDR_H, totalH - HDR_H)
    drawTimeBar(ctx, HDR_H,          currentSlots, tz) // old bar — exits top
    drawTimeBar(ctx, HDR_H + TIME_H, nextSlots,    tz) // new bar — slides into place
    if (channels.length > 0) {
        drawChannelRows(ctx, channels, lineups, HDR_H + 2 * TIME_H, newRowsH,
            windowNewStartMs, windowNewEndMs, iconMap)
    }

    const pngBuf = canvas.toBuffer('image/png')
    const base   = path.join(os.tmpdir(), `coax-guide-push-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    fs.writeFileSync(base + '.png', pngBuf)
    return { base, rowsH, cycleH }
}

// Encodes a PNG to MPEG-TS of exactly `duration` seconds.
// pinnedH: pixels locked at top (HEADER_H=28 for normal/approach, HDR_H=4 for push).
function encodeVideo({ pngPath, tsPath, rowsH, duration, pinnedH = HEADER_H, ffmpegPath, vEncoder, aEncoder }) {
    const visibleH    = H - pinnedH
    const scrollSpeed = (SCROLL_PX_PER_SEC / (FPS * rowsH)).toFixed(8)
    const filterGraph = [
        `[0:v]split=2[a][b]`,
        `[a]crop=${W}:${pinnedH}:0:0[hdr]`,
        `[b]crop=${W}:${rowsH}:0:${pinnedH},scroll=v=${scrollSpeed}:h=0,crop=${W}:${visibleH}:0:0[rows]`,
        `[hdr][rows]vstack[out]`,
    ].join(';')

    return new Promise((resolve, reject) => {
        const ff = spawn(ffmpegPath, [
            '-r', String(FPS), '-loop', '1', '-i', pngPath,
            '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
            '-filter_complex', filterGraph,
            '-map', '[out]', '-map', '1:a',
            '-c:v', vEncoder, '-preset', 'ultrafast',
            ...(vEncoder === 'libx264' ? ['-tune', 'zerolatency'] : []),
            '-g', String(FPS), '-maxrate', '2000k', '-bufsize', '4000k',
            '-c:a', aEncoder, '-t', String(duration), '-y', tsPath,
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
            // ?testIn=N fakes `now` to be N seconds before the next real half-hour,
            // so the transition plays out quickly without waiting for a real rollover.
            // Pass at least 15s to guarantee canAnimate=true and see the full push.
            const realNow      = new Date()
            const now          = req.query.testIn
                ? new Date(getNextHalfHour(realNow, tz).getTime() - parseFloat(req.query.testIn) * 1000)
                : realNow
            const nextHalfHour = getNextHalfHour(now, tz)
            const currentSlots = getSlotsAt(now, tz)
            const nextSlots    = getSlotsAt(nextHalfHour, tz)

            const from = new Date(now.getTime() - 30 * 60 * 1000).toISOString()
            const to   = new Date(nextHalfHour.getTime() + N_SLOTS * 30 * 60 * 1000).toISOString()

            let channels = [], lineups = {}
            try {
                const nums = await channelService.getAllChannelNumbers()
                channels = (await Promise.all(nums.map(n => channelService.getChannel(n))))
                    .filter(Boolean).sort((a, b) => a.number - b.number)
                await Promise.all(channels.map(async ch => {
                    try {
                        const data = await fetchJson(
                            `http://localhost:${port}/api/guide/channels/${ch.number}` +
                            `?dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}`)
                        lineups[ch.number] = data.programs || []
                    } catch { lineups[ch.number] = [] }
                }))
            } catch (e) { console.error('[guide-channel] data fetch failed:', e.message) }

            const iconCache = {}
            await Promise.allSettled(channels.filter(ch => ch.icon).map(async ch => {
                const url = resolveIcon(ch.icon, port)
                if (!url) return
                try { iconCache[ch.number] = await loadImage(url) } catch {}
            }))

            const cycleH       = channels.length > 0 ? channels.length * ROW_H : VISIBLE_CH_H
            const loopDuration = cycleH / SCROLL_PX_PER_SEC
            const pushDuration = TIME_H / SCROLL_PX_PER_SEC  // ≈ 0.578s, constant

            // ── Transition timing ─────────────────────────────────────────────────
            // The full two-phase animation needs at least (VISIBLE_CH_H + TIME_H) / 38 ≈ 12.53s
            // from the switch point to the half-hour. Using Math.floor (not ceil) guarantees
            // the switch happens early enough that timeFromSwitchToHalf >= 11.84s, which in
            // turn guarantees the new time bar starts below the viewport.
            const secUntilHalfHour   = (nextHalfHour.getTime() - now.getTime()) / 1000
            const minTransDuration   = (VISIBLE_CH_H + TIME_H) / SCROLL_PX_PER_SEC  // ≈ 11.84s
            const secUntilSwitch     = secUntilHalfHour - minTransDuration
            const numCurrentLoops    = Math.floor(Math.max(0, secUntilSwitch) / loopDuration)
            const timeFromSwitchToHalf = secUntilHalfHour - numCurrentLoops * loopDuration
            // canAnimate: true whenever we have >= 11.84s from switch to half-hour
            // (always true when secUntilHalfHour >= 11.84s; false only on near-instant connection)
            const canAnimate = timeFromSwitchToHalf >= minTransDuration

            // oldRowsH: exact pixels of old-window rows in the approach canvas before the
            // new time bar. With Math.floor above, oldRowsH >= VISIBLE_CH_H (bar enters
            // from below the viewport). Not rounded to cycle boundaries — drawChannelRows
            // tiles correctly for any height.
            const oldRowsH         = canAnimate ? Math.round(timeFromSwitchToHalf * SCROLL_PX_PER_SEC - TIME_H) : 0
            const approachDuration = canAnimate ? oldRowsH / SCROLL_PX_PER_SEC : 0

            // ── Build and encode all segments ──────────────────────────────────────
            const cur = await buildGuideCanvas(channels, lineups, now, tz, iconCache)
            tmpFiles.push(cur.base + '.png', cur.base + '.ts')
            await encodeVideo({ pngPath: cur.base + '.png', tsPath: cur.base + '.ts',
                rowsH: cur.rowsH, duration: loopDuration, ffmpegPath, vEncoder, aEncoder })

            const nxt = await buildGuideCanvas(channels, lineups, nextHalfHour, tz, iconCache)
            tmpFiles.push(nxt.base + '.png', nxt.base + '.ts')
            await encodeVideo({ pngPath: nxt.base + '.png', tsPath: nxt.base + '.ts',
                rowsH: nxt.rowsH, duration: loopDuration, ffmpegPath, vEncoder, aEncoder })

            let appr = null, push = null
            if (canAnimate) {
                appr = await buildApproachCanvas(channels, lineups, currentSlots, nextSlots, oldRowsH, tz, iconCache)
                tmpFiles.push(appr.base + '.png', appr.base + '.ts')
                await encodeVideo({ pngPath: appr.base + '.png', tsPath: appr.base + '.ts',
                    rowsH: appr.rowsH, duration: approachDuration, ffmpegPath, vEncoder, aEncoder })

                push = await buildPushCanvas(channels, lineups, currentSlots, nextSlots, tz, iconCache)
                tmpFiles.push(push.base + '.png', push.base + '.ts')
                await encodeVideo({ pngPath: push.base + '.png', tsPath: push.base + '.ts',
                    rowsH: push.rowsH, duration: pushDuration, pinnedH: HDR_H, ffmpegPath, vEncoder, aEncoder })
            }

            // ── Concat playlist ────────────────────────────────────────────────────
            const playlistPath = path.join(os.tmpdir(),
                `coax-guide-pl-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`)
            tmpFiles.push(playlistPath)
            const lines = ['ffconcat version 1.0']
            for (let i = 0; i < numCurrentLoops; i++) lines.push(`file '${cur.base}.ts'`)
            if (canAnimate) {
                lines.push(`file '${appr.base}.ts'`)
                lines.push(`file '${push.base}.ts'`)
            }
            for (let i = 0; i < 500; i++) lines.push(`file '${nxt.base}.ts'`)
            fs.writeFileSync(playlistPath, lines.join('\n'))

            // ── Stream (still -c copy, near-zero CPU) ─────────────────────────────
            const ff = spawn(ffmpegPath, [
                '-re', '-f', 'concat', '-safe', '0', '-i', playlistPath,
                '-c', 'copy', '-f', 'mpegts', 'pipe:1',
            ], { stdio: ['pipe', 'pipe', 'pipe'] })

            ff.stdout.pipe(res, { end: false })
            let stderrBuf = ''
            ff.stderr.on('data', d => { stderrBuf += d; if (stderrBuf.length > 5000) stderrBuf = stderrBuf.slice(-2500) })
            ff.on('close', code => { if (code !== 0 && stderrBuf) console.error('[guide-channel] stream exit', code, stderrBuf.slice(-300)) })
            ff.on('error', err => console.error('[guide-channel] stream error:', err.message))
            res.on('close', () => { try { ff.kill() } catch {} cleanup() })

        } catch (e) {
            console.error('[guide-channel] startup error:', e.message)
            cleanup()
            res.end()
        }
    }
}
