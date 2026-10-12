import { AdventureSchema, type Adventure, type Next, type Outcome, type Scene } from "../domain/adventure";
import { validateAdventure } from "./adventure";

/**
 * Pure helpers for the adventure editor: create, duplicate, add / rename /
 * delete scenes (keeping links intact), and a lint pass that explains what's
 * wrong in plain words.
 */

export function blankAdventure(id: string): Adventure {
  return {
    id,
    title: "A new adventure",
    blurb: "",
    start: "start",
    startingGold: 10,
    scenes: {
      start: {
        id: "start",
        title: "The beginning",
        text: "Describe where the heroes are and what they see.",
        choices: [{ id: "c1", label: "Head home", success: { text: "Nothing happens today.", next: { end: "victory" } } }],
      },
    },
  };
}

export function duplicateAdventure(adv: Adventure, id: string): Adventure {
  return { ...structuredClone(adv), id, title: `${adv.title} (copy)` };
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "scene";

/** A scene id derived from the title that isn't taken yet. */
export function freeSceneId(adv: Adventure, title: string): string {
  const base = slug(title);
  let id = base;
  for (let n = 2; id in adv.scenes; n++) id = `${base}-${n}`;
  return id;
}

export function addScene(adv: Adventure, title = "New scene"): { adventure: Adventure; id: string } {
  const id = freeSceneId(adv, title);
  const scene: Scene = { id, title, text: "", choices: [] };
  return { adventure: { ...adv, scenes: { ...adv.scenes, [id]: scene } }, id };
}

function mapNext(next: Next, f: (id: string) => string): Next {
  if ("scene" in next) return { scene: f(next.scene) };
  if ("fight" in next) return { ...next, victory: f(next.victory), ...(next.defeat ? { defeat: f(next.defeat) } : {}) };
  return next;
}

const mapOutcome = (o: Outcome, f: (id: string) => string): Outcome => ({ ...o, next: mapNext(o.next, f) });

/** Renames a scene and every link to it. Returns null if the new id is empty or taken. */
export function renameScene(adv: Adventure, from: string, to: string): Adventure | null {
  to = to.trim();
  if (!to || (to !== from && to in adv.scenes) || !(from in adv.scenes)) return null;
  if (to === from) return adv;
  const f = (id: string) => (id === from ? to : id);
  const scenes: Record<string, Scene> = {};
  for (const [id, scene] of Object.entries(adv.scenes)) {
    scenes[f(id)] = {
      ...scene,
      id: f(id),
      choices: scene.choices.map((c) => ({ ...c, success: mapOutcome(c.success, f), ...(c.failure ? { failure: mapOutcome(c.failure, f) } : {}) })),
    };
  }
  return { ...adv, start: f(adv.start), scenes };
}

export function deleteScene(adv: Adventure, id: string): Adventure {
  const scenes = { ...adv.scenes };
  delete scenes[id];
  return { ...adv, scenes };
}

/** Scene ids a scene leads to, in order, without repeats. */
export function sceneLinks(scene: Scene): string[] {
  const out: string[] = [];
  for (const c of scene.choices)
    for (const o of [c.success, c.failure]) {
      if (!o) continue;
      const n = o.next;
      if ("scene" in n) out.push(n.scene);
      if ("fight" in n) out.push(n.victory, ...(n.defeat ? [n.defeat] : []));
    }
  return [...new Set(out)];
}

export interface Issue {
  level: "error" | "warning";
  text: string;
  sceneId?: string;
}

/** Errors that break play, and warnings for things that are probably mistakes. */
export function lintAdventure(adv: Adventure, scenarioIds: string[]): Issue[] {
  const issues: Issue[] = validateAdventure(adv, scenarioIds).map((text) => ({ level: "error", text, sceneId: text.split("/")[0] }));
  // Reachability from the start scene.
  const seen = new Set<string>();
  const queue = adv.start in adv.scenes ? [adv.start] : [];
  while (queue.length) {
    const id = queue.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of sceneLinks(adv.scenes[id]!)) if (next in adv.scenes) queue.push(next);
  }
  let canEnd = false;
  for (const scene of Object.values(adv.scenes)) {
    if (!seen.has(scene.id)) issues.push({ level: "warning", text: `"${scene.title || scene.id}" can't be reached from the start`, sceneId: scene.id });
    if (scene.choices.length === 0) issues.push({ level: "error", text: `"${scene.title || scene.id}" has no choices, so the story gets stuck there`, sceneId: scene.id });
    for (const c of scene.choices) {
      if (!c.label.trim()) issues.push({ level: "warning", text: `A choice in "${scene.title || scene.id}" has no label`, sceneId: scene.id });
      for (const o of [c.success, c.failure]) if (o && "end" in o.next) canEnd = true;
      // Fights can end the adventure on defeat without a defeat scene.
      if ("fight" in c.success.next && !c.success.next.defeat) canEnd = true;
    }
  }
  if (!canEnd) issues.push({ level: "warning", text: "No choice ends the adventure" });
  return issues;
}

export class ImportError extends Error {}

/** Reads an exported adventure. Gives it a fresh id when one is supplied. */
export function parseAdventureJson(text: string, id?: string): Adventure {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError("That isn't valid JSON");
  }
  const result = AdventureSchema.safeParse(raw);
  if (!result.success) throw new ImportError("That doesn't look like an adventure");
  if (Object.keys(result.data.scenes).length === 0) throw new ImportError("The adventure has no scenes");
  return id ? { ...result.data, id } : result.data;
}
