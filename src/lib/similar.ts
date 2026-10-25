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
 * True when `stored` is probably the canonical name with a typo: one edit per seven
 * characters, and only on titles long enough for that to mean something. A different
 * alias ("Arifureta" for the full title) is far past this line and is left alone.
 */
export function looksLikeTypo(stored: string, canonical: string): boolean {
  const left = normalizeTitle(stored);
  const right = normalizeTitle(canonical);
  if (left === right) return false;
  if (left.length < 6 || right.length < 6) return false;
  const allowed = Math.max(1, Math.floor(Math.max(left.length, right.length) / 7));
  return editDistance(left, right) <= allowed;
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
