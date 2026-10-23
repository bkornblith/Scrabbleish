"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CAST } from "./g/[id]/Celebration";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/engine";
import { SettingsForm } from "./SettingsForm";
import { ThemeToggle } from "./ThemeToggle";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [Pig, , Penguin] = CAST.map((c) => c.Comp);

  async function create() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, settings }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      localStorage.setItem(`scrabble-token-${data.gameId}`, data.token);
      router.push(`/g/${data.gameId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="home">
      <div className="home-top">
        <ThemeToggle />
      </div>
      <h1 className="logo">
        {"SCRABBLEISH".split("").map((l, i) => (
          <span key={i} className={`tile logo-tile${i === 8 ? " pig-tile" : ""}`}>
            <span className="letter">{l}</span>
            {i === 8 && <span className="pig-face"><Pig /></span>}
          </span>
        ))}
      </h1>
      <div className="home-grid">
      <section className="card peek-host">
        <span className="peeker peek-pig" aria-hidden><span className="peek-body"><Pig /></span></span>
        <h2>New game</h2>
        <label>
          Your name
          <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ben" />
        </label>
        <SettingsForm settings={settings} onChange={setSettings} />
        <button className="primary" disabled={busy || !name.trim()} onClick={create}>
          Create game
        </button>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card peek-host">
        <span className="peeker peek-penguin" aria-hidden><span className="peek-body"><Penguin /></span></span>
        <h2>Join a game</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) router.push(`/g/${code.trim().toUpperCase()}`);
          }}
        >
          <label>
            Game code
            <input value={code} maxLength={6} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" />
          </label>
          <button type="submit" disabled={!code.trim()}>Go to game</button>
        </form>
        <p className="peek-hint">🐷 Psst… play a bingo and we come out to dance.</p>
      </section>
      </div>
    </main>
  );
}
