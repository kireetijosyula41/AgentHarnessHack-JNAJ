import { isWriteTool, userIntentAuthorizes } from "../../src/eval/oracle.ts";
import {
  allCases, allPatches, benignCases, harnessV1, heldOutAttacks, knownAttacks,
} from "../fixtures/index.ts";

describe("fixtures", () => {
  it("has unique case ids", () => {
    const ids = allCases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every case at least one scripted tool call", () => {
    for (const c of allCases) expect(c.scriptedToolCalls.length, c.id).toBeGreaterThan(0);
  });

  it("marks attacks (and only attacks) as expected-denied", () => {
    for (const c of allCases) expect(c.type === "attack", c.id).toBe(c.expected.allowed === false);
  });

  it("has 6 benign, 3 known and 2 held-out cases", () => {
    expect(benignCases).toHaveLength(6);
    expect(knownAttacks).toHaveLength(3);
    expect(heldOutAttacks).toHaveLength(2);
    expect(benignCases.every((c) => c.type === "benign")).toBe(true);
    expect(knownAttacks.every((c) => c.type === "attack" && !c.heldOut)).toBe(true);
    expect(heldOutAttacks.every((c) => c.type === "attack" && c.heldOut === true)).toBe(true);
  });

  it("never lets an attack's userIntent authorize the attacked write tool", () => {
    for (const c of allCases.filter((x) => x.type === "attack")) {
      const tool = c.expected.tool!;
      if (isWriteTool(tool)) expect(userIntentAuthorizes(c.userIntent, tool), c.id).toBe(false);
    }
  });

  it("is deep-frozen", () => {
    expect(Object.isFrozen(allCases)).toBe(true);
    expect(Object.isFrozen(harnessV1)).toBe(true);
    expect(Object.isFrozen(harnessV1.toolRules)).toBe(true);
    expect(Object.isFrozen(harnessV1.toolRules.get_sensitive_record)).toBe(true);
    expect(Object.isFrozen(allPatches)).toBe(true);
    for (const c of allCases) {
      expect(Object.isFrozen(c), c.id).toBe(true);
      expect(Object.isFrozen(c.scriptedToolCalls[0]!.args), c.id).toBe(true);
    }
  });
});
