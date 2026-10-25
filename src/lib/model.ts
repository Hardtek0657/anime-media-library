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
