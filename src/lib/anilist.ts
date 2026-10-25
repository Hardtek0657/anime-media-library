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
