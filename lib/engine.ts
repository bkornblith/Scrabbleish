// Pure game engine: no I/O, no dictionary. Shared by the server (authoritative)
// and the client (for live score previews).

import {
  BINGO_BONUS,
  BOARD_SIZE,
  CENTER,
  DISTRIBUTION,
  LETTER_VALUES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PREMIUMS,
  RACK_SIZE,
} from "./constants";

export type Tile = { id: string; letter: string }; // letter "?" = blank
export type BoardTile = { id: string; letter: string; blank: boolean };
export type Placement = { r: number; c: number; tileId: string; letter?: string };

export type Settings = {
  /** "challenge": words are only checked when challenged (official rules).
   *  "auto": the server rejects invalid words immediately. */
  wordCheck: "challenge" | "auto";
  /** What happens to a player whose challenge fails. Official Hasbro rule: lose next turn. */
  failedChallenge: "lose-turn" | "bonus-5" | "none";
  /** "standard" = 100 tiles; "double" = two full sets (200 tiles) for bigger games. */
  bag: "standard" | "double";
};

export const DEFAULT_SETTINGS: Settings = {
  wordCheck: "challenge",
  failedChallenge: "lose-turn",
  bag: "standard",
};

export type Player = {
  id: string;
  name: string;
  token: string;
  rack: Tile[];
  score: number;
  skipNext: boolean;
};

export type WordInfo = { word: string; cells: [number, number][]; score: number };

export type PendingPlay = {
  playerId: string;
  placements: { r: number; c: number; tile: BoardTile }[];
  words: WordInfo[];
  score: number;
  bingo: boolean;
};

export type LogEntry = {
  at: number;
  kind:
    | "join"
    | "start"
    | "draw"
    | "play"
    | "accepted"
    | "challenge-success"
    | "challenge-fail"
    | "lost-turn"
    | "exchange"
    | "pass"
    | "end";
  playerId?: string;
  text: string;
  bingo?: boolean;
};

export type Game = {
  id: string;
  version: number;
  createdAt: number;
  status: "lobby" | "playing" | "finished";
  hostId: string;
  settings: Settings;
  players: Player[];
  turn: number; // index into players
  board: (BoardTile | null)[]; // BOARD_SIZE * BOARD_SIZE, row-major
  bag: Tile[];
  pending: PendingPlay | null;
  lastPlay: { playerId: string; cells: [number, number][] } | null;
  scorelessTurns: number;
  log: LogEntry[];
  endReason?: string;
};

export class GameError extends Error {}

// ---------- helpers ----------

export const idx = (r: number, c: number) => r * BOARD_SIZE + c;
const inBounds = (r: number, c: number) => r >= 0 && c >= 0 && r < BOARD_SIZE && c < BOARD_SIZE;

export type RandomInt = (maxExclusive: number) => number;
const defaultRandom: RandomInt = (n) => Math.floor(Math.random() * n);

function shuffle<T>(arr: T[], rand: RandomInt): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function makeBag(kind: Settings["bag"], rand: RandomInt): Tile[] {
  const sets = kind === "double" ? 2 : 1;
  const tiles: Tile[] = [];
  let n = 0;
  for (let s = 0; s < sets; s++) {
    for (const [letter, count] of Object.entries(DISTRIBUTION)) {
      for (let i = 0; i < count; i++) tiles.push({ id: `t${n++}`, letter });
    }
  }
  return shuffle(tiles, rand);
}

export const rackValue = (rack: Tile[]) => rack.reduce((s, t) => s + LETTER_VALUES[t.letter], 0);

function log(game: Game, kind: LogEntry["kind"], text: string, playerId?: string) {
  game.log.push({ at: Date.now(), kind, text, playerId });
}

const playerById = (game: Game, id: string) => {
  const p = game.players.find((pl) => pl.id === id);
  if (!p) throw new GameError("Unknown player");
  return p;
};

export const currentPlayer = (game: Game) => game.players[game.turn];

function drawTiles(game: Game, player: Player, count: number) {
  const n = Math.min(count, game.bag.length);
  player.rack.push(...game.bag.splice(0, n));
}

// ---------- lobby ----------

export function createGame(id: string, hostName: string, hostId: string, hostToken: string, settings: Partial<Settings> = {}): Game {
  const game: Game = {
    id,
    version: 0,
    createdAt: Date.now(),
    status: "lobby",
    hostId,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    players: [],
    turn: 0,
    board: Array(BOARD_SIZE * BOARD_SIZE).fill(null),
    bag: [],
    pending: null,
    lastPlay: null,
    scorelessTurns: 0,
    log: [],
  };
  addPlayer(game, hostName, hostId, hostToken);
  return game;
}

export function addPlayer(game: Game, name: string, id: string, token: string) {
  if (game.status !== "lobby") throw new GameError("This game has already started");
  if (game.players.length >= MAX_PLAYERS) throw new GameError(`This game is full (${MAX_PLAYERS} players max)`);
  const clean = name.trim().slice(0, 20);
  if (!clean) throw new GameError("Please enter a name");
  if (game.players.some((p) => p.name.toLowerCase() === clean.toLowerCase()))
    throw new GameError("That name is taken in this game");
  game.players.push({ id, name: clean, token, rack: [], score: 0, skipNext: false });
  log(game, "join", `${clean} joined`, id);
}

export function updateSettings(game: Game, playerId: string, settings: Partial<Settings>) {
  if (game.status !== "lobby") throw new GameError("Settings can only change before the game starts");
  if (playerId !== game.hostId) throw new GameError("Only the host can change settings");
  game.settings = { ...game.settings, ...settings };
}

/** Official rule: each player draws a tile; the one closest to "A" (a blank beats everything) goes first. */
export function startGame(game: Game, playerId: string, rand: RandomInt = defaultRandom) {
  if (game.status !== "lobby") throw new GameError("Game already started");
  if (playerId !== game.hostId) throw new GameError("Only the host can start the game");
  if (game.players.length < MIN_PLAYERS) throw new GameError(`Need at least ${MIN_PLAYERS} players`);

  game.bag = makeBag(game.settings.bag, rand);
  const rankOf = (l: string) => (l === "?" ? 0 : l.charCodeAt(0) - 64);

  let contenders = [...game.players];
  while (contenders.length > 1) {
    shuffle(game.bag, rand);
    const draws = contenders.map((p, i) => ({ p, tile: game.bag[i] }));
    log(
      game,
      "draw",
      "Draw for first turn: " + draws.map((d) => `${d.p.name} ${d.tile.letter === "?" ? "blank" : d.tile.letter}`).join(", ")
    );
    const best = Math.min(...draws.map((d) => rankOf(d.tile.letter)));
    contenders = draws.filter((d) => rankOf(d.tile.letter) === best).map((d) => d.p);
  }
  shuffle(game.bag, rand);

  // Seat order starts with the winner of the draw, then continues in join order.
  const first = game.players.indexOf(contenders[0]);
  game.players = [...game.players.slice(first), ...game.players.slice(0, first)];
  for (const p of game.players) drawTiles(game, p, RACK_SIZE);
  game.turn = 0;
  game.status = "playing";
  log(game, "start", `${game.players[0].name} goes first`);
}

// ---------- move analysis (no dictionary) ----------

export type Analysis = { words: WordInfo[]; score: number; bingo: boolean };

/** Validates tile geometry and computes words + score. Throws GameError on illegal placement. */
export function analyzePlay(
  board: (BoardTile | null)[],
  placements: { r: number; c: number; tile: BoardTile }[]
): Analysis {
  if (placements.length === 0) throw new GameError("Place at least one tile");
  if (placements.length > RACK_SIZE) throw new GameError("Too many tiles");

  const placed = new Map<number, BoardTile>();
  for (const { r, c, tile } of placements) {
    if (!inBounds(r, c)) throw new GameError("Tile is off the board");
    if (board[idx(r, c)]) throw new GameError("That square is already taken");
    if (placed.has(idx(r, c))) throw new GameError("Two tiles on one square");
    if (!/^[A-Z]$/.test(tile.letter)) throw new GameError("Choose a letter for each blank");
    placed.set(idx(r, c), tile);
  }
  const at = (r: number, c: number) => (inBounds(r, c) ? placed.get(idx(r, c)) ?? board[idx(r, c)] : null);

  const rows = new Set(placements.map((p) => p.r));
  const cols = new Set(placements.map((p) => p.c));
  if (rows.size > 1 && cols.size > 1) throw new GameError("Tiles must be in a single row or column");

  // Pick the main direction. For a single tile, use whichever direction forms a word.
  let horizontal: boolean;
  if (placements.length > 1) horizontal = rows.size === 1;
  else {
    const { r, c } = placements[0];
    horizontal = !!(at(r, c - 1) || at(r, c + 1)) || !(at(r - 1, c) || at(r + 1, c));
  }
  const [dr, dc] = horizontal ? [0, 1] : [1, 0];

  // Contiguity: no gaps between the first and last new tile.
  const sorted = [...placements].sort((a, b) => (horizontal ? a.c - b.c : a.r - b.r));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  for (let r = first.r, c = first.c; r <= last.r && c <= last.c; r += dr, c += dc) {
    if (!at(r, c)) throw new GameError("Tiles must form one continuous word with no gaps");
  }

  const boardEmpty = board.every((t) => !t);
  if (boardEmpty) {
    if (!placed.has(idx(CENTER, CENTER))) throw new GameError("The first word must cover the centre star");
    if (placements.length < 2) throw new GameError("The first word must be at least two letters");
  } else {
    const touches = placements.some(({ r, c }) =>
      [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].some(([rr, cc]) => inBounds(rr, cc) && board[idx(rr, cc)])
    );
    if (!touches) throw new GameError("Your word must connect to tiles already on the board");
  }

  const readWord = (r0: number, c0: number, dr: number, dc: number): WordInfo | null => {
    let r = r0;
    let c = c0;
    while (at(r - dr, c - dc)) {
      r -= dr;
      c -= dc;
    }
    const cells: [number, number][] = [];
    let word = "";
    let sum = 0;
    let wordMult = 1;
    for (; at(r, c); r += dr, c += dc) {
      const t = at(r, c)!;
      cells.push([r, c]);
      word += t.letter;
      let v = t.blank ? 0 : LETTER_VALUES[t.letter];
      if (placed.has(idx(r, c))) {
        const prem = PREMIUMS[r][c];
        if (prem === "DL") v *= 2;
        if (prem === "TL") v *= 3;
        if (prem === "DW") wordMult *= 2;
        if (prem === "TW") wordMult *= 3;
      }
      sum += v;
    }
    return cells.length >= 2 ? { word, cells, score: sum * wordMult } : null;
  };

  const words: WordInfo[] = [];
  const main = readWord(first.r, first.c, dr, dc);
  if (main) words.push(main);
  for (const { r, c } of placements) {
    const cross = readWord(r, c, dc, dr);
    if (cross) words.push(cross);
  }
  if (words.length === 0) throw new GameError("A play must form a word of at least two letters");

  const bingo = placements.length === RACK_SIZE;
  const score = words.reduce((s, w) => s + w.score, 0) + (bingo ? BINGO_BONUS : 0);
  return { words, score, bingo };
}

// ---------- turn flow ----------

function endGame(game: Game, reason: string, wentOut?: Player) {
  const lines: string[] = [];
  let bonus = 0;
  for (const p of game.players) {
    if (p === wentOut) continue;
    const v = rackValue(p.rack);
    p.score -= v;
    bonus += v;
    if (v) lines.push(`${p.name} −${v}`);
  }
  if (wentOut && bonus) {
    wentOut.score += bonus;
    lines.push(`${wentOut.name} +${bonus}`);
  }
  game.status = "finished";
  game.endReason = reason;
  const top = Math.max(...game.players.map((p) => p.score));
  const winners = game.players.filter((p) => p.score === top).map((p) => p.name);
  log(game, "end", `${reason}. ${lines.length ? "Leftover tiles: " + lines.join(", ") + ". " : ""}${winners.length > 1 ? "Tie: " + winners.join(" & ") : winners[0] + " wins"} with ${top}.`);
}

function scorelessLimit(game: Game) {
  // Tournament rule is six successive scoreless turns (two players). Scale so each player gets two.
  return Math.max(6, 2 * game.players.length);
}

function noteScoreless(game: Game) {
  game.scorelessTurns++;
  if (game.scorelessTurns >= scorelessLimit(game) && !game.pending && game.status === "playing") {
    endGame(game, `Game over after ${game.scorelessTurns} scoreless turns in a row`);
  }
}

/** Move to the next player, skipping (and consuming) any lost turns. */
function advanceTurn(game: Game) {
  for (let guard = 0; guard <= game.players.length; guard++) {
    game.turn = (game.turn + 1) % game.players.length;
    const p = currentPlayer(game);
    if (!p.skipNext) return;
    p.skipNext = false;
    log(game, "lost-turn", `${p.name} loses this turn (failed challenge)`, p.id);
    noteScoreless(game);
    if (game.status !== "playing") return;
  }
}

/** Lock in a pending play: add its score and refill the rack. */
function finalizePending(game: Game) {
  const pend = game.pending;
  if (!pend) return;
  const p = playerById(game, pend.playerId);
  p.score += pend.score;
  drawTiles(game, p, RACK_SIZE - p.rack.length);
  game.pending = null;
  if (pend.score > 0) game.scorelessTurns = 0;
  else noteScoreless(game);
  if (p.rack.length === 0 && game.bag.length === 0 && game.status === "playing") {
    endGame(game, `${p.name} played out`, p);
  }
}

function requireTurn(game: Game, playerId: string) {
  if (game.status !== "playing") throw new GameError("The game is not in progress");
  if (currentPlayer(game).id !== playerId) throw new GameError("It's not your turn");
}

/** A pending play that emptied the rack with an empty bag ends the game once accepted, so the
 *  next player must accept or challenge before doing anything else. */
export function pendingWentOut(game: Game) {
  if (!game.pending) return false;
  const p = game.players.find((pl) => pl.id === game.pending!.playerId);
  return !!p && p.rack.length === 0 && game.bag.length === 0;
}

export type WordChecker = (word: string) => boolean;

export function play(game: Game, playerId: string, placements: Placement[], isWord: WordChecker) {
  requireTurn(game, playerId);
  if (pendingWentOut(game)) throw new GameError("Accept or challenge the last play first");
  const player = playerById(game, playerId);

  // Validate tiles come from the rack before touching state.
  const rackIds = new Set(player.rack.map((t) => t.id));
  const seen = new Set<string>();
  const tiles = placements.map((pl) => {
    if (seen.has(pl.tileId) || !rackIds.has(pl.tileId)) throw new GameError("That tile isn't on your rack");
    seen.add(pl.tileId);
    const t = player.rack.find((x) => x.id === pl.tileId)!;
    const blank = t.letter === "?";
    const letter = blank ? (pl.letter ?? "").toUpperCase() : t.letter;
    return { r: pl.r, c: pl.c, tile: { id: t.id, letter, blank } };
  });

  // (Pending tiles are already on the board, so new words can build on them.)
  const analysis = analyzePlay(game.board, tiles);

  if (game.settings.wordCheck === "auto") {
    const bad = analysis.words.filter((w) => !isWord(w.word)).map((w) => w.word);
    if (bad.length) throw new GameError(`Not in the dictionary: ${bad.join(", ")}`);
  }

  // The previous player's play stands once the next player commits to a move.
  if (game.pending) acceptPending(game);
  if (game.status !== "playing") return;

  for (const t of tiles) game.board[idx(t.r, t.c)] = t.tile;
  player.rack = player.rack.filter((t) => !seen.has(t.id));
  const pend: PendingPlay = { playerId, placements: tiles, words: analysis.words, score: analysis.score, bingo: analysis.bingo };
  game.lastPlay = { playerId, cells: tiles.map((t) => [t.r, t.c]) };
  log(
    game,
    "play",
    `${player.name} played ${analysis.words.map((w) => w.word).join(", ")} for ${analysis.score}${analysis.bingo ? " (bingo!)" : ""}`,
    playerId
  );
  if (analysis.bingo) game.log[game.log.length - 1].bingo = true;

  game.pending = pend;
  if (game.settings.wordCheck === "auto") {
    finalizePending(game);
    if (game.status === "playing") advanceTurn(game);
  } else {
    advanceTurn(game);
  }
}

function acceptPending(game: Game) {
  if (!game.pending) return;
  log(game, "accepted", `${playerById(game, game.pending.playerId).name}'s play stands`, game.pending.playerId);
  finalizePending(game);
}

/** Next player explicitly accepts the previous play (needed when that play ends the game). */
export function accept(game: Game, playerId: string) {
  requireTurn(game, playerId);
  if (!game.pending) throw new GameError("Nothing to accept");
  acceptPending(game);
}

export type ChallengeResult = { valid: boolean; invalidWords: string[] };

export function challenge(game: Game, challengerId: string, isWord: WordChecker): ChallengeResult {
  if (game.status !== "playing") throw new GameError("The game is not in progress");
  const pend = game.pending;
  if (!pend) throw new GameError("There is no play to challenge");
  if (pend.playerId === challengerId) throw new GameError("You can't challenge your own play");
  const challenger = playerById(game, challengerId);
  const author = playerById(game, pend.playerId);
  const invalidWords = pend.words.filter((w) => !isWord(w.word)).map((w) => w.word);

  if (invalidWords.length) {
    // Phony: tiles come back, no score, the turn is lost.
    for (const { r, c, tile } of pend.placements) {
      game.board[idx(r, c)] = null;
      author.rack.push({ id: tile.id, letter: tile.blank ? "?" : tile.letter });
    }
    game.pending = null;
    game.lastPlay = null;
    log(
      game,
      "challenge-success",
      `${challenger.name} challenged ${author.name}: ${invalidWords.join(", ")} ${invalidWords.length > 1 ? "are" : "is"} not valid. ${author.name} takes the tiles back and scores 0.`,
      challengerId
    );
    noteScoreless(game);
    return { valid: false, invalidWords };
  }

  const words = pend.words.map((w) => w.word).join(", ");
  const penalty = game.settings.failedChallenge;
  if (penalty === "bonus-5") pend.score += 5;
  log(
    game,
    "challenge-fail",
    `${challenger.name} challenged ${author.name}: ${words} ${pend.words.length > 1 ? "are" : "is"} valid.` +
      (penalty === "lose-turn" ? ` ${challenger.name} loses their next turn.` : penalty === "bonus-5" ? ` ${author.name} gets 5 bonus points.` : ""),
    challengerId
  );
  finalizePending(game);
  if (game.status === "playing" && penalty === "lose-turn") {
    if (currentPlayer(game).id === challengerId) {
      log(game, "lost-turn", `${challenger.name} loses this turn (failed challenge)`, challengerId);
      noteScoreless(game);
      if (game.status === "playing") advanceTurn(game);
    } else {
      challenger.skipNext = true;
    }
  }
  return { valid: true, invalidWords: [] };
}

export function exchange(game: Game, playerId: string, tileIds: string[], rand: RandomInt = defaultRandom) {
  requireTurn(game, playerId);
  if (pendingWentOut(game)) throw new GameError("Accept or challenge the last play first");
  if (tileIds.length === 0) throw new GameError("Select tiles to exchange");
  // Official rule: exchanging needs at least 7 tiles in the bag. Check against the bag *after*
  // the pending play's author refills, since accepting happens first.
  const player = playerById(game, playerId);
  const ids = new Set(tileIds);
  if (ids.size !== tileIds.length || tileIds.some((id) => !player.rack.some((t) => t.id === id)))
    throw new GameError("That tile isn't on your rack");
  const pendAuthor = game.pending ? playerById(game, game.pending.playerId) : null;
  const bagAfterAccept = game.bag.length - (pendAuthor ? Math.min(game.bag.length, RACK_SIZE - pendAuthor.rack.length) : 0);
  if (bagAfterAccept < RACK_SIZE) throw new GameError("You can only exchange when at least 7 tiles are left in the bag");

  acceptPending(game);
  if (game.status !== "playing") return;
  const out = player.rack.filter((t) => ids.has(t.id));
  player.rack = player.rack.filter((t) => !ids.has(t.id));
  drawTiles(game, player, out.length);
  game.bag.push(...out);
  shuffle(game.bag, rand);
  game.lastPlay = null;
  log(game, "exchange", `${player.name} exchanged ${out.length} tile${out.length > 1 ? "s" : ""}`, playerId);
  noteScoreless(game);
  if (game.status === "playing") advanceTurn(game);
}

export function pass(game: Game, playerId: string) {
  requireTurn(game, playerId);
  if (pendingWentOut(game)) throw new GameError("Accept or challenge the last play first");
  acceptPending(game);
  if (game.status !== "playing") return;
  log(game, "pass", `${playerById(game, playerId).name} passed`, playerId);
  noteScoreless(game);
  if (game.status === "playing") advanceTurn(game);
}

// ---------- per-player view ----------

export type PublicPlayer = { id: string; name: string; score: number; rackCount: number; skipNext: boolean };

export type GameView = {
  id: string;
  version: number;
  status: Game["status"];
  hostId: string;
  settings: Settings;
  players: PublicPlayer[];
  turn: number;
  board: (BoardTile | null)[];
  bagCount: number;
  pending: { playerId: string; cells: [number, number][]; words: { word: string; score: number }[]; score: number; bingo: boolean; wentOut: boolean } | null;
  lastPlay: Game["lastPlay"];
  log: LogEntry[];
  endReason?: string;
  you: { id: string; rack: Tile[] } | null;
  /** Tiles not visible to the viewer (bag + opponents' racks), by letter. */
  unseen: Record<string, number>;
};

export function viewFor(game: Game, token: string | null): GameView {
  const me = token ? game.players.find((p) => p.token === token) ?? null : null;
  const unseen: Record<string, number> = {};
  const hidden = [...game.bag, ...game.players.filter((p) => p !== me).flatMap((p) => p.rack)];
  for (const t of hidden) unseen[t.letter] = (unseen[t.letter] ?? 0) + 1;
  return {
    id: game.id,
    version: game.version,
    status: game.status,
    hostId: game.hostId,
    settings: game.settings,
    players: game.players.map((p) => ({ id: p.id, name: p.name, score: p.score, rackCount: p.rack.length, skipNext: p.skipNext })),
    turn: game.turn,
    board: game.board,
    bagCount: game.bag.length,
    pending: game.pending
      ? {
          playerId: game.pending.playerId,
          cells: game.pending.placements.map((p) => [p.r, p.c]),
          words: game.pending.words.map((w) => ({ word: w.word, score: w.score })),
          score: game.pending.score,
          bingo: game.pending.bingo,
          wentOut: pendingWentOut(game),
        }
      : null,
    lastPlay: game.lastPlay,
    log: game.log.slice(-200),
    endReason: game.endReason,
    you: me ? { id: me.id, rack: me.rack } : null,
    unseen: game.status === "lobby" ? {} : unseen,
  };
}
