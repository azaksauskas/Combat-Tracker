import type { Adventure, Choice, Next, Outcome } from "../domain/adventure";

/**
 * The adventure as a graph for the editor: scenes are nodes, choices are
 * arrows to where they lead. Pure, so the view only draws.
 */

export const END_VICTORY = "@end-victory";
export const END_DEFEAT = "@end-defeat";

export type EdgeKind = "go" | "failure" | "win" | "lose" | "end";

export interface GraphEdge {
  id: string;
  source: string;
  /** A scene id, or END_VICTORY / END_DEFEAT. */
  target: string;
  label: string;
  kind: EdgeKind;
  choiceId: string;
}

const short = (s: string, n = 28) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function targets(next: Next): { target: string; kind: EdgeKind; tag: string }[] {
  if ("scene" in next) return [{ target: next.scene, kind: "go", tag: "" }];
  if ("fight" in next) {
    const out: { target: string; kind: EdgeKind; tag: string }[] = [{ target: next.victory, kind: "win", tag: "⚔ won" }];
    if (next.defeat) out.push({ target: next.defeat, kind: "lose", tag: "⚔ lost" });
    else out.push({ target: END_DEFEAT, kind: "lose", tag: "⚔ lost" });
    return out;
  }
  return [{ target: next.end === "victory" ? END_VICTORY : END_DEFEAT, kind: "end", tag: "" }];
}

/** Every arrow: one per place a choice can lead (success, failure, fight won or lost). */
export function graphEdges(adv: Adventure): GraphEdge[] {
  const out: GraphEdge[] = [];
  for (const scene of Object.values(adv.scenes))
    for (const c of scene.choices) {
      const outcomes: [Outcome, "success" | "failure"][] = [[c.success, "success"]];
      if (c.failure) outcomes.push([c.failure, "failure"]);
      for (const [o, which] of outcomes)
        for (const t of targets(o.next)) {
          const tags = [c.check ? (which === "success" ? "✓" : "✗") : "", t.tag].filter(Boolean).join(" ");
          out.push({
            id: `${scene.id}/${c.id}/${which}/${t.kind}`,
            source: scene.id,
            target: t.target,
            label: `${short(c.label || "(unnamed)")}${tags ? ` ${tags}` : ""}`,
            kind: which === "failure" && t.kind === "go" ? "failure" : t.kind,
            choiceId: c.id,
          });
        }
    }
  return out;
}

export interface Pos {
  x: number;
  y: number;
}

export const COLUMN = 270;
export const ROW = 130;

/**
 * Positions for every scene: saved ones stay where the author put them; the
 * rest are laid out in columns by distance from the start (unreachable
 * scenes in a last column). The end markers go to the right of everything.
 */
export function layoutGraph(adv: Adventure): Record<string, Pos> {
  const depth = new Map<string, number>();
  const queue: string[] = adv.start in adv.scenes ? [adv.start] : [];
  if (queue[0]) depth.set(queue[0], 0);
  const edges = graphEdges(adv);
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of edges)
      if (e.source === id && e.target in adv.scenes && !depth.has(e.target)) {
        depth.set(e.target, depth.get(id)! + 1);
        queue.push(e.target);
      }
  }
  const last = Math.max(-1, ...depth.values()) + 1;
  const rows = new Map<number, number>();
  const pos: Record<string, Pos> = {};
  for (const id of Object.keys(adv.scenes)) {
    const saved = adv.layout?.[id];
    if (saved) {
      pos[id] = saved;
      continue;
    }
    const col = depth.get(id) ?? last;
    const row = rows.get(col) ?? 0;
    rows.set(col, row + 1);
    pos[id] = { x: col * COLUMN, y: row * ROW };
  }
  const xs = Object.values(pos).map((p) => p.x);
  const ys = Object.values(pos).map((p) => p.y);
  const right = (xs.length ? Math.max(...xs) : 0) + COLUMN;
  const top = ys.length ? Math.min(...ys) : 0;
  pos[END_VICTORY] = adv.layout?.[END_VICTORY] ?? { x: right, y: top };
  pos[END_DEFEAT] = adv.layout?.[END_DEFEAT] ?? { x: right, y: top + ROW };
  return pos;
}

/** A new choice in `from` leading to `to` (a scene or an end), as drawn in the graph. */
export function connectScenes(adv: Adventure, from: string, to: string): Adventure {
  const scene = adv.scenes[from];
  if (!scene || (!(to in adv.scenes) && to !== END_VICTORY && to !== END_DEFEAT)) return adv;
  const next: Next = to === END_VICTORY ? { end: "victory" } : to === END_DEFEAT ? { end: "defeat" } : { scene: to };
  const label = to === END_VICTORY ? "Head home" : to === END_DEFEAT ? "Give up" : `Go to ${adv.scenes[to]!.title || to}`;
  let n = scene.choices.length + 1;
  while (scene.choices.some((c) => c.id === `c${n}`)) n++;
  const choice: Choice = { id: `c${n}`, label, success: { next } };
  return { ...adv, scenes: { ...adv.scenes, [from]: { ...scene, choices: [...scene.choices, choice] } } };
}

/** Remembers where the author dragged a node. */
export const moveNode = (adv: Adventure, id: string, p: Pos): Adventure => ({ ...adv, layout: { ...adv.layout, [id]: { x: Math.round(p.x), y: Math.round(p.y) } } });
