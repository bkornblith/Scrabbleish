"use client";

import { useCallback, useEffect, useState } from "react";
import type { GameSummary } from "@/lib/admin";
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
    if (!confirm(`Delete ${ids.length} game${ids.length === 1 ? "" : "s"}? This can't be undone.`)) return;
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

  if (!password) {
    return (
      <main className={s.wrap}>
        <form
          className={s.login}
          onSubmit={(e) => {
            e.preventDefault();
            load(input);
          }}
        >
          <h1>Admin</h1>
          <label>
            Password
            <input type="password" autoFocus value={input} onChange={(e) => setInput(e.target.value)} />
          </label>
          <button className="primary" disabled={busy || !input}>Sign in</button>
          {error && <p className="error">{error}</p>}
        </form>
      </main>
    );
  }

  const all = games ?? [];
  return (
    <main className={s.wrap}>
      <header className={s.head}>
        <h1>Games ({all.length})</h1>
        <div className={s.actions}>
          <button disabled={busy} onClick={() => load(password)}>Refresh</button>
          <button
            onClick={() => {
              try { sessionStorage.removeItem(PW_KEY); } catch {}
              setPassword(null);
              setGames(null);
              setInput("");
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <div className={s.toolbar}>
        <span>Select idle for more than</span>
        {[1, 3, 7, 14].map((d) => (
          <button key={d} onClick={() => selectIdle(d)}>{d} day{d > 1 ? "s" : ""}</button>
        ))}
        <button onClick={() => setSelected(new Set(all.filter((g) => g.status === "finished").map((g) => g.id)))}>
          Finished
        </button>
        <button onClick={() => setSelected(new Set())} disabled={!selected.size}>Clear</button>
        <button className={s.danger} disabled={busy || !selected.size} onClick={() => remove([...selected])}>
          Delete {selected.size || ""} selected
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <p className={s.note}>Games with no activity for 30 days are also removed automatically.</p>

      {all.length === 0 ? (
        <p className={s.note}>{games ? "No games stored." : "Loading…"}</p>
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
                <th>Last activity</th>
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
                  <tr key={g.id} className={selected.has(g.id) ? s.sel : undefined}>
                    <td>
                      <input type="checkbox" aria-label={`Select ${g.id}`} checked={selected.has(g.id)} onChange={() => toggle(g.id)} />
                    </td>
                    <td><a href={`/g/${g.id}`} target="_blank" rel="noreferrer">{g.id}</a></td>
                    <td className={idle > 7 * DAY ? s.stale : idle > DAY ? s.idle : undefined} title={new Date(g.lastActivity).toLocaleString()}>
                      {ago(g.lastActivity, now)}
                    </td>
                    <td><span className={`${s.badge} ${s[g.status]}`}>{g.status}</span></td>
                    <td>{g.players.map((p) => `${p.name || "?"} (${p.score})`).join(", ")}</td>
                    <td>{g.moves}</td>
                    <td title={new Date(g.createdAt).toLocaleString()}>{new Date(g.createdAt).toLocaleDateString()}</td>
                    <td><button className={s.danger} disabled={busy} onClick={() => remove([g.id])}>Delete</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
