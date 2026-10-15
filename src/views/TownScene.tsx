import clsx from "clsx";
import { levelOf, type Building, type Town } from "../domain/town";
import { BUILDINGS, TRADE_FOR, assignments, cantUpgrade, durationText, isBuilt, isNew, maxLevel, pace, plots, progressOf, upgradeCost, yields } from "../game/town";
import { assignSettler, upgradeBuilding } from "../game/town-store";
import { num } from "../game/tuning";

/**
 * The town as a little village: every building is a tile on the green, with
 * who works it (and how well), construction progress, and empty plots for
 * what's still to come.
 */

export const FACES = ["😠", "🙁", "😐", "🙂", "😄"];
export const face = (mood: number) => FACES[Math.min(4, Math.floor(mood / 20))]!;

export const TRADE_ICON: Record<string, string> = {
  farmer: "🌾",
  woodcutter: "🪓",
  trader: "⚖",
  brewer: "🍺",
  herbalist: "🌿",
  guard: "🛡",
  smith: "⚒",
  priest: "🕯",
  mage: "🔮",
};
export const tradeIcon = (trade: string) => TRADE_ICON[trade] ?? "🧑";

const STORE_ICON = { food: "🍞", materials: "🪵", gold: "🪙", herbs: "🌿", dust: "✨" } as const;
const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

/** What one building gives, in a few words. */
export function buildingYield(t: Town, b: Building): string {
  const p = pace(t, b.id);
  const y = yields(t, b);
  const made = (Object.keys(STORE_ICON) as (keyof typeof STORE_ICON)[]).filter((k) => y[k] > 0).map((k) => `+${fmt(y[k])} ${STORE_ICON[k]}`);
  const level = levelOf(b);
  switch (b.type) {
    case "hall":
      return `${made.join(" ")} a day · ${num("town.hallBeds")} beds`;
    case "house":
      return `${num("town.houseBeds") + num("upgrade.bedsPerHouseLevel") * (level - 1)} beds`;
    case "watchtower":
      return p ? `Militia +${Math.round(num("militia.perTower") * p * (1 + num("upgrade.outputPerLevel") * (level - 1)))} · fewer thieves` : "Unmanned";
    case "smithy":
      return p ? `Fits mods, forges magic arms${p < 1 ? " (slowly)" : ""}` : "Cold forge: needs a worker";
    case "shrine":
      return p ? "Heals injuries, raises the fallen" : "Empty: needs a worker";
    case "tower":
      return p ? `${made.join(" ")} a day · wondrous items` : "Dark: needs a worker";
    default:
      if (!made.length) return BUILDINGS[b.type].staffed ? "Nothing without a worker" : "";
      return `${made.join(" ")} a day${b.type === "tavern" ? " · draws travellers · hiring" : b.type === "market" ? " · trading" : b.type === "apothecary" ? " · potions" : ""}`;
  }
}

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const roman = (n: number) => ROMAN[n] ?? String(n);

export function TownScene({ town: t, hours, renown, selected, onSelect, onBuild }: { town: Town; hours: number; renown: number; selected: string | null; onSelect: (id: string | null) => void; onBuild: () => void }) {
  const who = assignments(t);
  const max = plots(t, renown);
  const free = Math.max(0, max - t.buildings.length);
  return (
    <div
      className="rounded-xl border border-line p-3 shadow-inner"
      style={{ background: "radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--heal) 22%, var(--surface)) 0%, color-mix(in srgb, var(--heal) 10%, var(--surface-2)) 70%)" }}
      aria-label="Village"
    >
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-5">
        {t.buildings.map((b) => {
          const def = BUILDINGS[b.type];
          const worker = t.settlers.find((s) => s.id === who.get(b.id));
          const p = pace(t, b.id);
          const building = isNew(b);
          const upgrading = b.upTo !== undefined;
          const prog = !building ? progressOf(t, b, Math.max(0, hours - t.simulated)) : null;
          const left = b.readyAt !== undefined ? Math.max(0, b.readyAt - hours) : 0;
          const ring = building ? "border-line" : !def.staffed ? "border-line" : !worker ? "border-danger" : p < 1 ? "border-warn" : "border-heal";
          return (
            <li key={b.id}>
              <button
                className={clsx(
                  "relative flex aspect-square w-full flex-col items-center justify-center rounded-xl border-2 bg-surface/90 p-1 shadow transition hover:-translate-y-0.5 hover:shadow-lg",
                  ring,
                  selected === b.id && "ring-2 ring-accent ring-offset-2 ring-offset-surface",
                )}
                onClick={() => onSelect(selected === b.id ? null : b.id)}
                title={`${def.name}${building ? `: building, ${durationText(Math.ceil(left))} left` : ""}`}
                aria-pressed={selected === b.id}
              >
                <span className={clsx("text-4xl leading-none sm:text-5xl", building && "opacity-40 grayscale")}>{def.icon}</span>
                {building && <span className="absolute top-1 right-1 text-lg" aria-hidden>🏗</span>}
                {!building && (
                  <span className="absolute top-1 left-1 rounded bg-surface-3 px-1 font-display text-[10px] font-bold text-strong" title={`Level ${levelOf(b)}`}>
                    {roman(levelOf(b))}
                  </span>
                )}
                {upgrading && (
                  <span className="absolute top-1 right-1 rounded bg-accent px-1 text-[10px] font-bold text-accent-fg" title={`Upgrading to level ${b.upTo}: ${durationText(Math.ceil(left))} left`}>
                    ⬆ {roman(b.upTo!)}
                  </span>
                )}
                <span className="mt-1 truncate text-center text-xs font-semibold text-strong">{def.name}</span>
                {prog && (
                  <span className="mb-0.5 flex w-4/5 items-center gap-1" title={`Next ${STORE_ICON[prog.store]}: ${Math.round(prog.fraction * 100)}% · ${fmt(prog.perDay)} a day`}>
                    <span className="text-[10px]">{STORE_ICON[prog.store]}</span>
                    <span className="block h-1 flex-1 rounded bg-surface-3">
                      <span className="block h-1 rounded bg-heal transition-[width] duration-1000" style={{ width: `${prog.fraction * 100}%` }} />
                    </span>
                  </span>
                )}
                {building ? (
                  <span className="mt-1 w-4/5">
                    <span className="block h-1.5 rounded bg-surface-3">
                      <span className="block h-1.5 rounded bg-accent" style={{ width: `${100 - (left / Math.max(1, def.hours)) * 100}%` }} />
                    </span>
                    <span className="block text-center text-[10px] text-muted">{durationText(Math.ceil(left))}</span>
                  </span>
                ) : def.staffed ? (
                  worker ? (
                    <span className={clsx("mt-0.5 max-w-full truncate rounded-full px-1.5 text-[10px]", p < 1 ? "bg-warn/20 text-warn" : "bg-heal/20 text-heal")}>
                      {face(worker.mood)} {worker.name}
                      {p < 1 ? " · ½" : ""}
                    </span>
                  ) : (
                    <span className="mt-0.5 rounded-full bg-danger/15 px-1.5 text-[10px] text-danger">needs {tradeIcon(TRADE_FOR[b.type] ?? "")}</span>
                  )
                ) : (
                  b.type === "house" && <span className="text-[10px] text-muted">🛏 {num("town.houseBeds")}</span>
                )}
              </button>
            </li>
          );
        })}
        {Array.from({ length: Math.min(free, 6) }, (_, i) => (
          <li key={`plot-${i}`}>
            <button
              className="flex aspect-square w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-line/80 text-faint transition hover:border-accent hover:text-accent"
              onClick={onBuild}
              title="An empty plot: build something"
            >
              <span className="text-3xl">＋</span>
              <span className="text-xs">Empty plot</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-right text-[11px] text-muted">
        {t.buildings.length}/{max} plots ·{" "}
        <span className="text-heal">■</span> right trade · <span className="text-warn">■</span> half pace · <span className="text-danger">■</span> nobody working
      </p>
    </div>
  );
}

/** One building up close: what it does, and who works it. */
export function BuildingPanel({ town: t, buildingId, renown, onClose }: { town: Town; buildingId: string; renown: number; onClose: () => void }) {
  const b = t.buildings.find((x) => x.id === buildingId);
  if (!b) return null;
  const def = BUILDINGS[b.type];
  const who = assignments(t);
  const workerId = who.get(b.id);
  const trade = TRADE_FOR[b.type];
  const p = pace(t, b.id);
  return (
    <section className="flex flex-wrap items-start gap-3 rounded-lg border border-accent/50 bg-surface p-3 shadow" aria-label={`${def.name} details`}>
      <span className="text-5xl leading-none">{def.icon}</span>
      <div className="min-w-0 flex-1 space-y-1 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <strong className="font-display text-lg text-accent">
            {def.name} <span className="text-sm text-muted">· level {levelOf(b)}</span>
          </strong>
          <button className="btn btn-ghost px-2 py-0 text-xs" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="text-muted">{def.description}</p>
        {isBuilt(b) && <p className={clsx("font-semibold", def.staffed && !p ? "text-danger" : "text-strong")}>{buildingYield(t, b)}</p>}
        {isBuilt(b) && def.staffed && (
          <label className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">
              Worker {trade && <span>(best: {tradeIcon(trade)} a {trade})</span>}
            </span>
            <select
              className="field w-auto py-1 text-sm"
              value={workerId ?? ""}
              onChange={(e) => {
                if (e.target.value) assignSettler(e.target.value, b.id);
                else if (workerId) assignSettler(workerId, "rest");
              }}
              aria-label="Worker"
            >
              <option value="">Nobody</option>
              {t.settlers.map((s) => {
                const at = [...who].find(([, sid]) => sid === s.id)?.[0];
                const elsewhere = at && at !== b.id ? ` (now at the ${BUILDINGS[t.buildings.find((x) => x.id === at)!.type].name.toLowerCase()})` : "";
                return (
                  <option key={s.id} value={s.id}>
                    {face(s.mood)} {s.name}, {s.trade || "settler"}
                    {s.trade === trade ? " ★" : ""}
                    {elsewhere}
                  </option>
                );
              })}
            </select>
          </label>
        )}
        {isBuilt(b) && <Upgrade town={t} building={b} renown={renown} />}
      </div>
    </section>
  );
}

/** The next level: what it costs and what it brings. */
function Upgrade({ town: t, building: b, renown }: { town: Town; building: Building; renown: number }) {
  if (b.upTo !== undefined) return <p className="text-xs text-accent">⬆ Being upgraded to level {b.upTo}.</p>;
  const c = upgradeCost(b);
  const why = cantUpgrade(t, b, renown);
  const next = { ...b, level: levelOf(b) + 1 };
  const nextText = buildingYield({ ...t, buildings: t.buildings.map((x) => (x.id === b.id ? next : x)) }, next);
  const top = levelOf(b) >= maxLevel(renown);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-2/60 p-2">
      <button className="btn btn-primary text-sm" disabled={!!why} onClick={() => upgradeBuilding(b.id)} title={why ?? `Level ${levelOf(b) + 1}`}>
        ⬆ Upgrade to {roman(levelOf(b) + 1)}
      </button>
      {!top && (
        <span className="flex flex-wrap gap-1 text-[11px]">
          <span className={clsx("rounded-full px-1.5", t.gold < c.gold ? "bg-danger/15 text-danger" : "bg-surface-3 text-muted")}>🪙 {c.gold}</span>
          <span className={clsx("rounded-full px-1.5", t.materials < c.materials ? "bg-danger/15 text-danger" : "bg-surface-3 text-muted")}>🪵 {c.materials}</span>
          <span className="rounded-full bg-surface-3 px-1.5 text-muted">⏱ {c.hours} h</span>
        </span>
      )}
      <span className="text-xs text-muted">{top ? why : b.type === "hall" ? `→ +${num("upgrade.plotsPerHallLevel")} plots` : nextText ? `→ ${nextText}` : ""}</span>
      {why && !top && <span className="w-full text-[11px] text-warn">{why}</span>}
    </div>
  );
}
