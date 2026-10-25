import { invoke } from "@tauri-apps/api/core";

export type AniListSeason = {
  number: number;
  episodes: number | null;
  cover: string | null;
};

export type AniListDetails = {
  title: string;
  year: number | null;
  format: string;
  description: string | null;
  studio: string | null;
  author: string | null;
  genres: string | null;
  cover: string | null;
  seasons: AniListSeason[];
};

/** Covers arrive as data URIs (the Rust side downloads and encodes them), so this stays
 *  one network call per lookup and the database stays one file. */
export function anilistLookup(title: string): Promise<AniListDetails | null> {
  return invoke<AniListDetails | null>("anilist_lookup", { title });
}

/**
 * A misspelling makes AniList's search return nothing, so a failed title is retried with
 * the part before a colon and then with three words. The caller gets the number of calls
 * so the check can report its real cost.
 */
export async function anilistLookupDeep(
  title: string,
): Promise<{ details: AniListDetails | null; calls: number }> {
  const terms = [title.trim()];
  const head = title.split(/[:\-\u2013]/)[0].trim();
  if (head.length >= 3 && !terms.includes(head)) terms.push(head);
  const short = title.split(/\s+/).slice(0, 3).join(" ");
  if (short.length >= 3 && !terms.includes(short)) terms.push(short);

  let calls = 0;
  for (const term of terms) {
    calls += 1;
    const details = await anilistLookup(term);
    if (details) return { details, calls };
  }
  return { details: null, calls };
}
