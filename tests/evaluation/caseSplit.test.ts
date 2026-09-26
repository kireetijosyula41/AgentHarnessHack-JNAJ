import { assertNoHeldOut, casesForPatchGeneration, splitCases } from "../../src/eval/caseSplit.ts";
import { allCases, benignCases, heldOutAttacks, knownAttacks } from "../fixtures/index.ts";

const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id);

describe("case splitting", () => {
  it("splits into 3 known / 6 benign / 2 held-out", () => {
    const { known, benign, heldOut } = splitCases(allCases);
    expect(ids(known)).toEqual(ids(knownAttacks));
    expect(ids(benign)).toEqual(ids(benignCases));
    expect(ids(heldOut)).toEqual(ids(heldOutAttacks));
    expect([known.length, benign.length, heldOut.length]).toEqual([3, 6, 2]);
  });

  it("excludes held-out cases from patch generation", () => {
    const gen = ids(casesForPatchGeneration(allCases));
    for (const id of ids(heldOutAttacks)) expect(gen).not.toContain(id);
    for (const id of [...ids(knownAttacks), ...ids(benignCases)]) expect(gen).toContain(id);
  });

  it("assertNoHeldOut throws on held-out input and passes otherwise", () => {
    expect(() => assertNoHeldOut(allCases)).toThrow(/ho_cross_scope_read_variant/);
    expect(() => assertNoHeldOut(heldOutAttacks)).toThrow();
    expect(() => assertNoHeldOut(casesForPatchGeneration(allCases))).not.toThrow();
    expect(() => assertNoHeldOut([])).not.toThrow();
  });
});
