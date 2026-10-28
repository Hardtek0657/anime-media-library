import { invoke } from "@tauri-apps/api/core";

export type AniListSeason = {
  number: number;
  episodes: number | null;
  cover: string | null;
};

export type AniListDetails = {
  title: string;
  /** Romaji, English and the synonyms AniList holds, so a shelf title can be checked
   *  against every name the entry is known by. */
  titles: string[];
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

/** How long the check waits when AniList says it is being asked too often. */
const PAUSE_MS = 65_000;
/** Attempts per term, so a paused check still ends if AniList stays unhappy. */
const ATTEMPTS = 4;

function isRateLimit(cause: unknown): boolean {
  return String(cause).includes("RATE_LIMIT");
}

/** A rate limit pauses the check and asks for the same term again; a skipped title would be
 *  a wrong episode count, which is worse than a minute of waiting. */
async function lookupOnce(
  term: string,
  onWait?: (waiting: boolean) => void,
): Promise<AniListDetails | null> {
  let last: unknown;
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    try {
      return await anilistLookup(term);
    } catch (cause) {
      last = cause;
      if (isRateLimit(cause)) {
        // Say so on screen: a minute of silence reads as a hang.
        onWait?.(true);
        await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
        onWait?.(false);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 4000));
      }
    }
  }
  throw last;
}

/** Retries a title AniList cannot find with the part before a colon, then three words. The
 *  caller gets the request count so the report can state its real cost. */
export async function anilistLookupDeep(
  title: string,
  onWait?: (waiting: boolean) => void,
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
    const details = await lookupOnce(term, onWait);
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