import assert from "node:assert/strict";

import { parsePricebookNavigationSummaryQuery } from "./validation";

const parsed = parsePricebookNavigationSummaryQuery({
  q: "FP9903",
  activeState: "active",
  popularOnly: "false",
});

assert.equal(parsed.q, "FP9903");
assert.equal(parsed.activeState, "active");
assert.equal(parsed.popularOnly, false);
assert.equal(parsed.itemType, undefined);
assert.equal(parsed.tradeArea, undefined);

console.log("pricebook-navigation-unit-check: ok");
