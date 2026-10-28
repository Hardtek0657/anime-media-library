import type { Anime } from "./model";

/** Lowercase letters and digits only, so punctuation and spacing do not decide a match. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

/** Quotes are the same character in a different costume, so ’ and ' never cause a rename. */
function foldQuotes(title: string): string {
  return title
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The name to store instead of `stored`, or null when it already matches one of AniList's
 * names. Only a typo, capitalization or punctuation difference of a real name is renamed: a
 * romaji shelf title and a deliberately shortened one are not misspellings.
 */
export function renameSuggestion(stored: string, variants: string[]): string | null {
  const name = stored.trim();
  const names = variants.map((value) => value.trim()).filter((value) => value !== "");
  if (names.includes(name)) return null;
  // The words and the words' punctuation already agree; only the quote glyph differs.
  if (names.some((value) => foldQuotes(value) === foldQuotes(name))) return null;
  return closestName(name, names);
}

function closestName(name: string, names: string[]): string | null {
  const needle = normalizeTitle(name);
  const sameWords = names.filter((value) => normalizeTitle(value) === needle);
  const pool =
    sameWords.length > 0
      ? sameWords
      : names.filter((value) => {
          const candidate = normalizeTitle(value);
          if (candidate.length < 6) return false;
          const allowed = Math.max(1, Math.floor(Math.max(needle.length, candidate.length) / 7));
          return editDistance(needle, candidate) <= allowed;
        });
  if (pool.length === 0) return null;
  let best = pool[0];
  for (const value of pool) {
    if (editDistance(name, value) < editDistance(name, best)) best = value;
  }
  return best === name ? null : best;
}

export function findSimilarTitle(
  title: string,
  library: Anime[],
  excludeId: number | null,
): Anime | null {
  const needle = normalizeTitle(title);
  if (needle.length < 4) return null;

  let best: Anime | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const anime of library) {
    if (anime.id === excludeId) continue;
    const candidate = normalizeTitle(anime.title);
    if (candidate === needle) return anime;
    const allowed = Math.max(1, Math.floor(Math.max(needle.length, candidate.length) / 7));
    const distance = editDistance(needle, candidate);
    if (distance <= allowed && distance < bestDistance) {
      best = anime;
      bestDistance = distance;
    }
  }
  return best;
}
