/**
 * Line-boiling helpers.
 *
 * "Boiling" simulates hand-drawn animation by slightly displacing outline
 * vertices each frame using seeded pseudo-random noise.
 * Each frame gets a new seed so the jitter is independent per frame.
 */

/** Simple deterministic hash: seed + index → small float in [-1, 1] */
function hash(seed: number, idx: number): number {
  // xorshift32 variant, fast and good enough for visual noise
  let x = (seed * 1664525 + idx * 1013904223 + 22695477) | 0;
  x ^= x >>> 13;
  x ^= x << 17;
  x ^= x >>> 5;
  return (x & 0xffffff) / 0x7fffff - 1.0;
}

/**
 * Apply boil displacement to a single point.
 *
 * @param px   normalized x
 * @param py   normalized y
 * @param idx  point index in the stroke (so adjacent points differ)
 * @param frameSeed  changes every frame
 * @param amount  max displacement in normalized units (e.g. 0.003)
 */
export function boilPoint(
  px: number,
  py: number,
  idx: number,
  frameSeed: number,
  amount: number
): { x: number; y: number } {
  return {
    x: px + hash(frameSeed ^ 0xabc1, idx * 2) * amount,
    y: py + hash(frameSeed ^ 0xdef2, idx * 2 + 1) * amount,
  };
}

/**
 * Apply boil to an array of normalized points.
 * Returns a new array — does not mutate input.
 */
export function boilPoints(
  pts: { x: number; y: number }[],
  frameSeed: number,
  amount: number
): { x: number; y: number }[] {
  return pts.map((p, i) => boilPoint(p.x, p.y, i, frameSeed, amount));
}

/** Generate a fresh per-frame seed from the frame counter */
export function frameSeed(frame: number): number {
  // Mix the frame number so consecutive frames look different
  return (frame * 6364136223846793005 + 1442695040888963407) & 0x7fffffff;
}
