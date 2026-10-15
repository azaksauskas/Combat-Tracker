import clsx from "clsx";
import { useEffect, useLayoutEffect, useMemo, useState, type RefObject } from "react";
import type { Town } from "../domain/town";
import { phaseOf, skyAt, whereabouts } from "../game/village";

/**
 * The village coming alive: a sky that turns with the town's clock, settlers
 * walking between home, work and the tavern, and the heroes who look after a
 * building standing by it. Drawn over the building tiles; decoration only
 * (the tiles stay clickable underneath).
 */

/** How a settler looks, by trade. */
const FIGURE: Record<string, string> = {
  farmer: "🧑‍🌾",
  woodcutter: "🧔",
  trader: "🧑‍💼",
  brewer: "🧑‍🍳",
  herbalist: "🧝",
  guard: "💂",
  smith: "🧑‍🏭",
  priest: "🧑‍⚖️",
  mage: "🧙",
};
const HERO: Record<string, string> = { Fighter: "🛡️", Rogue: "🗡️", Cleric: "✝️", Wizard: "🔮" };

/** A small, stable number from a string (for each settler's own wander). */
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function SkyStrip({ hours }: { hours: number }) {
  const sky = skyAt(hours);
  const h = ((hours % 24) + 24) % 24;
  // An arc: low at the ends, high at noon.
  const arc = (x: number) => 70 - Math.sin(Math.PI * x) * 55;
  return (
    <div
      className="relative mb-3 h-16 overflow-hidden rounded-lg border border-line/60 transition-[background] duration-[3000ms]"
      style={{ background: `linear-gradient(to bottom, ${sky.top}, ${sky.bottom})` }}
      aria-label={`Sky at ${String(Math.floor(h)).padStart(2, "0")}:00`}
      role="img"
    >
      {/* Stars */}
      <div className="absolute inset-0 transition-opacity duration-[3000ms]" style={{ opacity: sky.stars }}>
        {Array.from({ length: 28 }, (_, i) => (
          <span
            key={i}
            className="motion-village absolute block h-[2px] w-[2px] rounded-full bg-white [animation:twinkle_3s_ease-in-out_infinite]"
            style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 70}%`, animationDelay: `${(i % 7) * 0.4}s` }}
          />
        ))}
      </div>
      {/* Clouds drift by in daylight */}
      <div className="absolute inset-0" style={{ opacity: 1 - sky.stars * 0.8 }}>
        <span className="motion-village absolute top-1 text-2xl opacity-80 [animation:cloud-drift_80s_linear_infinite]">☁️</span>
        <span className="motion-village absolute top-5 text-xl opacity-60 [animation:cloud-drift_120s_linear_infinite]" style={{ animationDelay: "-50s" }}>
          ☁️
        </span>
      </div>
      {sky.sun !== null && (
        <span className="absolute text-2xl drop-shadow-[0_0_10px_rgba(255,200,80,0.9)] transition-all duration-[1500ms] ease-linear" style={{ left: `calc(${sky.sun * 100}% - 12px)`, top: `${arc(sky.sun)}%` }}>
          ☀️
        </span>
      )}
      {sky.moon !== null && (
        <span className="absolute text-xl drop-shadow-[0_0_8px_rgba(220,230,255,0.8)] transition-all duration-[1500ms] ease-linear" style={{ left: `calc(${sky.moon * 100}% - 10px)`, top: `${arc(sky.moon)}%` }}>
          🌙
        </span>
      )}
      {/* Rooftops on the horizon */}
      <div className="absolute inset-x-0 bottom-0 h-3" style={{ background: "color-mix(in srgb, var(--heal) 35%, var(--surface-3))" }} />
    </div>
  );
}

interface Spot {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Figures walking over the tiles, placed by measuring them. */
export function VillageLife({ town: t, hours, grid }: { town: Town; hours: number; grid: RefObject<HTMLElement | null> }) {
  const [spots, setSpots] = useState<Record<string, Spot>>({});
  const [tick, setTick] = useState(0);
  const layout = t.buildings.map((b) => b.id).join();

  // Where each tile is, kept up to date as the grid reflows.
  useLayoutEffect(() => {
    const el = grid.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const next: Record<string, Spot> = {};
      el.querySelectorAll<HTMLElement>("[data-bid]").forEach((n) => {
        const r = n.getBoundingClientRect();
        next[n.dataset.bid!] = { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height };
      });
      setSpots(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [grid, layout]);

  // Every few seconds people shift about a little.
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 5000);
    return () => window.clearInterval(id);
  }, []);

  const phase = phaseOf(hours);
  const people = useMemo(() => whereabouts(t, Math.floor(hours)), [t, Math.floor(hours)]);
  // Who shares a tile: spread them around its lower half.
  const byTile = new Map<string, number>();
  const figures = people.map((p) => {
    const n = byTile.get(p.at) ?? 0;
    byTile.set(p.at, n + 1);
    return { ...p, n };
  });
  const patrons = Object.entries(t.patrons);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {figures.map(({ settler: s, at, asleep, n }) => {
        const spot = spots[at];
        if (!spot) return null;
        const seed = hash(s.id);
        const wander = asleep ? 0 : ((hash(`${s.id}:${tick}`) % 100) / 100 - 0.5) * spot.w * 0.35;
        // They stand on the street just below the building.
        const x = spot.x + spot.w * (0.12 + ((n * 0.23 + (seed % 10) / 50) % 0.7)) + wander;
        const y = spot.y + spot.h - 12 + (n % 2) * 5;
        return (
          <span
            key={s.id}
            className={clsx("absolute text-lg leading-none transition-[left,top] duration-[3500ms] ease-in-out", asleep && "opacity-70")}
            style={{ left: x, top: y }}
            title={s.name}
          >
            <span className={clsx("motion-village inline-block", !asleep && "[animation:walk-bob_0.6s_ease-in-out_infinite]")} style={{ animationDelay: `${(seed % 6) * 0.1}s` }}>
              {FIGURE[s.trade] ?? "🧑"}
            </span>
            {(asleep || phase === "evening") && <span className="absolute -top-2 -right-2 text-[10px]">{asleep ? "💤" : "🍺"}</span>}
          </span>
        );
      })}
      {patrons.map(([bid, p]) => {
        const spot = spots[bid];
        if (!spot) return null;
        return (
          <span key={`patron-${bid}`} className="absolute text-xl leading-none drop-shadow" style={{ left: spot.x + spot.w - 26, top: spot.y + spot.h - 18 }} title={`${p.name} looks after it`}>
            <span className="motion-village inline-block [animation:glow-pulse_2.5s_ease-in-out_infinite] rounded-full">{HERO[p.className] ?? "⭐"}</span>
          </span>
        );
      })}
    </div>
  );
}

/** Smoke from the chimney, sparks at the forge, a glow at the tower. */
export function BuildingLife({ type, working, hours }: { type: string; working: boolean; hours: number }) {
  const phase = phaseOf(hours);
  const lit = phase === "night" || phase === "evening";
  const chimney = ["hall", "house", "tavern", "smithy", "apothecary"].includes(type) && (phase !== "night" || type === "tavern");
  return (
    <>
      {chimney && (
        <span className="pointer-events-none absolute top-[22%] left-[60%]" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="motion-village absolute block h-2 w-2 rounded-full bg-[color-mix(in_srgb,var(--faint)_45%,transparent)] opacity-0 blur-[1px] [animation:smoke-rise_3.6s_ease-out_infinite]"
              style={{ animationDelay: `${i * 1.2}s` }}
            />
          ))}
        </span>
      )}
      {type === "smithy" && working && phase === "work" && (
        <span className="pointer-events-none absolute top-1/3 left-1/2" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="motion-village absolute text-[9px] text-[#ff9a3c] opacity-0 [animation:spark_1.1s_ease-out_infinite]" style={{ animationDelay: `${i * 0.27}s`, ["--dx" as string]: `${(i - 1.5) * 9}px` }}>
              ✦
            </span>
          ))}
        </span>
      )}
      {lit && ["hall", "house", "tavern", "shrine", "tower"].includes(type) && (
        <span className="pointer-events-none absolute inset-0 rounded-xl shadow-[inset_0_0_22px_rgba(255,190,90,0.55),0_0_16px_rgba(255,190,90,0.35)]" aria-hidden />
      )}
    </>
  );
}

/** Animation for the building's icon. */
export function iconMotion(type: string, working: boolean, hours: number): string | undefined {
  if (!working) return undefined;
  const phase = phaseOf(hours);
  if (type === "farm") return "motion-village [animation:sway_4s_ease-in-out_infinite] origin-bottom";
  if (type === "lumber" && phase === "work") return "motion-village [animation:chop_1.4s_ease-in-out_infinite] origin-bottom-right";
  if (type === "tower") return "motion-village [animation:glow-pulse_3s_ease-in-out_infinite] rounded-full";
  if (type === "watchtower" && phase === "night") return "motion-village [animation:glow-pulse_2s_ease-in-out_infinite] rounded-full";
  return undefined;
}
