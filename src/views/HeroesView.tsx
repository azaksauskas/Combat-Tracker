import clsx from "clsx";
import { useState } from "react";
import { describeAction } from "../domain/statblock";
import { ARMORS, WEAPONS, canUseArmor, gearIcon, gearName, startingKit, trainedWith, type Loadout } from "../game/arsenal";
import { useCampaign } from "../game/campaign-store";
import { INJURIES } from "../game/injuries";
import { availableMembers, heroAsNow, myCharacters, recoveryLeft } from "../game/party-store";
import { num } from "../game/tuning";
import { usePlay } from "../game/store";
import { working } from "../game/town";
import { SPELLS, isCaster, spellLimits, spellsFor } from "../game/spellbook";
import { craftTreasure, disenchant, equipGear, equipTreasure, gearSource, getGear, hastenRecovery, heroesForHire, hireHero, openChestNow, prepareSpells, sellTreasure, setPatron } from "../game/town-store";
import { AFFINITY, NO_DEEDS, TRAITS, attraction, questOf, questStage, tavernBatch, traitsOf } from "../game/roster";
import { num as tuned } from "../game/tuning";
import { MAGIC_ITEMS, MAX_ATTUNED, RARITY, chestLook, dustValue, recipes, sellValue, type Chest, type Loot, type Treasure } from "../game/treasure";
import { BUILDINGS } from "../game/town";
import { levelOf } from "../domain/town";
import { Dialog } from "../components/Dialog";
import { useGame } from "../store/game";
import { useActiveProfile, usePlayers } from "../store/players";

/**
 * The heroes' sheets: what they carry and wear, what that makes them in a
 * fight; the armoury and where to get more gear. Gear changes in town only.
 */

const SLOTS: { key: keyof Loadout; label: string; hint: string }[] = [
  { key: "main", label: "Main hand", hint: "The weapon in hand" },
  { key: "off", label: "Off hand", hint: "A shield, or a second light weapon" },
  {
    key: "spare",
    label: "On the back",
    hint: "Drawn in a fight, once a turn, for free",
  },
  { key: "armor", label: "Armour", hint: "Sets your AC" },
];

export function HeroesView() {
  const id = useActiveProfile((s) => s.id)!;
  const doc = usePlayers((s) => s.docs[id]);
  useGame((s) => s.library.characters);
  const away = !!useCampaign((s) => s.state) || !!usePlay((s) => s.game);
  const heroes = availableMembers(myCharacters());
  if (!doc) return null;
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
      <div className="space-y-3">
        {away && <p className="rounded-md border border-warn/60 bg-warn/10 px-3 py-2 text-sm text-warn">The heroes are out: gear is changed in town, between adventures.</p>}
        <ul className="grid gap-3 lg:grid-cols-2">
          {heroes.map((e) => (
            <HeroCard key={e.key} heroKey={e.key} locked={away} />
          ))}
        </ul>
      </div>
      <aside className="space-y-3">
        <Tavern />
        <Chests />
        <Treasury />
        <Forge />
        <Armory />
        <Shop />
      </aside>
    </div>
  );
}

function HeroCard({ heroKey, locked }: { heroKey: string; locked: boolean }) {
  const id = useActiveProfile((s) => s.id)!;
  const doc = usePlayers((s) => s.docs[id])!;
  const built = heroAsNow(heroKey)?.build();
  if (!built?.stats) return null;
  const st = built.stats;
  const loadout = doc.loadouts[heroKey] ?? startingKit(st.className);
  const fallen = doc.fallen.includes(heroKey);
  const injuries = doc.injuries[heroKey] ?? [];
  const resting = recoveryLeft(doc, heroKey);
  const options = (slot: keyof Loadout): string[] => {
    const owned = Object.keys(doc.armory).filter((k) => (doc.armory[k] ?? 0) > 0);
    if (slot === "armor") return owned.filter((k) => ARMORS[k] && ARMORS[k]!.kind !== "shield" && canUseArmor(st, k));
    if (slot === "off") return owned.filter((k) => (k === "shield" && canUseArmor(st, "shield")) || WEAPONS[k]?.props.includes("light"));
    return owned.filter((k) => WEAPONS[k]);
  };
  const weapons = st.actions.filter((a) => a.kind === "attack" && !a.slot && !a.cantrip);
  return (
    <li className={clsx("space-y-2 rounded-lg border bg-surface p-3 shadow", fallen ? "border-danger/50 opacity-70" : "border-line")} aria-label={`${built.name}'s sheet`}>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <strong className="font-display text-lg text-accent">{built.name}</strong>
          <div className="text-xs text-muted">
            Level {st.level} {st.className}
          </div>
        </div>
        <div className="flex gap-1 text-center text-xs">
          <span className="rounded-md border border-line bg-surface-2 px-2 py-1" title="Armour Class">
            🛡 <strong className="text-strong">{built.ac}</strong>
          </span>
          <span className="rounded-md border border-line bg-surface-2 px-2 py-1" title="Hit points">
            ❤ <strong className="text-strong">{built.hpMax}</strong>
          </span>
        </div>
      </div>
      <Roster heroKey={heroKey} className={st.className} locked={locked} />
      {resting > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-warn/50 bg-warn/10 px-2 py-1 text-xs text-warn" aria-label={`${built.name} in the infirmary`}>
          <span className="flex-1">
            🛏 In the infirmary: back on their feet in <strong>{resting} h</strong>. Stays home until then.
          </span>
          {(["potion-healing", "potion-greater-healing"] as const)
            .filter((k) => (doc.town?.stash[k] ?? 0) > 0)
            .map((k) => (
              <button key={k} className="btn px-2 py-0 text-xs" onClick={() => hastenRecovery(heroKey, built.name, k)} title="From the town's stores">
                🧪 {k === "potion-healing" ? "Potion" : "Greater potion"} (−
                {num("infirmary.potionHours") * (k === "potion-healing" ? 1 : 2)} h)
              </button>
            ))}
        </div>
      )}
      {(fallen || injuries.length > 0) && (
        <div className="flex flex-wrap gap-1 text-[11px]">
          {fallen && <span className="rounded-full bg-danger/15 px-2 text-danger">✝ Fallen: raise them at a shrine</span>}
          {injuries.map((inj, i) => (
            <span key={i} className="rounded-full bg-warn/15 px-2 text-warn" title={INJURIES[inj]?.effect}>
              🩹 {INJURIES[inj]?.name}
            </span>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {SLOTS.map((slot) => {
          const current = loadout[slot.key];
          const opts = options(slot.key).filter((k) => k !== current);
          return (
            <label key={slot.key} className="block rounded-md border border-line bg-surface-2/60 p-1.5" title={slot.hint}>
              <span className="block text-[10px] tracking-wider text-faint uppercase">{slot.label}</span>
              <select
                className="field w-full py-0.5 text-sm"
                value={current ?? ""}
                disabled={locked}
                onChange={(e) => equipGear(heroKey, slot.key, e.target.value || null)}
                aria-label={`${built.name}: ${slot.label}`}
              >
                <option value="">{slot.key === "armor" ? "No armour" : "— empty —"}</option>
                {current && (
                  <option value={current}>
                    {gearIcon(current)} {gearName(current)}
                  </option>
                )}
                {opts.map((k) => (
                  <option key={k} value={k}>
                    {gearIcon(k)} {gearName(k)} (armoury)
                    {WEAPONS[k] && !trainedWith(st, k) ? " · untrained" : ""}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
      <MagicItems heroKey={heroKey} name={built.name} locked={locked} />
      <ul className="space-y-0.5 text-xs">
        {weapons.map((a) => (
          <li key={a.id} className="text-muted">
            <strong className="text-strong">{a.name}</strong>
            {a.kind === "attack" && a.hand === "spare" ? <span className="text-faint"> (on the back)</span> : null}: {describeAction(a)}
          </li>
        ))}
      </ul>
      {isCaster(st.className) && <SpellPicker heroKey={heroKey} locked={locked} />}
    </li>
  );
}

/** The spells a hero has prepared now: what they stored, or what their sheet came with. */
function preparedNow(heroKey: string, stored: string[] | undefined): string[] {
  if (stored) return stored;
  const st = heroAsNow(heroKey)?.build().stats;
  if (!st) return [];
  const names = new Set(st.actions.map((a) => a.name));
  return SPELLS.filter((s) => s.classes.includes(st.className as "Cleric" | "Wizard") && (names.has(s.name) || (s.feature === "shield-spell" && st.features.includes("shield-spell")))).map(
    (s) => s.id,
  );
}

function SpellPicker({ heroKey, locked }: { heroKey: string; locked: boolean }) {
  const id = useActiveProfile((s) => s.id)!;
  const stored = usePlayers((s) => s.docs[id]?.spells[heroKey]);
  const st = heroAsNow(heroKey)?.build().stats;
  if (!st) return null;
  const chosen = preparedNow(heroKey, stored);
  const lim = spellLimits(st.className, st.level ?? 1);
  const known = spellsFor(st);
  const cantrips = chosen.filter((x) => SPELLS.find((s) => s.id === x)?.level === 0).length;
  const prepared = chosen.filter((x) => (SPELLS.find((s) => s.id === x)?.level ?? 0) > 0).length;
  const toggle = (spell: string) => prepareSpells(heroKey, chosen.includes(spell) ? chosen.filter((x) => x !== spell) : [...chosen, spell]);
  return (
    <details className="rounded-md border border-line bg-surface-2/60 p-2" aria-label={`${st.className} spells`}>
      <summary className="cursor-pointer text-xs font-bold tracking-wider text-faint uppercase">
        ✨ Spells · cantrips {cantrips}/{lim.cantrips} · prepared {prepared}/{lim.prepared}
      </summary>
      {[0, 1, 2, 3]
        .filter((lv) => known.some((s) => s.level === lv))
        .map((lv) => (
          <fieldset key={lv} className="mt-2">
            <legend className="text-[10px] tracking-wider text-faint uppercase">{lv === 0 ? "Cantrips" : `Level ${lv}`}</legend>
            <ul className="grid gap-0.5 sm:grid-cols-2">
              {known
                .filter((s) => s.level === lv)
                .map((s) => {
                  const on = chosen.includes(s.id);
                  const full = lv === 0 ? cantrips >= lim.cantrips : prepared >= lim.prepared;
                  return (
                    <li key={s.id}>
                      <label className={clsx("flex items-start gap-1.5 text-xs", !on && full && "opacity-50")} title={s.text}>
                        <input type="checkbox" checked={on} disabled={locked || (!on && full)} onChange={() => toggle(s.id)} />
                        <span>
                          <strong className="text-strong">{s.name}</strong>
                          <span className="block text-[10px] text-muted">{s.text}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
            </ul>
          </fieldset>
        ))}
    </details>
  );
}

function Armory() {
  const id = useActiveProfile((s) => s.id)!;
  const armory = usePlayers((s) => s.docs[id]?.armory ?? {});
  const items = Object.entries(armory).filter(([, n]) => n > 0);
  return (
    <section className="space-y-2 rounded-lg border border-line bg-surface p-3 shadow" aria-label="Armoury">
      <h3 className="text-xs font-bold tracking-wider text-faint uppercase">🗄 Armoury</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted italic">Empty. Take gear off a hero to store it here, or get more below.</p>
      ) : (
        <ul className="flex flex-wrap gap-1 text-sm">
          {items.map(([k, n]) => (
            <li key={k} className="rounded-full border border-line bg-surface-2 px-2 py-0.5">
              {gearIcon(k)} {gearName(k)}
              {n > 1 ? ` ×${n}` : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Shop() {
  const id = useActiveProfile((s) => s.id)!;
  const t = usePlayers((s) => s.docs[id]?.town);
  const [tab, setTab] = useState<"weapons" | "armour">("weapons");
  if (!t) return null;
  const market = working(t, "market") > 0;
  const smithy = working(t, "smithy") > 0;
  const ids = tab === "weapons" ? Object.keys(WEAPONS) : Object.keys(ARMORS);
  return (
    <section className="space-y-2 rounded-lg border border-line bg-surface p-3 shadow" aria-label="Get gear">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wider text-faint uppercase">⚒ Get gear</h3>
        <div className="flex gap-1" role="tablist">
          {(["weapons", "armour"] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} className={clsx("btn px-2 py-0 text-xs", tab === k && "border-accent text-accent")} onClick={() => setTab(k)}>
              {k === "weapons" ? "Weapons" : "Armour"}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-faint">
        The market sells simple weapons, light armour and shields
        {market ? "" : " (needs a staffed market)"}; the smithy forges martial weapons and heavier armour from gold and iron
        {smithy ? "" : " (needs a staffed smithy)"}.
      </p>
      <ul className="max-h-[28rem] space-y-1 overflow-y-auto text-sm">
        {ids.map((k) => {
          const src = gearSource(k)!;
          const open = src.at === "market" ? market : smithy;
          const wp = WEAPONS[k];
          const ar = ARMORS[k];
          const short = t.gold < src.gold || t.components.iron < src.iron;
          return (
            <li key={k} className="flex items-center gap-2 rounded-md border border-line bg-surface-2/60 px-2 py-1">
              <span className="text-lg">{gearIcon(k)}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-strong">{gearName(k)}</span>
                <span className="block truncate text-[11px] text-muted">
                  {wp
                    ? `${wp.dice}${wp.versatile ? ` (${wp.versatile})` : ""} ${wp.type} · ${wp.props.join(", ") || wp.category} · ${wp.mastery}`
                    : ar!.kind === "shield"
                      ? "+2 AC"
                      : `AC ${ar!.ac}${ar!.kind === "light" ? " + Dex" : ar!.kind === "medium" ? " + Dex (max 2)" : ""} · ${ar!.kind}`}
                </span>
              </span>
              <button
                className="btn px-2 py-0.5 text-xs"
                disabled={!open || short}
                onClick={() => getGear(k)}
                title={src.at === "market" ? "Buy at the market" : `Forge at the smithy: ${src.hours} h`}
              >
                🪙 {src.gold}
                {src.iron ? ` ⛓ ${src.iron}` : ""}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// --- Magic items ---------------------------------------------------------------------------

function ItemChip({ item, onRemove }: { item: Treasure; onRemove?: () => void }) {
  const def = MAGIC_ITEMS[item.id];
  if (!def) return null;
  const color = RARITY[def.rarity].color;
  return (
    <li
      className="flex items-center gap-1 rounded-full border bg-surface px-2 py-0.5 text-xs"
      style={{ borderColor: color, boxShadow: def.unique ? `0 0 6px ${color}` : undefined }}
      title={`${def.name} · ${RARITY[def.rarity].name}${def.attune ? " · attunement" : ""}\n${def.text}${def.lore ? `\n\n${def.lore}` : ""}`}
    >
      <span>{def.icon}</span>
      <span className="font-semibold" style={{ color }}>
        {def.name}
      </span>
      {onRemove && (
        <button className="ml-0.5 text-faint hover:text-danger" onClick={onRemove} aria-label={`Take ${def.name} back to the treasury`}>
          ✕
        </button>
      )}
    </li>
  );
}

function MagicItems({ heroKey, name, locked }: { heroKey: string; name: string; locked: boolean }) {
  const id = useActiveProfile((s) => s.id)!;
  const treasure = usePlayers((s) => s.docs[id]?.treasure) ?? [];
  const mine = treasure.filter((t) => t.on === heroKey);
  const free = treasure.filter((t) => !t.on && MAGIC_ITEMS[t.id]);
  const attuned = mine.filter((t) => MAGIC_ITEMS[t.id]?.attune).length;
  if (!mine.length && !free.length) return null;
  return (
    <div className="rounded-md border border-line bg-surface-2/60 p-1.5" aria-label={`${name}'s magic items`}>
      <div className="flex justify-between text-[10px] tracking-wider text-faint uppercase">
        <span>💎 Magic items</span>
        <span title="A hero can be attuned to at most three magic items">
          attuned {attuned}/{MAX_ATTUNED}
        </span>
      </div>
      <ul className="mt-1 flex flex-wrap gap-1">
        {mine.map((t) => (
          <ItemChip key={t.uid} item={t} onRemove={locked ? undefined : () => equipTreasure(t.uid, null)} />
        ))}
        {mine.length === 0 && <li className="text-xs text-faint italic">None yet</li>}
      </ul>
      {free.length > 0 && (
        <select className="field mt-1 w-full py-0.5 text-xs" value="" disabled={locked} aria-label={`Give ${name} a magic item`} onChange={(e) => e.target.value && equipTreasure(e.target.value, heroKey)}>
          <option value="">Give a magic item…</option>
          {free.map((t) => (
            <option key={t.uid} value={t.uid}>
              {MAGIC_ITEMS[t.id]!.icon} {MAGIC_ITEMS[t.id]!.name}
              {MAGIC_ITEMS[t.id]!.attune ? " (attunement)" : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function Chests() {
  const id = useActiveProfile((s) => s.id)!;
  const chests = usePlayers((s) => s.docs[id]?.chests) ?? [];
  const [opened, setOpened] = useState<{ chest: Chest; loot: Loot } | null>(null);
  if (!chests.length && !opened) return null;
  return (
    <section className="space-y-2 rounded-lg border border-highlight/60 bg-surface p-3 shadow" aria-label="Chests">
      <h3 className="text-xs font-bold tracking-wider text-faint uppercase">🧰 Chests to open</h3>
      <ul className="space-y-1">
        {chests.map((c) => (
          <li key={c.id} className="flex items-center gap-2 rounded-md border border-line bg-surface-2/60 px-2 py-1">
            <span className="motion-chest text-2xl [animation:chest-shake_1.6s_ease-in-out_infinite]">{chestLook(c.tier).icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-strong">{chestLook(c.tier).name}</span>
              <span className="block truncate text-[11px] text-muted">From {c.from}</span>
            </span>
            <button
              className="btn px-2 py-0.5 text-xs"
              onClick={() => {
                const loot = openChestNow(c.id);
                if (loot) setOpened({ chest: c, loot });
              }}
            >
              Open
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={!!opened} onClose={() => setOpened(null)} title={opened ? chestLook(opened.chest.tier).name : ""}>
        {opened && <ChestReveal chest={opened.chest} loot={opened.loot} />}
      </Dialog>
    </section>
  );
}

function ChestReveal({ chest, loot }: { chest: Chest; loot: Loot }) {
  const lines: { key: string; icon: string; text: string; color?: string; sub?: string }[] = [
    { key: "gold", icon: "🪙", text: `${loot.gold} gold` },
    ...(["iron", "herbs", "dust"] as const).filter((k) => loot[k] > 0).map((k) => ({ key: k, icon: { iron: "⛓", herbs: "🌿", dust: "✨" }[k], text: `${loot[k]} ${k === "dust" ? "arcane dust" : k}` })),
    ...loot.items.map((i, n) => {
      const d = MAGIC_ITEMS[i]!;
      return { key: `${i}${n}`, icon: d.icon, text: d.name, color: RARITY[d.rarity].color, sub: `${d.unique ? "Unique · " : ""}${RARITY[d.rarity].name}${d.attune ? " · attunement" : ""} — ${d.text}${d.lore ? ` ${d.lore}` : ""}` };
    }),
  ];
  return (
    <div className="text-center" aria-label="Chest contents">
      <div className="motion-chest mb-3 inline-block text-6xl [animation:chest-shake_0.8s_ease-in-out_2]">{chestLook(chest.tier).icon}</div>
      <p className="mb-3 text-sm text-muted">From {chest.from}</p>
      <ul className="space-y-2 text-left">
        {lines.map((l, i) => (
          <li
            key={l.key}
            className="rounded-md border bg-surface-2 px-3 py-2 opacity-0 [animation:loot-rise_0.5s_ease-out_forwards]"
            style={{ animationDelay: `${1.4 + i * 0.35}s`, borderColor: l.color ?? "var(--line)", boxShadow: l.color ? `0 0 10px ${l.color}66` : undefined }}
          >
            <span className="mr-2 text-xl">{l.icon}</span>
            <strong style={{ color: l.color }}>{l.text}</strong>
            {l.sub && <span className="mt-0.5 block text-xs text-muted">{l.sub}</span>}
          </li>
        ))}
      </ul>
      {loot.items.length === 0 && <p className="mt-3 text-xs text-faint italic">No magic this time.</p>}
    </div>
  );
}

function Treasury() {
  const id = useActiveProfile((s) => s.id)!;
  const doc = usePlayers((s) => s.docs[id]);
  const free = (doc?.treasure ?? []).filter((t) => !t.on && MAGIC_ITEMS[t.id]);
  if (!doc?.town || !doc.treasure.length) return null;
  const market = working(doc.town, "market") > 0;
  const tower = working(doc.town, "tower") > 0;
  return (
    <section className="space-y-2 rounded-lg border border-line bg-surface p-3 shadow" aria-label="Treasury">
      <h3 className="text-xs font-bold tracking-wider text-faint uppercase">💎 Treasury</h3>
      {free.length === 0 ? (
        <p className="text-sm text-muted italic">Every magic item is with a hero.</p>
      ) : (
        <ul className="space-y-1">
          {free.map((t) => (
            <li key={t.uid} className="flex flex-wrap items-center gap-1">
              <ul className="min-w-0 flex-1">
                <ItemChip item={t} />
              </ul>
              <button className="btn px-1.5 py-0 text-[11px]" disabled={!market} onClick={() => sellTreasure(t.uid)} title={market ? "Sell at the market" : "Needs a staffed market"}>
                🪙 {sellValue(t.id)}
              </button>
              <button className="btn px-1.5 py-0 text-[11px]" disabled={!tower} onClick={() => confirm(`Break ${MAGIC_ITEMS[t.id]!.name} down into dust?`) && disenchant(t.uid)} title={tower ? "Break it down into arcane dust at the mage tower" : "Needs a staffed mage tower"}>
                ✨ {dustValue(t.id)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Forge() {
  const id = useActiveProfile((s) => s.id)!;
  const t = usePlayers((s) => s.docs[id]?.town);
  const [at, setAt] = useState<"smithy" | "tower">("smithy");
  if (!t) return null;
  const levelAt = (type: "smithy" | "tower") => Math.max(0, ...t.buildings.filter((b) => b.type === type && working(t, type) > 0).map((b) => levelOf(b)));
  const level = levelAt(at);
  const list = recipes().filter((r) => r.at === at);
  return (
    <section className="space-y-2 rounded-lg border border-line bg-surface p-3 shadow" aria-label="Forge and enchant">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wider text-faint uppercase">🔨 Magic items to order</h3>
        <div className="flex gap-1" role="tablist">
          {(["smithy", "tower"] as const).map((k) => (
            <button key={k} role="tab" aria-selected={at === k} className={clsx("btn px-2 py-0 text-xs", at === k && "border-accent text-accent")} onClick={() => setAt(k)}>
              {BUILDINGS[k].icon} {k === "smithy" ? "Smithy" : "Mage tower"}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-faint">
        {level ? `Your ${BUILDINGS[at].name.toLowerCase()} is level ${level}; ` : `Needs a staffed ${BUILDINGS[at].name.toLowerCase()}; `}
        {at === "smithy" ? "it forges +1, +2 and +3 arms and armour." : "it crafts wondrous items and breaks unwanted ones down into dust."} Higher levels make finer things.
      </p>
      <ul className="max-h-[22rem] space-y-1 overflow-y-auto text-sm">
        {list.map((r) => {
          const d = MAGIC_ITEMS[r.item]!;
          const short = t.gold < r.gold || t.components.iron < r.iron || t.components.dust < r.dust;
          const tooLow = level < r.level;
          return (
            <li key={r.item} className={clsx("flex items-center gap-2 rounded-md border bg-surface-2/60 px-2 py-1", tooLow && "opacity-60")} style={{ borderColor: RARITY[d.rarity].color }}>
              <span className="text-lg">{d.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold" style={{ color: RARITY[d.rarity].color }}>
                  {d.name}
                </span>
                <span className="block text-[11px] text-muted">{tooLow ? `Needs a level ${r.level} ${BUILDINGS[at].name.toLowerCase()}` : d.text}</span>
              </span>
              <button className="btn px-2 py-0.5 text-xs" disabled={tooLow || short} onClick={() => craftTreasure(r.item)} title={`${r.hours} h of work`}>
                🪙 {r.gold}
                {r.iron ? ` ⛓ ${r.iron}` : ""}
                {r.dust ? ` ✨ ${r.dust}` : ""}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// --- The roster ------------------------------------------------------------------------------

function TraitChip({ id }: { id: string }) {
  const t = TRAITS[id];
  if (!t) return null;
  return (
    <span className="rounded-full border border-line bg-surface px-1.5 text-[11px]" title={t.text}>
      {t.icon} {t.name}
    </span>
  );
}

/** Traits, the personal quest and the building the hero looks after. */
function Roster({ heroKey, className, locked }: { heroKey: string; className: string | null; locked: boolean }) {
  const id = useActiveProfile((s) => s.id)!;
  const doc = usePlayers((s) => s.docs[id])!;
  const traits = traitsOf(doc.traits, heroKey);
  const quest = questOf(className);
  const deeds = doc.deeds[heroKey] ?? NO_DEEDS;
  const stage = questStage(quest, deeds);
  const next = quest.stages[Math.min(2, stage)]!;
  const value = deeds[quest.stat];
  const t = doc.town;
  const patronOf = t ? Object.entries(t.patrons).find(([, p]) => p.key === heroKey)?.[0] : undefined;
  const likes = AFFINITY[(className ?? "Fighter") as keyof typeof AFFINITY] ?? [];
  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex flex-wrap gap-1" aria-label="Traits">
        {traits.map((tr) => (
          <TraitChip key={tr} id={tr} />
        ))}
      </div>
      <div className="rounded-md border border-line bg-surface-2/60 p-1.5" aria-label="Personal quest" title={quest.text}>
        <div className="flex justify-between gap-2">
          <span>
            📜 <strong className="text-strong">{quest.name}</strong>
          </span>
          <span className="text-faint">{"★".repeat(stage) + "☆".repeat(3 - stage)}</span>
        </div>
        {stage < 3 ? (
          <>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full bg-highlight" style={{ width: `${Math.min(100, (value / next) * 100)}%` }} />
            </div>
            <div className="mt-0.5 text-[11px] text-muted">
              {value}/{next} {quest.unit} · next: {stage === 0 ? "a silver chest" : stage === 1 ? `the ${TRAITS[quest.trait]?.name} trait` : "a treasure like no other"}
            </div>
          </>
        ) : (
          <div className="mt-0.5 text-[11px] text-heal">Complete: a legend in the making.</div>
        )}
      </div>
      {t && (
        <label className="flex items-center gap-1.5" title="A hero looking after a building stays home and the building makes more (more again if it suits their class)">
          <span className="text-faint">🏛 Looks after</span>
          <select className="field flex-1 py-0.5 text-xs" value={patronOf ?? ""} disabled={locked} onChange={(e) => (e.target.value ? setPatron(e.target.value, heroKey) : patronOf && setPatron(patronOf, null))} aria-label="Looks after">
            <option value="">— nothing: free to adventure —</option>
            {t.buildings
              .filter((b) => b.type !== "house" && b.type !== "hall")
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {BUILDINGS[b.type].icon} {BUILDINGS[b.type].name}
                  {likes.includes(b.type) ? " ★" : ""}
                  {t.patrons[b.id] && t.patrons[b.id]!.key !== heroKey ? ` (now ${t.patrons[b.id]!.name})` : ""}
                </option>
              ))}
          </select>
        </label>
      )}
      {patronOf && <p className="text-[11px] text-warn">Stays home while looking after the {BUILDINGS[t!.buildings.find((b) => b.id === patronOf)?.type ?? "hall"].name.toLowerCase()}.</p>}
    </div>
  );
}

function Tavern() {
  const id = useActiveProfile((s) => s.id)!;
  const doc = usePlayers((s) => s.docs[id]);
  const t = doc?.town;
  if (!doc || !t) return null;
  const tavern = t.buildings.find((b) => b.type === "tavern");
  const staffed = working(t, "tavern") > 0;
  const draw = attraction(t, doc.renown, Object.keys(t.patrons).length);
  const list = heroesForHire();
  const days = Math.max(1, Math.round(tuned("tavern.refreshDays")));
  const nextIn = Math.ceil(((tavernBatch(t.hours) + 1) * days * 24 - t.hours) / 24);
  return (
    <section className="space-y-2 rounded-lg border border-line bg-surface p-3 shadow" aria-label="Tavern">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wider text-faint uppercase">🍺 Heroes for hire</h3>
        <span className="text-xs text-muted" title={draw.lines.map(([k, v]) => `${k}: ${v >= 0 ? "+" : ""}${v}`).join("\n")}>
          ⭐ Attraction {draw.score}
        </span>
      </div>
      {!tavern ? (
        <p className="text-sm text-muted italic">Build a tavern: heroes looking for work stop where there's ale and a story.</p>
      ) : (
        <>
          {list.length === 0 && <p className="text-sm text-muted italic">Nobody looking for work right now.</p>}
          <ul className="space-y-1.5">
            {list.map((c) => (
              <li key={c.id} className="rounded-md border border-line bg-surface-2/60 p-2 text-sm" aria-label={`For hire: ${c.spec.name}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <strong className="text-strong">{c.spec.name}</strong>
                  <span className="text-xs text-faint">
                    Level {c.level} {c.spec.species} {c.spec.className}
                  </span>
                </div>
                <p className="text-xs text-muted italic">{c.pitch}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {c.traits.map((tr) => (
                    <TraitChip key={tr} id={tr} />
                  ))}
                  <button className="btn ml-auto px-2 py-0.5 text-xs" disabled={!staffed || t.gold < c.fee} onClick={() => hireHero(c.id)} title={staffed ? "Hire" : "Needs a staffed tavern"}>
                    Hire · 🪙 {c.fee}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-faint">
            New faces in {nextIn} day{nextIn === 1 ? "" : "s"}. The more the town draws heroes (renown, spirit, the tavern, heroes looking after the town), the more come, and the better.{staffed ? "" : " Hiring needs a staffed tavern."}
          </p>
        </>
      )}
    </section>
  );
}
