export type AnimeFormat = "TV" | "Movie" | "OVA" | "ONA" | "Special";

export const FORMATS: AnimeFormat[] = ["TV", "Movie", "OVA", "ONA", "Special"];

export type Season = {
  number: number;
  episodeCount: number;
  episodesWatched: number;
};

export type Anime = {
  id: number;
  title: string;
  year: number | null;
  format: AnimeFormat;
  notes: string | null;
  description: string | null;
  seasons: Season[];
};

export type ShelfStatus = "watching" | "completed" | "not-started";

export type Filter = "all" | ShelfStatus;

export const STATUS_LABEL: Record<ShelfStatus, string> = {
  watching: "Watching",
  completed: "Completed",
  "not-started": "Not started",
};

export function isSeasonDone(season: Season): boolean {
  return season.episodesWatched >= season.episodeCount;
}

/** Derived from progress only, so it cannot drift out of sync with the seasons. */
export function statusOf(anime: Anime): ShelfStatus {
  if (anime.seasons.length === 0) return "not-started";
  if (anime.seasons.every(isSeasonDone)) return "completed";
  return anime.seasons.some((season) => season.episodesWatched > 0)
    ? "watching"
    : "not-started";
}

export function nextUnfinished(anime: Anime): Season | null {
  return anime.seasons.find((season) => !isSeasonDone(season)) ?? null;
}

/**
 * The one season a shelf row talks about: the furthest season that has progress and
 * episodes left, otherwise the first unfinished season, otherwise the last season once
 * everything is watched.
 */
export function currentSeason(anime: Anime): Season | null {
  const seasons = anime.seasons;
  if (seasons.length === 0) return null;
  const started = seasons.filter(
    (season) => season.episodesWatched > 0 && !isSeasonDone(season),
  );
  if (started.length > 0) return started[started.length - 1];
  const unfinished = seasons.find((season) => !isSeasonDone(season));
  return unfinished ?? seasons[seasons.length - 1];
}

export function episodeWatched(anime: Anime): number {
  return anime.seasons.reduce((sum, season) => sum + season.episodesWatched, 0);
}

export function episodeTotal(anime: Anime): number {
  return anime.seasons.reduce((sum, season) => sum + season.episodeCount, 0);
}

/** Two letters from the real title, used instead of invented cover art. */
export function monogram(title: string): string {
  const words = title.trim().split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word));
  if (words.length === 0) return "?";
  const first = [...words[0]][0] ?? "?";
  const second = [...(words[1] ?? "")][0] ?? "";
  return (first + second).toUpperCase();
}

const SPINES = ["#7c8f79", "#8a7ba3", "#a07a63", "#6f8b9e", "#a08a5f"];

/** Deterministic, so a title keeps the same spine colour across sessions. */
export function spineColor(title: string): string {
  let hash = 5381;
  for (const char of title.toLowerCase()) {
    hash = ((hash << 5) + hash + (char.codePointAt(0) ?? 0)) | 0;
  }
  return SPINES[Math.abs(hash) % SPINES.length];
}
