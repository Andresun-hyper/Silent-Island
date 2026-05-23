/**
 * Geometry helpers for the ink poles animation.
 * All coordinates are in normalized [0,1] space; callers multiply by canvas dimensions.
 */

export interface Vec2 {
  x: number;
  y: number;
}

/** Linear interpolation */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Clamp */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Catenary approximation via a parabola arc.
 * Returns N points from (x0,y0) to (x1,y1) with a midpoint droop of `sag` (normalized units).
 */
export function catenary(
  p0: Vec2,
  p1: Vec2,
  sag: number,
  segments = 32
): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = lerp(p0.x, p1.x, t);
    // parabolic: dip is highest at t=0.5
    const sagY = 4 * sag * t * (1 - t);
    const y = lerp(p0.y, p1.y, t) + sagY;
    pts.push({ x, y });
  }
  return pts;
}

/**
 * Winding path control points (normalized).
 * The path starts at bottom-left, curves through mid-frame, exits near bottom-right.
 */
export const PATH_CONTROLS: Vec2[] = [
  { x: 0.28, y: 0.99 },
  { x: 0.34, y: 0.82 },
  { x: 0.42, y: 0.72 },
  { x: 0.48, y: 0.66 },
  { x: 0.52, y: 0.62 },
  { x: 0.58, y: 0.59 },
  { x: 0.66, y: 0.58 },
  { x: 0.74, y: 0.60 },
];

/**
 * Three utility poles.
 * base: foot of the pole (normalized), height: pole height (normalized), lean: slight tilt
 */
export interface Pole {
  base: Vec2;
  top: Vec2;
  crossArm: { left: Vec2; right: Vec2 }; // attachment points for wires
}

function makePole(bx: number, by: number, h: number, tiltX = 0): Pole {
  const base: Vec2 = { x: bx, y: by };
  const top: Vec2 = { x: bx + tiltX, y: by - h };
  // cross-arm spans ~4% of width on each side
  const crossArm = {
    left: { x: top.x - 0.04, y: top.y + 0.01 },
    right: { x: top.x + 0.04, y: top.y + 0.01 },
  };
  return { base, top, crossArm };
}

export const POLES: Pole[] = [
  makePole(0.36, 0.80, 0.20, 0.004),
  makePole(0.50, 0.68, 0.18, -0.002),
  makePole(0.63, 0.61, 0.16, 0.003),
];

/**
 * Wire definitions: from-pole index / side to to-pole index / side.
 * sag is the normalized droop amount.
 */
export interface WireDef {
  fromPole: number;
  fromSide: "left" | "right";
  toPole: number;
  toSide: "left" | "right";
  sag: number;
  /** index into the two attachment points that hangs lowest */
  sagIndex?: number;
}

export const WIRES: WireDef[] = [
  { fromPole: 0, fromSide: "left",  toPole: 1, toSide: "left",  sag: 0.025 },
  { fromPole: 0, fromSide: "right", toPole: 1, toSide: "right", sag: 0.022 },
  { fromPole: 1, fromSide: "left",  toPole: 2, toSide: "left",  sag: 0.020 },
  { fromPole: 1, fromSide: "right", toPole: 2, toSide: "right", sag: 0.018 },
];

/** Evaluate a catenary wire and return its points in normalized space */
export function wirePoints(wire: WireDef): Vec2[] {
  const p0 = wire.fromSide === "left"
    ? POLES[wire.fromPole].crossArm.left
    : POLES[wire.fromPole].crossArm.right;
  const p1 = wire.toSide === "left"
    ? POLES[wire.toPole].crossArm.left
    : POLES[wire.toPole].crossArm.right;
  return catenary(p0, p1, wire.sag, 48);
}
