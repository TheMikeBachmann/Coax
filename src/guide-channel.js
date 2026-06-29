const { spawn } = require('child_process')
const { createCanvas, loadImage } = require('@napi-rs/canvas')
const http = require('http')

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
const REFRESH_SEC = 30
const FPS = 10
const FRAME_MS = 1000 / FPS
const FRAMES_PER_REFRESH = FPS * REFRESH_SEC

function hhmm(date, tz) {
    const fmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz })
    return fmt.format(date).replace(':00', '').replace(' ', ' ')
}

function getSlotsAt(date, tz) {
    const parts = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric', minute: 'numeric', hour12: false, timeZone: tz
    }).formatToParts(date)
    const minutes = parseInt(parts.find(p => p.type === 'minute').value)
    const t0 = new Date(date)
    t0.setSeconds(0, 0)
    t0.setMilliseconds(0)
    const msToSubtract = (minutes % 30) * 60 * 1000
    t0.setTime(t0.getTime() - msToSubtract)
    return Array.from({ length: N_SLOTS }, (_, i) =>
        new Date(t0.getTime() + i * 30 * 60 * 1000)
    )
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

// Convert a relative icon path (/images/...) to an absolute localhost URL.
function resolveIcon(icon, port) {
    if (!icon) return null
    if (icon.startsWith('http://') || icon.startsWith('https://')) return icon
    return `http://localhost:${port}${icon.startsWith('/') ? '' : '/'}${icon}`
}

// Builds a tall canvas: HEADER_H header + all channel rows.
// Returns { canvas, rowsH, cycleH }.
async function buildGuideCanvas(channels, lineups, now, port, tz, iconMap) {
    const slots = getSlotsAt(now, tz)

    // Repeat the channel list enough times that the canvas is always taller than
    // the visible area, enabling seamless infinite scrolling regardless of how
    // few channels there are.  The scroll modulo is cycleH (one full repetition)
    // so scrollY=0 and scrollY=cycleH show identical content → no visible seam.
    const cycleH = channels.length > 0 ? channels.length * ROW_H : VISIBLE_CH_H
    const reps = channels.length > 0
        ? Math.max(2, Math.ceil((VISIBLE_CH_H + cycleH) / cycleH) + 1)
        : 1
    const rowsH = reps * cycleH
    const totalH = HEADER_H + rowsH
    const canvas = createCanvas(W, totalH)
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = '#0a0a3a'
    ctx.fillRect(0, 0, W, totalH)

    // ── Header bar ──
    ctx.fillStyle = '#1a1a6a'
    ctx.fillRect(0, 0, W, HDR_H)
    ctx.fillStyle = 'yellow'
    ctx.font = 'bold 15px monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('PROGRAM GUIDE', 8, HDR_H / 2)

    // ── Time-slot bar ──
    ctx.fillStyle = '#0a0a50'
    ctx.fillRect(0, HDR_H, W, TIME_H)

    // Column dividers — start below the title bar, extend through time-slot row and all channel rows
    ctx.fillStyle = '#3344aa'
    ctx.fillRect(CH_COL, HDR_H, 1, totalH - HDR_H)
    for (let i = 1; i < N_SLOTS; i++) {
        ctx.fillRect(CH_COL + i * SLOT_W, HDR_H, 1, totalH - HDR_H)
    }

    // ── Channel rows (repeated reps times for seamless infinite scroll) ──
    for (let rep = 0; rep < reps; rep++) {
        for (let r = 0; r < channels.length; r++) {
            const ch = channels[r]
            const y = HEADER_H + (rep * channels.length + r) * ROW_H

            ctx.fillStyle = r % 2 === 0 ? '#0f0f50' : '#080840'
            ctx.fillRect(0, y, W, ROW_H)
            ctx.fillStyle = '#3344aa'
            ctx.fillRect(0, y + ROW_H - 1, W, 1)

            const img = iconMap[ch.number]
            if (img) {
                // Fit icon centered in the full row slot
                const pad = 2
                const maxW = CH_COL - pad * 2
                const maxH = ROW_H - pad * 2
                const scale = Math.min(maxW / img.width, maxH / img.height)
                const iw = Math.round(img.width * scale)
                const ih = Math.round(img.height * scale)
                const ix = Math.round(pad + (maxW - iw) / 2)
                const iy = Math.round(y + pad + (maxH - ih) / 2)
                ctx.drawImage(img, ix, iy, iw, ih)
            } else {
                ctx.textBaseline = 'top'
                ctx.textAlign = 'left'
                ctx.fillStyle = '#aaddff'
                ctx.font = '10px monospace'
                ctx.fillText(String(ch.number).substring(0, 4), 3, y + 4)
                ctx.fillStyle = 'white'
                ctx.fillText(String(ch.name || '').substring(0, 9), 3, y + 18)
            }

            const lineup = lineups[ch.number] || []
            for (let s = 0; s < N_SLOTS; s++) {
                const slotStart = slots[s].getTime()
                const slotEnd = slotStart + 30 * 60 * 1000
                const prog = lineup.find(p => {
                    const ps = new Date(p.start).getTime()
                    const pe = new Date(p.stop).getTime()
                    return ps < slotEnd && pe > slotStart
                })
                const px = CH_COL + s * SLOT_W + 3
                ctx.fillStyle = 'white'
                ctx.font = '11px monospace'
                ctx.textBaseline = 'top'
                ctx.fillText(String(prog?.title || 'Off Air').substring(0, 16), px, y + 8)
                if (prog?.sub?.season) {
                    ctx.fillStyle = '#888888'
                    ctx.font = '9px monospace'
                    ctx.fillText(`S${prog.sub.season}E${prog.sub.episode}`.substring(0, 8), px, y + 22)
                }
            }
        }
    }

    return { canvas, rowsH, cycleH }
}

module.exports = function guideChannelHandler(channelService, db, port) {
    return async function(req, res) {
        res.writeHead(200, {
            'Content-Type': 'video/mp2t',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Range',
        })

        let stopped = false
        const tz = req.query.tz || 'UTC'

        const ffmpegSettings = db['ffmpeg-settings'].find()[0] || {}
        const ffmpegPath = ffmpegSettings.ffmpegPath || 'ffmpeg'
        const vEncoder = ffmpegSettings.videoEncoder || 'libx264'
        const aEncoder = ffmpegSettings.audioEncoder || 'aac'

        // Single long-running ffmpeg fed raw RGBA frames via stdin.
        // No process restarts = no PTS discontinuities.
        const ff = spawn(ffmpegPath, [
            '-f', 'rawvideo',
            '-pixel_format', 'rgba',
            '-video_size', `${W}x${H}`,
            '-framerate', String(FPS),
            '-i', 'pipe:0',
            '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
            '-map', '0:v',
            '-map', '1:a',
            '-c:v', vEncoder,
            '-preset', 'ultrafast',
            ...(vEncoder === 'libx264' ? ['-tune', 'zerolatency'] : []),
            '-g', String(FPS),
            '-c:a', aEncoder,
            '-f', 'mpegts', 'pipe:1',
        ], { stdio: ['pipe', 'pipe', 'pipe'] })

        ff.stdout.pipe(res, { end: false })
        let stderrBuf = ''
        ff.stderr.on('data', d => { stderrBuf += d })
        ff.on('close', code => {
            stopped = true
            if (code !== 0 && stderrBuf) console.error('[guide-channel] ffmpeg exit', code, stderrBuf.slice(-500))
        })
        ff.on('error', err => {
            stopped = true
            console.error('[guide-channel] ffmpeg error:', err.message)
        })
        res.on('close', () => {
            stopped = true
            try { ff.stdin.end() } catch {}
        })

        // Reusable 704×480 frame canvas
        const frameCanvas = createCanvas(W, H)
        const frameCtx = frameCanvas.getContext('2d')

        let guideCanvas = null
        let guideCycleH = VISIBLE_CH_H  // scroll modulo: one full channel-list repetition
        let refreshing = false
        let frameIndex = 0
        const iconCache = {}

        async function refreshGuide() {
            if (refreshing) return
            refreshing = true
            try {
                const now = new Date()
                const from = now.toISOString()
                const to = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString()
                let channels = []
                let lineups = {}
                try {
                    const nums = await channelService.getAllChannelNumbers()
                    channels = (await Promise.all(nums.map(n => channelService.getChannel(n))))
                        .filter(Boolean)
                        .sort((a, b) => a.number - b.number)
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
                    console.error('[guide-channel] Failed to fetch data:', e.message)
                }

                // Load icons only for channels not already cached
                await Promise.allSettled(
                    channels.filter(ch => ch.icon && !iconCache[ch.number]).map(async ch => {
                        const url = resolveIcon(ch.icon, port)
                        if (!url) return
                        try { iconCache[ch.number] = await loadImage(url) } catch {}
                    })
                )
                // Evict icons for channels no longer present
                const activeNums = new Set(channels.map(ch => ch.number))
                for (const num of Object.keys(iconCache)) {
                    if (!activeNums.has(parseInt(num))) delete iconCache[num]
                }

                guideCanvas = null  // release old native memory before allocating new canvas
                const result = await buildGuideCanvas(channels, lineups, now, port, tz, iconCache)
                guideCanvas = result.canvas
                guideCycleH = result.cycleH
            } catch (e) {
                console.error('[guide-channel] refreshGuide error:', e.message)
            } finally {
                refreshing = false
            }
        }

        function renderFrame() {
            if (!guideCanvas) return null
            const t = frameIndex / FPS
            const scrollY = guideCycleH > 0 ? (t * SCROLL_PX_PER_SEC) % guideCycleH : 0

            frameCtx.fillStyle = '#0a0a3a'
            frameCtx.fillRect(0, 0, W, H)
            // Scrolled channel rows
            frameCtx.drawImage(guideCanvas, 0, HEADER_H + scrollY, W, VISIBLE_CH_H, 0, HEADER_H, W, VISIBLE_CH_H)
            // Pinned header
            frameCtx.drawImage(guideCanvas, 0, 0, W, HEADER_H, 0, 0, W, HEADER_H)

            // Time-row labels: slide in new half-hour set for 4s after each rollover
            const now = new Date()
            const totalMs = (now.getMinutes() * 60 + now.getSeconds()) * 1000 + now.getMilliseconds()
            const msSinceRollover = totalMs % (30 * 60 * 1000)
            const ANIM_MS = 4000
            const progress = msSinceRollover < ANIM_MS ? msSinceRollover / ANIM_MS : 1
            const curSlots = getSlotsAt(now, tz)
            frameCtx.save()
            frameCtx.beginPath()
            frameCtx.rect(0, HDR_H, W, TIME_H)
            frameCtx.clip()
            if (progress < 1) {
                const prevSlots = curSlots.map(s => new Date(s.getTime() - 30 * 60 * 1000))
                drawTimeLabels(frameCtx, prevSlots, HDR_H + TIME_H / 2 - progress * TIME_H, tz)
                drawTimeLabels(frameCtx, curSlots, HDR_H + TIME_H / 2 + (1 - progress) * TIME_H, tz)
            } else {
                drawTimeLabels(frameCtx, curSlots, HDR_H + TIME_H / 2, tz)
            }
            frameCtx.restore()

            return Buffer.from(frameCtx.getImageData(0, 0, W, H).data.buffer)
        }

        // Load guide data before starting the frame loop
        await refreshGuide()

        function rolloverKey(date) {
            const parts = new Intl.DateTimeFormat('en-US', {
                hour: 'numeric', minute: 'numeric', hour12: false, timeZone: tz
            }).formatToParts(date)
            const h = parts.find(p => p.type === 'hour').value
            const m = parseInt(parts.find(p => p.type === 'minute').value)
            return `${h}:${m < 30 ? '00' : '30'}`
        }

        let lastRolloverKey = rolloverKey(new Date())

        function scheduleNextFrame() {
            if (stopped) return
            const frameStart = Date.now()

            // Refresh at each half-hour boundary so data matches the new labels
            const checkNow = new Date()
            const key = rolloverKey(checkNow)
            if (key !== lastRolloverKey) {
                lastRolloverKey = key
                refreshGuide().catch(e => console.error('[guide-channel] rollover refresh error:', e.message))
            }

            // Also refresh every REFRESH_SEC frames
            if (frameIndex > 0 && frameIndex % FRAMES_PER_REFRESH === 0) {
                refreshGuide().catch(e => console.error('[guide-channel] periodic refresh error:', e.message))
            }

            let frame
            try { frame = renderFrame() } catch (e) {
                console.error('[guide-channel] renderFrame error:', e.message)
            }
            if (frame && !ff.stdin.destroyed) {
                frameIndex++
                const ok = ff.stdin.write(frame)
                const elapsed = Date.now() - frameStart
                const delay = Math.max(0, FRAME_MS - elapsed)
                if (ok) {
                    setTimeout(scheduleNextFrame, delay)
                } else {
                    ff.stdin.once('drain', () => { if (!stopped) scheduleNextFrame() })
                }
            } else {
                setTimeout(scheduleNextFrame, FRAME_MS)
            }
        }

        scheduleNextFrame()
    }
}
