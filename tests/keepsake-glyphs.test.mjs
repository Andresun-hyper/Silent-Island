import { test } from "node:test";
import assert from "node:assert/strict";
import { keepsakeGlyphs, glyphPose } from "../src/lib/keepsake-glyphs.ts";

test("all keepsake silhouettes are bounded, deterministic and support short Chinese notes", () => {
  for (const form of ["bird", "flower", "light"]) {
    const glyphs = keepsakeGlyphs("山", form);
    assert.ok(glyphs.length >= 20 && glyphs.length <= 24);
    assert.deepEqual(glyphs, keepsakeGlyphs("山", form));
    for (const glyph of glyphs) {
      assert.equal(glyph.character, "山");
      assert.ok(glyph.x >= 20 && glyph.x <= 236 && glyph.y >= 20 && glyph.y <= 220);
    }
    assert.deepEqual(keepsakeGlyphs("  ", form), []);
  }
});

test("glyphs assemble fully, scatter completely and never leave the texture", () => {
  for (const form of ["bird", "flower", "light"]) {
    keepsakeGlyphs("风来时慢一点", form).forEach((glyph, i) => {
      assert.equal(glyphPose(glyph, i, 0).opacity, 0);
      assert.equal(glyphPose(glyph, i, 1, true).opacity, 0);
      const assembled = glyphPose(glyph, i, 1);
      assert.equal(assembled.x, glyph.x);
      assert.equal(assembled.y, glyph.y);
      assert.equal(assembled.opacity, 1);
      for (const leaving of [false, true]) for (let p = 0; p <= 1; p += .05) {
        const pose = glyphPose(glyph, i, p, leaving);
        assert.ok(pose.opacity >= 0 && pose.opacity <= 1);
        assert.ok(pose.x > 8 && pose.x < 248 && pose.y > 8 && pose.y < 248);
      }
    });
  }
});
