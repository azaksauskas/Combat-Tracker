import { startCells, type Cell } from "./board";
import { PARTY, SRD_MONSTERS, type ContentEntry } from "../content/srd";
import type { Combatant } from "../domain/types";
import { boardFromAscii, type UnitSetup } from "./engine";
import type { Objective } from "./state";

/**
 * Hand-made skirmishes. Maps are ASCII: "#" wall, "~" difficult terrain,
 * "P" party start squares, "1"–"9" monster start squares (in order),
 * "." open ground.
 */
export interface Scenario {
  id: string;
  name: string;
  blurb: string;
  map: string[];
  /** Monster content keys, matched to "1", "2", … on the map. */
  monsters: string[];
  /** 2024 encounter difficulty for a level-1 party of four. */
  difficulty?: "Low" | "Moderate" | "High";
  /** Hero start squares in order; otherwise the "P" squares of the map. */
  starts?: Cell[];
  /** Besides beating every foe: hold out some rounds, or reach the "X" squares of the map. */
  goal?: { kind: "survive"; rounds: number } | { kind: "escape" };
  /** Raised ground, row by row ("0"–"3", stairs "a"/"b"/"c"); see boardFromAscii. */
  heights?: string[];
  /** Already sized for the party (patrols, contracts, bands on the road): not scaled again. */
  sized?: boolean;
  /** How the map is drawn: built stone, a cave, or the open country. */
  look?: "dungeon" | "cave" | "wilds";
}

/** A fight written for four heroes, scaled for a bigger company: more of the same foes (6 heroes: half as many again). */
export function scaleForParty(sc: Scenario, heroes: number): Scenario {
  if (sc.sized || heroes <= 4 || !sc.monsters.length) return sc;
  const extra = Math.round((sc.monsters.length * (heroes - 4)) / 4);
  return { ...sc, monsters: [...sc.monsters, ...Array.from({ length: extra }, (_, i) => sc.monsters[i % sc.monsters.length]!)] };
}

/** The battle's objective, from the scenario's goal and map. */
export function objectiveOf(sc: Scenario): Objective | undefined {
  if (!sc.goal) return undefined;
  if (sc.goal.kind === "survive") return { kind: "survive", rounds: sc.goal.rounds };
  return { kind: "escape", cells: starts(sc.map, (c) => c === "X") };
}

export const objectiveText = (o: Objective, round: number) =>
  o.kind === "survive" ? `Hold out for ${o.rounds} rounds (round ${Math.min(round, o.rounds)} of ${o.rounds}), or beat them all` : "Get every hero still standing onto the marked squares, or beat them all";

export const SCENARIOS: Scenario[] = [
  {
    id: "goblin-ambush",
    name: "Goblin Ambush",
    blurb: "A forest road. Goblins wait in the brush, and their wolf is hungry.",
    map: [
      "~~~...........~~~~",
      "~~.....~~~...4.~~~",
      "~.......~~....1..~",
      "P......~~~.......~",
      "P..............2.~",
      "P....#....~~....5.",
      "P....#....~~...3..",
      "~.........~~...6.~",
      "~~~~..........~~~~",
    ],
    // 5 × CR 1/4 = 250 XP: between Low and Moderate.
    monsters: ["goblin-warrior", "goblin-warrior", "wolf", "goblin-warrior", "goblin-warrior"],
    difficulty: "Moderate",
  },
  {
    id: "crypt",
    name: "The Restless Crypt",
    blurb: "Pillars, coffins and the dead that won't stay down. Bring something blunt.",
    map: [
      "##################",
      "#P......#......4.#",
      "#P......#...1....#",
      "#P..#.......#....#",
      "#P..#..##...#.2..#",
      "#......##.....5..#",
      "#..#........#..3.#",
      "#..#....#...#.6..#",
      "##################",
    ],
    // 5 × CR 1/4 = 250 XP: between Low and Moderate.
    monsters: ["skeleton", "zombie", "skeleton", "zombie", "zombie"],
    difficulty: "Moderate",
  },
  {
    id: "bandit-camp",
    name: "Bandit Camp",
    blurb: "Crossbows behind the wagons. Close the distance or find cover.",
    map: [
      "..............7...",
      "P.........##......",
      "P...~~........1..4",
      "P...~~....##......",
      "P.............##.5",
      "..........2....3..",
      "....##........##.6",
      "..............8...",
    ],
    // 6 × CR 1/8 = 150 XP: Low.
    monsters: ["bandit", "bandit", "bandit", "bandit", "bandit", "bandit"],
    difficulty: "Low",
  },
  {
    id: "cult-cellar",
    name: "The Cult Cellar",
    blurb: "Candles, chanting and a nest of rats under the temple. The cultists stay back while the rats swarm.",
    map: [
      "################",
      "#P.....#.......#",
      "#P..~~.#..1....#",
      "#P..~~....#..4.#",
      "#P.......2#....#",
      "#....#.......5.#",
      "#....#..3......#",
      "#.......#....6.#",
      "################",
    ],
    // 6 × CR 1/8 = 150 XP: Low, but Pack Tactics makes the rats bite above their weight.
    monsters: ["giant-rat", "giant-rat", "giant-rat", "cultist", "giant-rat", "cultist"],
    difficulty: "Low",
  },
  {
    id: "crypt-depths",
    name: "The Crypt Depths",
    blurb: "Below the old crypt, where the dead are made. For heroes of level 3 or more.",
    map: [
      "####################",
      "#P.....#.....#....5#",
      "#P.....#..1..#.....#",
      "#P.........#....6..#",
      "#P..##.....#..2....#",
      "#...##..3.....#..7.#",
      "#.......#..4..#....#",
      "#..#....#.....#.8.9#",
      "####################",
    ],
    // 9 × CR 1/4 = 450 XP: Low for level 3, a slog without radiant damage.
    monsters: ["skeleton", "skeleton", "zombie", "skeleton", "zombie", "skeleton", "zombie", "skeleton", "zombie"],
    difficulty: "Moderate",
  },
  {
    id: "hollow-sanctum",
    name: "The Hollow Sanctum",
    blurb: "The cult's hidden temple, its hired brutes and its captain. For heroes of level 4.",
    map: [
      "##################",
      "#P......#.....3..#",
      "#P..~~..#..1.....#",
      "#P..~~......#..6.#",
      "#P.......2..#....#",
      "#....#.......4.7.#",
      "#....#..5........#",
      "##################",
    ],
    // 4 cultists + 2 bugbears + a captain = 950 XP: Low to Moderate for level 4.
    monsters: ["cultist", "bugbear-warrior", "cultist", "cultist", "cultist", "bugbear-warrior", "bandit-captain"],
    difficulty: "Moderate",
  },
  {
    id: "gnoll-warband",
    name: "The Gnoll Warband",
    blurb: "Gnolls on the march with a bugbear chieftain. For heroes of level 4–5.",
    map: [
      "....................",
      "P.......~~......1...",
      "P...##..~~...2....5.",
      "P...##........3.....",
      "P.........##.....6..",
      "..........##..4.....",
      ".....~~.............",
      ".....~~.............",
    ],
    // 4 gnolls + 2 bugbears = 800 XP: Low to Moderate for level 4.
    monsters: ["gnoll-warrior", "gnoll-warrior", "gnoll-warrior", "gnoll-warrior", "bugbear-warrior", "bugbear-warrior"],
    difficulty: "Moderate",
  },
  {
    id: "hold-the-ford",
    name: "Hold the Ford",
    blurb: "Goblins pour across the river to raid the farms. Hold the ford until the militia arrives: four rounds.",
    map: [
      "~~~~...~~~~...~~~~",
      "1~~~...~~~~...~~~4",
      "~~~~...~~~~...~~~~",
      "2.......PP.......5",
      "........PP........",
      "3~~~...~~~~...~~~6",
      "~~~~...~~~~...~~~~",
      "~~~~...~~~~...~~~7",
    ],
    // 7 × CR 1/4 = 350 XP: more than a Moderate fight, but they only need to last four rounds.
    monsters: ["goblin-warrior", "wolf", "goblin-warrior", "goblin-warrior", "wolf", "goblin-warrior", "goblin-warrior"],
    difficulty: "High",
    goal: { kind: "survive", rounds: 4 },
  },
  {
    id: "run-for-the-gate",
    name: "Run for the Gate",
    blurb: "Caught outside the walls at dusk with bandits between you and the gate. You don't have to win: just get inside.",
    map: [
      "################X",
      "P.....#.....1...X",
      "P...........#...X",
      "P....##..2......X",
      "P.......#....3..X",
      "......4....#....X",
      "################X",
    ],
    monsters: ["bandit", "bandit", "bandit", "bandit"],
    difficulty: "Moderate",
    goal: { kind: "escape" },
  },
];

function starts(map: string[], ch: (c: string) => boolean): Cell[] {
  const cells: { cell: Cell; ch: string }[] = [];
  map.forEach((row, y) => [...row].forEach((c, x) => ch(c) && cells.push({ cell: { x, y }, ch: c })));
  return cells.sort((a, b) => a.ch.localeCompare(b.ch)).map((c) => c.cell);
}

const content = [...PARTY, ...SRD_MONSTERS];

function unitFrom(id: string, key: string | ContentEntry, side: UnitSetup["side"], pos: Cell): UnitSetup {
  const c = (typeof key === "string" ? content.find((e) => e.key === key)! : key).build();
  return { id, name: c.name, side, image: c.image, stats: c.stats!, ac: c.ac, hp: c.hpMax, speed: c.speed, pos };
}

/** Numbers duplicates: "Goblin Warrior", "Goblin Warrior 2", … */
function uniqueNames(units: UnitSetup[]) {
  const seen = new Map<string, number>();
  return units.map((u) => {
    const n = (seen.get(u.name) ?? 0) + 1;
    seen.set(u.name, n);
    return n > 1 ? { ...u, name: `${u.name} ${n}` } : u;
  });
}

export function scenarioSetup(sc: Scenario, members: ContentEntry[] = PARTY) {
  const board = boardFromAscii(
    sc.map.map((r) => r.replace(/[P1-9X]/g, ".")),
    sc.heights,
  );
  if (sc.look) board.look = sc.look;
  const marked = sc.starts ?? starts(sc.map, (c) => c === "P");
  // More foes or heroes than the map has marked squares for: the rest stand close by.
  const monsterCells = startCells(board, starts(sc.map, (c) => /[1-9]/.test(c)), sc.monsters.length, marked);
  const partyCells = startCells(board, marked, Math.max(members.length, 6), monsterCells);
  const party = members.map((p, i) => unitFrom(`p${i}`, p, "party", partyCells[i] ?? { x: 0, y: i }));
  const monsters = sc.monsters.map((m, i) => unitFrom(`m${i}`, m, "enemy", monsterCells[i] ?? { x: board.width - 1, y: i }));
  return { board, units: uniqueNames([...party, ...monsters]), partyCells };
}

/** Plays a saved encounter from the DM tools: its monsters (with stat blocks) on an open field. */
export function encounterScenario(name: string, combatants: Combatant[]): Scenario & { custom: UnitSetup[] } {
  const monsters = combatants.filter((c) => c.isMonster && c.stats);
  const width = 18;
  const height = 9;
  const map = Array.from({ length: height }, (_, y) => {
    const row = Array.from({ length: width }, () => ".");
    if (y >= 2 && y < 6) row[0] = "P";
    return row.join("");
  });
  const custom = monsters.slice(0, 9).map((c, i): UnitSetup => ({
    id: `m${i}`,
    name: c.name,
    side: "enemy",
    image: c.image,
    stats: c.stats!,
    ac: c.ac,
    hp: c.hpMax,
    speed: c.speed,
    pos: { x: width - 2 - (i % 3), y: 1 + Math.floor(i / 3) * 3 + (i % 3) },
  }));
  return { id: `encounter:${name}`, name, blurb: `${custom.length} monsters from your saved encounter.`, map, monsters: [], custom };
}

export function setupFor(sc: Scenario & { custom?: UnitSetup[] }, members: ContentEntry[] = PARTY, heroes = members.length) {
  if (!sc.custom) return scenarioSetup(scaleForParty(sc, heroes), members);
  const base = scenarioSetup({ ...sc, monsters: [] }, members);
  return { board: base.board, units: [...base.units, ...sc.custom], partyCells: base.partyCells };
}
