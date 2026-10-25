import type { Anime } from "./model";

export type SeasonAdd = { number: number; episodes: number };
export type SeasonGrow = { number: number; from: number; to: number };

export type ScanChange = {
  title: string;
  added: SeasonAdd[];
  grown: SeasonGrow[];
};

export type ScanReport = {
  total: number;
  checked: number;
  requests: number;
  changes: ScanChange[];
  errors: string[];
};

/**
 * What a suggestion would change for one title. Only additions and increases: a check
 * never removes a season or lowers an episode count the user relied on.
 */
export function planChange(
  anime: Anime,
  suggested: { number: number; episodes: number }[],
): ScanChange | null {
  const added: SeasonAdd[] = [];
  const grown: SeasonGrow[] = [];
  for (const season of suggested) {
    const existing = anime.seasons.find((row) => row.number === season.number);
    if (!existing) {
      added.push({ number: season.number, episodes: season.episodes });
    } else if (season.episodes > existing.episodeCount) {
      grown.push({ number: season.number, from: existing.episodeCount, to: season.episodes });
    }
  }
  if (added.length === 0 && grown.length === 0) return null;
  added.sort((left, right) => left.number - right.number);
  grown.sort((left, right) => left.number - right.number);
  return { title: anime.title, added, grown };
}
