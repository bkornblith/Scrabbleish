import { Redis } from "@upstash/redis";
import type { Game } from "./engine";

// Games live in Redis (Upstash, via the Vercel Marketplace) so every serverless instance sees
// the same state. Without Redis credentials we fall back to process memory for local dev.

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token, automaticDeserialization: false }) : null;

if (!redis && process.env.VERCEL) {
  console.error("No Redis configured: add the Upstash Redis integration to this Vercel project.");
}

const TTL_SECONDS = 60 * 60 * 24 * 30;
const key = (id: string) => `scrabble:game:${id}`;

const mem: Map<string, { v: number; data: string }> =
  ((globalThis as unknown as { __scrabbleMem?: Map<string, { v: number; data: string }> }).__scrabbleMem ??= new Map());

// Compare-and-set: only write if the stored version is still the one we read.
const CAS = `
local cur = redis.call('HGET', KEYS[1], 'v')
if (cur or '-1') ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[1], 'v', ARGV[2], 'data', ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[4])
return 1
`;

export async function loadGame(id: string): Promise<Game | null> {
  if (!redis) {
    const e = mem.get(id);
    return e ? (JSON.parse(e.data) as Game) : null;
  }
  const data = await redis.hget<string>(key(id), "data");
  return data ? (JSON.parse(data) as Game) : null;
}

export async function loadVersion(id: string): Promise<number | null> {
  if (!redis) return mem.get(id)?.v ?? null;
  const v = await redis.hget<string>(key(id), "v");
  return v == null ? null : Number(v);
}

/** Saves `game` if nobody else wrote since `expectedVersion` (-1 = must not exist). Bumps game.version. */
export async function saveGame(game: Game, expectedVersion: number): Promise<boolean> {
  const next = expectedVersion + 1;
  game.version = next;
  const data = JSON.stringify(game);
  if (!redis) {
    const cur = mem.get(game.id)?.v ?? -1;
    if (cur !== expectedVersion) return false;
    mem.set(game.id, { v: next, data });
    return true;
  }
  const ok = await redis.eval(CAS, [key(game.id)], [String(expectedVersion), String(next), data, String(TTL_SECONDS)]);
  return Number(ok) === 1;
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

export class NotFound extends Error {}

// ---------- admin ----------

/** Every stored game. Used only by the admin page, so a full scan is fine. */
export async function listGames(): Promise<Game[]> {
  if (!redis) return [...mem.values()].map((e) => JSON.parse(e.data) as Game);
  const keys: string[] = [];
  let cursor = "0";
  do {
    const [next, batch] = await redis.scan(cursor, { match: key("*"), count: 200 });
    cursor = String(next);
    keys.push(...batch);
  } while (cursor !== "0");
  if (!keys.length) return [];
  const pipe = redis.pipeline();
  for (const k of keys) pipe.hget(k, "data");
  const rows = (await pipe.exec()) as (string | null)[];
  return rows.filter((d): d is string => !!d).map((d) => JSON.parse(d) as Game);
}

/** Deletes the given games and returns how many existed. */
export async function deleteGames(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  if (!redis) return ids.filter((id) => mem.delete(id)).length;
  return redis.del(...ids.map(key));
}
