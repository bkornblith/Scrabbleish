import type { Game } from "./engine";
import { memoryBackend } from "./backends/memory";
import { redisBackend } from "./backends/redis";
import { broadcastChange, supabaseBackend } from "./backends/supabase";
import type { Backend } from "./backends/types";

// Where games live, in order of preference:
//  1. Supabase Postgres + Realtime (instant updates, free tier) when its URL and secret key are set
//  2. Upstash Redis (polling) when its REST credentials are set
//  3. Process memory, for local development
// Every serverless instance must share state, so production needs 1 or 2.

/** First set env var among `names`, also accepting a custom integration prefix such as STORAGE_SUPABASE_URL. */
function env(...names: string[]): string | undefined {
  for (const n of names) if (process.env[n]) return process.env[n];
  for (const n of names) {
    const key = Object.keys(process.env).find((k) => k.endsWith("_" + n) && process.env[k]);
    if (key) return process.env[key];
  }
}

const supabaseUrl = env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
const supabaseKey = env("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");
const redisUrl = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

const backend: Backend =
  supabaseUrl && supabaseKey
    ? supabaseBackend(supabaseUrl, supabaseKey)
    : redisUrl && redisToken
      ? redisBackend(redisUrl, redisToken)
      : memoryBackend;

if (backend.name === "memory" && process.env.VERCEL) {
  console.error("No database configured: connect Supabase (see README) so games are shared between servers.");
}

/** True when clients should listen for Supabase Realtime pushes instead of polling quickly. */
export const realtimeEnabled = backend.name === "supabase";

/** What the browser needs to subscribe to Realtime: the project URL and its public key. */
const publicKey = env(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY"
);
export const realtimeConfig = realtimeEnabled && publicKey ? { url: supabaseUrl!, key: publicKey } : null;
export const storageBackend = backend.name;

export class NotFound extends Error {}

export const loadGame = (id: string) => backend.load(id);
export const loadVersion = (id: string) => backend.loadVersion(id);

/** Saves `game` if nobody else wrote since `expectedVersion` (-1 = must not exist). Bumps game.version. */
export async function saveGame(game: Game, expectedVersion: number): Promise<boolean> {
  game.version = expectedVersion + 1;
  const ok = await backend.save(game, expectedVersion);
  if (ok && realtimeEnabled) {
    await broadcastChange(supabaseUrl!, supabaseKey!, game.id, game.version).catch((e) =>
      console.error("Realtime broadcast failed", e)
    );
  }
  return ok;
}

/** Load, mutate and save with optimistic retries. */
export async function updateGame<T>(id: string, fn: (game: Game) => T): Promise<{ game: Game; result: T }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const game = await loadGame(id);
    if (!game) throw new NotFound();
    const before = game.version;
    const result = fn(game);
    if (await saveGame(game, before)) return { game, result };
  }
  throw new Error("The game is busy, please try again");
}

// ---------- admin and maintenance ----------

/** Every stored game. Used only by the admin page, so a full scan is fine. */
export const listGames = () => backend.list();

/** Deletes the given games and returns how many existed. */
export const deleteGames = (ids: string[]) => backend.remove(ids);

/** Deletes games with no moves for 7 days. */
export const cleanupExpired = () => backend.cleanup();
