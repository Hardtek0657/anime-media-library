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

/** One call, retried once: a long check occasionally meets a rate limit or a slow answer. */
// AniList allows about ninety requests a minute, and a season chain spends one request per
// season, so a sweep can briefly outrun it. Two patient retries recover most of those.
async function lookupOnce(term: string): Promise<AniListDetails | null> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await anilistLookup(term);
    } catch (cause) {
      last = cause;
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
  }
  throw last;
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
  // "Im Standing on a Million Lives" finds nothing; dropping the first word does. A
  // missing apostrophe or a stray leading word is the same kind of problem.
  const words = title.trim().split(/\s+/);
  if (words.length >= 4) {
    const rest = words.slice(1).join(" ");
    if (!terms.includes(rest)) terms.push(rest);
  }

  let calls = 0;
  for (const term of terms) {
    calls += 1;
    const details = await lookupOnce(term);
    if (details) return { details, calls };
  }
  return { details: null, calls };
}
export type AniListCandidate = {
  id: number;
  title: string;
  year: number | null;
  format: string;
};

/** Every entry AniList offers for a title, so the user can pick the one they meant. */
export function anilistCandidates(title: string): Promise<AniListCandidate[]> {
  return invoke<AniListCandidate[]>("anilist_candidates", { title });
}

/** Details for one exact AniList entry. */
export function anilistById(id: number): Promise<AniListDetails | null> {
  return invoke<AniListDetails | null>("anilist_by_id", { id });
}