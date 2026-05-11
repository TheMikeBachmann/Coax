# dizqueTV

Create live TV channel streams from media on your Plex servers.

This is a fork of [vexorian/dizquetv](https://github.com/vexorian/dizquetv) with the frontend rewritten in React + TypeScript.

## What's different in this fork

- **React frontend** — the original AngularJS UI has been replaced with React 18 + TypeScript + Vite + Tailwind CSS
- **In-browser player** — preview any channel directly in the browser without an external player
- **Hierarchical Plex library browser** — browse by show → season → episode; add an entire show or season with one click
- **H.264 output by default** — configurable video/audio encoder in FFmpeg settings (use `libx264` + `aac` for browser playback, `mpeg2video` + `ac3` for HDHR/Plex DVR)
- **CORS headers on video endpoint** — allows direct browser streaming without proxy buffering

## Getting started

### Requirements

- Node.js 18+
- ffmpeg (must be accessible from your PATH or configured in Settings → FFmpeg)
- A Plex Media Server with content

### Run

```bash
cd dizquetv
npm install
npm run build        # build the React client into web/public
node index.js
```

Then open `http://localhost:8000` in your browser.

### Development (hot reload)

Run the backend and frontend dev server separately:

```bash
# Terminal 1 — backend
node index.js

# Terminal 2 — frontend (proxies /api and /video to :8000)
cd client
npm install
npm run dev
```

The dev UI will be at `http://localhost:5173`.

### First-time setup

1. **Settings → Plex Servers** — add your Plex server (use the OAuth login button)
2. **Settings → FFmpeg** — set the path to your ffmpeg binary; set Video Encoder to `H.264 — libx264` and Audio Encoder to `AAC — aac` for browser playback
3. **Channels** — create a channel, add content from your Plex library
4. **Player** — select your channel and press Play to test in-browser

## Features

- Spoofs an HDHomerun tuner and IPTV channel list for Plex, Jellyfin, and Emby
- EPG/XMLTV guide data
- Filler content (commercials, bumpers, music videos) on a schedule
- Custom shows (curated playlists treated as a show)
- Per-channel watermark/icon overlay
- Time-slot and random-slot scheduling
- Subtitle support
- Auto-deinterlace for interlaced content
- Direct play or ffmpeg transcoding (configurable per channel)
- Hardware encoding support (VideoToolbox on macOS, NVENC on NVIDIA)

## Limitations

- Plex Pass is required to use the spoofed HDHR tuner with Plex
- dizqueTV does not watch Plex for library updates — re-add programs after library changes
- The in-browser player requires H.264/AAC output; MPEG-2/AC3 is needed for HDHR/Plex DVR. Configure the encoder in FFmpeg settings to match your use case.

## License

- Original pseudotv-plex code: [MIT license (c) 2020 Dan Ferguson](https://github.com/DEFENDORe/pseudotv/blob/665e71e24ee5e93d9c9c90545addb53fdc235ff6/LICENSE)
- dizqueTV improvements: zlib license (c) 2020 Victor Hugo Soliz Kuncar
- This fork: MIT
