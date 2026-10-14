import { describe, expect, it } from "vitest";
import { GOBLIN_TRAIL } from "../content/adventures";
import { choose, startAdventure } from "./adventure";
import { addScene, blankAdventure, clueIndex, deleteScene, duplicateAdventure, lintAdventure, parseAdventureJson, renameScene, sceneLinks, ImportError } from "./adventure-edit";
import { SCENARIOS } from "./scenarios";

const ids = SCENARIOS.map((s) => s.id);

describe("adventure editing", () => {
  it("a blank adventure is valid and playable to the end", () => {
    const adv = blankAdventure("a1");
    expect(lintAdventure(adv, ids)).toEqual([]);
    const s = choose(startAdventure(adv, 1), adv, "c1");
    expect(s.ended).toBe("victory");
  });

  it("the built-in adventure has no issues, and a copy is independent", () => {
    expect(lintAdventure(GOBLIN_TRAIL, ids)).toEqual([]);
    const copy = duplicateAdventure(GOBLIN_TRAIL, "copy");
    copy.scenes.millbrook!.title = "Changed";
    expect(GOBLIN_TRAIL.scenes.millbrook!.title).toBe("Millbrook's Plea");
    expect(copy.title).toBe("The Goblin Trail (copy)");
  });

  it("adds scenes with free ids", () => {
    let adv = blankAdventure("a");
    const first = addScene(adv, "The Dark Cave!");
    expect(first.id).toBe("the-dark-cave");
    adv = first.adventure;
    expect(addScene(adv, "The Dark Cave").id).toBe("the-dark-cave-2");
  });

  it("renaming a scene keeps every link pointing at it", () => {
    const renamed = renameScene(GOBLIN_TRAIL, "crypt-approach", "hill")!;
    expect(renamed.scenes.hill!.id).toBe("hill");
    expect(renamed.scenes["crypt-approach"]).toBeUndefined();
    expect(sceneLinks(renamed.scenes.toll!)).toContain("hill");
    expect(lintAdventure(renamed, ids)).toEqual([]);
    expect(renameScene(GOBLIN_TRAIL, "trail", "toll")).toBeNull();
    expect(renameScene(GOBLIN_TRAIL, "trail", " ")).toBeNull();
    expect(renameScene(GOBLIN_TRAIL, "millbrook", "start")!.start).toBe("start");
  });

  it("lint explains broken links, dead ends and unreachable scenes", () => {
    let adv = deleteScene(GOBLIN_TRAIL, "captured");
    adv = addScene(adv, "Orphan").adventure;
    const issues = lintAdventure(adv, ids);
    expect(issues.filter((i) => i.level === "error").map((i) => i.text)).toEqual(
      expect.arrayContaining([expect.stringMatching(/missing defeat scene "captured"/), expect.stringMatching(/"Orphan" has no choices/)]),
    );
    expect(issues).toContainEqual({ level: "warning", text: `"Orphan" can't be reached from the start`, sceneId: "orphan" });
  });

  it("imports exported JSON and rejects junk", () => {
    const back = parseAdventureJson(JSON.stringify(GOBLIN_TRAIL), "new-id");
    expect(back.id).toBe("new-id");
    expect(back.scenes).toEqual(GOBLIN_TRAIL.scenes);
    expect(() => parseAdventureJson("{nope")).toThrow(ImportError);
    expect(() => parseAdventureJson(JSON.stringify({ id: "x", scenes: {} }))).toThrow(/no scenes/);
  });
});

describe("clues", () => {
  it("indexes where clues are learned and needed, and warns when one is never learned", () => {
    const idx = clueIndex(GOBLIN_TRAIL);
    expect(idx.get("trap-disarmed")).toMatchObject({ learned: ["The Crypt on the Hill › Check the entrance for traps"] });
    expect(idx.get("trap-disarmed")!.needed).toHaveLength(2);
    let adv = blankAdventure("a");
    adv = { ...adv, scenes: { start: { ...adv.scenes.start!, choices: [...adv.scenes.start!.choices, { id: "c2", label: "Ask about the amulet", requiresFlag: "amulet", success: { next: { end: "victory" } } }] } } };
    expect(lintAdventure(adv, ids).map((i) => i.text)).toContain(`The clue "amulet" is needed but never learned, so those choices never appear`);
  });
});
