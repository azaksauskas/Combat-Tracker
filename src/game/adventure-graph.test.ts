import { describe, expect, it } from "vitest";
import { GOBLIN_TRAIL } from "../content/adventures";
import { blankAdventure, deleteScene, renameScene } from "./adventure-edit";
import { COLUMN, END_DEFEAT, END_VICTORY, connectScenes, graphEdges, layoutGraph, moveNode } from "./adventure-graph";

describe("the adventure graph", () => {
  it("draws an arrow for every way a choice can go", () => {
    const edges = graphEdges(GOBLIN_TRAIL);
    expect(edges.length).toBeGreaterThan(5);
    // Every arrow points at a scene or an end.
    for (const e of edges) expect(e.target in GOBLIN_TRAIL.scenes || e.target === END_VICTORY || e.target === END_DEFEAT).toBe(true);
    expect(edges.some((e) => e.kind === "win")).toBe(true);
    expect(edges.some((e) => e.kind === "end" && e.target === END_VICTORY)).toBe(true);
  });

  it("lays scenes out by distance from the start, keeping where the author put them", () => {
    const pos = layoutGraph(GOBLIN_TRAIL);
    expect(pos[GOBLIN_TRAIL.start]).toEqual({ x: 0, y: 0 });
    expect(Object.keys(pos)).toEqual(expect.arrayContaining([...Object.keys(GOBLIN_TRAIL.scenes), END_VICTORY, END_DEFEAT]));
    const moved = moveNode(GOBLIN_TRAIL, GOBLIN_TRAIL.start, { x: 500.4, y: -20 });
    expect(layoutGraph(moved)[GOBLIN_TRAIL.start]).toEqual({ x: 500, y: -20 });
    // Renaming and deleting keep the layout tidy.
    const renamed = renameScene(moved, GOBLIN_TRAIL.start, "begin")!;
    expect(renamed.layout?.begin).toEqual({ x: 500, y: -20 });
    expect(deleteScene(renamed, "begin").layout?.begin).toBeUndefined();
  });

  it("connecting two nodes adds a choice", () => {
    let adv = blankAdventure("a");
    adv = { ...adv, scenes: { ...adv.scenes, cave: { id: "cave", title: "The Cave", text: "", choices: [] } } };
    adv = connectScenes(adv, "start", "cave");
    expect(adv.scenes.start!.choices.at(-1)).toMatchObject({ label: "Go to The Cave", success: { next: { scene: "cave" } } });
    adv = connectScenes(adv, "cave", END_VICTORY);
    expect(adv.scenes.cave!.choices[0]).toMatchObject({ label: "Head home", success: { next: { end: "victory" } } });
    expect(layoutGraph(adv).cave).toEqual({ x: COLUMN, y: 0 });
    expect(connectScenes(adv, "cave", "nowhere")).toBe(adv);
  });
});
