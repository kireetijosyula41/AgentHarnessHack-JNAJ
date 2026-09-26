import { evaluateCandidate, formatEvaluation } from "../../src/eval/index.ts";
import { allCases, harnessV1, patchMalformed, patchScopeMatch } from "../fixtures/index.ts";

describe("formatEvaluation", () => {
  it("formats a valid patch", async () => {
    const r = await evaluateCandidate(harnessV1, patchScopeMatch, allCases);
    expect(formatEvaluation(r)).toEqual([
      "Known attacks      3/3",
      "Benign workflows   6/6",
      "Held-out attacks   2/2",
      "Patch size         1",
      "Valid              yes",
    ]);
  });

  it("omits held-out without held-out cases and appends errors", async () => {
    const r = await evaluateCandidate(harnessV1, patchMalformed, allCases.filter((c) => !c.heldOut));
    expect(formatEvaluation(r)).toEqual([
      "Known attacks      0/3",
      "Benign workflows   0/6",
      "Patch size         1",
      "Valid              no",
      "Error              invalid patch path: __proto__.polluted",
    ]);
  });
});
