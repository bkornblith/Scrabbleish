// Official English-language Scrabble board, tile values and tile distribution.

export const BOARD_SIZE = 15;
export const CENTER = 7;
export const RACK_SIZE = 7;
export const BINGO_BONUS = 50;

export type Premium = "TW" | "DW" | "TL" | "DL" | null;

// T = triple word, D = double word, t = triple letter, d = double letter, * = centre star (double word)
const TOP_HALF = [
  "T..d...T...d..T",
  ".D...t...t...D.",
  "..D...d.d...D..",
  "d..D...d...D..d",
  "....D.....D....",
  ".t...t...t...t.",
  "..d...d.d...d..",
  "T..d...*...d..T",
];
const LAYOUT = [...TOP_HALF, ...TOP_HALF.slice(0, 7).reverse()];

export const PREMIUMS: Premium[][] = LAYOUT.map((row) =>
  row.split("").map((ch) => {
    switch (ch) {
      case "T":
        return "TW";
      case "D":
      case "*":
        return "DW";
      case "t":
        return "TL";
      case "d":
        return "DL";
      default:
        return null;
    }
  })
);

export const LETTER_VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
  N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
  "?": 0,
};

// "?" is a blank tile.
export const DISTRIBUTION: Record<string, number> = {
  A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9, J: 1, K: 1, L: 4, M: 2,
  N: 6, O: 8, P: 2, Q: 1, R: 6, S: 4, T: 6, U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1,
  "?": 2,
};

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
