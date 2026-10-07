# Tracker — CLAUDE.md

## Project

Vanilla JS PWA for tracking personal data (modeled on the sidur project). Source in `docs/`, served via GitHub Pages at https://dn-scribe.github.io/Tracker/. Local-only IndexedDB storage, no sync.

## Stack

- `docs/js/app.js` — UI + logic (entry, history, export, config editor, clear cache)
- `docs/js/storage.js` — IndexedDB (`entries` store, `meta` store holding `config`)
- `docs/js/version.js` — version string and changelog
- `docs/sw.js` — service worker (cache-first shell)
- `docs/css/style.css` — styles (big fonts: `html { font-size: 22px }`)

Data model: entry = `{id, date: YYYY-MM-DD, time: HH:MM, item, values: string[], ts}` (`time` absent on pre-1.2 entries; use `Storage.timeOf`). Config = `{rows: [{fields: [{name, def}]}]}`, 1 or 2 fields per row (2 = merged, same row in the form, item name = names joined by " / ").

## Release checklist — every change

1. Bump `CACHE_NAME` in `docs/sw.js` (`tracker-vN` → `tracker-vN+1`)
2. Bump `TR.Version.current` in `docs/js/version.js` and add a changelog entry (patch = fix, minor = feature). Both travel as a pair.
3. Add any new shell file to `SHELL` in `sw.js`.
4. Commit, push, merge to `main`. Pages rebuilds in ~1 min; the SW picks up the new `CACHE_NAME` on next open.

Dev server: `python3 -m http.server 8766 --directory docs`.
