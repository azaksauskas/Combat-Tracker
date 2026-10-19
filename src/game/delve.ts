import type { ContentEntry } from "../content/srd";
import { key, type Board, type Cell } from "./board";
import type { UnitSetup } from "./engine";
import { scenarioSetup, type Scenario } from "./scenarios";
import type { MapObject, Objective, PassageLook, TrapKind } from "./state";
import { WEAPONS, ARMORS } from "./arsenal";
import { MAGIC_ITEMS } from "./treasure";

/**
 * The delve: a ladder of hand-made levels played from above. Each level has
 * a way in and a way out (stairs, a door, a ladder, a boat); getting every
 * standing hero to the way out clears it. Some levels are fights, some are
 * for exploring (traps, locks, levers and loot, nobody home), the last has
 * a boss. Clearing a level opens the next and unlocks gear for the heroes.
 *
 * Map legend, besides the usual terrain (see boardFromAscii):
 *   P hero start   < way in   > way out   1–9 monsters (in order)
 *   + door   L locked door (k: its key)   G gate   / lever (opens the gates)
 *   ^ hidden trap   C chest   $ coins   j a rack of javelins   b barrel
 */

export interface DelveLevel {
  n: number;
  id: string;
  name: string;
  blurb: string;
  kind: "fight" | "explore" | "boss";
  look: Board["look"];
  map: string[];
  monsters: string[];
  /** Renamed monsters (by their number on the map, 1-based). */
  names?: Record<number, string>;
  /** Monsters lying in wait (by number): seen only from 10 ft, and they strike first. */
  ambush?: number[];
  entrance: PassageLook;
  exit: PassageLook;
  /** The traps in map order (cycled), how hard to find and dodge, and how much they hurt. */
  traps: TrapKind[];
  trapDc: number;
  trapDamage: string;
  /** Locks: how hard to pick (forcing is 2 harder). */
  lockDc: number;
  /** What's in the chests, in map order. */
  chests: Loot[];
  /** Gold in each pile of coins. */
  coins: number;
  /** Gold for clearing the level. */
  reward: number;
  /** Gear and magic items the quartermaster has once the level is cleared. */
  unlocks: string[];
}

export interface Loot {
  gold?: number;
  items?: string[];
  stash?: Record<string, number>;
}

/** What the quartermaster has from the start. */
export const STARTING_UNLOCKS = [
  ...Object.values(WEAPONS)
    .filter((w) => w.category === "simple")
    .map((w) => w.id),
  "padded",
  "leather",
  "hide",
  "shield",
];

export const DELVE: DelveLevel[] = [
  {
    n: 1,
    id: "cellar-steps",
    name: "The Cellar Steps",
    blurb: "Under the old customs house the stairs go down into the dark. Something squeaks.",
    kind: "fight",
    look: "dungeon",
    map: [
      "####################",
      "#<P.#.....b#.......#",
      "#PP.#..1...#..2....#",
      "#...+......+.......#",
      "#...#..^...#....C..#",
      "##+###########+#####",
      "#.....#......#.....#",
      "#.$...#..3...#..^..#",
      "#.....+......+....>#",
      "#b....#....b.#.....#",
      "####################",
    ],
    monsters: ["giant-rat", "giant-rat", "giant-rat"],
    entrance: "stairs-up",
    exit: "door",
    traps: ["spikes"],
    trapDc: 10,
    trapDamage: "1d6",
    lockDc: 10,
    chests: [{ gold: 10, stash: { "potion-healing": 1, "alchemists-fire": 1 } }],
    coins: 8,
    reward: 20,
    unlocks: ["shortsword", "scimitar", "rapier", "longsword", "battleaxe", "warhammer", "studded-leather", "chain-shirt"],
  },
  {
    n: 2,
    id: "goblin-warren",
    name: "The Goblin Warren",
    blurb: "Goblins have dug into the crypt from below. They know you're coming.",
    kind: "fight",
    look: "cave",
    map: [
      "######################",
      "#P<..,,.....~~~...b..#",
      "#PP...,..1.......2...#",
      "#.....##...j##.......#",
      "#..^..###..####..3...#",
      "#.....##..k..##......#",
      "###L####..^...####+###",
      "#..C..#..........#...#",
      "#.....#..4...5...#.>.#",
      "#..$..#.....,....#...#",
      "######################",
    ],
    monsters: ["goblin-warrior", "goblin-warrior", "wolf", "goblin-warrior", "goblin-warrior"],
    ambush: [4, 5],
    entrance: "door",
    exit: "ladder",
    traps: ["net", "spikes"],
    trapDc: 12,
    trapDamage: "2d4",
    lockDc: 13,
    chests: [{ gold: 25, items: ["cloak-of-protection"], stash: { "potion-healing": 2 } }],
    coins: 15,
    reward: 40,
    unlocks: ["longbow", "greatsword", "greataxe", "glaive", "halberd", "hand-crossbow", "scale-mail", "ring-mail", "chain-mail"],
  },
  {
    n: 3,
    id: "flooded-hall",
    name: "The Flooded Hall",
    blurb: "Nobody lives here any more, or so they say: the sea came in. Old traps, old treasure, things in the water, and a boat tied up by the far bank.",
    kind: "explore",
    look: "cave",
    map: [
      "######################",
      "#P<....#....wWw......#",
      "#PP....#..^.wWw..C1..#",
      "#......#....wWw......#",
      "##+#####....www..^...#",
      "#......#.....^.......#",
      "#..j...G.....ww....$.#",
      "#...../#....wWw......#",
      "#.3....#..^.wWw..b...#",
      "#.C....#....wWw2.,...#",
      "#......#....wW>......#",
      "######################",
    ],
    monsters: ["giant-rat", "zombie", "giant-rat"],
    names: { 2: "Drowned One" },
    ambush: [1, 2, 3],
    entrance: "ladder",
    exit: "boat",
    traps: ["darts", "spikes", "fire", "darts"],
    trapDc: 13,
    trapDamage: "2d6",
    lockDc: 13,
    chests: [
      { gold: 30, stash: { "holy-water": 2, "potion-healing": 1 } },
      { gold: 40, items: ["weapon-plus-1", "stone-of-good-luck"] },
    ],
    coins: 25,
    reward: 50,
    unlocks: ["flail", "morningstar", "maul", "war-pick", "whip", "trident", "heavy-crossbow", "breastplate", "splint", "wand-of-the-war-mage-1"],
  },
  {
    n: 4,
    id: "bone-gate",
    name: "The Bone Gate",
    blurb: "The drowned dead stand guard in the long hall. A gate shuts it off from the vaults below.",
    kind: "fight",
    look: "dungeon",
    map: [
      "######################",
      "#P<..#..O.....O..#...#",
      "#PP..+...........+.>.#",
      "#....#..1..2..3..#...#",
      "#.C..#..O.....O..#...#",
      "#....#####G#######...#",
      "#.....b..........#...#",
      "#..j..../...^....#...#",
      "#................+...#",
      "#..$.......4...5.#...#",
      "######################",
    ],
    monsters: ["skeleton", "skeleton", "skeleton", "zombie", "zombie"],
    ambush: [4, 5],
    entrance: "boat",
    exit: "stairs-down",
    traps: ["fire"],
    trapDc: 14,
    trapDamage: "2d6",
    lockDc: 14,
    chests: [{ gold: 30, stash: { "holy-water": 3, "potion-healing": 1 } }],
    coins: 30,
    reward: 70,
    unlocks: ["half-plate", "plate", "flame-tongue", "shield-plus-1", "ring-of-protection", "amulet-of-health"],
  },
  {
    n: 5,
    id: "fog-shrine",
    name: "The Fog Shrine",
    blurb: "Green fog pours from a crack in the shrine floor. The priest who tends it will not let you leave.",
    kind: "boss",
    look: "dungeon",
    map: [
      "######################",
      "#P<.....#.....#......#",
      "#PP.....+..1..+...^..#",
      "#.......#.....#......#",
      "###+#######+#######+##",
      "#......O.......O.....#",
      "#..2...........,...3.#",
      "#......O...6k..O.....#",
      "#~~.......#L#......~~#",
      "#~~~..4.C.#>#..5..~~~#",
      "######################",
    ],
    monsters: ["cultist", "cultist", "cultist", "skeleton", "skeleton", "bandit-captain"],
    names: { 6: "The Fog Priest" },
    ambush: [4, 5],
    entrance: "stairs-up",
    exit: "door",
    traps: ["fire"],
    trapDc: 15,
    trapDamage: "2d8",
    lockDc: 15,
    chests: [{ gold: 60, items: ["weapon-plus-2", "boots-of-speed"], stash: { "potion-greater-healing": 1 } }],
    coins: 0,
    reward: 150,
    unlocks: ["armor-plus-1", "wand-of-the-war-mage-2"],
  },
];

/** Everything the quartermaster could ever have. */
export const ALL_UNLOCKS = [...STARTING_UNLOCKS, ...DELVE.flatMap((l) => [...l.unlocks, ...l.chests.flatMap((c) => c.items ?? [])])];

export const isMagic = (id: string) => id in MAGIC_ITEMS;
export const isKit = (id: string) => id in WEAPONS || id in ARMORS;

const OBJECT_CHARS = /[<>+LG/^C$jbk]/;

/** The level's objects, read off its map. */
export function levelObjects(level: DelveLevel): MapObject[] {
  const out: MapObject[] = [];
  let trap = 0;
  let chest = 0;
  const wall = (x: number, y: number) => /[#OT]/.test(level.map[y]?.[x] ?? "#");
  level.map.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (!OBJECT_CHARS.test(ch)) return;
      const pos = { x, y };
      const id = `o${out.length}`;
      // Doors and gates run along the wall they sit in.
      const dir = wall(x - 1, y) && wall(x + 1, y) ? ("h" as const) : ("v" as const);
      switch (ch) {
        case "<":
          return void out.push({ id, kind: "entrance", pos, look: level.entrance });
        case ">":
          return void out.push({ id, kind: "exit", pos, look: level.exit });
        case "+":
          return void out.push({ id, kind: "door", pos, dir });
        case "L":
          return void out.push({ id, kind: "door", pos, dir, locked: true, group: "key", dc: level.lockDc });
        case "G":
          return void out.push({ id, kind: "gate", pos, dir, group: "gate", dc: level.lockDc + 4 });
        case "/":
          return void out.push({ id, kind: "lever", pos, group: "gate" });
        case "^":
          return void out.push({ id, kind: "trap", pos, trap: level.traps[trap++ % level.traps.length], hidden: true, armed: true, dc: level.trapDc, damage: level.trapDamage });
        case "C": {
          const l = level.chests[chest++ % Math.max(1, level.chests.length)] ?? {};
          return void out.push({ id, kind: "chest", pos, loot: { gold: l.gold ?? 0, items: l.items ?? [], stash: l.stash } });
        }
        case "$":
          return void out.push({ id, kind: "loot", pos, loot: { gold: level.coins, items: [] } });
        case "j":
          return void out.push({ id, kind: "loot", pos, loot: { gold: 0, items: [], stash: { javelin: 3 } } });
        case "k":
          return void out.push({ id, kind: "loot", pos, group: "key" });
        case "b":
          return void out.push({ id, kind: "barrel", pos });
      }
    }),
  );
  return out;
}

/** Everything a level's battle needs: the board, the creatures, the objects and the goal. */
export function levelSetup(level: DelveLevel, members: ContentEntry[]): { scenario: Scenario; board: Board; units: UnitSetup[]; objects: MapObject[]; objective: Objective } {
  const objects = levelObjects(level);
  // Objects stand in as walls while creatures are placed, so nobody starts on a chest or in a doorway.
  const scenario: Scenario = {
    id: `delve:${level.id}`,
    name: `${level.n}. ${level.name}`,
    blurb: level.blurb,
    map: level.map.map((r) => r.replace(/[<>+LG/^C$jbk]/g, "#")),
    monsters: level.monsters,
    look: level.look,
  };
  const { board, units } = scenarioSetup(scenario, members);
  const spots = new Set(objects.map((o) => key(o.pos)));
  board.walls = board.walls.filter((w) => !spots.has(w));
  // Monsters haven't noticed the party yet: they join in when a hero sees them.
  const named = units.map((u) => {
    const i = /^m(\d+)$/.exec(u.id);
    if (!i) return u;
    const n = Number(i[1]) + 1;
    const name = level.names?.[n];
    return { ...u, ...(name ? { name } : {}), dormant: true, ...(level.ambush?.includes(n) ? { ambush: true } : {}) };
  });
  const exits: Cell[] = objects.filter((o) => o.kind === "exit").map((o) => o.pos);
  return { scenario: { ...scenario, map: level.map }, board, units: named, objects, objective: { kind: "exit", cells: exits } };
}
