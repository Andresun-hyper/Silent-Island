import { test } from "node:test";
import assert from "node:assert/strict";
import { terrainHeight } from "../src/lib/island-terrain.ts";

test("the full house and eaves share one level foundation", () => {
  for (const x of [-3.85, -2.1, -.35]) for (const z of [-10.15, -8.7, -7.25]) {
    assert.ok(Math.abs(terrainHeight(x, z) - .24) < 1e-9);
  }
});

test("the courtyard sits below the house while rear hills rise above it", () => {
  assert.ok(terrainHeight(-.8, -6.1) < terrainHeight(-2.1, -8.7) - .2);
  assert.ok(terrainHeight(-4.2, -14.8) > 2);
  assert.ok(terrainHeight(-5.6, -21.5) > 3);
});

test("pond bed is level and the terrain has no discontinuous steps", () => {
  assert.equal(terrainHeight(2.45, -2.15), -.13);
  assert.equal(terrainHeight(3, -2), -.13);
  for (let x = -12; x < 12; x += .5) for (let z = -26; z < 19; z += .5) {
    const h = terrainHeight(x, z);
    assert.ok(Number.isFinite(h));
    assert.ok(Math.abs(h - terrainHeight(x + .001, z)) < .005);
    assert.ok(Math.abs(h - terrainHeight(x, z + .001)) < .005);
  }
});
