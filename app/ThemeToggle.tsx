"use client";

import { useEffect, useState } from "react";

type Mode = "auto" | "light" | "dark";
const NEXT: Record<Mode, Mode> = { auto: "light", light: "dark", dark: "auto" };
const LABEL: Record<Mode, string> = { auto: "🌓 Auto", light: "☀️ Light", dark: "🌙 Dark" };

export function applyTheme(mode: Mode) {
  const root = document.documentElement;
  if (mode === "auto") delete root.dataset.theme;
  else root.dataset.theme = mode;
}

/** Cycles Auto (follows the device) → Light (minimal) → Dark (neon). */
export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("auto");
  useEffect(() => {
    try {
      const m = localStorage.getItem("scrabble-theme") as Mode | null;
      if (m && m in NEXT) setMode(m);
    } catch {}
  }, []);
  return (
    <button
      className="pill pill-btn"
      title="Theme"
      onClick={() => {
        const m = NEXT[mode];
        setMode(m);
        applyTheme(m);
        try {
          localStorage.setItem("scrabble-theme", m);
        } catch {}
      }}
    >
      {LABEL[mode]}
    </button>
  );
}
