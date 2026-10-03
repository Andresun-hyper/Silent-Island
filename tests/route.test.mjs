import { test } from "node:test";
import assert from "node:assert/strict";
import { clampProgress, placeAtProgress, ROUTE_POINTS, ROUTE_STOPS } from "../src/lib/island-route.ts";

test("route navigation clamps both ends and ignores non-finite input", () => {
  assert.equal(clampProgress(-.3), 0);
  assert.equal(clampProgress(1.5), 1);
  assert.equal(clampProgress(.42), .42);
  assert.equal(clampProgress(NaN), 0);
  assert.equal(clampProgress(Infinity), 0);
});

test("every named stop resolves to its own journal location", () => {
  for (const [place, progress] of Object.entries(ROUTE_STOPS)) assert.equal(placeAtProgress(progress), place);
  assert.equal(placeAtProgress(.27), "field");
  assert.equal(placeAtProgress(.3), "pond");
  assert.equal(placeAtProgress(.76), "lamplight");
  assert.equal(placeAtProgress(.8), "grove");
});

test("the route advances continuously toward the cabin without reversing depth", () => {
  assert.ok(ROUTE_POINTS.length >= 5);
  for (let i = 1; i < ROUTE_POINTS.length; i++) {
    assert.ok(ROUTE_POINTS[i][2] < ROUTE_POINTS[i - 1][2]);
    assert.ok(ROUTE_POINTS[i].every(Number.isFinite));
  }
});
