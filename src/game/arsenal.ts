import { abilityMod, ActionSchema, type Ability, type AttackAction, type DamageType, type Mastery, type StatAction, type StatBlock } from "../domain/statblock";
import type { CombatantDraft } from "../store/actions";

/**
 * Weapons and armour (SRD 5.2), what each class can use, and a hero's
 * loadout: the weapons in hand and on the back, the armour they wear. A
 * loadout rewrites the hero's weapon attacks and AC from their abilities.
 */

export type WeaponProp = "finesse" | "light" | "heavy" | "two-handed" | "thrown" | "reach" | "versatile" | "loading";

export interface WeaponDef {
  id: string;
  name: string;
  icon: string;
  category: "simple" | "martial";
  kind: "melee" | "ranged";
  dice: string;
  type: DamageType;
  props: WeaponProp[];
  /** Damage die when held in two hands. */
  versatile?: string;
  /** Ranged and thrown weapons: normal / long range. */
  range?: [number, number];
  /** The weapon's 2024 mastery property, by name. */
  mastery: string;
  /** Gold at the market (simple) or the smithy (martial, also needs iron). */
  price: number;
}

const w = (
  id: string,
  name: string,
  icon: string,
  category: WeaponDef["category"],
  kind: WeaponDef["kind"],
  dice: string,
  type: DamageType,
  props: WeaponProp[],
  mastery: string,
  price: number,
  extra: Partial<WeaponDef> = {},
): WeaponDef => ({
  id,
  name,
  icon,
  category,
  kind,
  dice,
  type,
  props,
  mastery,
  price,
  ...extra,
});

export const WEAPONS: Record<string, WeaponDef> = Object.fromEntries(
  [
    // Simple melee
    w("club", "Club", "🏏", "simple", "melee", "1d4", "bludgeoning", ["light"], "Slow", 1),
    w("dagger", "Dagger", "🗡", "simple", "melee", "1d4", "piercing", ["finesse", "light", "thrown"], "Nick", 2, { range: [20, 60] }),
    w("greatclub", "Greatclub", "🪵", "simple", "melee", "1d8", "bludgeoning", ["two-handed"], "Push", 1),
    w("handaxe", "Handaxe", "🪓", "simple", "melee", "1d6", "slashing", ["light", "thrown"], "Vex", 5, { range: [20, 60] }),
    w("javelin", "Javelin", "🔱", "simple", "melee", "1d6", "piercing", ["thrown"], "Slow", 1, { range: [30, 120] }),
    w("mace", "Mace", "🔨", "simple", "melee", "1d6", "bludgeoning", [], "Sap", 5),
    w("quarterstaff", "Quarterstaff", "🦯", "simple", "melee", "1d6", "bludgeoning", ["versatile"], "Topple", 1, { versatile: "1d8" }),
    w("sickle", "Sickle", "🌙", "simple", "melee", "1d4", "slashing", ["light"], "Nick", 1),
    w("spear", "Spear", "🔱", "simple", "melee", "1d6", "piercing", ["thrown", "versatile"], "Sap", 1, { versatile: "1d8", range: [20, 60] }),
    // Simple ranged
    w("dart", "Dart", "🎯", "simple", "ranged", "1d4", "piercing", ["finesse", "thrown"], "Vex", 1, { range: [20, 60] }),
    w("light-crossbow", "Light Crossbow", "🏹", "simple", "ranged", "1d8", "piercing", ["loading", "two-handed"], "Slow", 25, { range: [80, 320] }),
    w("shortbow", "Shortbow", "🏹", "simple", "ranged", "1d6", "piercing", ["two-handed"], "Vex", 25, { range: [80, 320] }),
    w("sling", "Sling", "🪢", "simple", "ranged", "1d4", "bludgeoning", [], "Slow", 1, { range: [30, 120] }),
    // Martial melee
    w("battleaxe", "Battleaxe", "🪓", "martial", "melee", "1d8", "slashing", ["versatile"], "Topple", 10, { versatile: "1d10" }),
    w("flail", "Flail", "⛓", "martial", "melee", "1d8", "bludgeoning", [], "Sap", 10),
    w("glaive", "Glaive", "🗡", "martial", "melee", "1d10", "slashing", ["heavy", "reach", "two-handed"], "Graze", 20),
    w("greataxe", "Greataxe", "🪓", "martial", "melee", "1d12", "slashing", ["heavy", "two-handed"], "Cleave", 30),
    w("greatsword", "Greatsword", "⚔", "martial", "melee", "2d6", "slashing", ["heavy", "two-handed"], "Graze", 50),
    w("halberd", "Halberd", "🪓", "martial", "melee", "1d10", "slashing", ["heavy", "reach", "two-handed"], "Cleave", 20),
    w("longsword", "Longsword", "🗡", "martial", "melee", "1d8", "slashing", ["versatile"], "Sap", 15, { versatile: "1d10" }),
    w("maul", "Maul", "🔨", "martial", "melee", "2d6", "bludgeoning", ["heavy", "two-handed"], "Topple", 10),
    w("morningstar", "Morningstar", "✴", "martial", "melee", "1d8", "piercing", [], "Sap", 15),
    w("rapier", "Rapier", "🤺", "martial", "melee", "1d8", "piercing", ["finesse"], "Vex", 25),
    w("scimitar", "Scimitar", "🗡", "martial", "melee", "1d6", "slashing", ["finesse", "light"], "Nick", 25),
    w("shortsword", "Shortsword", "🗡", "martial", "melee", "1d6", "piercing", ["finesse", "light"], "Vex", 10),
    w("trident", "Trident", "🔱", "martial", "melee", "1d8", "piercing", ["thrown", "versatile"], "Topple", 5, { versatile: "1d10", range: [20, 60] }),
    w("warhammer", "Warhammer", "🔨", "martial", "melee", "1d8", "bludgeoning", ["versatile"], "Push", 15, { versatile: "1d10" }),
    w("war-pick", "War Pick", "⛏", "martial", "melee", "1d8", "piercing", ["versatile"], "Sap", 5, { versatile: "1d10" }),
    w("whip", "Whip", "〰", "martial", "melee", "1d4", "slashing", ["finesse", "reach"], "Slow", 2),
    // Martial ranged
    w("hand-crossbow", "Hand Crossbow", "🏹", "martial", "ranged", "1d6", "piercing", ["light", "loading"], "Vex", 75, { range: [30, 120] }),
    w("heavy-crossbow", "Heavy Crossbow", "🏹", "martial", "ranged", "1d10", "piercing", ["heavy", "loading", "two-handed"], "Push", 50, { range: [100, 400] }),
    w("longbow", "Longbow", "🏹", "martial", "ranged", "1d8", "piercing", ["heavy", "two-handed"], "Slow", 50, { range: [150, 600] }),
  ].map((x) => [x.id, x]),
);

export interface ArmorDef {
  id: string;
  name: string;
  icon: string;
  kind: "light" | "medium" | "heavy" | "shield";
  /** Base AC (a shield: the bonus). */
  ac: number;
  price: number;
}

const a = (id: string, name: string, icon: string, kind: ArmorDef["kind"], ac: number, price: number): ArmorDef => ({ id, name, icon, kind, ac, price });

export const ARMORS: Record<string, ArmorDef> = Object.fromEntries(
  [
    a("padded", "Padded Armor", "🧥", "light", 11, 5),
    a("leather", "Leather Armor", "🧥", "light", 11, 10),
    a("studded-leather", "Studded Leather", "🧥", "light", 12, 45),
    a("hide", "Hide Armor", "🐻", "medium", 12, 10),
    a("chain-shirt", "Chain Shirt", "⛓", "medium", 13, 50),
    a("scale-mail", "Scale Mail", "🐉", "medium", 14, 50),
    a("breastplate", "Breastplate", "🛡", "medium", 14, 400),
    a("half-plate", "Half Plate", "🛡", "medium", 15, 750),
    a("ring-mail", "Ring Mail", "⭕", "heavy", 14, 30),
    a("chain-mail", "Chain Mail", "⛓", "heavy", 16, 75),
    a("splint", "Splint Armor", "🛡", "heavy", 17, 200),
    a("plate", "Plate Armor", "🛡", "heavy", 18, 1500),
    a("shield", "Shield", "🛡", "shield", 2, 10),
  ].map((x) => [x.id, x]),
);

export const isGear = (id: string) => id in WEAPONS || id in ARMORS;
export const gearName = (id: string) => WEAPONS[id]?.name ?? ARMORS[id]?.name ?? id;
export const gearIcon = (id: string) => WEAPONS[id]?.icon ?? ARMORS[id]?.icon ?? "📦";

// --- What each class can use ----------------------------------------------------------

/** Armour and weapons a hero is trained with (2024 classes; a Cleric's Protector order adds heavy armour and martial weapons). */
export function training(stats: Pick<StatBlock, "className" | "traits">) {
  const protector = stats.traits.some((t) => /Protector/.test(t.name));
  switch (stats.className) {
    case "Fighter":
      return {
        armor: ["light", "medium", "heavy", "shield"],
        martial: () => true,
        mastery: true,
      };
    case "Rogue":
      return {
        armor: ["light"],
        martial: (wp: WeaponDef) => wp.props.includes("finesse") || wp.props.includes("light"),
        mastery: true,
      };
    case "Cleric":
      return {
        armor: protector ? ["light", "medium", "heavy", "shield"] : ["light", "medium", "shield"],
        martial: () => protector,
        mastery: false,
      };
    default:
      return { armor: [] as string[], martial: () => false, mastery: false };
  }
}

export const canUseArmor = (stats: Pick<StatBlock, "className" | "traits">, armorId: string) => !!ARMORS[armorId] && training(stats).armor.includes(ARMORS[armorId]!.kind);
export const trainedWith = (stats: Pick<StatBlock, "className" | "traits">, weaponId: string) => {
  const wp = WEAPONS[weaponId];
  return !!wp && (wp.category === "simple" || training(stats).martial(wp));
};

// --- Loadouts ---------------------------------------------------------------------------

export interface Loadout {
  /** Weapon in the main hand. */
  main?: string;
  /** A second light weapon, or "shield". */
  off?: string;
  /** Carried on the back: can be drawn in a fight (swapping with the main hand). */
  spare?: string;
  armor?: string;
}

/** What each class starts with (matching the ready-made heroes and the character builder). */
export function startingKit(className: string | null | undefined): Loadout {
  switch (className) {
    case "Fighter":
      return { main: "greatsword", spare: "javelin", armor: "chain-mail" };
    case "Rogue":
      return { main: "shortsword", spare: "shortbow", armor: "leather" };
    case "Cleric":
      return { main: "mace", off: "shield", armor: "chain-shirt" };
    case "Wizard":
      return { main: "dagger" };
    default:
      return { main: "club" };
  }
}

/** Items a loadout uses (for moving them between the hero and the armoury). */
export const loadoutItems = (l: Loadout) => [l.main, l.off, l.spare, l.armor].filter((x): x is string => !!x);

/** Why a loadout doesn't work, or null. */
export function loadoutProblem(stats: Pick<StatBlock, "className" | "traits">, l: Loadout): string | null {
  const main = l.main ? WEAPONS[l.main] : undefined;
  if (l.armor && !canUseArmor(stats, l.armor)) return `Not trained to wear ${ARMORS[l.armor]?.name ?? "that"}`;
  if (l.off === "shield" && !training(stats).armor.includes("shield")) return "Not trained with shields";
  if (l.off && main?.props.includes("two-handed")) return `${main.name} needs both hands`;
  if (l.off && l.off !== "shield") {
    const off = WEAPONS[l.off];
    if (!off?.props.includes("light") || !main?.props.includes("light")) return "Fighting with two weapons needs a light weapon in each hand";
  }
  return null;
}

const addMod = (dice: string, mod: number) => (mod === 0 ? dice : `${dice}${mod > 0 ? "+" : ""}${mod}`);
const SUPPORTED_MASTERY = ["graze", "sap", "slow", "vex"];

/** The attacks a weapon gives a hero (thrown melee weapons give a thrown attack too). */
export function weaponAttacks(stats: StatBlock, weaponId: string, hand: "main" | "off" | "spare", twoHands: boolean): AttackAction[] {
  const wp = WEAPONS[weaponId];
  if (!wp) return [];
  const t = training(stats);
  const trained = trainedWith(stats, weaponId);
  const str = abilityMod(stats.abilities.str);
  const dex = abilityMod(stats.abilities.dex);
  const pick = (ranged: boolean): Ability => (wp.props.includes("finesse") ? (dex > str ? "dex" : "str") : ranged && wp.kind === "ranged" ? "dex" : "str");
  const mastery = t.mastery && SUPPORTED_MASTERY.includes(wp.mastery.toLowerCase()) ? (wp.mastery.toLowerCase() as Mastery) : undefined;
  const make = (ranged: boolean, suffix: string): AttackAction => {
    const ability = pick(ranged);
    const mod = abilityMod(stats.abilities[ability]);
    const die = twoHands && wp.versatile && !ranged ? wp.versatile : wp.dice;
    // An off-hand attack adds no ability modifier (unless it's negative).
    const dmgMod = hand === "off" ? Math.min(0, mod) : mod;
    const notes = [
      wp.props.length ? wp.props.join(", ") : "",
      mastery ? `Mastery: ${wp.mastery}` : t.mastery ? `Mastery ${wp.mastery} (not in the rules yet)` : "",
      trained ? "" : "untrained: no proficiency bonus",
    ]
      .filter(Boolean)
      .join(" · ");
    return ActionSchema.parse({
      id: `w-${hand}-${weaponId}${suffix ? "-thrown" : ""}`,
      kind: "attack",
      name: `${hand === "off" ? "Off-hand " : ""}${wp.name}${suffix}`,
      attackType: ranged ? "ranged" : "melee",
      toHit: mod + (trained ? stats.proficiency : 0),
      reach: wp.props.includes("reach") ? 10 : 5,
      range: ranged ? (wp.range ?? null) : null,
      damage: [{ dice: addMod(die, dmgMod), type: wp.type }],
      finesse: wp.props.includes("finesse") || ranged ? true : undefined,
      mastery,
      bonusAction: hand === "off" ? true : undefined,
      hand,
      notes,
    }) as AttackAction;
  };
  if (wp.kind === "ranged") return [make(true, "")];
  const out = [make(false, "")];
  if (wp.props.includes("thrown") && hand !== "off") out.push(make(true, " (thrown)"));
  return out;
}

/** Armour Class from armour, shield and Dexterity (+1 with a Defense fighting style while armoured). */
export function armorClass(stats: StatBlock, l: Loadout): number {
  const dex = abilityMod(stats.abilities.dex);
  const armor = l.armor ? ARMORS[l.armor] : undefined;
  let ac = !armor ? 10 + dex : armor.kind === "light" ? armor.ac + dex : armor.kind === "medium" ? armor.ac + Math.min(2, dex) : armor.ac;
  if (l.off === "shield") ac += ARMORS.shield!.ac;
  if (armor && stats.traits.some((t) => /Fighting Style: Defense/.test(t.name))) ac += 1;
  return ac;
}

const isWeaponAttack = (x: StatAction) => x.kind === "attack" && !x.slot && !x.cantrip;

/** A hero's sheet with this loadout: weapon attacks and AC rebuilt; spells and features untouched. */
export function applyLoadout<T extends Pick<CombatantDraft, "ac" | "stats">>(c: T, l: Loadout): T {
  if (!c.stats) return c;
  const st = c.stats;
  const twoHands = !l.off;
  const attacks = [
    ...(l.main ? weaponAttacks(st, l.main, "main", twoHands) : []),
    ...(l.off && l.off !== "shield" ? weaponAttacks(st, l.off, "off", false) : []),
    ...(l.spare ? weaponAttacks(st, l.spare, "spare", true) : []),
  ];
  if (!attacks.length)
    attacks.push(
      ActionSchema.parse({
        id: "w-unarmed",
        kind: "attack",
        name: "Unarmed Strike",
        attackType: "melee",
        toHit: abilityMod(st.abilities.str) + st.proficiency,
        damage: [
          {
            dice: String(Math.max(1, 1 + abilityMod(st.abilities.str))),
            type: "bludgeoning",
          },
        ],
        notes: "",
      }) as AttackAction,
    );
  return {
    ...c,
    ac: armorClass(st, l),
    stats: {
      ...st,
      actions: [...attacks, ...st.actions.filter((x) => !isWeaponAttack(x))],
    },
  };
}
