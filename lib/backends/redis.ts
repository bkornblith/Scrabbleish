import { Redis } from "@upstash/redis";
import type { Game } from "../engine";
import { EXPIRY_SECONDS, type Backend } from "./types";

// Upstash Redis. Kept so existing deployments keep working until they move to Supabase.
const key = (id: string) => `scrabble:game:${id}`;

// Compare-and-set: only write if the stored version is still the one we read. Every save
// resets the 7-day expiry.
const CAS = `
local cur = redis.call('HGET', KEYS[1], 'v')
if (cur or '-1') ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[1], 'v', ARGV[2], 'data', ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[4])
return 1
`;

export function redisBackend(url: string, token: string): Backend {
  const redis = new Redis({ url, token, automaticDeserialization: false });
  return {
    name: "redis",
    async load(id) {
      const data = await redis.hget<string>(key(id), "data");
      return data ? (JSON.parse(data) as Game) : null;
    },
    async loadVersion(id) {
      const v = await redis.hget<string>(key(id), "v");
      return v == null ? null : Number(v);
    },
    async save(game, expected) {
      const ok = await redis.eval(CAS, [key(game.id)], [String(expected), String(game.version), JSON.stringify(game), String(EXPIRY_SECONDS)]);
      return Number(ok) === 1;
    },
    async list() {
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
    },
    async remove(ids) {
      return ids.length ? redis.del(...ids.map(key)) : 0;
    },
    async cleanup() {
      return 0; // Redis expires keys by itself.
    },
  };
}
