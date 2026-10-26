import type { Anime } from "./model";

export type SeasonAdd = { number: number; episodes: number };
export type SeasonGrow = { number: number; from: number; to: number };

export type ScanChange = {
  title: string;
  added: SeasonAdd[];
  grown: SeasonGrow[];
};

export type ScanDetails = {
  title: string;
  fields: string[];
};

export type ScanRename = {
  id: number;
  from: string;
  to: string;
};

export type ScanReport = {
  total: number;
  checked: number;
  requests: number;
  changes: ScanChange[];
  details: ScanDetails[];
  renames: ScanRename[];
  errors: string[];
};

/** The report as plain text, so a finished check can be pasted somewhere instead of retyped. */
export function scanLogText(report: ScanReport): string {
  const found = report.changes.length + report.details.length + report.renames.length;
  const lines = [
    `Library check, ${new Date().toLocaleString()}`,
    `Checked ${report.checked} of ${report.total} ${report.total === 1 ? "title" : "titles"} with ${report.requests} ${report.requests === 1 ? "request" : "requests"}.`,
  ];

  if (report.renames.length > 0) {
    lines.push("", "Misspelled titles");
    for (const rename of report.renames) {
      lines.push(`- ${rename.from} looks misspelled; AniList lists ${rename.to}.`);
    }
  }
  if (report.changes.length > 0) {
    lines.push("", "New seasons and episode counts");
    for (const change of report.changes) {
      const parts: string[] = [];
      if (change.added.length > 0) {
        parts.push(
          `added ${change.added.map((season) => `S${season.number} (${season.episodes} eps)`).join(", ")}`,
        );
      }
      if (change.grown.length > 0) {
        parts.push(
          `grew ${change.grown.map((season) => `S${season.number} ${season.from} to ${season.to} eps`).join(", ")}`,
        );
      }
      lines.push(`- ${change.title} ${parts.join(" and ")}.`);
    }
  }
  if (report.details.length > 0) {
    lines.push("", "Details filled");
    for (const entry of report.details) {
      lines.push(`- ${entry.title} filled ${entry.fields.join(", ")}.`);
    }
  }
  if (report.errors.length > 0) {
    lines.push("", "Problems");
    for (const line of report.errors) lines.push(`- ${line}`);
  }
  if (found === 0 && report.errors.length === 0) {
    lines.push(
      "",
      "No new seasons, no higher episode counts, no misspelled titles and no missing details.",
    );
  }
  return lines.join("\n");
}

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
