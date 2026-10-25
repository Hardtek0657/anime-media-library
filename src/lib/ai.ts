import { invoke } from "@tauri-apps/api/core";
import type { AnimeFormat } from "./model";

export type Suggestion = {
  title: string;
  year: number | null;
  format: AnimeFormat;
  seasons: { number: number; episodes: number }[];
  description: string;
};

export const aiHasKey = (): Promise<boolean> => invoke<boolean>("ai_has_key");

export const aiSetKey = (key: string): Promise<void> =>
  invoke<void>("ai_set_key", { key });

export const aiClearKey = (): Promise<void> => invoke<void>("ai_clear_key");

export const aiLookup = (title: string): Promise<Suggestion> =>
  invoke<Suggestion>("ai_lookup", { title });
