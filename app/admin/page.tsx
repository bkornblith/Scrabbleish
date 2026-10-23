"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { GameSummary } from "@/lib/admin";
import { ThemeToggle } from "../ThemeToggle";
import s from "./admin.module.css";

const PW_KEY = "scrabble-admin-password";
const DAY = 24 * 60 * 60 * 1000;

function ago(t: number, now: number) {
  const m = Math.round((now - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export default function Admin() {
  const [password, setPassword] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);

  const load = useCallback(async (pw: string) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/games", { headers: { "x-admin-password": pw }, cache: "no-store" });
      const data = await res.json();
      if (res.status === 401) {
        try { sessionStorage.removeItem(PW_KEY); } catch {}
        setPassword(null);
        throw new Error(data.error);
      }
      if (!res.ok) throw new Error(data.error);
      try { sessionStorage.setItem(PW_KEY, pw); } catch {}
      setPassword(pw);
      setGames(data.games);
      setNow(Date.now());
      setSelected((sel) => new Set([...sel].filter((id) => data.games.some((g: GameSummary) => g.id === id))));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(PW_KEY); } catch {}
    if (saved) load(saved);
  }, [load]);

  async function remove(ids: string[]) {
    if (!password || !ids.length) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/games", {
        method: "DELETE",
        headers: { "content-type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
    } catch (e) {
      setError((e as Error).message);
    }
    await load(password);
  }

  function toggle(id: string) {
    setSelected((sel) => {
      const next = new Set(sel);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectIdle = (days: number) =>
    setSelected(new Set((games ?? []).filter((g) => now - g.lastActivity > days * DAY).map((g) => g.id)));

  const topbar = (
    <div className="topbar">
      <Link href="/" className="brand">
        <img className="brand-mark" src="/icon.svg" alt="" />
        <span className="brand-name">Scrabbleish</span>
      </Link>
      <span className="pill">Admin</span>
      <span className="sp" />
      <ThemeToggle />
    </div>
  );

  if (!password) {
    return (
      <main className={s.wrap}>
        {topbar}
        <form
          className={`card ${s.login}`}
          onSubmit={(e) => {
            e.preventDefault();
            load(input);
          }}
        >
          <h2>Sign in</h2>
          <p className="muted">Manage and clean up stored games.</p>
          <label>
            Password
            <input type="password" autoFocus value={input} onChange={(e) => setInput(e.target.value)} />
          </label>
          <button className="btn primary" disabled={busy || !input}>Sign in</button>
          {error && <p className="error">{error}</p>}
        </form>
      </main>
    );
  }

  const all = games ?? [];
  const count = (st: GameSummary["status"]) => all.filter((g) => g.status === st).length;
  const stats: [string, number][] = [
    ["Games", all.length],
    ["Playing", count("playing")],
    ["In lobby", count("lobby")],
    ["Finished", count("finished")],
  ];
  const n = confirmIds?.length ?? 0;
  return (
    <main className={s.wrap}>
      {topbar}

      <div className={s.stats}>
        {stats.map(([label, v]) => (
          <div key={label} className={`card ${s.stat}`}>
            <span className={s.statNum}>{games ? v : "–"}</span>
            <span className={s.statLabel}>{label}</span>
          </div>
        ))}
      </div>

      <section className={`card ${s.panel}`}>
        <div className={s.toolbar}>
          <span className={s.toolLabel}>Select</span>
          {[1, 3, 7].map((d) => (
            <button key={d} className="pill pill-btn" onClick={() => selectIdle(d)}>Idle {d}d+</button>
          ))}
          <button className="pill pill-btn" onClick={() => setSelected(new Set(all.filter((g) => g.status === "finished").map((g) => g.id)))}>
            Finished
          </button>
          {selected.size > 0 && (
            <button className="pill pill-btn" onClick={() => setSelected(new Set())}>Clear</button>
          )}
          <span className="sp" />
          <button className="btn" disabled={busy} onClick={() => load(password)}>↻ Refresh</button>
          <button className="btn danger" disabled={busy || !selected.size} onClick={() => setConfirmIds([...selected])}>
            Delete{selected.size ? ` ${selected.size}` : ""}
          </button>
        </div>
        {error && <p className="error">{error}</p>}

        {all.length === 0 ? (
          <div className={s.empty}>
            <img src="/icon.svg" alt="" width={56} height={56} />
            <p>{games ? "No games stored. Everything is tidy." : "Loading…"}</p>
          </div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={selected.size === all.length}
                      onChange={(e) => setSelected(new Set(e.target.checked ? all.map((g) => g.id) : []))}
                    />
                  </th>
                  <th>Code</th>
                  <th>Last move</th>
                  <th>Status</th>
                  <th>Players</th>
                  <th>Moves</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {all.map((g) => {
                  const idle = now - g.lastActivity;
                  return (
                    <tr key={g.id} className={selected.has(g.id) ? s.sel : undefined} onClick={() => toggle(g.id)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`Select ${g.id}`} checked={selected.has(g.id)} onChange={() => toggle(g.id)} />
                      </td>
                      <td data-label="Code">
                        <a className={s.code} href={`/g/${g.id}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{g.id}</a>
                      </td>
                      <td data-label="Last move" className={idle > 7 * DAY ? s.stale : idle > DAY ? s.idle : undefined} title={new Date(g.lastActivity).toLocaleString()}>
                        {ago(g.lastActivity, now)}
                      </td>
                      <td data-label="Status"><span className={`${s.status} ${s[g.status]}`}>{g.status}</span></td>
                      <td data-label="Players" className={s.players}>
                        {g.players.map((p, i) => (
                          <span key={i} className={s.player}>{p.name || "?"} <b>{p.score}</b></span>
                        ))}
                      </td>
                      <td data-label="Moves">{g.moves}</td>
                      <td data-label="Created" title={new Date(g.createdAt).toLocaleString()}>{new Date(g.createdAt).toLocaleDateString()}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button className={s.rowDelete} disabled={busy} aria-label={`Delete ${g.id}`} onClick={() => setConfirmIds([g.id])}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className={s.note}>Games with no moves for 7 days are also removed automatically every morning.</p>

      {confirmIds && (
        <div className="modal-bg" onClick={() => setConfirmIds(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete {n === 1 ? `game ${confirmIds[0]}` : `${n} games`}?</h3>
            <p className="muted">Anyone still playing will lose the game. This can&apos;t be undone.</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirmIds(null)}>Cancel</button>
              <button
                className="btn danger"
                onClick={() => {
                  remove(confirmIds);
                  setConfirmIds(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
