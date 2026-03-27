# AI_README — context for future work on this repo

This file is for **humans and coding assistants** picking the project up later. The user-facing overview is in **`README.md`**.

## What this is

- **Static site**: `index.html` + `styles.css` + `app.js` + `catalog.json`. **No build step**, no npm, no frameworks.
- **Deployed**: GitHub Pages — repo `talrme/music`, live at **https://talrme.github.io/music** (paths are repo-root relative).
- **Branding**: Header/title is **myMusic**; clicking it runs **`resetAllDefaults()`** (dark theme, default accent, panels on, lyrics off, queue reset to first playlist when catalog is loaded).

## How to run locally

Use HTTP (not `file://` — audio and fetches break):

```bash
cd music && python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Code style (match existing)

- Single **IIFE** in `app.js`, **`"use strict"`**, **`var`** (not `const`/`let` unless you deliberately modernize).
- **`$(id)`** → `document.getElementById`.
- **Theme**: `document.documentElement` uses **`data-theme="dark"` | `"light"`** and CSS variable **`--accent`**.
- **localStorage** keys: `music-theme`, `music-accent` (constants `STORAGE_*` at top of `app.js`).

## State you must keep in sync

| Piece | Where | Notes |
|--------|--------|--------|
| Queue + current index | `state.queue`, `state.currentIndex` | Drives playback and URL `q` / `i` |
| Panel toggles | `ui.showPlaylists`, `ui.showQueue`, `ui.showLyrics` | Bound to `#panel-*` and settings sliders |
| Catalog | `catalog`, `songMap` | Filled after `fetch("catalog.json")` |
| Playlist “context” for EQ highlight | `queuePlaylistContext` | Set when user starts queue from a playlist row; cleared on URL/default load and “Add to queue” |

When adding a new **persisted UI flag**: extend **`parseUiParams()`**, **`applyUiPrefsFromUrlOrStorage()`**, **`syncUrl()`**, **`applyPanelVisibility()`** (or equivalent), **`syncSliderControls()`**, and **`resetAllDefaults()`** if it should reset with the title button.

## URL query string (full contract)

`syncUrl()` writes **`history.replaceState`** with:

| Param | Meaning |
|--------|---------|
| `q` | Comma-separated song IDs (only if queue non-empty) |
| `i` | Current track index (with `q`) |
| `theme` | `dark` or `light` |
| `accent` | 6-char hex **without** `#` |
| `showPl` | `1` / `0` — playlists panel |
| `showQu` | `1` / `0` — queue panel |
| `showLy` | `1` / `0` — lyrics section |
| `qLabel` | Custom queue panel title (**percent-encoded**); omitted when the title is the default `Queue` |

**Init order matters**: `applyUiPrefsFromUrlOrStorage()` runs **before** the catalog fetch finishes and **does not** call `syncUrl()` at the end — so existing `q`/`i` are not wiped. **`syncUrl()`** runs after catalog load (`applyInitialState` → `renderQueue` → `loadTrack` → `syncUrl`) so the full URL is applied once the queue is known.

## Important DOM IDs (non-exhaustive)

- Player: `audio`, `cover-art`, `vinyl`, `btn-play`, `seek`, `volume`, `track-title`, `track-artist`
- Panels: `panel-playlists`, `panel-queue`, `panel-lyrics`, `lyrics-text`
- Settings: `settings-dialog`, `theme-presets`, `accent-picker`, `slider-show-pl`, `slider-show-qu`, `slider-show-ly`, rows `row-show-pl`, etc.
- Header: `btn-app-title`, `btn-settings`

## Settings UX detail

Panel toggles are **`input type="range"`** min/max `0`/`1` step `1`, styled as switches. Class **`settings-slider--on`** mirrors the live value (don’t rely on `[value="…"]` in CSS). **`wireSettingsToggleRow`** lets users tap the **whole row**, not only the thumb.

## Lyrics

- Section **`#panel-lyrics`** in the main column; visibility from **`ui.showLyrics`** (settings + `showLy` URL).
- Content: **`loadLyricsContent(song)`** — inline `song.lyrics` or fetch `song.lyricsFile`; placeholder text if none.

## Known platform limits

- **iOS Safari**: programmatic **`audio.volume`** is ignored; device volume buttons control loudness. Desktop slider works as expected.

## Content model

See **`README.md`** for `catalog.json` shape (`songs`, `playlists`, `lyrics` / `lyricsFile`).

## When editing

- Keep **README.md** in sync if user-visible behavior or URL params change (or point readers here for param details).
- After substantive changes, user may want **`git push`** from the `music` repo root (`origin/main`).
