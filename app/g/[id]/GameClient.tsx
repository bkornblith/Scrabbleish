"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BOARD_SIZE, LETTER_VALUES, PREMIUMS, RACK_SIZE, type Premium } from "@/lib/constants";
import { analyzePlay, exchangeLimit, idx, type BoardTile, type GameView, type Settings, type Tile } from "@/lib/engine";
import { SettingsForm } from "../../SettingsForm";
import { Celebration, type CelebrationEvent } from "./Celebration";
import { ThemeToggle } from "../../ThemeToggle";
import { subscribeToGame, type RealtimeConfig } from "@/lib/realtime";

type Placed = { tileId: string; letter: string; blank: boolean };
type DropTarget = { cell: number } | { rackIdx: number } | null;
type Drag = {
  tileId: string;
  letter: string;
  blank: boolean;
  fromCell: number | null;
  x: number;
  y: number;
  grabX: number;
  grabY: number;
  lift: number; // extra upward offset on touch so the finger doesn't hide the tile
  over: DropTarget;
};

const PREMIUM_LABEL: Record<NonNullable<Premium>, string> = { TW: "Triple word", DW: "Double word", TL: "Triple letter", DL: "Double letter" };
const AVATAR_COLORS = ["#6366f1", "#e11d48", "#0d9488", "#d97706", "#7c3aed"];

type ConfirmBox = { title: string; body?: string; ok: string; danger?: boolean; onOk: () => void };

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
  const loaded = !!view;
  useEffect(() => {
    if (!loaded) return;
    const demo = new URLSearchParams(window.location.search).get("celebrate");
    if (demo === "bingo") setCelebration({ kind: "bingo", title: "BINGO! Preview played RETAINS for 64", key: Date.now() });
    if (demo === "win") setCelebration({ kind: "win", title: "🏆 Preview wins!", key: Date.now() });
  }, [loaded]);

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

  const [rtConfig, setRtConfig] = useState<RealtimeConfig | null>(null);
  const liveRef = useRef(false); // Realtime connected: pushes tell us when to refresh
  const kickRef = useRef<() => void>(() => {});

  const poll = useCallback(async () => {
    const since = versionRef.current;
    const res = await fetch(`/api/games/${id}${since != null ? `?since=${since}` : ""}`, {
      headers: token ? { "x-player-token": token } : {},
      cache: "no-store",
    });
    if (res.status === 404) {
      setNotFound(true);
      return "stop";
    }
    if (!res.ok) return "same";
    const data = await res.json();
    if (!data.game) return "same";
    if (data.realtime) setRtConfig((cur) => cur ?? data.realtime);
    applyView(data.game);
    return data.game.status === "finished" ? "stop" : "changed";
  }, [id, token, applyView]);

  // With Supabase Realtime, a push tells us when to refresh and polling is only a slow safety
  // net. Without it we poll quickly. Either way polling pauses while the tab is hidden (refreshing
  // as soon as it's visible again), slows down when nothing has happened for a while, and stops
  // once the game is over.
  useEffect(() => {
    versionRef.current = null;
    let stop = false;
    let gen = 0;
    let quietSince = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const loop = async (myGen: number) => {
      let result: "changed" | "same" | "stop" = "same";
      try {
        result = await poll();
      } catch {}
      if (stop || myGen !== gen || result === "stop" || document.hidden) return;
      if (result === "changed") quietSince = Date.now();
      const delay = liveRef.current ? 20_000 : Date.now() - quietSince > 120_000 ? 4000 : 1500;
      timer = setTimeout(() => loop(myGen), delay);
    };
    loop(gen);
    kickRef.current = () => {
      if (stop || document.hidden) return;
      clearTimeout(timer);
      quietSince = Date.now();
      loop(++gen);
    };
    const onVis = () => {
      clearTimeout(timer);
      if (!document.hidden) {
        quietSince = Date.now();
        loop(++gen);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [poll]);

  const finished = view?.status === "finished";
  useEffect(() => {
    if (!rtConfig || finished) return;
    return subscribeToGame(
      rtConfig,
      id,
      () => kickRef.current(),
      (connected) => {
        const was = liveRef.current;
        liveRef.current = connected;
        if (was && !connected) kickRef.current(); // fall back to quick polling right away
      }
    );
  }, [rtConfig, id, finished]);

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
      <div className="topbar">
        <Link href="/" className="brand">
          <img className="brand-mark" src="/logo.svg" alt="" />
          <span className="brand-name">Scrabbleish</span>
        </Link>
        <span className="sp" />
        <ThemeToggle />
      </div>
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
          {view.players.map((p, i) => (
            <li key={p.id}>
              <span className="av" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                {p.name.slice(0, 1).toUpperCase()}
              </span>
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
  const [drag, setDrag] = useState<Drag | null>(null);
  const [snapCell, setSnapCell] = useState<number | null>(null);
  const [confirmBox, setConfirmBox] = useState<ConfirmBox | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const pressRef = useRef<{ tileId: string; fromCell: number | null; x: number; y: number; rect: DOMRect; touch: boolean } | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const suppressClickRef = useRef(false);
  const dropRef = useRef<(d: Drag, target: DropTarget) => void>(() => {});

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
    if (view.board[cell] || exchangeMode) return;
    if (placed.has(cell) && placed.get(cell)!.tileId !== tileId) return;
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
    setSnapCell(cell);
  }

  function returnToRack(tileId: string, rackIdx?: number) {
    setPlaced((prev) => {
      const next = new Map([...prev].filter(([, p]) => p.tileId !== tileId));
      return next.size === prev.size ? prev : next;
    });
    if (rackIdx == null) return;
    setOrder((o) => {
      // rackIdx counts visible rack tiles (excluding the dragged one).
      const visible = o.filter((id) => id !== tileId && !placedIds.has(id));
      visible.splice(Math.min(rackIdx, visible.length), 0, tileId);
      return [...visible, ...o.filter((id) => id !== tileId && placedIds.has(id))];
    });
  }

  dropRef.current = (d, target) => {
    if (target && "cell" in target) {
      if (target.cell === d.fromCell) return setSnapCell(target.cell);
      if (!view.board[target.cell] && !placed.has(target.cell)) return placeTile(target.cell, d.tileId);
      return; // occupied: tile springs back where it came from
    }
    if (target && "rackIdx" in target) return returnToRack(d.tileId, target.rackIdx);
    if (d.fromCell != null) returnToRack(d.tileId);
  };

  // Pointer-based dragging (mouse, pen and touch) with a lifted tile that follows the pointer.
  useEffect(() => {
    const hit = (x: number, y: number): DropTarget => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const sq = el?.closest<HTMLElement>("[data-cell]");
      if (sq) return { cell: Number(sq.dataset.cell) };
      const rack = el?.closest<HTMLElement>(".rack");
      if (!rack) return null;
      const tiles = [...rack.querySelectorAll<HTMLElement>("[data-rack-idx]")];
      let i = tiles.findIndex((t) => {
        const r = t.getBoundingClientRect();
        return x < r.left + r.width / 2;
      });
      if (i < 0) i = tiles.length;
      return { rackIdx: i };
    };
    const center = (d: Drag) => [d.x - d.grabX + 26, d.y - d.grabY - d.lift + 26] as const;

    const move = (e: PointerEvent) => {
      const p = pressRef.current;
      if (!p) return;
      let d = dragRef.current;
      if (!d) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
        const placedTile = p.fromCell != null ? placedRef.current.get(p.fromCell) : null;
        const t = rackRef.current.get(p.tileId);
        if (!t) return;
        d = {
          tileId: p.tileId,
          letter: placedTile ? placedTile.letter : t.letter,
          blank: t.letter === "?",
          fromCell: p.fromCell,
          x: e.clientX,
          y: e.clientY,
          grabX: Math.min(52, Math.max(0, ((p.x - p.rect.left) / p.rect.width) * 52)),
          grabY: Math.min(52, Math.max(0, ((p.y - p.rect.top) / p.rect.height) * 52)),
          lift: p.touch ? 36 : 0,
          over: null,
        };
      }
      d = { ...d, x: e.clientX, y: e.clientY };
      const [cx, cy] = center(d);
      d.over = hit(cx, cy);
      dragRef.current = d;
      setDrag(d);
    };
    const up = () => {
      const d = dragRef.current;
      pressRef.current = null;
      if (!d) return;
      dragRef.current = null;
      suppressClickRef.current = true;
      setTimeout(() => (suppressClickRef.current = false), 0);
      setDrag(null);
      dropRef.current(d, d.over);
    };
    const cancel = () => {
      pressRef.current = null;
      dragRef.current = null;
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, []);

  const placedRef = useRef(placed);
  placedRef.current = placed;
  const rackRef = useRef(rackById);
  rackRef.current = rackById;

  useEffect(() => {
    if (snapCell == null) return;
    const t = setTimeout(() => setSnapCell(null), 350);
    return () => clearTimeout(t);
  }, [snapCell]);

  function startPress(e: React.PointerEvent<HTMLElement>, tileId: string, fromCell: number | null) {
    if (exchangeMode || (e.pointerType === "mouse" && e.button !== 0)) return;
    // Stop the browser from starting a text selection or its own native drag (which shows a
    // ghost image of the letters and highlights board labels).
    if (e.pointerType === "mouse") e.preventDefault();
    window.getSelection()?.removeAllRanges();
    pressRef.current = {
      tileId,
      fromCell,
      x: e.clientX,
      y: e.clientY,
      rect: e.currentTarget.getBoundingClientRect(),
      touch: e.pointerType === "touch",
    };
  }

  function onSquareClick(cell: number) {
    if (suppressClickRef.current) return;
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
    setConfirmBox({
      title: `Challenge ${p.words.map((w) => w.word).join(", ")}?`,
      body: `If any word isn't in the dictionary, ${pendingAuthor?.name} takes the tiles back and scores 0. ${penalty}`,
      ok: "Challenge",
      danger: true,
      onOk: () => act({ type: "challenge" }),
    });
  }

  const swapLimit = exchangeLimit(view);
  const visibleRack = rackTiles.filter((t) => t.id !== drag?.tileId);
  const overRack = !!drag?.over && "rackIdx" in drag.over;
  const winnerScore = Math.max(...view.players.map((p) => p.score));

  return (
    <main className="table" onDragStart={(e) => e.preventDefault()}>
      <header className="topbar">
        <Link href="/" className="brand">
          <img className="brand-mark" src="/logo.svg" alt="" />
          <span className="brand-name">Scrabbleish</span>
        </Link>
        <span className="pill">Game {view.id}</span>
        <span className="sp" />
        <button className="pill pill-btn" onClick={toggleCelebrate} title="Dancing critters for bingos and wins">
          {celebrate ? "🦄 On" : "🦄 Off"}
        </button>
        <ThemeToggle />
      </header>

      <div className="layout">
        <div className="board-col">

          <div className="boardwrap">
            <div className="board">
              {PREMIUMS.flatMap((row, r) =>
                row.map((prem, c) => {
                  const cell = idx(r, c);
                  const t = view.board[cell];
                  const p = placed.get(cell);
                  const over = drag?.over && "cell" in drag.over && drag.over.cell === cell;
                  const draggingThis = drag?.fromCell === cell;
                  const star = r === 7 && c === 7;
                  const cls = [
                    "sq",
                    prem ? prem.toLowerCase() : "",
                    star ? "star" : "",
                    over ? (t || (p && !draggingThis) ? "drop-bad" : "drop-ok") : "",
                    selected && !t && !p ? "targetable" : "",
                  ];
                  return (
                    <div key={cell} data-cell={cell} className={cls.join(" ")} onClick={() => onSquareClick(cell)}>
                      {t ? (
                        <div className={`tile ${t.blank ? "blank" : ""} ${pendingCells.has(cell) ? "pending" : lastCells.has(cell) ? "last" : ""}`}>
                          <TileFace letter={t.letter} blank={t.blank} />
                        </div>
                      ) : p && !draggingThis ? (
                        <div
                          className={`tile tentative ${p.blank ? "blank" : ""} ${snapCell === cell ? "snap" : ""}`}
                          onPointerDown={(e) => startPress(e, p.tileId, cell)}
                        >
                          <TileFace letter={p.letter} blank={p.blank} />
                        </div>
                      ) : star ? (
                        <span className="sq-label"><span className="ab">★</span></span>
                      ) : prem ? (
                        <span className="sq-label">
                          <span className="ab">{prem}</span>
                          <span className="full">{PREMIUM_LABEL[prem]}</span>
                        </span>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {me && view.status === "playing" && (
            <>
              <div className="rackrow">
                <button className="icon-btn" onClick={shuffleRack} title="Shuffle rack" aria-label="Shuffle rack">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></svg>
                </button>
                <div className={`rack ${overRack ? "rack-over" : ""}`}>
                  {visibleRack.flatMap((t, i, arr) => {
                    const gapAt = overRack && drag?.over && "rackIdx" in drag.over ? drag.over.rackIdx : -1;
                    const els = gapAt === i ? [<div key="gap" className="rack-gap" />] : [];
                    els.push(
                      <div
                        key={t.id}
                        data-rack-idx={i}
                        className={`tile rack-tile ${t.letter === "?" ? "blank" : ""} ${selected === t.id ? "selected" : ""}`}
                        onPointerDown={(e) => startPress(e, t.id, null)}
                        onClick={() => {
                          if (suppressClickRef.current) return;
                          setSelected(selected === t.id ? null : t.id);
                        }}
                      >
                        <TileFace letter={t.letter} />
                      </div>
                    );
                    if (i === arr.length - 1 && gapAt > i) els.push(<div key="gap" className="rack-gap" />);
                    return els;
                  })}
                  {overRack && visibleRack.length === 0 && <div key="gap" className="rack-gap" />}
                  {Array.from({ length: Math.max(0, RACK_SIZE - visibleRack.length - (overRack ? 1 : 0)) }).map((_, i) => (
                    <div key={`e${i}`} className="rack-slot" />
                  ))}
                </div>
                <button className="icon-btn" onClick={recall} disabled={placed.size === 0} title="Recall tiles" aria-label="Recall tiles">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
                </button>
              </div>

            </>
          )}
        </div>

        <aside className="side">
          <div className="side-banner">
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
          </div>

          {me && view.status === "playing" ? (
            <section className="card actions">
            <div className={`preview ${preview ? (preview.ok ? "ok" : "bad") : ""}`}>
              {preview?.ok ? (
                <>
                  {preview.words.map((w, i) => (
                    <span key={i} className="word-chip">
                      {w.word} <b>{w.score}</b>
                    </span>
                  ))}
                  {preview.bingo && <span className="word-chip bingo">Bingo <b>50</b></span>}
                </>
              ) : preview ? (
                preview.error
              ) : myTurn ? (
                "Drag tiles onto the board, or tap a tile then a square"
              ) : (
                "You can arrange tiles while you wait"
              )}
            </div>

            <div className="controls">
                  <button className="btn primary" disabled={!myTurn || busy || !preview?.ok || mustAccept} onClick={submitPlay}>
                    {preview?.ok ? `Play for ${preview.score}` : "Play"}
                  </button>
                  <button
                    className="btn"
                    disabled={!myTurn || busy || mustAccept || swapLimit === 0}
                    title={swapLimit === 0 ? "Exchanges need at least 7 tiles in the bag" : "Swap any of your tiles for new ones"}
                    onClick={() => {
                      recall();
                      setExchangeSel(new Set());
                      setExchangeMode(true);
                    }}
                  >
                    Exchange
                  </button>
                  <button
                    className="btn"
                    disabled={!myTurn || busy || mustAccept}
                    onClick={() => setConfirmBox({ title: "Pass your turn?", ok: "Pass", onOk: () => act({ type: "pass" }) })}
                  >
                    Pass
                  </button>
                  <button className="btn mobile-only" onClick={shuffleRack} aria-label="Shuffle rack">Shuffle</button>
                  <button className="btn mobile-only" onClick={recall} disabled={placed.size === 0} aria-label="Recall tiles">Recall</button>
            </div>
              {error && <p className="error center">{error}</p>}
            </section>
          ) : (
            error && <p className="error center">{error}</p>
          )}

          <section className="card">
            <h4>Players</h4>
            {view.players.map((p, i) => {
              const won = view.status === "finished" && p.score === winnerScore;
              const turn = i === view.turn && view.status === "playing";
              return (
                <div key={p.id} className={`pl ${turn ? "on" : ""} ${won ? "won" : ""}`}>
                  <span className="av" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                    {won ? "🏆" : p.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="n">
                    {p.name}
                    {p.id === me?.id && <span className="badge you">you</span>}
                    <small>
                      {turn ? "Playing · " : ""}
                      {p.rackCount} tiles
                      {p.skipNext && <span className="warn-text"> · loses next turn</span>}
                    </small>
                  </span>
                  <span className="s">{p.score}</span>
                </div>
              );
            })}
          </section>

          <section className="card bag">
            <span>Bag</span>
            <div className="bar">
              <span style={{ width: `${Math.min(100, (view.bagCount / (view.settings.bag === "double" ? 200 : 100)) * 100)}%` }} />
            </div>
            <span className="bag-n">{view.bagCount}</span>
          </section>

          <section className="card">
            <h4>Moves</h4>
            <div className="log" ref={logRef}>
              {view.log
                .filter((l) => l.kind !== "join")
                .map((l, i) => (
                  <p key={i} className={`log-${l.kind}`}>{l.text}</p>
                ))}
            </div>
          </section>

          {Object.keys(view.unseen).length > 0 && (
            <details className="card unseen">
              <summary>Unseen tiles ({Object.values(view.unseen).reduce((a, b) => a + b, 0)})</summary>
              <div className="unseen-grid">
                {Object.entries(view.unseen)
                  .sort(([a], [b]) => (a === "?" ? 1 : b === "?" ? -1 : a.localeCompare(b)))
                  .map(([l, n]) => (
                    <span key={l}>
                      <b>{l === "?" ? "␣" : l}</b>
                      {n}
                    </span>
                  ))}
              </div>
            </details>
          )}
        </aside>
      </div>

      {drag && (
        <div
          className={`tile floating ${drag.blank ? "blank" : ""} ${drag.over ? "" : "nowhere"}`}
          style={{ left: drag.x - drag.grabX, top: drag.y - drag.grabY - drag.lift }}
        >
          <TileFace letter={drag.letter} blank={drag.blank && drag.letter !== "?"} />
        </div>
      )}

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

      {exchangeMode && (
        <div className="modal-bg" onClick={() => setExchangeMode(false)}>
          <div className="modal exchange-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Exchange tiles</h3>
            <p className="muted">
              Tap the tiles to put back in the bag. You'll draw the same number of new tiles, and this uses your turn.
            </p>
            <div className="exchange-rack">
              {order
                .map((id) => rackById.get(id))
                .filter((t): t is Tile => !!t)
                .map((t) => (
                  <button
                    key={t.id}
                    className={`tile ex-tile ${t.letter === "?" ? "blank" : ""} ${exchangeSel.has(t.id) ? "picked" : ""}`}
                    onClick={() =>
                      setExchangeSel((sel) => {
                        const n = new Set(sel);
                        if (n.has(t.id)) n.delete(t.id);
                        else n.add(t.id);
                        return n;
                      })
                    }
                  >
                    <TileFace letter={t.letter} />
                  </button>
                ))}
            </div>
            <div className="exchange-meta">
              <button className="link-btn" onClick={() => setExchangeSel(new Set(order.filter((id) => rackById.has(id)).slice(0, swapLimit)))}>
                Select all
              </button>
              <button className="link-btn" onClick={() => setExchangeSel(new Set())}>Clear</button>
              <span className="sp" />
              <span className={exchangeSel.size > swapLimit ? "error" : "muted"}>
                {view.bagCount} in bag
              </span>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setExchangeMode(false)}>Cancel</button>
              <button
                className="btn primary"
                disabled={busy || exchangeSel.size === 0 || exchangeSel.size > swapLimit}
                onClick={submitExchange}
              >
                {exchangeSel.size ? `Swap ${exchangeSel.size} tile${exchangeSel.size > 1 ? "s" : ""}` : "Swap"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmBox && (
        <div className="modal-bg" onClick={() => setConfirmBox(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{confirmBox.title}</h3>
            {confirmBox.body && <p className="muted">{confirmBox.body}</p>}
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirmBox(null)}>Cancel</button>
              <button
                className={`btn ${confirmBox.danger ? "danger" : "primary"}`}
                onClick={() => {
                  confirmBox.onOk();
                  setConfirmBox(null);
                }}
              >
                {confirmBox.ok}
              </button>
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
  if (view.status === "finished")
    return (
      <div className="banner done">
        <span className="dot" />
        <div className="banner-text"><strong>{view.endReason ?? "Game over"}</strong></div>
      </div>
    );
  const current = view.players[view.turn];
  const pend = view.pending;
  return (
    <div className={`banner ${myTurn ? "mine" : ""}`}>
      <span className="dot" />
      <div className="banner-text">
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
          <button className="btn danger" disabled={busy} onClick={props.onChallenge}>
            Challenge
          </button>
        )}
        {mustAccept && (
          <button className="btn primary" disabled={busy} onClick={props.onAccept}>
            Accept
          </button>
        )}
      </div>
    </div>
  );
}
