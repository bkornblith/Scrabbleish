"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export type RealtimeConfig = { url: string; key: string };

let client: SupabaseClient | null = null;

/** Subscribes to "this game changed" pushes. Returns an unsubscribe function. */
export function subscribeToGame(
  cfg: RealtimeConfig,
  gameId: string,
  onChange: () => void,
  onStatus: (connected: boolean) => void
): () => void {
  let channel: RealtimeChannel | null = null;
  let closed = false;
  (async () => {
    const { createClient } = await import("@supabase/supabase-js");
    if (closed) return;
    client ??= createClient(cfg.url, cfg.key, { auth: { persistSession: false } });
    channel = client
      .channel(`game:${gameId}`)
      .on("broadcast", { event: "changed" }, () => onChange())
      .subscribe((status) => onStatus(status === "SUBSCRIBED"));
  })().catch(() => onStatus(false));
  return () => {
    closed = true;
    onStatus(false);
    if (channel && client) client.removeChannel(channel);
  };
}
