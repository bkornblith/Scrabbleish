import type { Game } from "../engine";

/** Games with no saves for this long are deleted. */
export const EXPIRY_SECONDS = 60 * 60 * 24 * 7;

export interface Backend {
  name: "supabase" | "redis" | "memory";
  load(id: string): Promise<Game | null>;
  loadVersion(id: string): Promise<number | null>;
  /** Writes `data` (already at version expected+1) if the stored version is `expected` (-1 = must not exist). */
  save(game: Game, expected: number): Promise<boolean>;
  list(): Promise<Game[]>;
  remove(ids: string[]): Promise<number>;
  /** Deletes expired games; returns how many. */
  cleanup(): Promise<number>;
}
