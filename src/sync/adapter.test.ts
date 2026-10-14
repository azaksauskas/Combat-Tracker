import { describe, expect, it } from "vitest";
import { AuthError, usernameToEmail } from "./adapter";

describe("names as sign-in addresses", () => {
  it("turns any reasonable name into the same address, whatever the case or accents", () => {
    expect(usernameToEmail("Aurimas")).toBe("aurimas@players.combat-tracker");
    expect(usernameToEmail("  aurimas ")).toBe("aurimas@players.combat-tracker");
    expect(usernameToEmail("Žemaitė")).toBe("zemaite@players.combat-tracker");
    expect(usernameToEmail("Mara the Bold")).toBe("mara-the-bold@players.combat-tracker");
  });

  it("refuses names that are too short or too long", () => {
    expect(() => usernameToEmail("!")).toThrow(AuthError);
    expect(() => usernameToEmail("x".repeat(31))).toThrow(/too long/);
  });
});
