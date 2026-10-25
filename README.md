# Anime Media Library

A local anime watch log. One window, one SQLite file, no account and no network calls.

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
- Filters: all, watching, completed, not started. Title search.
- Optional DeepSeek fill: with a key added, one button fills the year, format, seasons and
  description from the title. Off by default, and it is the only feature that uses the
  network.
- A row shows one season: the one you are in. The panel holds the full list.
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

## Verified

Checked in the running app on Windows (WebView2 155), not only in a browser:

- First launch creates the schema and shows the empty state with the add action.
- Adding a title with one season and 3 of 28 episodes saved it as Watching.
- `+1 ep` took that season from 3/28 to 4/28 and the count survived a reload.
- Setting the last episode of the final season moved the title to Completed, and the rail
  count followed.
- Filters and search: Watching, Completed and the empty result state each show the right
  rows; searching a title narrows the list to it.
- An empty title and a zero episode count are both refused, with the message inside the
  panel.
- Delete asks for confirmation, then removes the title and its seasons.
- Escape closes the detail panel.
- A row renders exactly one season and stays 69 px tall whatever the season count. With
  season 1 finished, season 2 at 5 of 12 and season 3 untouched, the row showed `S2 5/12`;
  with every episode watched it showed the last season, `S3 12/12`.
- Adding a title that already exists, `absolute duo` in different case, was refused with
  "“Absolute Duo” is already on the shelf. Open that entry instead." and no row was created.
- A season numbered 2.5 saved, showed as S2.5 with its own 6 of 12 progress, and survived a
  reload. Renaming season 2 to 2.5 replaced the old row instead of leaving a duplicate.
- Two seasons with the same number are refused with "Season 2.5 is listed twice."
- With no key saved, the panel says so and offers `Add one`; the dialog reports `No key
  saved.` and stores nothing.
- Saving a key reports `A key is saved.` and adds `Remove key`; removing it returns the
  panel to the no key hint.
- Asking DeepSeek with a deliberately wrong key showed "DeepSeek rejected the API key.
  Check it in AI settings." in the panel, with the draft untouched.
- A description typed in the panel saved, reopened with the same text, and the temporary
  title was deleted afterwards.
- `pnpm tauri build` produced a working bundle, and the packaged executable opened the same
  library from the same database file.

## Not included

No metadata API, no cover downloads, no sync, no ratings, no import or export. Apart from
the optional DeepSeek call, the app touches one file: its own database.

## Development notes

- `src-tauri/migrations/` holds SQL applied at startup. Add a new numbered file and a
  matching `Migration` entry in `src-tauri/src/lib.rs` instead of editing an applied one.
- Database capabilities live in `src-tauri/capabilities/default.json`, which grants load,
  select, execute and close on the app's own database.
- `src-tauri/tauri.debug.conf.json` is a development-only config that opens the WebView2
  debugging port on 9222 and marks the window title. Run it with
  `pnpm tauri dev --config src-tauri/tauri.debug.conf.json`. The shipped config leaves the
  port closed.
