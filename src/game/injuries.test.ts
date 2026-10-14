import { produce } from "immer";
import { describe, expect, it } from "vitest";
import { PARTY, SRD_MONSTERS } from "../content/srd";
import { boardFromAscii, createGame } from "./engine";
import { aftermath, applyInjuries, recoveryHours } from "./injuries";
import { resolveParty } from "./party-store";

const brann = PARTY[0]!.build();
const ezra = PARTY[3]!.build();

describe("lasting injuries", () => {
  it("change the hero's sheet", () => {
    const hurt = applyInjuries(brann, ["broken-hand", "cracked-ribs", "twisted-knee", "deep-wound"]);
    expect(hurt).toMatchObject({ ac: brann.ac - 1, speed: brann.speed - 5, hpMax: brann.hpMax - 4 });
    expect(hurt.stats!.actions[0]).toMatchObject({ toHit: (brann.stats!.actions[0] as { toHit: number }).toHit - 1 });
    const dazed = applyInjuries(ezra, ["concussion"]);
    expect(dazed.stats!.actions.find((a) => a.name === "Burning Hands")).toMatchObject({ dc: 12 });
    expect(dazed.stats!.actions.find((a) => a.name === "Dagger")).toMatchObject({ toHit: 3 });
    expect(applyInjuries(brann, [])).toBe(brann);
  });

  it("two failed death saves leave an injury, three kill; others walk away", () => {
    const gob = SRD_MONSTERS[0]!.build();
    const unit = (id: string, c: typeof brann, side: "party" | "enemy", x: number) => ({ id, name: c.name, side, stats: c.stats!, ac: c.ac, hp: c.hpMax, speed: c.speed, pos: { x, y: 0 } });
    let s = createGame(boardFromAscii(["......"]), [unit("hero:fighter", brann, "party", 0), unit("hero:wizard", ezra, "party", 1), unit("hero:rogue", PARTY[1]!.build(), "party", 2), unit("g", gob, "enemy", 5)], 3).state;
    s = produce(s, (d) => {
      d.units.find((u) => u.id === "hero:fighter")!.death = { successes: 0, failures: 2, stable: true, worst: 2 };
      d.units.find((u) => u.id === "hero:wizard")!.dead = true;
    });
    const r = aftermath(s, (id) => (id.startsWith("hero:") ? id.slice(5) : undefined));
    expect(r.find((x) => x.key === "fighter")).toMatchObject({ name: "Brann Ironside", injury: expect.any(String) });
    expect(r.find((x) => x.key === "wizard")).toMatchObject({ fallen: true });
    expect(r.find((x) => x.key === "rogue")).toBeUndefined();
  });

  it("the downed and the badly hurt spend time in the infirmary", () => {
    const gob = SRD_MONSTERS[0]!.build();
    const unit = (id: string, c: typeof brann, side: "party" | "enemy", x: number) => ({ id, name: c.name, side, stats: c.stats!, ac: c.ac, hp: c.hpMax, speed: c.speed, pos: { x, y: 0 } });
    let s = createGame(
      boardFromAscii(["......"]),
      [unit("hero:fighter", brann, "party", 0), unit("hero:wizard", ezra, "party", 1), unit("hero:rogue", PARTY[1]!.build(), "party", 2), unit("g", gob, "enemy", 5)],
      3,
    ).state;
    s = produce(s, (d) => {
      const f = d.units.find((u) => u.id === "hero:fighter")!;
      f.wentDown = true;
      f.hp = 3;
      const w = d.units.find((u) => u.id === "hero:wizard")!;
      w.hp = Math.floor(w.hpMax / 4);
      d.units.find((u) => u.id === "hero:rogue")!.hp -= 1;
    });
    const r = aftermath(s, (id) => (id.startsWith("hero:") ? id.slice(5) : undefined));
    const by = (k: string) => r.find((x) => x.key === k)!;
    expect(by("fighter")).toMatchObject({ downed: true });
    expect(recoveryHours(by("fighter"), false)).toBe(24);
    expect(recoveryHours(by("fighter"), true)).toBe(12);
    expect(recoveryHours({ ...by("fighter"), injury: "concussion" }, false)).toBe(36);
    // Lesser wounds: less time; a scratch: none.
    const wiz = recoveryHours(by("wizard"), false);
    expect(wiz).toBeGreaterThan(0);
    expect(wiz).toBeLessThan(24);
    expect(recoveryHours(by("rogue"), false)).toBe(0);
    expect(recoveryHours({ key: "x", name: "X", fallen: true }, false)).toBe(0);
  });

  it("the fallen can't be picked for the party", () => {
    expect(resolveParty(["fighter", "wizard"], [], ["wizard"]).map((e) => e.key)).toEqual(["fighter"]);
    expect(resolveParty(["wizard"], [], ["wizard"]).map((e) => e.key)).toEqual(["fighter", "rogue", "cleric"]);
  });
});
