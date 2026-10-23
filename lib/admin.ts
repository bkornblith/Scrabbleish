import { createHash, timingSafeEqual } from "node:crypto";
import type { Game } from "./engine";

// A single shared admin password, set with ADMIN_PASSWORD (defaults to "admin").
const PASSWORD = process.env.ADMIN_PASSWORD || "admin";
const digest = (s: string) => createHash("sha256").update(s).digest();

export function isAdmin(req: Request): boolean {
  const given = req.headers.get("x-admin-password");
  return given != null && timingSafeEqual(digest(given), digest(PASSWORD));
}

export type GameSummary = {
  id: string;
  status: Game["status"];
  players: { name: string; score: number }[];
  createdAt: number;
  lastActivity: number;
  moves: number;
};

export function summarize(game: Game): GameSummary {
  const lastActivity = game.log.reduce((t, e) => Math.max(t, e.at), game.createdAt);
  return {
    id: game.id,
    status: game.status,
    players: game.players.map((p) => ({ name: p.name, score: p.score })),
    createdAt: game.createdAt,
    lastActivity,
    moves: game.log.filter((e) => ["play", "exchange", "pass"].includes(e.kind)).length,
  };
}
