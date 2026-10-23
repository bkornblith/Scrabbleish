import type { Game } from "../engine";
import { EXPIRY_SECONDS, type Backend } from "./types";

// Local development only: state lives in this Node process.
type Entry = { v: number; data: string; savedAt: number };
const mem: Map<string, Entry> = ((globalThis as unknown as { __scrabbleMem?: Map<string, Entry> }).__scrabbleMem ??= new Map());

function prune() {
  const cutoff = Date.now() - EXPIRY_SECONDS * 1000;
  let n = 0;
  for (const [id, e] of mem) if (e.savedAt < cutoff && mem.delete(id)) n++;
  return n;
}

export const memoryBackend: Backend = {
  name: "memory",
  async load(id) {
    prune();
    const e = mem.get(id);
    return e ? (JSON.parse(e.data) as Game) : null;
  },
  async loadVersion(id) {
    prune();
    return mem.get(id)?.v ?? null;
  },
  async save(game, expected) {
    if ((mem.get(game.id)?.v ?? -1) !== expected) return false;
    mem.set(game.id, { v: game.version, data: JSON.stringify(game), savedAt: Date.now() });
    return true;
  },
  async list() {
    prune();
    return [...mem.values()].map((e) => JSON.parse(e.data) as Game);
  },
  async remove(ids) {
    return ids.filter((id) => mem.delete(id)).length;
  },
  async cleanup() {
    return prune();
  },
};
