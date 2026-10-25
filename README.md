# Anime Media Library

A local anime watch log. One window, one SQLite file, no account and no network calls.

You add a title, give it seasons, and log episodes. A title shows as **Watching** once any
episode is logged, **Completed** when every season is finished, and **Not started** before
that. Stopping mid-season is a first-class case: set the last episode you watched and the
shelf remembers it.

## What it does

- Catalog of titles with year, format and notes.
- Seasons per title, each with an episode count and episodes watched.
- Quick `+1 ep` from the shelf, or set any episode number in the detail panel.
- Derived status per title, so nothing drifts out of sync.
- Filters: all, watching, completed, not started. Title search.
- Everything stored in a local SQLite database. Deleting a title deletes its seasons.

## Stack

| Layer | Choice |
|---|---|
| Shell | Tauri 2 (WebView2 on Windows) |
| UI | React 19, TypeScript, Vite |
| Storage | SQLite through `tauri-plugin-sql`, migrations declared in Rust |

## Run it

Prerequisites: Node 20+, pnpm, Rust (stable MSVC toolchain), and the platform Tauri
dependencies (on Windows: MSVC Build Tools and WebView2).

```powershell
pnpm install
pnpm tauri dev
```

Build an installer:

```powershell
pnpm tauri build
```

## Where the data lives

One SQLite file, `anime-library.db`, in the app config directory. On Windows that is
`%APPDATA%\com.hardtek.animemedialibrary\`. Copy that file to back up the library.

## Schema

```sql
CREATE TABLE anime (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL CHECK (length(trim(title)) > 0),
  year       INTEGER CHECK (year BETWEEN 1900 AND 2100),
  format     TEXT    NOT NULL DEFAULT 'TV'
                     CHECK (format IN ('TV', 'Movie', 'OVA', 'ONA', 'Special')),
  notes      TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE season (
  anime_id         INTEGER NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  number           INTEGER NOT NULL CHECK (number > 0),
  episode_count    INTEGER NOT NULL CHECK (episode_count > 0),
  episodes_watched INTEGER NOT NULL DEFAULT 0 CHECK (episodes_watched >= 0),
  PRIMARY KEY (anime_id, number),
  CHECK (episodes_watched <= episode_count)
);
```

Status is computed from `season`, never stored, so there is no column to fall out of date.
Episode counts are clamped in SQL, which means an out of range value cannot be written even
if the UI is bypassed.

## Design

The interface is a dark shelf: ink and bone, one amber accent, serif titles, and a thin
spine per row whose colour is derived from the title. Details and the reasoning are in
[DESIGN.md](DESIGN.md).

## Not included

No metadata API, no cover downloads, no sync, no ratings, no import or export. The app is
deliberately offline: the only file it touches is its own database.

## Development notes

- `src-tauri/migrations/` holds SQL applied at startup. Add a new numbered file and a
  matching `Migration` entry in `src-tauri/src/lib.rs` instead of editing an applied one.
- Database capabilities live in `src-tauri/capabilities/default.json` (`sql:default`).
