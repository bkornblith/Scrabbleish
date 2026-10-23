import { createClient } from "@supabase/supabase-js";
import type { Game } from "../engine";
import { EXPIRY_SECONDS, type Backend } from "./types";

// Supabase Postgres. The `games` table has row-level security on and no policies, so only this
// server (using the secret/service-role key) can read it: players never see each other's racks.
// See supabase/schema.sql.

const cutoff = () => new Date(Date.now() - EXPIRY_SECONDS * 1000).toISOString();

export function supabaseBackend(url: string, secretKey: string): Backend {
  const db = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const games = () => db.from("games");
  const fail = (what: string, error: { message: string }) => {
    throw new Error(`Supabase ${what} failed: ${error.message}`);
  };

  return {
    name: "supabase",
    async load(id) {
      const { data, error } = await games().select("data").eq("id", id).gt("updated_at", cutoff()).maybeSingle();
      if (error) fail("load", error);
      return (data?.data as Game | undefined) ?? null;
    },
    async loadVersion(id) {
      const { data, error } = await games().select("version").eq("id", id).gt("updated_at", cutoff()).maybeSingle();
      if (error) fail("load", error);
      return data ? Number(data.version) : null;
    },
    async save(game, expected) {
      const row = { version: game.version, data: game, updated_at: new Date().toISOString() };
      if (expected === -1) {
        const { error } = await games().insert({ id: game.id, ...row });
        if (!error) return true;
        if (error.code === "23505") return false; // id already taken
        fail("insert", error);
      }
      const { data, error } = await games().update(row).eq("id", game.id).eq("version", expected).select("id");
      if (error) fail("save", error);
      return (data?.length ?? 0) === 1;
    },
    async list() {
      const { data, error } = await games().select("data").gt("updated_at", cutoff()).order("updated_at", { ascending: false }).limit(1000);
      if (error) fail("list", error);
      return (data ?? []).map((r) => r.data as Game);
    },
    async remove(ids) {
      if (!ids.length) return 0;
      const { data, error } = await games().delete().in("id", ids).select("id");
      if (error) fail("delete", error);
      return data?.length ?? 0;
    },
    async cleanup() {
      const { data, error } = await games().delete().lt("updated_at", cutoff()).select("id");
      if (error) fail("cleanup", error);
      return data?.length ?? 0;
    },
  };
}

/** Tells everyone watching a game that it changed, via Supabase Realtime broadcast. Only the
 *  version number is sent; clients then fetch their own (filtered) view from the API. */
export async function broadcastChange(url: string, secretKey: string, gameId: string, version: number) {
  const headers: Record<string, string> = { apikey: secretKey, "Content-Type": "application/json" };
  if (secretKey.startsWith("eyJ")) headers.Authorization = `Bearer ${secretKey}`; // legacy JWT keys
  const res = await fetch(`${url.replace(/\/$/, "")}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers,
    body: JSON.stringify({ messages: [{ topic: `game:${gameId}`, event: "changed", payload: { v: version }, private: false }] }),
  });
  if (!res.ok) console.error("Realtime broadcast failed", res.status, await res.text().catch(() => ""));
}
