export type GlyphForm = "bird" | "flower" | "light";
export interface KeepsakeGlyph {
  character: string;
  x: number;
  y: number;
  rotation: number;
  size: number;
}

const bird: [number, number][] = [
  [26, 54], [42, 61], [58, 72], [74, 85], [90, 98], [107, 110],
  [230, 54], [214, 61], [198, 72], [182, 85], [166, 98], [149, 110],
  [118, 112], [132, 120], [140, 105], [145, 89], [158, 87],
  [124, 138], [116, 154], [104, 170], [139, 155], [150, 170],
];

export function keepsakeGlyphs(text: string, form: GlyphForm): KeepsakeGlyph[] {
  const characters = Array.from(text.replace(/\s/g, ""));
  if (!characters.length) return [];
  let points: [number, number][];
  if (form === "bird") points = bird;
  else if (form === "flower") {
    points = Array.from({ length: 15 }, (_, i) => {
      const angle = i / 15 * Math.PI * 2;
      const radius = 39 + Math.cos(angle * 5) * 10;
      return [128 + Math.cos(angle) * radius, 86 + Math.sin(angle) * radius];
    });
    points.push([128, 86], [127, 139], [125, 157], [125, 175], [126, 193], [109, 158], [96, 148], [143, 177], [158, 163]);
  } else {
    points = [[128, 36], [112, 56], [132, 56], [150, 61], [91, 77], [85, 98], [87, 120], [95, 142], [114, 153], [134, 153], [154, 143], [164, 122], [169, 100], [164, 78], [113, 85], [137, 91], [115, 113], [141, 117], [125, 172], [118, 191], [134, 193]];
  }
  // Short notes repeat only in the decorative silhouette; the journal remains unchanged.
  return points.map(([x, y], i) => ({ character: characters[i % characters.length], x, y, rotation: Math.sin(i * 2.3) * .16, size: form === "bird" ? 26 : 25 }));
}

export function glyphPose(glyph: KeepsakeGlyph, index: number, progress: number, leaving = false) {
  const stagger = (index % 7) * .025;
  const t = Math.min(1, Math.max(0, (progress - stagger) / (1 - stagger)));
  const ease = t * t * (3 - 2 * t);
  const scatter = leaving ? ease : 1 - ease;
  return {
    x: glyph.x + Math.sin(index * 1.9 + .7) * 23 * scatter,
    y: glyph.y - (18 + index % 5 * 5) * scatter,
    rotation: glyph.rotation + Math.sin(index) * .7 * scatter,
    opacity: leaving ? 1 - ease : ease,
  };
}
