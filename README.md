# Music

**Live site:** [https://talrme.github.io/music](https://talrme.github.io/music)

A static, mobile-first web player for your own tracks: playlists, a reorderable queue, optional lyrics, themes, and a shareable URL that encodes the queue.

## Run locally

Browsers often block audio on `file://`. Serve the folder over HTTP:

```bash
cd music
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Add your music

1. Put MP3s in `audio/` and cover images in `covers/` (or use full URLs in `catalog.json`).
2. Edit **`catalog.json`**:
   - **`songs`**: each entry needs a unique **`id`**, **`title`**, **`audio`** path (or URL), **`cover`** path (or URL), and optionally **`lyrics`** (string) or **`lyricsFile`** (path to a `.txt` file under `lyrics/`).
   - **`playlists`**: each has **`id`**, **`name`**, and **`songIds`** (array of song `id`s in play order).

## URL state

The queue and current track are reflected in the query string:

- **`q`** — comma-separated song IDs (queue order).
- **`i`** — zero-based index of the current track in that queue.
- Theme, accent, panel toggles, lyrics visibility, and optional **custom queue panel title** (`qLabel`) are also kept in the link when you use **Queue options → Copy link for sharing**.

Example: `?q=track-a,track-b&i=0`

Bookmarks and that menu action preserve the same queue for sharing.

## Project layout

| Path | Purpose |
|------|---------|
| `index.html` | Page shell |
| `styles.css` | Layout, themes, vinyl UI |
| `app.js` | Player, queue, playlists, URL sync |
| `catalog.json` | Playlists and song metadata |
| `audio/` | MP3 files |
| `covers/` | Album art |
| `lyrics/` | Optional `.txt` lyrics |

## Features (short)

- Playlists (accordion) and a **queue** with drag handles (or touch reorder on mobile).
- **Click a playlist song** to load the **whole playlist** into the queue and **start playback on that track**.
- **Playlist** “now playing” highlight only when the queue was started by **clicking a song** in that playlist; using **Add to queue** clears that context.
- Dark/light theme and accent color (saved in the browser).
- Optional lyrics panel when a song defines lyrics or a lyrics file.

## License

Your content (audio, art, lyrics) stays yours. The site code is yours to use as you like.
