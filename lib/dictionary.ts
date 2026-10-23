import { readFileSync } from "node:fs";
import path from "node:path";

// NASPA Word List 2023 (the North American Scrabble dictionary). Swap data/nwl2023.txt for
// another one-word-per-line list (e.g. Collins) to change dictionaries.
let words: Set<string> | null = null;

function load() {
  if (!words) {
    const text = readFileSync(path.join(process.cwd(), "data", "nwl2023.txt"), "utf8");
    words = new Set(text.split(/\r?\n/).map((w) => w.trim().toUpperCase()).filter(Boolean));
  }
  return words;
}

export const isWord = (word: string) => load().has(word.toUpperCase());
