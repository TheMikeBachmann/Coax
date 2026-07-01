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

function resolveIcon(icon, port) {
    if (!icon) return null
    if (icon.startsWith('http://') || icon.startsWith('https://')) return icon
    return `http://localhost:${port}${icon.startsWith('/') ? '' : '/'}${icon}`
}

// Renders the full guide to a temp PNG file for FFmpeg to read.
// Returns { tmpPath, rowsH, cycleH, totalH }.
// The canvas is discarded after PNG export so no Skia/Rust memory lingers.
async function buildGuideCanvas(channels, lineups, now, port, tz, iconMap) {
    const slots = getSlotsAt(now, tz)

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

    ctx.fillStyle = '#3344aa'
    ctx.fillRect(CH_COL, HDR_H, 1, totalH - HDR_H)
    for (let i = 1; i < N_SLOTS; i++) {
        ctx.fillRect(CH_COL + i * SLOT_W, HDR_H, 1, totalH - HDR_H)
    }

    // ── Channel rows ──
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

    drawTimeLabels(ctx, slots, HDR_H + TIME_H / 2, tz)

    // Write to a temp PNG file; FFmpeg reads this with -loop 1 and its
    // scroll filter handles frame generation — no raw video pipe needed.
    const pngBuf = canvas.toBuffer('image/png')
    const tmpPath = path.join(os.tmpdir(), `coax-guide-${Date.now()}-${Math.random().toString(36).slice(2)}.png`)
    fs.writeFileSync(tmpPath, pngBuf)
    return { tmpPath, rowsH, cycleH, totalH }
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
        const vEncoder = ffmpegSettings.videoEncoder || 'libx264'
        const aEncoder = ffmpegSettings.audioEncoder || 'aac'

        // Build guide canvas and fetch channel data once per session.
        const iconCache = {}
        let tmpPath = null

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

            await Promise.allSettled(
                channels.filter(ch => ch.icon).map(async ch => {
                    const url = resolveIcon(ch.icon, port)
                    if (!url) return
                    try { iconCache[ch.number] = await loadImage(url) } catch {}
                })
            )

            const result = await buildGuideCanvas(channels, lineups, now, port, tz, iconCache)
            tmpPath = result.tmpPath

            // FFmpeg reads the static PNG with -loop 1 and its scroll filter
            // advances the viewport each frame internally.  P-frames for a slowly
            // scrolling scene are near-free (just a vertical motion vector), so
            // CPU is a fraction of what raw-video-pipe encoding costs.
            //
            // Filter graph:
            //   split the full guide image into header (pinned) and channel rows
            //   (scrolling), crop the visible window, stack them back together.
            const scrollSpeed = (SCROLL_PX_PER_SEC / (FPS * result.rowsH)).toFixed(8)
            const filterGraph = [
                `[0:v]split=2[a][b]`,
                `[a]crop=${W}:${HEADER_H}:0:0[hdr]`,
                `[b]crop=${W}:${result.rowsH}:0:${HEADER_H},scroll=v=${scrollSpeed}:h=0,crop=${W}:${VISIBLE_CH_H}:0:0[rows]`,
                `[hdr][rows]vstack[out]`,
            ].join(';')

            const ff = spawn(ffmpegPath, [
                '-r', String(FPS),
                '-loop', '1',
                '-i', tmpPath,
                '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
                '-filter_complex', filterGraph,
                '-map', '[out]',
                '-map', '1:a',
                '-c:v', vEncoder,
                '-preset', 'ultrafast',
                ...(vEncoder === 'libx264' ? ['-tune', 'zerolatency'] : []),
                '-g', String(FPS),
                '-maxrate', '2000k',
                '-bufsize', '4000k',
                '-c:a', aEncoder,
                '-flush_packets', '1',
                '-f', 'mpegts', 'pipe:1',
            ], { stdio: ['pipe', 'pipe', 'pipe'] })

            ff.stdout.pipe(res, { end: false })

            let stderrBuf = ''
            ff.stderr.on('data', d => {
                stderrBuf += d
                if (stderrBuf.length > 10000) stderrBuf = stderrBuf.slice(-5000)
            })
            ff.on('close', code => {
                if (code !== 0 && stderrBuf) console.error('[guide-channel] ffmpeg exit', code, stderrBuf.slice(-500))
            })
            ff.on('error', err => console.error('[guide-channel] ffmpeg error:', err.message))

            res.on('close', () => {
                try { ff.kill() } catch {}
                if (tmpPath) { try { fs.unlinkSync(tmpPath) } catch {} }
            })
        } catch (e) {
            console.error('[guide-channel] startup error:', e.message)
            if (tmpPath) { try { fs.unlinkSync(tmpPath) } catch {} }
            res.end()
        }
    }
}
