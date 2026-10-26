# Anime Media Library

A local anime watch log. One window, one SQLite file, no account. It runs fully offline;
a DeepSeek fill and AniList artwork are the only optional network calls.

You add a title, give it seasons, and log episodes. A title shows as **Watching** once any
episode is logged, **Completed** when every season is finished, and **Not started** before
that. Stopping mid-season is a first-class case: set the last episode you watched and the
shelf remembers it.

![The shelf with three titles at different stages](docs/shelf.png)

## What it does

- Catalog of titles with year, format, description and notes.
- Seasons per title, each with an episode count and episodes watched.
- Seasons can be numbered as a half (2.5, 4.5), and each one is tracked as its own season
  with its own episode progress.
- Quick `+1 ep` from the shelf, or set any episode number in the detail panel.
- Derived status per title, so nothing drifts out of sync.
- Filters: all, watching, completed, not started, plus format chips (TV, Movie, OVA, ONA,
  Special) for the formats you actually own. Title search.
- Cover art per title and per season, stored as a data URI in the same database file.
- Author, studio and genres alongside year and format.
- Optional DeepSeek fill: with a key added, one button fills the year, format, seasons and
  description from the title. Off by default, and it is the only feature that sends your
  input off this machine.
- `Fetch artwork and details` pulls covers and creator fields from AniList, which needs no
  key.
- `Check library` asks DeepSeek about every title, adds seasons you are missing, raises
  episode counts that grew, and fills missing details and artwork from AniList. It reports
  each change in a dialog.
- A row shows one season: the one you are in. The panel holds the full list.
- Clicking a row opens it in place: every season with its artwork, number, episode count
  and its own `+1 ep`, plus `Edit title` and `Delete title`.
- Right-clicking a row opens `Edit title`, `Check for new seasons` (the check for that one
  title) and `Delete title`, which asks once before it removes anything.
- Misspelled titles are caught: the check compares each title with AniList's and offers
  `Rename it` rather than guessing.
- The shelf is sorted by title, ignoring case, so the order is alphabetical rather than
  upper before lower.
- One title per show: saving a title that already exists is refused and names the existing
  entry, and a near miss (a typo) asks "same show?" before the AI request goes out.
- Every title stored in a local SQLite database. Deleting a title deletes its seasons.

## Stack

| Layer | Choice |
|---|---|
| Shell | Tauri 2 (WebView2 on Windows) |
| UI | React 19, TypeScript, Vite |
| Storage | SQLite through `tauri-plugin-sql`, migrations declared in Rust |
| Optional AI | Rust command calling DeepSeek; the key lives in the Windows Credential Manager |
| Artwork and facts | AniList public GraphQL, called from Rust, no key required |

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

The path comes from the app identifier, not the current working directory: the SQL plugin
resolves a relative database name against the app config dir. Start the exe from `C:\`, from
a shortcut, or from the folder you happen to be in, and it reads the same file.

The DeepSeek key is not in that file. It is stored as a Windows credential under
`anime-media-library` / `deepseek`, and it is removed from the same dialog that saved it.

## Optional AI fill

Open `AI settings` in the header, paste a DeepSeek key, and save. Nothing is sent anywhere
until you press `Fill from AI` in the title panel, and the app keeps working normally
without a key.

- What leaves the machine: the title you typed, once per press, to
  `https://api.deepseek.com/chat/completions`.
- What comes back: a JSON object with year, format, seasons and a short description. The
  Rust side validates every field, drops impossible values (year outside 1900 to 2100, zero
  episodes, duplicate season numbers) and caps the season list.
- What it changes: year, format and description only where they are empty. Seasons are
  merged: a new title gets the suggested list, and a saved title keeps its rows while
  missing seasons are added, episode counts follow the suggestion, and watch progress is
  preserved (clamped if the suggested count is smaller). A season the model does not mention
  is left alone.
- Before any request, the title is compared with the shelf. Within one edit per seven
  characters of an existing title, the panel stops and asks whether it is the same show,
  offering `Open that entry` or `Different title, fill anyway`. Nothing is sent until that
  is answered.
- Failures are shown in the panel: a rejected key, no balance, rate limiting, a network
  error, or a reply that is not the expected JSON.

The provider is one constant pair (`ENDPOINT` and `MODEL` in `src-tauri/src/ai.rs`), so
another OpenAI-compatible endpoint is a config change rather than a rewrite.

## Artwork and creator fields

A text model cannot return images, so covers come from AniList's public API, which needs no
key and receives only the title. The Rust side downloads the image, refuses anything over
400 KB, and stores it as a `data:image/...;base64,...` URI in `anime.cover` and
`season.cover`. That keeps the library one file to back up; a typical cover adds 35 to
75 KB.

- `Fetch artwork and details` fills only empty fields: year, format, description, author,
  studio, genres and covers.
- Season art is used only when AniList's relation chain matches the number of seasons you
  have. Otherwise every season uses the series cover, which is honest about what is known
  and stops the check asking again.
- Nothing is overwritten. A creator or description you typed stays as you typed it.

## Checking the library

`Check library` in the header walks every title and asks DeepSeek about it: one request per
title, shown as `Checking 2 of 5…` while it runs.

- It only adds. A season you do not have is inserted with its episode count; a season whose
  suggested count is higher is raised. Nothing is deleted, no count is lowered, watch
  progress is never touched.
- The report opens in a centered dialog: titles checked, requests made, and per title what
  was added or raised. `Dismiss` closes it.
- A failure stops the run and the error appears in the report, keeping whatever was applied
  before it. Running it again is safe, because the check only adds.
- A new movie or spin-off is its own title, so it is not added automatically; the card says
  so.

## Schema

```sql
CREATE TABLE anime (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL CHECK (length(trim(title)) > 0),
  year       INTEGER CHECK (year BETWEEN 1900 AND 2100),
  format     TEXT    NOT NULL DEFAULT 'TV'
                     CHECK (format IN ('TV', 'Movie', 'OVA', 'ONA', 'Special')),
  notes      TEXT,
  description TEXT,
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

Season numbers can be halves. SQLite stores `2.5` as `REAL` in the same column (integer
affinity keeps whole numbers integers), and the composite primary key still rejects a
second `2.5` for the same title.

## Design

The interface is a dark shelf: ink and bone, one amber accent, serif titles, and a thin
spine per row whose colour is derived from the title. Details and the reasoning are in
[DESIGN.md](DESIGN.md).

## Not included

No sync, no ratings, no import or export. Covers and creator fields come from AniList, and
the DeepSeek fill is the other optional network use. Apart from those, the app touches one
file: its own database.

## Development notes

- `src-tauri/migrations/` holds SQL applied at startup. Add a new numbered file and a
  matching `Migration` entry in `src-tauri/src/lib.rs` instead of editing an applied one.
- Database capabilities live in `src-tauri/capabilities/default.json`, which grants load,
  select, execute and close on the app's own database.
- `src-tauri/tauri.debug.conf.json` is a development-only config that opens the WebView2
  debugging port on 9222 and marks the window title. Run it with
  `pnpm tauri dev --config src-tauri/tauri.debug.conf.json`. The shipped config leaves the
  port closed.

## License

Proprietary, all rights reserved. No permission is granted to use, copy, modify or
distribute this code without written permission from the author. See [LICENSE](LICENSE).
Anime titles, artwork and metadata belong to their respective rights holders.