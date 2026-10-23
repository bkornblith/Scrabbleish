"use client";

import { useEffect, useMemo, useState } from "react";

// Dancing critters for bingos (one at random) and wins (the whole cast in a conga line).

function UnicornPig() {
  return (
    <svg viewBox="0 0 120 110" className="critter">
      <polygon points="74,8 80,34 68,32" fill="#ffd54a" stroke="#d9a400" strokeWidth="2" />
      <path d="M70 14 l9 3 M71 21 l8 3 M72 27 l7 2" stroke="#d9a400" strokeWidth="1.5" />
      <path d="M40 30 q-14 -8 -18 10 q10 0 18 -4" fill="#b77dd8" />
      <path d="M48 26 q-6 -16 8 -14 q-2 10 -8 14" fill="#7ac8f0" />
      <ellipse cx="55" cy="66" rx="38" ry="28" fill="#ffb3c7" stroke="#e87f9e" strokeWidth="2" />
      <circle cx="78" cy="46" r="22" fill="#ffb3c7" stroke="#e87f9e" strokeWidth="2" />
      <path d="M64 30 l-4 -12 l12 8z M90 30 l6 -11 l2 13z" fill="#ff98b4" stroke="#e87f9e" strokeWidth="2" />
      <ellipse cx="90" cy="54" rx="11" ry="8" fill="#ff98b4" stroke="#e87f9e" strokeWidth="2" />
      <circle cx="87" cy="54" r="2" fill="#a24767" />
      <circle cx="94" cy="54" r="2" fill="#a24767" />
      <circle cx="74" cy="42" r="3" fill="#2b2620" />
      <circle cx="86" cy="40" r="3" fill="#2b2620" />
      <circle cx="69" cy="52" r="4" fill="#ff7fa3" opacity="0.6" />
      <path d="M17 60 q-10 -6 -6 -14 q6 4 2 10" fill="none" stroke="#e87f9e" strokeWidth="3" />
      <g className="legs">
        <rect x="30" y="86" width="9" height="18" rx="4" fill="#ffb3c7" stroke="#e87f9e" strokeWidth="2" />
        <rect x="70" y="86" width="9" height="18" rx="4" fill="#ffb3c7" stroke="#e87f9e" strokeWidth="2" />
      </g>
    </svg>
  );
}

function DiscoSloth() {
  return (
    <svg viewBox="0 0 120 120" className="critter">
      <line x1="60" y1="0" x2="60" y2="14" stroke="#777" strokeWidth="2" />
      <circle cx="60" cy="22" r="10" fill="#cfd8dc" stroke="#90a4ae" strokeWidth="2" />
      <path d="M52 18 h16 M50 24 h20 M56 13 v18 M64 13 v18" stroke="#fff" strokeWidth="1.5" />
      <ellipse cx="60" cy="84" rx="28" ry="30" fill="#a88565" stroke="#7d5f45" strokeWidth="2" />
      <circle cx="60" cy="52" r="20" fill="#a88565" stroke="#7d5f45" strokeWidth="2" />
      <ellipse cx="60" cy="56" rx="15" ry="12" fill="#f0dcc0" />
      <ellipse cx="52" cy="52" rx="6" ry="4" fill="#5b4330" transform="rotate(-15 52 52)" />
      <ellipse cx="68" cy="52" rx="6" ry="4" fill="#5b4330" transform="rotate(15 68 52)" />
      <rect x="44" y="47" width="32" height="8" rx="3" fill="#ff3d9a" opacity="0.85" />
      <ellipse cx="60" cy="60" rx="3" ry="2" fill="#3b2a1d" />
      <path d="M55 65 q5 4 10 0" stroke="#3b2a1d" strokeWidth="2" fill="none" />
      <path className="arm-up" d="M80 76 q18 -20 14 -44" stroke="#a88565" strokeWidth="10" strokeLinecap="round" fill="none" />
      <path d="M40 80 q-14 10 -14 22" stroke="#a88565" strokeWidth="10" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function Penguin() {
  return (
    <svg viewBox="0 0 110 120" className="critter">
      <ellipse cx="55" cy="64" rx="32" ry="44" fill="#263238" />
      <ellipse cx="55" cy="72" rx="22" ry="34" fill="#fff" />
      <circle cx="46" cy="38" r="5" fill="#fff" />
      <circle cx="64" cy="38" r="5" fill="#fff" />
      <circle cx="47" cy="39" r="2.5" fill="#000" />
      <circle cx="63" cy="39" r="2.5" fill="#000" />
      <polygon points="50,46 60,46 55,54" fill="#ffa000" />
      <rect x="35" y="2" width="40" height="20" rx="2" fill="#111" />
      <rect x="28" y="20" width="54" height="5" rx="2" fill="#111" />
      <rect x="35" y="15" width="40" height="4" fill="#e53935" />
      <path className="wing" d="M24 60 q-16 10 -14 26" stroke="#263238" strokeWidth="9" strokeLinecap="round" fill="none" />
      <path d="M86 60 q16 10 14 26" stroke="#263238" strokeWidth="9" strokeLinecap="round" fill="none" />
      <g className="legs">
        <ellipse cx="42" cy="110" rx="12" ry="5" fill="#ffa000" />
        <ellipse cx="68" cy="110" rx="12" ry="5" fill="#ffa000" />
        <rect x="30" y="112" width="24" height="3" fill="#9e9e9e" />
        <rect x="56" y="112" width="24" height="3" fill="#9e9e9e" />
      </g>
    </svg>
  );
}

function SkateLlama() {
  return (
    <svg viewBox="0 0 120 130" className="critter">
      <path d="M70 10 l-2 -8 l6 6 M82 10 l2 -8 l-6 6" stroke="#e8d9c0" strokeWidth="4" strokeLinecap="round" />
      <rect x="66" y="8" width="22" height="58" rx="11" fill="#f5ead6" stroke="#cbb796" strokeWidth="2" />
      <ellipse cx="88" cy="24" rx="12" ry="8" fill="#f5ead6" stroke="#cbb796" strokeWidth="2" />
      <circle cx="76" cy="20" r="3" fill="#2b2620" />
      <circle cx="95" cy="24" r="1.5" fill="#2b2620" />
      <path d="M90 29 q4 3 8 0" stroke="#2b2620" strokeWidth="1.5" fill="none" />
      <ellipse cx="60" cy="74" rx="36" ry="20" fill="#f5ead6" stroke="#cbb796" strokeWidth="2" />
      <path d="M66 46 h22 v10 h-22z" fill="#43a047" />
      <path d="M66 50 h22" stroke="#fdd835" strokeWidth="3" />
      <g className="legs">
        <rect x="34" y="88" width="9" height="20" rx="4" fill="#f5ead6" stroke="#cbb796" strokeWidth="2" />
        <rect x="74" y="88" width="9" height="20" rx="4" fill="#f5ead6" stroke="#cbb796" strokeWidth="2" />
      </g>
      <rect x="18" y="108" width="84" height="7" rx="3.5" fill="#ef6c00" />
      <circle cx="32" cy="120" r="6" fill="#424242" />
      <circle cx="88" cy="120" r="6" fill="#424242" />
    </svg>
  );
}

const CAST = [
  { name: "unicorn pig", Comp: UnicornPig },
  { name: "disco sloth", Comp: DiscoSloth },
  { name: "tap-dancing penguin", Comp: Penguin },
  { name: "skateboarding llama", Comp: SkateLlama },
];

const CONFETTI_COLORS = ["#d9473b", "#2f7fb8", "#f3c742", "#1f6f4a", "#ff98b4", "#b77dd8"];

/** Every board square flips into a little pig that pops out and dances, rippling out from the centre. */
function PigParty({ duration }: { duration: number }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  // Track the board's position (it can shift while fonts load or the page scrolls).
  useEffect(() => {
    let raf = 0;
    let last = "";
    const tick = () => {
      const el = document.querySelector(".board");
      if (el) {
        const r = el.getBoundingClientRect();
        const key = `${r.left},${r.top},${r.width},${r.height}`;
        if (key !== last) {
          last = key;
          setRect(r);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  const cells = useMemo(
    () =>
      Array.from({ length: 225 }, (_, i) => {
        const r = Math.floor(i / 15);
        const c = i % 15;
        const dist = Math.hypot(r - 7, c - 7);
        return { i, delay: dist * 0.07, flip: (r + c) % 2 === 0 ? 1 : -1, tempo: 0.32 + ((r * 7 + c * 3) % 5) * 0.03 };
      }),
    []
  );
  if (!rect) return null;
  return (
    <div className="pig-party" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}>
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <symbol id="pigface" viewBox="0 0 40 40">
            <path d="M8 12 L6 3 L15 8Z M32 12 L34 3 L25 8Z" fill="#ff8fb0" stroke="#e0628a" strokeWidth="1.5" strokeLinejoin="round" />
            <circle cx="20" cy="22" r="15" fill="#ffb3c7" stroke="#e0628a" strokeWidth="1.5" />
            <ellipse cx="20" cy="26" rx="7" ry="5" fill="#ff8fb0" stroke="#e0628a" strokeWidth="1.3" />
            <circle cx="17.5" cy="26" r="1.4" fill="#a24767" />
            <circle cx="22.5" cy="26" r="1.4" fill="#a24767" />
            <circle cx="14" cy="18" r="2" fill="#2b2620" />
            <circle cx="26" cy="18" r="2" fill="#2b2620" />
            <circle cx="14.6" cy="17.4" r="0.6" fill="#fff" />
            <circle cx="26.6" cy="17.4" r="0.6" fill="#fff" />
            <circle cx="10.5" cy="24" r="2.2" fill="#ff7fa3" opacity="0.5" />
            <circle cx="29.5" cy="24" r="2.2" fill="#ff7fa3" opacity="0.5" />
          </symbol>
        </defs>
      </svg>
      {cells.map((c) => (
        <div
          key={c.i}
          className="pig-cell"
          style={{ animationDelay: `${c.delay}s`, animationDuration: `${duration}s`, ["--flip" as string]: c.flip }}
        >
          <div className="pig-dance" style={{ animationDuration: `${c.tempo}s`, animationDelay: `${c.delay}s` }}>
            <svg viewBox="0 0 40 40">
              <use href="#pigface" />
            </svg>
          </div>
        </div>
      ))}
    </div>
  );
}

export type CelebrationEvent = { kind: "bingo" | "win"; title: string; key: number };

export function Celebration({ event, onDone }: { event: CelebrationEvent; onDone: () => void }) {
  const dancer = useMemo(() => CAST[Math.floor(Math.random() * CAST.length)], []);
  const confetti = useMemo(
    () =>
      Array.from({ length: event.kind === "win" ? 90 : 0 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 2.5,
        duration: 2.5 + Math.random() * 2.5,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: Math.random() * 360,
      })),
    [event.kind]
  );

  useEffect(() => {
    const t = setTimeout(onDone, event.kind === "win" ? 10000 : 6500);
    return () => clearTimeout(t);
  }, [event, onDone]);

  return (
    <div className={`celebration ${event.kind}`} onClick={onDone} aria-live="polite">
      <PigParty duration={event.kind === "win" ? 8.5 : 5} />
      <div className="celebration-title">{event.title}</div>
      {event.kind === "bingo" ? (
        <div className="dancer" title={dancer.name}>
          <dancer.Comp />
        </div>
      ) : (
        <>
          {CAST.map(({ name, Comp }, i) => (
            <div key={name} className="dancer conga" style={{ animationDelay: `${i * 0.55}s` }} title={name}>
              <Comp />
            </div>
          ))}
          {confetti.map((c, i) => (
            <span
              key={i}
              className="confetti"
              style={{
                left: `${c.left}%`,
                background: c.color,
                animationDelay: `${c.delay}s`,
                animationDuration: `${c.duration}s`,
                transform: `rotate(${c.rotate}deg)`,
              }}
            />
          ))}
        </>
      )}
    </div>
  );
}
