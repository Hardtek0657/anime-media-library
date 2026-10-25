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

/**
 * The closest existing title that is probably the same show: equal after normalising, or
 * within one edit per seven characters. Short titles are left alone, they match too easily.
 */
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
