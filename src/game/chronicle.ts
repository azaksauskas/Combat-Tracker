import type { ChronicleEntry } from "../domain/players";
import type { CampaignState } from "./adventure";
import { ITEMS } from "./party";

/**
 * Turns a step of an adventure into chronicle entries for the DM: what the
 * party found, who levelled up or died, story flags, and how it ended.
 * Pure: compares the state before and after one step.
 */

export type ChronicleDraft = Omit<ChronicleEntry, "id" | "at" | "status">;

const itemList = (items: Record<string, number>) =>
  Object.entries(items)
    .map(([id, n]) => `${n > 1 ? `${n} × ` : ""}${ITEMS[id]?.name ?? id}`)
    .join(", ");

export function chronicleStep(before: CampaignState | null, after: CampaignState | null, title: string): ChronicleDraft[] {
  const out: ChronicleDraft[] = [];
  if (!before && after) {
    out.push({ kind: "adventure", adventure: title, text: `Set out on “${title}” with ${after.party.heroes.map((h) => h.name).join(", ")}.` });
    return out;
  }
  if (before && !after) {
    if (!before.ended) out.push({ kind: "adventure", adventure: title, text: `Abandoned “${title}”.` });
    return out;
  }
  if (!before || !after) return out;

  // Loot: gold, items and XP gained in this step.
  const gold = after.party.gold - before.party.gold;
  const xp = after.party.xp - before.party.xp;
  const items: Record<string, number> = {};
  const ids = new Set([...Object.keys(after.party.items), ...after.party.heroes.flatMap((h) => h.equipment)]);
  for (const id of ids) {
    const n = after.party.items[id] ?? 0;
    const was = before.party.items[id] ?? 0;
    // Equipping moves an item out of the pack; only count what's new to the party.
    const equippedNow = after.party.heroes.filter((h) => h.equipment.includes(id)).length;
    const equippedBefore = before.party.heroes.filter((h) => h.equipment.includes(id)).length;
    const gained = n + equippedNow - (was + equippedBefore);
    if (gained > 0) items[id] = gained;
  }
  const found = [gold > 0 ? `${gold} gp` : "", itemList(items)].filter(Boolean).join(", ");
  if (found || xp > 0)
    out.push({
      kind: "loot",
      adventure: title,
      text: found ? `Found ${found}${xp > 0 ? ` (+${xp} XP)` : ""}.` : `Earned ${xp} XP.`,
      ...(gold > 0 ? { gold } : {}),
      ...(xp > 0 ? { xp } : {}),
      ...(Object.keys(items).length ? { items } : {}),
    });
  if (gold < 0) out.push({ kind: "story", adventure: title, text: `Spent ${-gold} gp.`, gold });

  // Heroes: level-ups and deaths.
  for (const h of after.party.heroes) {
    const was = before.party.heroes.find((x) => x.key === h.key);
    if (!was) continue;
    if (h.level > was.level) out.push({ kind: "level", adventure: title, text: `${h.name} reached level ${h.level}.` });
    if (h.dead && !was.dead) out.push({ kind: "death", adventure: title, text: `${h.name} died.` });
  }

  // People who'll move to the player's town.
  for (const r of after.recruits ?? [])
    if (!(before.recruits ?? []).some((x) => x.name === r.name)) out.push({ kind: "story", adventure: title, text: `${r.name}${r.trade ? `, ${r.trade},` : ""} will move to the heroes' town.` });

  // Deeds that will colour the town's reputation.
  const d0 = before.deeds ?? { law: 0, good: 0 };
  const d1 = after.deeds ?? { law: 0, good: 0 };
  const dl = d1.law - d0.law;
  const dg = d1.good - d0.good;
  if (dl || dg)
    out.push({
      kind: "story",
      adventure: title,
      text: `A ${[dg > 0 ? "kind" : dg < 0 ? "cruel" : "", dl > 0 ? "lawful" : dl < 0 ? "lawless" : ""].filter(Boolean).join(", ")} deed (${[dl ? `law ${dl > 0 ? "+" : ""}${dl}` : "", dg ? `good ${dg > 0 ? "+" : ""}${dg}` : ""].filter(Boolean).join(", ")}).`,
    });

  // Story flags the DM may want to know about.
  const flags = after.flags.filter((f) => !before.flags.includes(f));
  if (flags.length) out.push({ kind: "story", adventure: title, text: `Story: ${flags.join(", ")}.`, flags });

  if (after.ended && !before.ended)
    out.push({
      kind: "adventure",
      adventure: title,
      text: after.ended === "victory" ? `Completed “${title}”. Party: ${after.party.heroes.map((h) => `${h.name} (level ${h.level}${h.dead ? ", fallen" : ""})`).join(", ")}; ${after.party.gold} gp.` : `“${title}” ended in defeat.`,
    });
  return out;
}

/** A finished battle inside an adventure. */
export function chronicleFight(title: string, battle: string, outcome: "victory" | "defeat", retreat: boolean, rounds: number): ChronicleDraft {
  return {
    kind: "fight",
    adventure: title,
    text: retreat ? `Retreated from ${battle}.` : outcome === "victory" ? `Won ${battle} in ${rounds} round${rounds === 1 ? "" : "s"}.` : `Lost ${battle}.`,
  };
}
