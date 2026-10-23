"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BOARD_SIZE, LETTER_VALUES, PREMIUMS, RACK_SIZE, type Premium } from "@/lib/constants";
import { analyzePlay, idx, type BoardTile, type GameView, type Settings, type Tile } from "@/lib/engine";
import { SettingsForm } from "../../SettingsForm";
import { Celebration, type CelebrationEvent } from "./Celebration";

type Placed = { tileId: string; letter: string; blank: boolean };

const PREMIUM_LABEL: Record<NonNullable<Premium>, string> = { TW: "TRIPLE WORD", DW: "DOUBLE WORD", TL: "TRIPLE LETTER", DL: "DOUBLE LETTER" };

export function GameClient({ id }: { id: string }) {
  const tokenKey = `scrabble-token-${id}`;
  const [token, setToken] = useState<string | null>(null);
  const [view, setView] = useState<GameView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [celebration, setCelebration] = useState<CelebrationEvent | null>(null);
  const [celebrate, setCelebrate] = useState(true);
  const celebrateRef = useRef(true);
  const versionRef = useRef<number | null>(null);
  const logLenRef = useRef<number | null>(null);

  // ---------- server sync ----------

  useEffect(() => {
    try {
      setToken(localStorage.getItem(tokenKey));
      const off = localStorage.getItem("scrabble-celebrations") === "off";
      setCelebrate(!off);
      celebrateRef.current = !off;
    } catch {}
  }, [tokenKey]);

  // Preview the animations with ?celebrate=bingo or ?celebrate=win.
  useEffect(() => {
    const demo = new URLSearchParams(window.location.search).get("celebrate");
    if (demo === "bingo") setCelebration({ kind: "bingo", title: "BINGO! Preview played RETAINS for 64", key: Date.now() });
    if (demo === "win") setCelebration({ kind: "win", title: "🏆 Preview wins!", key: Date.now() });
  }, []);

  const toggleCelebrate = useCallback(() => {
    const next = !celebrateRef.current;
    celebrateRef.current = next;
    setCelebrate(next);
    if (!next) setCelebration(null);
    try {
      localStorage.setItem("scrabble-celebrations", next ? "on" : "off");
    } catch {}
  }, []);

  const applyView = useCallback((v: GameView) => {
    versionRef.current = v.version;
    // Pop up the outcome of challenges and the end of the game.
    if (logLenRef.current != null && v.log.length > logLenRef.current) {
      const fresh = v.log.slice(logLenRef.current - v.log.length);
      const notable = [...fresh].reverse().find((l) => l.kind === "challenge-success" || l.kind === "challenge-fail" || l.kind === "end");
      if (notable) setToast(notable.text);
      if (celebrateRef.current) {
        const end = fresh.find((l) => l.kind === "end");
        const bingo = [...fresh].reverse().find((l) => l.kind === "play" && l.bingo);
        if (end) {
          const top = Math.max(...v.players.map((p) => p.score));
          const winners = v.players.filter((p) => p.score === top).map((p) => p.name);
          setCelebration({ kind: "win", title: `🏆 ${winners.join(" & ")} ${winners.length > 1 ? "tie" : "wins"}!`, key: Date.now() });
        } else if (bingo) {
          setCelebration({ kind: "bingo", title: `BINGO! ${bingo.text.replace(/ \(bingo!\)$/, "")}`, key: Date.now() });
        }
      }
    }
    logLenRef.current = v.log.length;
    setView(v);
  }, []);

  const poll = useCallback(async () => {
    const since = versionRef.current;
    const res = await fetch(`/api/games/${id}${since != null ? `?since=${since}` : ""}`, {
      headers: token ? { "x-player-token": token } : {},
      cache: "no-store",
    });
    if (res.status === 404) return setNotFound(true);
    if (!res.ok) return;
    const data = await res.json();
    if (data.game) applyView(data.game);
  }, [id, token, applyView]);

  useEffect(() => {
    versionRef.current = null;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      try {
        await poll();
      } catch {}
      if (!stop) timer = setTimeout(loop, document.hidden ? 5000 : 1500);
    };
    loop();
    const onVis = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        loop();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [poll]);

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError("");
      try {
        const res = await fetch(`/api/games/${id}/action`, {
          method: "POST",
          headers: { "content-type": "application/json", ...(token ? { "x-player-token": token } : {}) },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (data.token) {
          localStorage.setItem(tokenKey, data.token);
          setToken(data.token);
        }
        if (data.game) applyView(data.game);
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [id, token, tokenKey, applyView]
  );

  if (notFound)
    return (
      <main className="home">
        <div className="card">
          <h2>Game {id} not found</h2>
          <p>Check the code, or the game may have expired.</p>
          <Link href="/">Back home</Link>
        </div>
      </main>
    );
  if (!view) return <main className="home"><p>Loading…</p></main>;
  if (view.status === "lobby") return <Lobby view={view} act={act} busy={busy} error={error} />;
  return (
    <>
      <Table
        view={view}
        act={act}
        busy={busy}
        error={error}
        setError={setError}
        toast={toast}
        clearToast={() => setToast("")}
        celebrate={celebrate}
        toggleCelebrate={toggleCelebrate}
      />
      {celebration && <Celebration key={celebration.key} event={celebration} onDone={() => setCelebration(null)} />}
    </>
  );
}

// ---------- lobby ----------

type Act = (body: Record<string, unknown>) => Promise<boolean>;

function Lobby({ view, act, busy, error }: { view: GameView; act: Act; busy: boolean; error: string }) {
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);
  const isHost = view.you?.id === view.hostId;
  const link = typeof window !== "undefined" ? window.location.href : "";

  return (
    <main className="home">
      <Link href="/" className="back">← Home</Link>
      <section className="card">
        <h2>Game {view.id}</h2>
        <p>Share this link with up to {5 - view.players.length} more player{5 - view.players.length === 1 ? "" : "s"}:</p>
        <div className="share">
          <input readOnly value={link} onFocus={(e) => e.target.select()} />
          <button
            onClick={() => {
              navigator.clipboard?.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <h3>Players ({view.players.length}/5)</h3>
        <ul className="players-list">
          {view.players.map((p) => (
            <li key={p.id}>
              {p.name}
              {p.id === view.hostId && <span className="badge">host</span>}
              {p.id === view.you?.id && <span className="badge you">you</span>}
            </li>
          ))}
        </ul>

        {!view.you && view.players.length < 5 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act({ type: "join", name });
            }}
          >
            <label>
              Your name
              <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} autoFocus />
            </label>
            <button className="primary" disabled={busy || !name.trim()}>Join game</button>
          </form>
        )}

        <h3>Rules</h3>
        <SettingsForm
          settings={view.settings}
          disabled={!isHost || busy}
          onChange={(s: Settings) => act({ type: "settings", settings: s })}
        />

        {isHost ? (
          <button className="primary" disabled={busy || view.players.length < 2} onClick={() => act({ type: "start" })}>
            {view.players.length < 2 ? "Waiting for players…" : `Start game with ${view.players.length} players`}
          </button>
        ) : (
          view.you && <p className="muted">Waiting for the host to start…</p>
        )}
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}

// ---------- game table ----------

function TileFace({ letter, blank, small }: { letter: string; blank?: boolean; small?: boolean }) {
  return (
    <>
      <span className="letter">{letter === "?" ? "" : letter}</span>
      {!blank && letter !== "?" && !small && <span className="value">{LETTER_VALUES[letter]}</span>}
    </>
  );
}

function Table({
  view,
  act,
  busy,
  error,
  setError,
  toast,
  clearToast,
  celebrate,
  toggleCelebrate,
}: {
  view: GameView;
  act: Act;
  busy: boolean;
  error: string;
  setError: (s: string) => void;
  toast: string;
  clearToast: () => void;
  celebrate: boolean;
  toggleCelebrate: () => void;
}) {
  const me = view.you;
  const myTurn = !!me && view.status === "playing" && view.players[view.turn]?.id === me.id;
  const rack = useMemo(() => me?.rack ?? [], [me]);
  const rackById = useMemo(() => new Map(rack.map((t) => [t.id, t])), [rack]);

  const [order, setOrder] = useState<string[]>([]);
  const [placed, setPlaced] = useState<Map<number, Placed>>(new Map());
  const [selected, setSelected] = useState<string | null>(null);
  const [exchangeMode, setExchangeMode] = useState(false);
  const [exchangeSel, setExchangeSel] = useState<Set<string>>(new Set());
  const [blankAt, setBlankAt] = useState<{ cell: number; tileId: string } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // Keep local rack order and tentative placements in sync with the server rack and board.
  useEffect(() => {
    setOrder((prev) => {
      const ids = rack.map((t) => t.id);
      return [...prev.filter((i) => ids.includes(i)), ...ids.filter((i) => !prev.includes(i))];
    });
    setPlaced((prev) => {
      const next = new Map([...prev].filter(([cell, p]) => rackById.has(p.tileId) && !view.board[cell]));
      return next.size === prev.size ? prev : next;
    });
  }, [rack, rackById, view.board]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [view.log.length]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clearToast, 8000);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  const placedIds = new Set([...placed.values()].map((p) => p.tileId));
  const rackTiles = order.map((i) => rackById.get(i)).filter((t): t is Tile => !!t && !placedIds.has(t.id));

  const preview = useMemo(() => {
    if (placed.size === 0) return null;
    try {
      const placements = [...placed].map(([cell, p]) => ({
        r: Math.floor(cell / BOARD_SIZE),
        c: cell % BOARD_SIZE,
        tile: { id: p.tileId, letter: p.letter, blank: p.blank } as BoardTile,
      }));
      return { ok: true as const, ...analyzePlay(view.board, placements) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [placed, view.board]);

  const pendingCells = new Set((view.pending?.cells ?? []).map(([r, c]) => idx(r, c)));
  const lastCells = new Set((view.lastPlay?.cells ?? []).map(([r, c]) => idx(r, c)));
  const pendingAuthor = view.pending ? view.players.find((p) => p.id === view.pending!.playerId) : null;
  const canChallenge = !!me && !!view.pending && view.pending.playerId !== me.id && view.status === "playing";
  const mustAccept = myTurn && !!view.pending?.wentOut;

  function placeTile(cell: number, tileId: string) {
    if (view.board[cell] || !myTurn || exchangeMode) return;
    const t = rackById.get(tileId);
    if (!t) return;
    setPlaced((prev) => {
      const next = new Map([...prev].filter(([, p]) => p.tileId !== tileId));
      if (t.letter === "?") {
        next.delete(cell);
        setBlankAt({ cell, tileId });
        return next;
      }
      next.set(cell, { tileId, letter: t.letter, blank: false });
      return next;
    });
    setSelected(null);
  }

  function onSquareClick(cell: number) {
    // Clicking a tentatively placed tile sends it back to the rack.
    if (placed.has(cell)) {
      setPlaced((prev) => {
        const next = new Map(prev);
        next.delete(cell);
        return next;
      });
      return;
    }
    if (selected) placeTile(cell, selected);
  }

  function recall() {
    setPlaced(new Map());
    setSelected(null);
  }

  function shuffleRack() {
    setOrder((o) => {
      const a = [...o];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    });
  }

  async function submitPlay() {
    const placements = [...placed].map(([cell, p]) => ({
      r: Math.floor(cell / BOARD_SIZE),
      c: cell % BOARD_SIZE,
      tileId: p.tileId,
      letter: p.blank ? p.letter : undefined,
    }));
    if (await act({ type: "play", placements })) recall();
  }

  async function submitExchange() {
    if (await act({ type: "exchange", tileIds: [...exchangeSel] })) {
      setExchangeMode(false);
      setExchangeSel(new Set());
    }
  }

  function challengeNow() {
    const p = view.pending!;
    const penalty =
      view.settings.failedChallenge === "lose-turn"
        ? "If every word is valid, you lose your next turn."
        : view.settings.failedChallenge === "bonus-5"
          ? `If every word is valid, ${pendingAuthor?.name} gets 5 extra points.`
          : "";
    if (confirm(`Challenge ${pendingAuthor?.name}'s play: ${p.words.map((w) => w.word).join(", ")}?\n\n${penalty}`)) {
      act({ type: "challenge" });
    }
  }

  const winnerScore = Math.max(...view.players.map((p) => p.score));

  return (
    <main className="table">
      <header className="topbar">
        <Link href="/" className="back">← Home</Link>
        <span>Game {view.id}</span>
        <span className="muted">{view.bagCount} tiles in bag</span>
        <button className="link-btn" onClick={toggleCelebrate} title="Dancing critters for bingos and wins">
          {celebrate ? "🦄 Celebrations on" : "Celebrations off"}
        </button>
      </header>

      <div className="layout">
        <div className="board-col">
          <StatusBanner
            view={view}
            myTurn={myTurn}
            pendingAuthorName={pendingAuthor?.name}
            isAuthor={!!me && view.pending?.playerId === me.id}
            canChallenge={canChallenge}
            mustAccept={mustAccept}
            busy={busy}
            onChallenge={challengeNow}
            onAccept={() => act({ type: "accept" })}
          />

          <div className="board">
            {PREMIUMS.flatMap((row, r) =>
              row.map((prem, c) => {
                const cell = idx(r, c);
                const t = view.board[cell];
                const p = placed.get(cell);
                const cls = ["sq", prem ? prem.toLowerCase() : "", r === 7 && c === 7 ? "star" : ""];
                return (
                  <div
                    key={cell}
                    className={cls.join(" ")}
                    onClick={() => onSquareClick(cell)}
                    onDragOver={(e) => {
                      if (!t && myTurn) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      placeTile(cell, e.dataTransfer.getData("text/plain"));
                    }}
                  >
                    {t ? (
                      <div className={`tile ${t.blank ? "blank" : ""} ${pendingCells.has(cell) ? "pending" : lastCells.has(cell) ? "last" : ""}`}>
                        <TileFace letter={t.letter} blank={t.blank} />
                      </div>
                    ) : p ? (
                      <div
                        className={`tile tentative ${p.blank ? "blank" : ""}`}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", p.tileId)}
                      >
                        <TileFace letter={p.letter} blank={p.blank} />
                      </div>
                    ) : (
                      <span className="sq-label">{r === 7 && c === 7 ? "★" : prem ? PREMIUM_LABEL[prem] : ""}</span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {me && view.status === "playing" && (
            <>
              <div
                className="rack"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain");
                  setPlaced((prev) => new Map([...prev].filter(([, p]) => p.tileId !== id)));
                }}
              >
                {rackTiles.map((t) => (
                  <div
                    key={t.id}
                    className={`tile rack-tile ${t.letter === "?" ? "blank" : ""} ${selected === t.id ? "selected" : ""} ${exchangeSel.has(t.id) ? "exchange" : ""}`}
                    draggable={myTurn && !exchangeMode}
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                    onClick={() => {
                      if (exchangeMode) {
                        setExchangeSel((s) => {
                          const n = new Set(s);
                          if (n.has(t.id)) n.delete(t.id);
                          else n.add(t.id);
                          return n;
                        });
                      } else setSelected(selected === t.id ? null : t.id);
                    }}
                  >
                    <TileFace letter={t.letter} />
                  </div>
                ))}
                {Array.from({ length: Math.max(0, RACK_SIZE - rackTiles.length - placed.size) }).map((_, i) => (
                  <div key={`e${i}`} className="rack-slot" />
                ))}
              </div>

              <div className="controls">
                {exchangeMode ? (
                  <>
                    <span className="muted">Tap tiles to swap.</span>
                    <button className="primary" disabled={busy || exchangeSel.size === 0} onClick={submitExchange}>
                      Exchange {exchangeSel.size || ""}
                    </button>
                    <button onClick={() => (setExchangeMode(false), setExchangeSel(new Set()))}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button
                      className="primary"
                      disabled={!myTurn || busy || !preview?.ok || mustAccept}
                      onClick={submitPlay}
                    >
                      {preview?.ok ? `Play ${preview.score}` : "Play"}
                    </button>
                    <button onClick={recall} disabled={placed.size === 0}>Recall</button>
                    <button onClick={shuffleRack}>Shuffle</button>
                    <button
                      disabled={!myTurn || busy || view.bagCount < RACK_SIZE || mustAccept}
                      title={view.bagCount < RACK_SIZE ? "Exchanges need at least 7 tiles in the bag" : ""}
                      onClick={() => (recall(), setExchangeMode(true))}
                    >
                      Exchange
                    </button>
                    <button
                      disabled={!myTurn || busy || mustAccept}
                      onClick={() => confirm("Pass your turn?") && act({ type: "pass" })}
                    >
                      Pass
                    </button>
                  </>
                )}
              </div>
              {preview && !preview.ok && <p className="hint">{preview.error}</p>}
              {preview?.ok && (
                <p className="hint">
                  {preview.words.map((w) => `${w.word} ${w.score}`).join(" + ")}
                  {preview.bingo ? " + 50 bingo" : ""}
                </p>
              )}
              {!myTurn && placed.size === 0 && <p className="hint">Tip: you can arrange tiles while you wait.</p>}
            </>
          )}
          {error && <p className="error">{error}</p>}
        </div>

        <aside className="side">
          <section className="card scores">
            {view.players.map((p, i) => (
              <div
                key={p.id}
                className={`score-row ${i === view.turn && view.status === "playing" ? "turn" : ""} ${view.status === "finished" && p.score === winnerScore ? "winner" : ""}`}
              >
                <span className="name">
                  {view.status === "finished" && p.score === winnerScore ? "🏆 " : ""}
                  {p.name}
                  {p.id === me?.id && <span className="badge you">you</span>}
                  {p.skipNext && <span className="badge warn">loses next turn</span>}
                </span>
                <span className="muted small">{p.rackCount} tiles</span>
                <span className="pts">{p.score}</span>
              </div>
            ))}
          </section>

          <section className="card log" ref={logRef}>
            {view.log
              .filter((l) => l.kind !== "join")
              .map((l, i) => (
                <p key={i} className={`log-${l.kind}`}>{l.text}</p>
              ))}
          </section>

          {view.status !== "lobby" && Object.keys(view.unseen).length > 0 && (
            <details className="card unseen">
              <summary>Unseen tiles ({Object.values(view.unseen).reduce((a, b) => a + b, 0)})</summary>
              <p className="mono">
                {Object.entries(view.unseen)
                  .sort(([a], [b]) => (a === "?" ? 1 : b === "?" ? -1 : a.localeCompare(b)))
                  .map(([l, n]) => `${l === "?" ? "blank" : l}×${n}`)
                  .join("  ")}
              </p>
            </details>
          )}
        </aside>
      </div>

      {blankAt && (
        <div className="modal-bg" onClick={() => setBlankAt(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Choose a letter for the blank</h3>
            <div className="letters">
              {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((l) => (
                <button
                  key={l}
                  onClick={() => {
                    setPlaced((prev) => new Map(prev).set(blankAt.cell, { tileId: blankAt.tileId, letter: l, blank: true }));
                    setBlankAt(null);
                    setError("");
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" onClick={clearToast}>
          {toast}
        </div>
      )}
    </main>
  );
}

function StatusBanner(props: {
  view: GameView;
  myTurn: boolean;
  pendingAuthorName?: string;
  isAuthor: boolean;
  canChallenge: boolean;
  mustAccept: boolean;
  busy: boolean;
  onChallenge: () => void;
  onAccept: () => void;
}) {
  const { view, myTurn, pendingAuthorName, isAuthor, canChallenge, mustAccept, busy } = props;
  if (view.status === "finished") return <div className="banner done">{view.endReason ?? "Game over"}</div>;
  const current = view.players[view.turn];
  const pend = view.pending;
  return (
    <div className={`banner ${myTurn ? "mine" : ""}`}>
      <div>
        <strong>{myTurn ? "Your turn" : `${current?.name}'s turn`}</strong>
        {view.settings.wordCheck === "challenge" && pend && (
          <div className="pending-line">
            {isAuthor ? "You" : pendingAuthorName} played <b>{pend.words.map((w) => w.word).join(", ")}</b> for {pend.score}
            {pend.bingo ? " (bingo)" : ""}.{" "}
            {isAuthor
              ? "It can be challenged until the next player moves."
              : mustAccept
                ? "That was their last tile: accept to end the game, or challenge."
                : myTurn
                  ? "Making your move accepts it."
                  : "You can challenge until the next player moves."}
          </div>
        )}
      </div>
      <div className="banner-actions">
        {canChallenge && (
          <button className="danger" disabled={busy} onClick={props.onChallenge}>
            Challenge
          </button>
        )}
        {mustAccept && (
          <button className="primary" disabled={busy} onClick={props.onAccept}>
            Accept
          </button>
        )}
      </div>
    </div>
  );
}
