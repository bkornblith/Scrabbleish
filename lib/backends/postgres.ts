import { Pool } from "pg";
import type { Game } from "../engine";
import { EXPIRY_SECONDS, type Backend } from "./types";

// Plain Postgres (Neon via Vercel Storage, or any other host). Same `games` table as
// supabase/schema.sql; it is created on first use, so there is no setup step.

const SCHEMA = `
  create table if not exists games (
    id text primary key,
    version integer not null,
    data jsonb not null,
    updated_at timestamptz not null default now()
  );
  create index if not exists games_updated_at_idx on games (updated_at);`;

const FRESH = `updated_at > now() - make_interval(secs => ${EXPIRY_SECONDS})`;

export function postgresBackend(connectionString: string): Backend {
  // One connection per serverless instance is plenty; Neon closes idle ones when it scales to zero.
  const pool = new Pool({ connectionString, max: 2, idleTimeoutMillis: 10_000 });
  let ready: Promise<unknown> | null = null;
  const q = async <R extends object = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
    ready ??= pool.query(SCHEMA).catch((e) => {
      ready = null;
      throw e;
    });
    await ready;
    return pool.query<R>(sql, params);
  };

  return {
    name: "postgres",
    async load(id) {
      const { rows } = await q<{ data: Game }>(`select data from games where id = $1 and ${FRESH}`, [id]);
      return rows[0]?.data ?? null;
    },
    async loadVersion(id) {
      const { rows } = await q<{ version: number }>(`select version from games where id = $1 and ${FRESH}`, [id]);
      return rows[0] ? Number(rows[0].version) : null;
    },
    async save(game, expected) {
      const data = JSON.stringify(game);
      if (expected === -1) {
        const { rowCount } = await q(
          "insert into games (id, version, data, updated_at) values ($1, $2, $3, now()) on conflict (id) do nothing",
          [game.id, game.version, data]
        );
        return rowCount === 1;
      }
      const { rowCount } = await q(
        "update games set version = $2, data = $3, updated_at = now() where id = $1 and version = $4",
        [game.id, game.version, data, expected]
      );
      return rowCount === 1;
    },
    async list() {
      const { rows } = await q<{ data: Game }>(`select data from games where ${FRESH} order by updated_at desc limit 1000`);
      return rows.map((r) => r.data);
    },
    async remove(ids) {
      if (!ids.length) return 0;
      const { rowCount } = await q("delete from games where id = any($1)", [ids]);
      return rowCount ?? 0;
    },
    async cleanup() {
      const { rowCount } = await q(`delete from games where not (${FRESH})`);
      return rowCount ?? 0;
    },
  };
}
