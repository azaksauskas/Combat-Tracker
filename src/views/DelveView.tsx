import clsx from "clsx";
import type { ReactNode } from "react";
import { ARMORS, WEAPONS, gearIcon, gearName, trainedWith } from "../game/arsenal";
import { DELVE, type DelveLevel } from "../game/delve";
import { SUPPLIES, buySupply, delveOf, equip, handMagic, kitChoices, levelOpen, loadoutOf, startDelveLevel, supplyName, takeTestKit } from "../game/delve-store";
import { chosenParty } from "../game/party-store";
import type { PassageLook } from "../game/state";
import { MAGIC_ITEMS, RARITY } from "../game/treasure";
import { useActiveProfile, usePlayers } from "../store/players";

/** The delve: five levels down, one after the other, and the quartermaster who kits the heroes out. */

const PASSAGE: Record<PassageLook, string> = {
  "stairs-up": "🪜 stairs up",
  "stairs-down": "⬇ stairs down",
  door: "🚪 door",
  ladder: "🪜 ladder",
  boat: "⛵ boat",
};
const KIND: Record<DelveLevel["kind"], { label: string; cls: string }> = {
  fight: { label: "Fight", cls: "text-danger" },
  explore: { label: "Explore", cls: "text-heal" },
  boss: { label: "Boss", cls: "text-warn" },
};

export function DelveView({ partyPicker }: { partyPicker: ReactNode }) {
  const activeId = useActiveProfile((s) => s.id);
  const doc = usePlayers((s) => (activeId ? s.docs[activeId] : undefined));
  const d = delveOf(doc);
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold text-accent">The Drowned Crypt</h2>
          <p className="text-sm text-muted">Five levels down under the fog. Find the way out of each; fight, sneak, or search for treasure on the way.</p>
        </div>
        <div className="text-right text-sm">
          <div className="font-display text-xl text-strong">💰 {d.gold} gold</div>
          <div className="text-xs text-faint">{Object.entries(d.stash).filter(([, n]) => n > 0).map(([k, n]) => `${n}× ${supplyName(k)}`).join(" · ") || "Empty packs"}</div>
        </div>
      </header>

      <HowToPlay first={d.cleared.length === 0} />

      <ol className="grid gap-3 md:grid-cols-5" aria-label="Delve levels">
        {DELVE.map((l) => {
          const open = levelOpen(d, l.n);
          const done = d.cleared.includes(l.n);
          return (
            <li key={l.id} className={clsx("flex flex-col rounded-lg border p-3 shadow", done ? "border-heal/60 bg-heal/5" : open ? "border-accent/70 bg-surface" : "border-line bg-surface-2 opacity-60")}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-bold text-faint">Level {l.n}</span>
                <span className={clsx("font-bold uppercase", KIND[l.kind].cls)}>{KIND[l.kind].label}</span>
              </div>
              <h3 className="mt-1 font-display text-lg leading-tight font-bold text-strong">{l.name}</h3>
              <p className="mt-1 flex-1 text-xs text-muted">{l.blurb}</p>
              <p className="mt-2 text-[11px] text-faint">
                In: {PASSAGE[l.entrance]} · Out: {PASSAGE[l.exit]}
              </p>
              <button className={clsx("btn mt-2 font-display", open && "btn-primary")} disabled={!open} onClick={() => startDelveLevel(l.n)}>
                {done ? "Go again" : open ? "Go down" : "🔒 Locked"}
              </button>
            </li>
          );
        })}
      </ol>

      {partyPicker}

      <Quartermaster />

      <details className="rounded-lg border border-dashed border-line p-3 text-sm">
        <summary className="cursor-pointer text-muted">🧪 Testing</summary>
        <p className="mt-2 text-xs text-faint">Opens every level, unlocks every item, fills the packs, adds 1000 gold and raises the picked heroes to level 3.</p>
        <button className="btn mt-2" onClick={takeTestKit}>
          Take the test kit
        </button>
      </details>
    </div>
  );
}

function Quartermaster() {
  const activeId = useActiveProfile((s) => s.id);
  const doc = usePlayers((s) => (activeId ? s.docs[activeId] : undefined));
  const d = delveOf(doc);
  const choices = kitChoices(d);
  const heroes = chosenParty().map((e) => ({ key: e.key, label: e.label, c: e.build() }));
  const free = (doc?.treasure ?? []).filter((t) => !t.on && MAGIC_ITEMS[t.id]);
  return (
    <section aria-label="Quartermaster" className="space-y-3">
      <h3 className="text-xs font-bold tracking-wider text-faint uppercase">Quartermaster</h3>
      <div className="flex flex-wrap gap-2">
        {SUPPLIES.map((s) => (
          <button key={s.id} className="btn text-sm" disabled={d.gold < s.price} onClick={() => buySupply(s.id)}>
            {s.count ? `${s.count}× ` : ""}
            {supplyName(s.id)} · {s.price} gp <span className="text-faint">(have {d.stash[s.id] ?? 0})</span>
          </button>
        ))}
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {heroes.map(({ key, label, c }) => {
          const stats = c.stats;
          if (!stats) return null;
          const l = loadoutOf(doc, key, stats.className);
          const weapons = choices.weapons.filter((w) => trainedWith(stats, w.id) || w.id === l.main || w.id === l.spare);
          const light = weapons.filter((w) => w.props.includes("light"));
          const pick = (slot: "main" | "off" | "spare" | "armor", list: { id: string; name: string; icon: string }[], current: string | undefined, none: string) => {
            // Whatever the hero has now stays on the list, unlocked or not.
            const all = current && !list.some((x) => x.id === current) ? [{ id: current, name: gearName(current), icon: gearIcon(current) }, ...list] : list;
            return (
              <label className="flex items-center justify-between gap-2 text-xs">
                <span className="text-faint capitalize">{slot === "off" ? "off hand" : slot}</span>
                <select className="field w-auto max-w-[60%] py-0.5 text-xs" value={current ?? ""} onChange={(e) => equip(key, slot, e.target.value || undefined)}>
                  <option value="">{none}</option>
                  {all.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.icon} {x.name}
                    </option>
                  ))}
                </select>
              </label>
            );
          };
          const offList = [...(choices.shield ? [{ id: "shield", name: ARMORS.shield!.name, icon: ARMORS.shield!.icon }] : []), ...(WEAPONS[l.main ?? ""]?.props.includes("light") ? light : [])];
          const worn = (doc?.treasure ?? []).filter((t) => t.on === key);
          return (
            <li key={key} className="rounded-md border border-line bg-surface-2 p-3">
              <div className="flex items-baseline justify-between">
                <strong className="text-strong">{label}</strong>
                <span className="text-xs text-faint">
                  AC {c.ac} · {stats.className ?? ""}
                </span>
              </div>
              <div className="mt-2 grid gap-1">
                {pick("main", weapons, l.main, "Unarmed")}
                {pick("off", offList, l.off, "Nothing")}
                {pick("spare", weapons, l.spare, "Nothing")}
                {pick("armor", choices.armors, l.armor, "No armour")}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
                {worn.map((t) => (
                  <button key={t.uid} className="rounded border border-accent/50 px-1.5 py-0.5" style={{ color: RARITY[MAGIC_ITEMS[t.id]!.rarity].color }} title={`${MAGIC_ITEMS[t.id]!.text} (click to take it off)`} onClick={() => handMagic(t.uid, undefined)}>
                    {MAGIC_ITEMS[t.id]!.icon} {MAGIC_ITEMS[t.id]!.name} ✕
                  </button>
                ))}
                {free.length > 0 && (
                  <select className="field w-auto py-0.5 text-xs" value="" onChange={(e) => e.target.value && handMagic(e.target.value, key)} aria-label={`Give ${label} a magic item`}>
                    <option value="">+ magic item…</option>
                    {free.map((t) => (
                      <option key={t.uid} value={t.uid}>
                        {MAGIC_ITEMS[t.id]!.icon} {MAGIC_ITEMS[t.id]!.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The game in five lines, open until the first level is cleared. */
function HowToPlay({ first }: { first: boolean }) {
  return (
    <details open={first} className="rounded-lg border border-accent/50 bg-accent/5 p-3 text-sm">
      <summary className="cursor-pointer font-display font-bold text-accent">How to play</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
        <li>
          <strong className="text-strong">Pick your heroes</strong> below (up to six) and give them weapons and armour at the <strong className="text-strong">Quartermaster</strong>.
        </li>
        <li>
          <strong className="text-strong">Go down</strong> into a level. It starts dark: you see only what your heroes' light reaches.
        </li>
        <li>
          <strong className="text-strong">Explore:</strong> click a square to walk there, and the party follows. Open doors and chests by clicking them when you're next to them. Hidden traps show only when a hero gets close or <em>searches</em>.
        </li>
        <li>
          <strong className="text-strong">Fight</strong> when monsters see you: then it's turns, hero by hero (move, then an action; <em>End turn</em> when done). Some monsters lie in wait. When the last one falls, you explore again.
        </li>
        <li>
          <strong className="text-strong">Get out:</strong> bring every hero still standing onto the way out (green frame). You keep the gold and gear you found, and the quartermaster gets new stock.
        </li>
      </ol>
    </details>
  );
}
