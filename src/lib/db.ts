import Database from "@tauri-apps/plugin-sql";
import type { Anime, AnimeFormat, Season } from "./model";

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
  season_number: number | null;
  episode_count: number | null;
  episodes_watched: number | null;
};

export async function loadLibrary(): Promise<Anime[]> {
  const rows = await (
    await db()
  ).select<LibraryRow[]>(
    `SELECT a.id, a.title, a.year, a.format, a.notes,
            s.number AS season_number, s.episode_count, s.episodes_watched
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
};

export async function saveAnime(
  id: number | null,
  draft: AnimeDraft,
  seasons: Season[],
  removed: number[],
): Promise<number> {
  const conn = await db();
  const values = [
    draft.title.trim(),
    draft.year,
    draft.format,
    draft.notes?.trim() || null,
  ];

  let animeId = id;
  if (animeId === null) {
    // RETURNING, not last_insert_rowid(): the plugin pools connections, so the
    // rowid lookup can land on a different connection and return 0.
    const inserted = await conn.select<{ id: number }[]>(
      `INSERT INTO anime (title, year, format, notes)
            VALUES (?, ?, ?, ?) RETURNING id`,
      values,
    );
    animeId = inserted[0].id;
  } else {
    await conn.execute(
      "UPDATE anime SET title = ?, year = ?, format = ?, notes = ? WHERE id = ?",
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
