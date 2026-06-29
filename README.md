# Coax

Create live TV channel streams from media on your Plex servers.

## Features

- Spoofs an HDHomerun tuner and IPTV channel list for Plex, Jellyfin, and Emby
- EPG/XMLTV guide data
- In-browser guide channel with live clock and channel logos
- Filler content (commercials, bumpers, music videos) on a schedule
- Custom shows (curated playlists treated as a show)
- Per-channel watermark/icon overlay
- Time-slot and random-slot scheduling
- Subtitle support
- Auto-deinterlace for interlaced content
- Direct play or ffmpeg transcoding (configurable per channel)
- Hardware encoding support (VideoToolbox on macOS, NVENC on NVIDIA)

## Getting started with Docker

```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/TheMikeBachmann/Coax/main/docker-compose.yml
docker compose up -d
```

Then open `http://localhost:8000`.

To update:

```bash
docker compose pull && docker compose up -d
```

## Running locally

### Requirements

- Node.js 18+
- ffmpeg (must be accessible from your PATH or configured in Settings → FFmpeg)
- A Plex Media Server with content

### Run

```bash
npm install
npm run build
node index.js
```

Then open `http://localhost:8000`.

### Development (hot reload)

```bash
# Terminal 1 — backend
node index.js

# Terminal 2 — frontend (proxies /api and /video to :8000)
npm run dev-client
```

The dev UI will be at `http://localhost:5173`.

## First-time setup

1. **Settings → Plex Servers** — add your Plex server (use the OAuth login button)
2. **Settings → FFmpeg** — set the path to your ffmpeg binary; set Video Encoder to `H.264 — libx264` and Audio Encoder to `AAC — aac` for browser playback
3. **Channels** — create a channel, add content from your Plex library
4. **Player** — select your channel and press Play to test in-browser

## Limitations

- Plex Pass is required to use the spoofed HDHR tuner with Plex
- The in-browser player requires H.264/AAC output; MPEG-2/AC3 is needed for HDHR/Plex DVR — configure the encoder in FFmpeg settings to match your use case

## License

Coax is a fork of [dizqueTV](https://github.com/vexorian/dizquetv) by Victor Hugo Soliz Kuncar, which is itself derived from [pseudotv-plex](https://github.com/DEFENDORe/pseudotv) by Dan Ferguson.

- Original pseudotv-plex code: MIT license © 2020 Dan Ferguson
- dizqueTV improvements: zlib license © 2020 Victor Hugo Soliz Kuncar
- Coax changes: MIT
