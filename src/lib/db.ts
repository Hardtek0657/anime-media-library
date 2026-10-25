import Database from "@tauri-apps/plugin-sql";
import type { Anime, AnimeFormat, Season } from "./model";

// Must match the migrations URL in src-tauri/src/lib.rs. A relative sqlite name is
// resolved against the app config dir, not the process directory, so the file always
// lands in %APPDATA%\com.hardtek.animemedialibrary\ whichever folder starts the exe.
const DB_URL = "sqlite:anime-library.db";

let handle: Promise<Database> | null = null;

function db(): Promise<Database> {
  handle ??= Database.load(DB_URL);
  return handle;
}

type LibraryRow = {
  id: number;
  title: string;
  year: number | null;
  format: AnimeFormat;
  notes: string | null;
  description: string | null;
  author: string | null;
  studio: string | null;
  genres: string | null;
  cover: string | null;
  season_number: number | null;
  episode_count: number | null;
  episodes_watched: number | null;
  season_cover: string | null;
};

export async function loadLibrary(): Promise<Anime[]> {
  const rows = await (
    await db()
  ).select<LibraryRow[]>(
    `SELECT a.id, a.title, a.year, a.format, a.notes, a.description,
            a.author, a.studio, a.genres, a.cover,
            s.number AS season_number, s.episode_count, s.episodes_watched,
            s.cover AS season_cover
       FROM anime a
       LEFT JOIN season s ON s.anime_id = a.id
      ORDER BY a.title COLLATE NOCASE, s.number`,
  );

  const byId = new Map<number, Anime>();
  for (const row of rows) {
    let anime = byId.get(row.id);
    if (!anime) {
      anime = {
        id: row.id,
        title: row.title,
        year: row.year,
        format: row.format,
        notes: row.notes,
        description: row.description,
        author: row.author,
        studio: row.studio,
        genres: row.genres,
        cover: row.cover,
        seasons: [],
      };
      byId.set(row.id, anime);
    }
    if (
      row.season_number !== null &&
      row.episode_count !== null &&
      row.episodes_watched !== null
    ) {
      anime.seasons.push({
        number: row.season_number,
        episodeCount: row.episode_count,
        episodesWatched: row.episodes_watched,
        cover: row.season_cover,
      });
    }
  }
  return [...byId.values()];
}

export type AnimeDraft = {
  title: string;
  year: number | null;
  format: AnimeFormat;
  notes: string | null;
  description: string | null;
  author: string | null;
  studio: string | null;
  genres: string | null;
  cover: string | null;
};

export async function saveAnime(
  id: number | null,
  draft: AnimeDraft,
  seasons: Season[],
  removed: number[],
): Promise<number> {
  // ponytail: these statements are not one transaction. A failure halfway leaves a
  // title with fewer seasons than the form showed, fixable by editing it again. Use a
  // Rust command with a real transaction when partial saves start losing real work.
  const conn = await db();
  const title = draft.title.replace(/\s+/g, " ").trim();
  const clash = await conn.select<{ title: string }[]>(
    "SELECT title FROM anime WHERE lower(trim(title)) = lower(?) AND id IS NOT ?",
    [title, id ?? -1],
  );
  if (clash.length > 0) {
    throw new Error(`“${clash[0].title}” is already on the shelf. Open that entry instead.`);
  }

  const values = [
    title,
    draft.year,
    draft.format,
    draft.notes?.trim() || null,
    draft.description?.trim() || null,
    draft.author?.trim() || null,
    draft.studio?.trim() || null,
    draft.genres?.trim() || null,
    draft.cover,
  ];

  let animeId = id;
  if (animeId === null) {
    // RETURNING, not last_insert_rowid(): the plugin pools connections, so the
    // rowid lookup can land on a different connection and return 0.
    const inserted = await conn.select<{ id: number }[]>(
      `INSERT INTO anime (title, year, format, notes, description, author, studio, genres, cover)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      values,
    );
    animeId = inserted[0].id;
  } else {
    await conn.execute(
      `UPDATE anime SET title = ?, year = ?, format = ?, notes = ?, description = ?,
              author = ?, studio = ?, genres = ?, cover = ?
        WHERE id = ?`,
      [...values, animeId],
    );
  }

  for (const number of removed) {
    await conn.execute(
      "DELETE FROM season WHERE anime_id = ? AND number = ?",
      [animeId, number],
    );
  }

  for (const season of seasons) {
    await conn.execute(
      `INSERT INTO season (anime_id, number, episode_count, episodes_watched)
            VALUES (?, ?, ?, ?)
       ON CONFLICT(anime_id, number) DO UPDATE SET
            episode_count = excluded.episode_count,
            episodes_watched = MIN(excluded.episodes_watched, excluded.episode_count)`,
      [animeId, season.number, season.episodeCount, season.episodesWatched],
    );
  }

  return animeId;
}

export async function deleteAnime(id: number): Promise<void> {
  const conn = await db();
  await conn.execute("DELETE FROM season WHERE anime_id = ?", [id]);
  await conn.execute("DELETE FROM anime WHERE id = ?", [id]);
}

/** Clamped in SQL against episode_count, so an out of range value cannot land. */
export async function setWatched(
  animeId: number,
  number: number,
  watched: number,
): Promise<void> {
  await (
    await db()
  ).execute(
    `UPDATE season SET episodes_watched = MAX(0, MIN(?, episode_count))
      WHERE anime_id = ? AND number = ?`,
    [watched, animeId, number],
  );
}

/** Applies what a library check found: new seasons, and episode counts that grew. */
export async function applyScan(
  animeId: number,
  added: { number: number; episodes: number }[],
  grown: { number: number; to: number }[],
): Promise<void> {
  // ponytail: same non-transactional shape as saveAnime. A failure midway leaves the
  // additions before it applied; rerunning a check is safe because it only ever adds.
  const conn = await db();
  for (const season of added) {
    await conn.execute(
      "INSERT INTO season (anime_id, number, episode_count, episodes_watched) VALUES (?, ?, ?, 0)",
      [animeId, season.number, season.episodes],
    );
  }
  for (const season of grown) {
    await conn.execute(
      "UPDATE season SET episode_count = ? WHERE anime_id = ? AND number = ?",
      [season.to, animeId, season.number],
    );
  }
}

/** What AniList answered, reduced to the fields the shelf can use. */
export type Details = {
  author: string | null;
  studio: string | null;
  genres: string | null;
  description: string | null;
  cover: string | null;
  seasons: { number: number; cover: string | null }[];
};

export type DetailsApplied = { fields: string[]; seasonCovers: number };

/**
 * Fills only the columns that are still empty, so a check can run over a library the user
 * has already curated without overwriting their words. Returns what it filled.
 */
export async function applyDetails(
  animeId: number,
  details: Details,
): Promise<DetailsApplied> {
  const conn = await db();
  const rows = await conn.select<
    {
      author: string | null;
      studio: string | null;
      genres: string | null;
      description: string | null;
      cover: string | null;
    }[]
  >("SELECT author, studio, genres, description, cover FROM anime WHERE id = ?", [animeId]);
  if (rows.length === 0) return { fields: [], seasonCovers: 0 };
  const current = rows[0];

  const candidates: [keyof Omit<Details, "seasons">, string | null][] = [
    ["author", details.author],
    ["studio", details.studio],
    ["genres", details.genres],
    ["description", details.description],
    ["cover", details.cover],
  ];
  const filled: string[] = [];
  const assignments: string[] = [];
  const values: string[] = [];
  for (const [field, value] of candidates) {
    if (!value) continue;
    const present = current[field];
    if (present !== null && present.trim() !== "") continue;
    assignments.push(`${field} = ?`);
    values.push(value);
    filled.push(field);
  }
  if (assignments.length > 0) {
    await conn.execute(`UPDATE anime SET ${assignments.join(", ")} WHERE id = ?`, [
      ...values,
      animeId,
    ]);
  }

  // Season art is only trusted when the whole chain lines up with the rows we have.
  // Otherwise every season gets the series cover, which is still worth showing and stops
  // the check asking about this title again on every run.
  const counted = await conn.select<{ total: number }[]>(
    "SELECT count(*) AS total FROM season WHERE anime_id = ?",
    [animeId],
  );
  const seasonTotal = counted[0]?.total ?? 0;
  const art = new Map<number, string | null>();
  if (seasonTotal > 0 && seasonTotal === details.seasons.length) {
    for (const season of details.seasons) art.set(season.number, season.cover);
  }
  let seasonCovers = 0;
  if (seasonTotal > 0) {
    const rows = await conn.select<{ number: number }[]>(
      "SELECT number FROM season WHERE anime_id = ? AND (cover IS NULL OR cover = '')",
      [animeId],
    );
    for (const row of rows) {
      const url =
        seasonTotal === details.seasons.length ? art.get(row.number) ?? null : details.cover;
      if (!url) continue;
      await conn.execute("UPDATE season SET cover = ? WHERE anime_id = ? AND number = ?", [
        url,
        animeId,
        row.number,
      ]);
      seasonCovers += 1;
    }
  }
  return { fields: filled, seasonCovers };
}

export async function advanceSeason(
  animeId: number,
  number: number,
): Promise<void> {
  await (
    await db()
  ).execute(
    `UPDATE season SET episodes_watched = MIN(episodes_watched + 1, episode_count)
      WHERE anime_id = ? AND number = ?`,
    [animeId, number],
  );
}
