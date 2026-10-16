import { mulberry32 } from "./rng";
import type { Place } from "./world";

/**
 * Inside a settlement (Battle Brothers style): what it is known for changes
 * what it offers, its buildings are drawn and clickable, and its people can
 * be talked to. Pure data and functions; world-store applies the effects.
 */

export type Building = "board" | "market" | "tavern" | "temple" | "farm" | "lodge" | "forge" | "docks" | "hall" | "college" | "court";

export interface Character {
  /** The building it is known for. */
  building: Building;
  /** One line, shown on entering. */
  blurb: string;
  /** Price multipliers. */
  rations?: number;
  potions?: number;
  horses?: number;
  /** Contract pay multiplier, and extra contracts on the board. */
  pay?: number;
  extraWork?: number;
  /** Extra sellswords at the tavern. */
  extraRecruits?: number;
}

/** What each "known for" means (see KNOWN_FOR in world.ts). */
export const CHARACTER: Record<string, Character> = {
  "farms and cheap bread": { building: "farm", blurb: "Fields to the horizon. Bread is cheap and the farmers need hands.", rations: 0.6 },
  "hunters and furs": { building: "lodge", blurb: "Hides drying on every fence. The hunters know every den for a day around.", pay: 1.15 },
  "a holy well": { building: "temple", blurb: "Pilgrims queue at the well. The priests sell draughts blessed in its water.", potions: 0.75 },
  "a busy forge": { building: "forge", blurb: "Hammers ring from dawn. The smiths here are the best for a week's ride." },
  "the river market": { building: "docks", blurb: "Barges tie up at the quay; everything is for sale, horses too.", potions: 0.8, horses: 0.75 },
  "a mercenary hall": { building: "hall", blurb: "Sellswords drink in the hall, waiting for a captain who pays.", extraRecruits: 2 },
  "the temple of the Dawn": { building: "temple", blurb: "The great temple's bells mark the hours. Its healers are famous.", potions: 0.7 },
  "a college of mages": { building: "college", blurb: "Robed scholars argue in the streets. They know old places nobody else remembers." },
  "the duke's court": { building: "court", blurb: "The duke's banners fly. There's always work for a company with a name.", pay: 1.25, extraWork: 1 },
};

export const characterOf = (place: Place): Character => CHARACTER[place.known ?? ""] ?? { building: "board", blurb: "" };

export const BUILDING: Record<Building, { name: string; icon: string }> = {
  board: { name: "Notice board", icon: "📜" },
  market: { name: "Market", icon: "⚖" },
  tavern: { name: "Tavern", icon: "🍺" },
  temple: { name: "Temple", icon: "🕯" },
  farm: { name: "Farm", icon: "🌾" },
  lodge: { name: "Hunters' lodge", icon: "🦌" },
  forge: { name: "Forge", icon: "⚒" },
  docks: { name: "Quay", icon: "⛵" },
  hall: { name: "Mercenary hall", icon: "⚔" },
  college: { name: "College", icon: "🔭" },
  court: { name: "Duke's court", icon: "👑" },
};

/** The buildings of a settlement, in the order they stand along the street. */
export function buildingsOf(place: Place): Building[] {
  const own = characterOf(place).building;
  const base: Building[] = ["board", "market", "tavern", "temple"];
  if (own !== "board" && !base.includes(own)) base.splice(2, 0, own);
  // Every town and city has a smith taking orders (the forge town the best).
  if (place.kind !== "village" && !base.includes("forge")) base.splice(base.indexOf("tavern"), 0, "forge");
  return base;
}

// --- Things to do -------------------------------------------------------------------------

/** Something the company can do at a building, once a day per settlement. */
export interface Deed {
  id: string;
  building: Building;
  label: string;
  /** What comes of it. */
  text: string;
  /** Gold, times the settlement's size (village 1, town 1.5, city 2). */
  cost?: number;
  hours?: number;
  rep?: number;
  provisions?: number;
  /** Mark these unknown places on the map (nearest first). */
  reveal?: ("den" | "lair" | "site" | "mark")[];
  /** Mark the nearest unknown place of any of these kinds. */
  revealAny?: ("den" | "lair" | "site" | "mark")[];
}

export const DEEDS: Deed[] = [
  { id: "round", building: "tavern", label: "Buy the house a round", cost: 4, rep: 1, revealAny: ["den", "lair", "site", "mark"], text: "Tongues loosen. Someone mentions a place you didn't know." },
  { id: "alms", building: "temple", label: "Give alms", cost: 12, rep: 2, text: "The priests bless the company by name at the evening service." },
  { id: "fields", building: "farm", label: "Help in the fields (6 hours)", hours: 6, provisions: 5, rep: 1, text: "Hard work and honest pay: sacks of meal and the farmers' thanks." },
  { id: "tracker", building: "lodge", label: "Hire a tracker", cost: 10, reveal: ["den", "den"], text: "A tracker marks the dens on your map and spits for luck." },
  { id: "sages", building: "college", label: "Consult the sages", cost: 15, reveal: ["site", "mark"], text: "Dusty maps, and places nobody else remembers." },
  { id: "court", building: "court", label: "Pay court to the duke", cost: 20, rep: 3, text: "The duke receives you, briefly. His steward will remember the company's name." },
];

export const sizeOf = (place: Place) => (place.kind === "city" ? 2 : place.kind === "town" ? 1.5 : 1);
export const deedCost = (d: Deed, place: Place) => Math.round((d.cost ?? 0) * sizeOf(place));

// --- Townsfolk ------------------------------------------------------------------------------

export type Role = "elder" | "merchant" | "guard" | "farmer" | "priest" | "hunter" | "bard" | "child" | "smith" | "sage";

export interface Townsfolk {
  id: string;
  name: string;
  role: Role;
  /** The building they stand by. */
  at: Building;
  /** What they can point out on the map. */
  knows: ("den" | "lair" | "site" | "mark")[];
}

const NAMES = ["Agna", "Bertil", "Corwin", "Dora", "Edric", "Fenna", "Godric", "Hilde", "Ivo", "Jessa", "Kell", "Lotte", "Merrin", "Nils", "Osk", "Pella", "Rook", "Sabine", "Tam", "Ulla", "Wendel", "Yara"];

export const ROLE: Record<Role, { title: string; at: Building[]; knows: Townsfolk["knows"]; hello: string[] }> = {
  elder: { title: "the reeve", at: ["board"], knows: ["lair"], hello: ["Swords for hire? The board's there. Read it, then come and argue the pay.", "We pay what we can. It's never enough, I know."] },
  merchant: { title: "a merchant", at: ["market", "docks"], knows: ["site"], hello: ["Buying or selling? Both? Even better.", "The roads are bad for trade. You'd know."] },
  guard: { title: "a guard", at: ["board", "court", "hall"], knows: ["lair", "den"], hello: ["Keep your blades sheathed in town and we'll get on fine.", "Another company. Well, the last lot didn't come back."] },
  farmer: { title: "a farmer", at: ["farm", "market"], knows: ["den"], hello: ["Wolves took two sheep last week. Two!", "Rain's late. Everything's late."] },
  priest: { title: "a priest", at: ["temple"], knows: ["mark", "site"], hello: ["The Dawn watches over travellers. Mostly.", "Rest here a while, if your souls need it."] },
  hunter: { title: "a hunter", at: ["lodge", "tavern"], knows: ["den", "den"], hello: ["I can smell a den from a mile off. Ask me where.", "Tracks everywhere this season. Something's driving them."] },
  bard: { title: "a bard", at: ["tavern"], knows: ["mark", "lair"], hello: ["A company! Tell me your deeds; I'll make them better.", "I sing for coin, or for a good story."] },
  child: { title: "a child", at: ["market", "temple", "farm"], knows: ["mark"], hello: ["Are you knights? You look like knights. Sort of.", "I know a secret place. Want to know?"] },
  smith: { title: "the smith", at: ["forge"], knows: ["site"], hello: ["Mind the sparks.", "Good steel takes time. Bad steel takes lives."] },
  sage: { title: "a sage", at: ["college"], knows: ["site", "mark", "site"], hello: ["Old places keep old secrets. I keep a list of them.", "You have the look of people who go into ruins."] },
};

const hashOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 23);

/** The people about in a settlement this batch of days. */
export function townsfolkOf(seed: number, place: Place, batch: number): Townsfolk[] {
  const rng = mulberry32((seed ^ hashOf(place.id) ^ (batch * 7919)) >>> 0).rng;
  const here = buildingsOf(place);
  const roles = (Object.keys(ROLE) as Role[]).filter((r) => ROLE[r].at.some((b) => here.includes(b)));
  const count = place.kind === "city" ? 5 : place.kind === "town" ? 4 : 3;
  const out: Townsfolk[] = [];
  // The reeve is always there; the rest by chance.
  const picked: Role[] = ["elder"];
  while (picked.length < Math.min(count, roles.length)) {
    const r = roles[Math.floor(rng() * roles.length)]!;
    if (!picked.includes(r)) picked.push(r);
  }
  const names = [...NAMES];
  for (const role of picked) {
    const name = names.splice(Math.floor(rng() * names.length), 1)[0]!;
    const spots = ROLE[role].at.filter((b) => here.includes(b));
    out.push({ id: `${place.id}-${batch}-${role}`, name, role, at: spots[Math.floor(rng() * spots.length)] ?? "market", knows: ROLE[role].knows });
  }
  return out;
}

/** Their greeting, coloured by how the company is thought of here. */
export function greeting(f: Townsfolk, rep: number, seed: number): string {
  const lines = ROLE[f.role].hello;
  const line = lines[hashOf(f.id + seed) % lines.length]!;
  if (rep <= -3) return `${line} …And don't think we've forgotten what your lot did.`;
  if (rep >= 6) return `${line} Everyone knows your company here. You're welcome at any table.`;
  return line;
}
