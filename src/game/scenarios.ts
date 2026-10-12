import { PARTY, SRD_MONSTERS } from "../content/srd";
import type { Combatant } from "../domain/types";
import type { Cell } from "./board";
import { boardFromAscii, type UnitSetup } from "./engine";

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
}

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
];

function starts(map: string[], ch: (c: string) => boolean): Cell[] {
  const cells: { cell: Cell; ch: string }[] = [];
  map.forEach((row, y) => [...row].forEach((c, x) => ch(c) && cells.push({ cell: { x, y }, ch: c })));
  return cells.sort((a, b) => a.ch.localeCompare(b.ch)).map((c) => c.cell);
}

const content = [...PARTY, ...SRD_MONSTERS];

function unitFrom(id: string, key: string, side: UnitSetup["side"], pos: Cell): UnitSetup {
  const c = content.find((e) => e.key === key)!.build();
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

export function scenarioSetup(sc: Scenario) {
  const board = boardFromAscii(sc.map.map((r) => r.replace(/[P1-9]/g, ".")));
  const partyCells = starts(sc.map, (c) => c === "P");
  const monsterCells = starts(sc.map, (c) => /[1-9]/.test(c));
  const party = PARTY.map((p, i) => unitFrom(`p${i}`, p.key, "party", partyCells[i] ?? { x: 0, y: i }));
  const monsters = sc.monsters.map((m, i) => unitFrom(`m${i}`, m, "enemy", monsterCells[i] ?? { x: board.width - 1, y: i }));
  return { board, units: uniqueNames([...party, ...monsters]) };
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

export function setupFor(sc: Scenario & { custom?: UnitSetup[] }) {
  if (!sc.custom) return scenarioSetup(sc);
  const base = scenarioSetup({ ...sc, monsters: [] });
  return { board: base.board, units: [...base.units, ...sc.custom] };
}
