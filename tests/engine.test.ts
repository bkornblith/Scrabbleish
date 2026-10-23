import { test } from "node:test";
import assert from "node:assert/strict";
import { DISTRIBUTION, LETTER_VALUES, PREMIUMS } from "../lib/constants";
import * as E from "../lib/engine";

const WORDS = new Set(["CAT", "CATS", "AT", "TA", "QI", "CARE", "SCARE", "AE", "RETAINS", "STAINER"]);
const isWord = (w: string) => WORDS.has(w);
let seed = 1;
const rand: E.RandomInt = (n) => {
  seed = (seed * 16807) % 2147483647;
  return seed % n;
};

function setup(n = 2, settings: Partial<E.Settings> = {}) {
  const g = E.createGame("TEST", "P0", "p0", "tok0", settings);
  for (let i = 1; i < n; i++) E.addPlayer(g, `P${i}`, `p${i}`, `tok${i}`);
  E.startGame(g, "p0", rand);
  // Seats are reordered by the draw; relabel so p0 is the first to play.
  g.players.forEach((p, i) => Object.assign(p, { id: `p${i}`, token: `tok${i}`, name: `P${i}` }));
  return g;
}

/** Give the current player a rack containing these letters. */
function rig(g: E.Game, playerIdx: number, letters: string) {
  const p = g.players[playerIdx];
  g.bag.push(...p.rack);
  p.rack = [];
  for (const l of letters) {
    let i = g.bag.findIndex((t) => t.letter === l);
    if (i < 0) {
      // Steal it from another rack, giving them a bag tile instead.
      const other = g.players.find((o) => o.rack.some((t) => t.letter === l))!;
      const j = other.rack.findIndex((t) => t.letter === l);
      const k = g.bag.findIndex((t) => !letters.includes(t.letter));
      [other.rack[j], g.bag[k]] = [g.bag[k], other.rack[j]];
      i = k;
    }
    p.rack.push(g.bag.splice(i, 1)[0]);
  }
}
const place = (g: E.Game, pi: number, word: string, r: number, c: number, horiz = true, blanks: Record<number, string> = {}) => {
  const rack = [...g.players[pi].rack];
  return [...word].map((ch, i) => {
    const want = blanks[i] ? "?" : ch;
    const t = rack.splice(rack.findIndex((x) => x.letter === want), 1)[0];
    return { r: horiz ? r : r + i, c: horiz ? c + i : c, tileId: t.id, letter: blanks[i] };
  });
};

test("official board, values, distribution", () => {
  const count = (p: string) => PREMIUMS.flat().filter((x) => x === p).length;
  assert.equal(count("TW"), 8);
  assert.equal(count("DW"), 17);
  assert.equal(count("TL"), 12);
  assert.equal(count("DL"), 24);
  assert.equal(PREMIUMS[7][7], "DW");
  assert.equal(PREMIUMS[0][3], "DL");
  assert.equal(PREMIUMS[5][5], "TL");
  const tiles = Object.values(DISTRIBUTION).reduce((a, b) => a + b, 0);
  assert.equal(tiles, 100);
  const points = Object.entries(DISTRIBUTION).reduce((s, [l, n]) => s + n * LETTER_VALUES[l], 0);
  assert.equal(points, 187);
});

test("start: 7 tiles each, draw decides first player", () => {
  const g = setup(5);
  assert.equal(g.players.length, 5);
  assert.ok(g.players.every((p) => p.rack.length === 7));
  assert.equal(g.bag.length, 65);
  assert.ok(g.log.some((l) => l.kind === "draw"));
});

test("first move must cover centre and scores double", () => {
  const g = setup();
  rig(g, 0, "CATSXYZ");
  assert.throws(() => E.play(g, "p0", place(g, 0, "CAT", 0, 0), isWord), /centre/);
  E.play(g, "p0", place(g, 0, "CAT", 7, 6), isWord);
  assert.equal(g.pending!.score, 10);
  assert.equal(g.turn, 1);
  // Score is added (and rack refilled) once the next player moves.
  E.pass(g, "p1");
  assert.equal(g.players[0].score, 10);
  assert.equal(g.players[0].rack.length, 7);
});

test("hooks: cross words score, premiums only count for new tiles", () => {
  const g = setup();
  rig(g, 0, "CATEEIO");
  E.play(g, "p0", place(g, 0, "CAT", 7, 6), isWord); // C(7,6) A(7,7) T(7,8)
  rig(g, 1, "SCAREEE");
  // CARE down from C at (7,6): new tiles A(8,6) DL, R(9,6), E(10,6). C=3 + A*2=2 + R1 + E1 = 7
  E.play(g, "p1", place(g, 1, "ARE", 8, 6, false), isWord);
  assert.deepEqual(g.pending!.words.map((w) => w.word), ["CARE"]);
  assert.equal(g.pending!.score, 7);
});

test("geometry errors", () => {
  const g = setup();
  rig(g, 0, "CATSXYZ");
  const p = place(g, 0, "CAT", 7, 6);
  p[2].c = 10;
  assert.throws(() => E.play(g, "p0", p, isWord), /continuous/);
  const q = place(g, 0, "CAT", 7, 6);
  q[1].r = 8;
  assert.throws(() => E.play(g, "p0", q, isWord), /single row or column/);
  assert.throws(() => E.play(g, "p1", place(g, 0, "CAT", 7, 6), isWord), /not your turn/);
});

test("successful challenge: phony removed, zero points, tiles returned", () => {
  const g = setup(3);
  rig(g, 0, "XQZTEAB");
  E.play(g, "p0", place(g, 0, "ZEX", 7, 6), isWord);
  const res = E.challenge(g, "p2", isWord);
  assert.equal(res.valid, false);
  assert.deepEqual(res.invalidWords, ["ZEX"]);
  assert.ok(g.board.every((t) => !t));
  assert.equal(g.players[0].score, 0);
  assert.equal(g.players[0].rack.length, 7);
  assert.equal(g.turn, 1, "challenged player has lost their turn");
});

test("failed challenge by next player: play stands and challenger loses turn", () => {
  const g = setup(3);
  rig(g, 0, "CATEEIO");
  E.play(g, "p0", place(g, 0, "CAT", 7, 6), isWord);
  E.challenge(g, "p1", isWord);
  assert.equal(g.players[0].score, 10);
  assert.equal(g.turn, 2);
});

test("failed challenge by a later player: they lose their next turn", () => {
  const g = setup(3);
  rig(g, 0, "CATEEIO");
  E.play(g, "p0", place(g, 0, "CAT", 7, 6), isWord);
  E.challenge(g, "p2", isWord);
  assert.equal(g.turn, 1);
  E.pass(g, "p1");
  assert.equal(g.turn, 0, "p2 skipped");
  assert.ok(g.log.some((l) => l.kind === "lost-turn" && l.playerId === "p2"));
});

test("bonus-5 failed challenge setting", () => {
  const g = setup(2, { failedChallenge: "bonus-5" });
  rig(g, 0, "CATEEIO");
  E.play(g, "p0", place(g, 0, "CAT", 7, 6), isWord);
  E.challenge(g, "p1", isWord);
  assert.equal(g.players[0].score, 15);
  assert.equal(g.turn, 1);
});

test("cannot challenge after the next player has moved", () => {
  const g = setup(2);
  rig(g, 0, "ZEXTQAB");
  E.play(g, "p0", place(g, 0, "ZEX", 7, 6), isWord);
  E.pass(g, "p1");
  assert.throws(() => E.challenge(g, "p1", isWord), /no play to challenge/);
});

test("auto mode rejects invalid words without penalty", () => {
  const g = setup(2, { wordCheck: "auto" });
  rig(g, 0, "ZEXTQAB");
  assert.throws(() => E.play(g, "p0", place(g, 0, "ZEX", 7, 6), isWord), /Not in the dictionary/);
  assert.equal(g.turn, 0);
});

test("bingo adds 50, blanks score 0", () => {
  const g = setup();
  rig(g, 0, "RETAIN?");
  E.play(g, "p0", place(g, 0, "RETAINS", 7, 3, true, { 6: "S" }), isWord);
  // R E T(7,5)... row 7: col3 DL. R*2=2,E1,T1,A1,I1,N1,S(blank)0 = 7, x2 centre = 14, +50
  assert.equal(g.pending!.score, 64);
  assert.ok(g.pending!.bingo);
});

test("exchange needs 7 in bag; going out ends the game with rack adjustments", () => {
  const g = setup();
  rig(g, 0, "CATEEIO");
  rig(g, 1, "EEEEEEE");
  g.bag.splice(0, g.bag.length - 3);
  assert.throws(() => E.exchange(g, "p0", [g.players[0].rack[0].id], rand), /at least 7/);
  // Empty the bag and leave p0 with only CAT.
  g.bag = [];
  g.players[0].rack = g.players[0].rack.filter((t) => "CAT".includes(t.letter));
  E.play(g, "p0", place(g, 0, "CAT", 7, 6), isWord);
  assert.ok(g.pending);
  assert.throws(() => E.pass(g, "p1"), /Accept or challenge/);
  E.accept(g, "p1");
  assert.equal(g.status, "finished");
  assert.equal(g.players[0].score, 10 + 7);
  assert.equal(g.players[1].score, -7);
});

test("six scoreless turns end the game", () => {
  const g = setup(2);
  for (let i = 0; i < 6; i++) E.pass(g, g.players[g.turn].id);
  assert.equal(g.status, "finished");
});

test("view hides other racks and the bag", () => {
  const g = setup(3);
  const v = E.viewFor(g, "tok1");
  assert.equal(v.you!.id, "p1");
  const json = JSON.stringify(v);
  assert.ok(!json.includes("tok0") && !json.includes("tok2"));
  assert.equal(v.bagCount, g.bag.length);
  assert.equal(Object.values(v.unseen).reduce((a, b) => a + b, 0), 100 - 7);
});
