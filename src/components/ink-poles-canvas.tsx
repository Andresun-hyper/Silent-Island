"use client";

/**
 * InkPolesCanvas — full animation renderer (v2).
 *
 * Preserved from v1:
 *   - Winding dirt path with earth-tone watercolor fill
 *   - Three wooden utility poles with cross-arms + insulators
 *   - Catenary hanging wires with per-wire sway
 *   - Line-boiling jitter on every stroke (frameSeed system)
 *   - Film grain post-processing
 *   - Strictly static camera
 *
 * New in v2:
 *   - Loose watercolor grass patches at pole bases and path edges
 *   - Grass edge-bloom boiling (gentle outline shimmer)
 *   - Slow Perlin-noise ripple on grass fill texture
 *   - Richer multi-pass ink wash with improved pigment feel
 */

import { useEffect, useRef, useCallback, useMemo } from "react";
import { POLES, WIRES, wirePoints, PATH_CONTROLS, lerp, clamp } from "@/lib/animation/geometry";
import type { Vec2 } from "@/lib/animation/geometry";
import { boilPoints, frameSeed } from "@/lib/animation/boil";
import { swayOffset } from "@/lib/animation/sway";
import { drawGrain } from "@/lib/animation/postfx";
import { buildGrassPatches, drawGrassPatches } from "@/lib/animation/grass";

// ─── Palette ────────────────────────────────────────────────────────────────
const BG_COLOR     = "#d9d5cf";
const INK_DARK     = "rgba(22, 16, 12, 0.88)";
const INK_MED      = "rgba(32, 24, 18, 0.55)";
const INK_LIGHT    = "rgba(50, 40, 30, 0.28)";
const EARTH_BASE   = "rgba(130, 105, 72, 0.18)";
const EARTH_MID    = "rgba(100, 80, 55, 0.30)";
const EARTH_DARK   = "rgba(78, 60, 40, 0.38)";
const POLE_FILL    = "rgba(105, 85, 60, 0.25)";
const SHADOW_LIGHT = "rgba(20, 14, 10, 0.12)";

interface WireDragState {
  active: boolean;
  wireIndex: number;
  pointer: Vec2;
  tension: number;
}

export type HealingMotif = "bird" | "moon" | "island";
export type HealingPhase = "entering" | "idle" | "revealing" | "leaving";

export interface InkPolesCanvasProps {
  motif?: HealingMotif;
  phase?: HealingPhase;
  sceneKey?: number;
  onWireRelease?: (tension: number) => void;
  onWireTensionChange?: (tension: number) => void;
}

interface HealingSceneState {
  motif: HealingMotif;
  phase: HealingPhase;
  phaseAge: number;
  sceneKey: number;
  tension: number;
}

interface TextGlyph {
  text: string;
  x: number;
  y: number;
  size: number;
  rot: number;
  scatterX: number;
  scatterY: number;
  phase: number;
}

interface SceneViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Core stroke helper ──────────────────────────────────────────────────────

function inkStroke(
  ctx: CanvasRenderingContext2D,
  pts: Vec2[],
  w: number, h: number,
  lineWidth: number,
  color: string,
  passes = 2
): void {
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = lineWidth;
  ctx.lineCap     = "round";
  ctx.lineJoin    = "round";
  for (let pass = 0; pass < passes; pass++) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x * w, pts[0].y * h);
    for (let i = 1; i < pts.length; i++) {
      // Smooth catmull-rom style — slightly smoother than raw lineTo
      if (i < pts.length - 1) {
        const mx = (pts[i].x + pts[i + 1].x) / 2;
        const my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x * w, pts[i].y * h, mx * w, my * h);
      } else {
        ctx.lineTo(pts[i].x * w, pts[i].y * h);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Watercolor wash fill — multiple jittered translucent passes */
function washFill(
  ctx: CanvasRenderingContext2D,
  pts: Vec2[],
  w: number, h: number,
  color: string,
  seed: number,
  jitterAmt = 0.004,
  passes = 4
): void {
  if (pts.length < 3) return;
  ctx.save();
  ctx.fillStyle = color;
  for (let p = 0; p < passes; p++) {
    const jittered = boilPoints(pts, seed ^ (p * 0xf1a3), jitterAmt * (0.5 + p * 0.3));
    ctx.beginPath();
    ctx.moveTo(jittered[0].x * w, jittered[0].y * h);
    for (let i = 1; i < jittered.length; i++) {
      ctx.lineTo(jittered[i].x * w, jittered[i].y * h);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ─── Path ────────────────────────────────────────────────────────────────────

function drawPath(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  seed: number
): void {
  const ctrl = PATH_CONTROLS;

  // Build left + right edges with a natural widening toward the viewer
  const leftEdge: Vec2[]  = ctrl.map((p, i) => ({
    x: p.x - 0.034 - i * 0.0018,
    y: p.y + 0.002,
  }));
  const rightEdge: Vec2[] = ctrl.map((p, i) => ({
    x: p.x + 0.034 + i * 0.0016,
    y: p.y - 0.002,
  }));

  const poly: Vec2[] = [...leftEdge, ...[...rightEdge].reverse()];

  // Three wash layers — light to dark
  washFill(ctx, poly, w, h, EARTH_BASE, seed,            0.003, 3);
  washFill(ctx, poly, w, h, EARTH_MID,  seed ^ 0xaabb,  0.004, 3);
  washFill(ctx, poly, w, h, EARTH_DARK, seed ^ 0x1234,  0.005, 2);

  // Shadow pool down the center spine
  const spine: Vec2[] = ctrl.map(p => ({ x: p.x, y: p.y }));
  const spineW = w * 0.012;
  ctx.save();
  ctx.strokeStyle = SHADOW_LIGHT;
  ctx.lineWidth   = spineW;
  ctx.lineCap     = "round";
  ctx.lineJoin    = "round";
  ctx.beginPath();
  const bs = boilPoints(spine, seed ^ 0x9abc, 0.003);
  ctx.moveTo(bs[0].x * w, bs[0].y * h);
  for (let i = 1; i < bs.length; i++) ctx.lineTo(bs[i].x * w, bs[i].y * h);
  ctx.stroke();
  ctx.restore();

  // Path edge ink lines
  inkStroke(ctx, boilPoints(leftEdge,  seed ^ 0x1111, 0.003), w, h, 1.4, INK_MED,  2);
  inkStroke(ctx, boilPoints(rightEdge, seed ^ 0x2222, 0.003), w, h, 1.4, INK_MED,  2);

  // Fine edge texture — broken secondary strokes for a worn earth feel
  inkStroke(ctx, boilPoints(leftEdge.slice(1),  seed ^ 0x3333, 0.005), w, h, 0.6, INK_LIGHT, 1);
  inkStroke(ctx, boilPoints(rightEdge.slice(1), seed ^ 0x4444, 0.005), w, h, 0.6, INK_LIGHT, 1);

  // Scattered rut marks
  for (let i = 1; i < ctrl.length - 1; i += 2) {
    const cx = ctrl[i].x;
    const cy = ctrl[i].y;
    const dash: Vec2[] = [
      { x: cx - 0.014, y: cy + 0.003 },
      { x: cx + 0.014, y: cy - 0.003 },
    ];
    inkStroke(ctx, boilPoints(dash, seed ^ (i * 0x567), 0.004), w, h, 0.7, INK_LIGHT, 1);
  }
}

function drawPathReserve(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): void {
  const spine = PATH_CONTROLS;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const passes = [
    { width: 0.170, alpha: 0.58, blur: 20 },
    { width: 0.125, alpha: 0.78, blur: 12 },
    { width: 0.090, alpha: 0.92, blur: 4 },
  ];

  for (const pass of passes) {
    ctx.filter = `blur(${pass.blur}px)`;
    ctx.strokeStyle = `rgba(217,213,207,${pass.alpha})`;
    ctx.lineWidth = w * pass.width;
    ctx.beginPath();
    ctx.moveTo(spine[0].x * w, spine[0].y * h);

    for (let i = 1; i < spine.length; i++) {
      if (i < spine.length - 1) {
        const mx = (spine[i].x + spine[i + 1].x) / 2;
        const my = (spine[i].y + spine[i + 1].y) / 2;
        ctx.quadraticCurveTo(spine[i].x * w, spine[i].y * h, mx * w, my * h);
      } else {
        ctx.lineTo(spine[i].x * w, spine[i].y * h);
      }
    }

    ctx.stroke();
  }

  ctx.restore();
}

// ─── Poles ───────────────────────────────────────────────────────────────────

function drawPole(
  ctx: CanvasRenderingContext2D,
  poleIdx: number,
  w: number, h: number,
  seed: number
): void {
  const pole = POLES[poleIdx];
  const taper = 0.005; // pole narrows toward top

  // Build the shaft polygon (left + right sides tapering)
  const steps = 8;
  const left: Vec2[]  = [];
  const right: Vec2[] = [];
  for (let s = 0; s <= steps; s++) {
    const t  = s / steps;
    const bx = lerp(pole.base.x, pole.top.x, t);
    const by = lerp(pole.base.y, pole.top.y, t);
    const hw = lerp(0.009, 0.009 - taper, t);
    left.push({ x: bx - hw, y: by });
    right.push({ x: bx + hw, y: by });
  }

  const shaftPoly: Vec2[] = [...left, ...[...right].reverse()];

  // Weathered wood fill — two washes
  washFill(ctx, shaftPoly, w, h, POLE_FILL,             seed ^ (poleIdx * 0xabcd), 0.002, 3);
  washFill(ctx, shaftPoly, w, h, "rgba(70,50,32,0.18)", seed ^ (poleIdx * 0x1357), 0.003, 2);

  // Grain lines (vertical streaks of darker ink)
  for (let g = 0; g < 3; g++) {
    const gx = lerp(pole.base.x - 0.006, pole.base.x + 0.006, g / 2);
    const grain: Vec2[] = [
      { x: gx, y: pole.base.y },
      { x: gx + (g - 1) * 0.001, y: pole.top.y + 0.04 },
    ];
    inkStroke(ctx, boilPoints(grain, seed ^ (g * 0xef01 + poleIdx), 0.0018), w, h, 0.5, INK_LIGHT, 1);
  }

  // Silhouette strokes — main two edges
  inkStroke(ctx, boilPoints(left,  seed ^ 0xaaaa, 0.002), w, h, 1.8, INK_DARK, 2);
  inkStroke(ctx, boilPoints(right, seed ^ 0xbbbb, 0.002), w, h, 1.8, INK_DARK, 2);

  // Cross-arm
  const { left: crossL, right: crossR } = pole.crossArm;
  const armSpan = 0.010;
  const arm: Vec2[] = [
    { x: crossL.x - armSpan, y: crossL.y + 0.006 },
    { x: crossL.x,           y: crossL.y },
    { x: crossR.x,           y: crossR.y },
    { x: crossR.x + armSpan, y: crossR.y + 0.006 },
  ];
  // Arm fill
  const armBot: Vec2[] = arm.map(p => ({ x: p.x, y: p.y + 0.009 }));
  const armPoly: Vec2[] = [...arm, ...[...armBot].reverse()];
  washFill(ctx, armPoly, w, h, POLE_FILL, seed ^ 0x2468, 0.002, 2);

  inkStroke(ctx, boilPoints(arm,    seed ^ 0xcccc, 0.0016), w, h, 2.4, INK_DARK, 2);
  inkStroke(ctx, boilPoints(armBot, seed ^ 0xdddd, 0.0012), w, h, 1.0, INK_MED,  1);

  // Insulators
  for (const pt of [crossL, crossR]) {
    const nub: Vec2[] = [
      { x: pt.x - 0.006, y: pt.y - 0.005 },
      { x: pt.x + 0.006, y: pt.y - 0.005 },
      { x: pt.x + 0.006, y: pt.y + 0.005 },
      { x: pt.x - 0.006, y: pt.y + 0.005 },
    ];
    washFill(ctx, boilPoints(nub, seed ^ 0xe0e0, 0.002), w, h, EARTH_DARK, seed ^ 0x7890, 0.002, 2);
    inkStroke(ctx, boilPoints(nub, seed ^ 0xf1f1, 0.001), w, h, 0.9, INK_DARK, 1);
  }
}

// ─── Wires ───────────────────────────────────────────────────────────────────

function drawWire(
  ctx: CanvasRenderingContext2D,
  wireIdx: number,
  t: number,
  w: number, h: number,
  seed: number,
  drag: WireDragState
): void {
  const wire = WIRES[wireIdx];
  const isPulled = drag.wireIndex === wireIdx && drag.tension > 0.01;
  const tension = isPulled ? drag.tension : 0;
  const tremble = 1 - tension * 0.88;
  const dynamicSag = wire.sag + swayOffset(wireIdx, t) * tremble;
  const basePts = wirePoints({ ...wire, sag: dynamicSag });
  const pts = isPulled
    ? pulledWirePoints(basePts[0], basePts[basePts.length - 1], drag.pointer, 48)
    : basePts;

  // Main line
  inkStroke(ctx, boilPoints(pts, seed ^ (wireIdx * 0x5678), lerp(0.0016, 0.00022, tension)), w, h, 1.2, INK_DARK, 1);
  // Feathered shadow pass
  inkStroke(ctx, boilPoints(pts, seed ^ (wireIdx * 0x8765 + 1), lerp(0.0011, 0.00016, tension)), w, h, 0.5, INK_MED, 1);
}

function pulledWirePoints(p0: Vec2, p1: Vec2, pulledMid: Vec2, segments: number): Vec2[] {
  const control = {
    x: pulledMid.x * 2 - (p0.x + p1.x) * 0.5,
    y: pulledMid.y * 2 - (p0.y + p1.y) * 0.5,
  };
  const pts: Vec2[] = [];

  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const inv = 1 - u;
    pts.push({
      x: inv * inv * p0.x + 2 * inv * u * control.x + u * u * p1.x,
      y: inv * inv * p0.y + 2 * inv * u * control.y + u * u * p1.y,
    });
  }

  return pts;
}

const HAND_FONT = "\"Segoe Print\", \"Bradley Hand ITC\", \"KaiTi\", \"STKaiti\", cursive";
const HAND_INK = { r: 31, g: 23, b: 17 };

const BIRD_GLYPHS: TextGlyph[] = [
  { text: "孤", x: -25, y:  0, size: 18, rot: -0.18, scatterX:  68, scatterY: -54, phase: 0.1 },
  { text: "风", x: -8,  y: -7, size: 22, rot:  0.08, scatterX:  48, scatterY: -73, phase: 0.9 },
  { text: "息", x:  9,  y: -3, size: 18, rot: -0.08, scatterX:  75, scatterY: -20, phase: 1.8 },
  { text: "慢", x:  24, y:  2, size: 14, rot:  0.16, scatterX:  98, scatterY: -46, phase: 2.5 },
  { text: "v",  x: -13, y: -23, size: 20, rot: -0.58, scatterX:  26, scatterY: -92, phase: 3.2 },
  { text: "r",  x:  6,  y: -24, size: 18, rot:  0.40, scatterX:  88, scatterY: -88, phase: 4.0 },
  { text: "予", x: -36, y:  6, size: 13, rot: -0.43, scatterX:  20, scatterY:  38, phase: 4.7 },
  { text: "归", x: -46, y: 12, size: 12, rot: -0.72, scatterX: -16, scatterY:  42, phase: 5.5 },
  { text: "·",  x:  40, y: -5, size: 16, rot:  0.00, scatterX: 118, scatterY: -12, phase: 6.1 },
];

const MOON_GLYPHS: TextGlyph[] = [
  { text: "月", x: -16, y: -28, size: 19, rot: -0.30, scatterX: -92, scatterY: -22, phase: 1.2 },
  { text: "清", x: -2,  y: -11, size: 15, rot:  0.14, scatterX: -64, scatterY: -50, phase: 2.0 },
  { text: "白", x:  8,  y:  8, size: 15, rot:  0.38, scatterX: -84, scatterY:  16, phase: 2.8 },
  { text: "m",  x: -5,  y:  27, size: 16, rot:  0.64, scatterX: -44, scatterY:  60, phase: 3.7 },
  { text: "息", x:  20, y: -4, size: 12, rot: -0.18, scatterX: -16, scatterY: -76, phase: 4.5 },
];

const ISLAND_GLYPHS: TextGlyph[] = [
  { text: "岛", x: -30, y: -7, size: 18, rot: -0.10, scatterX: 52, scatterY: -20, phase: 0.4 },
  { text: "草", x: -9,  y: -5, size: 15, rot:  0.12, scatterX: 76, scatterY:  16, phase: 1.1 },
  { text: "石", x:  11, y:  0, size: 14, rot: -0.18, scatterX: 43, scatterY:  34, phase: 1.9 },
  { text: "一", x:  29, y:  3, size: 21, rot:  0.06, scatterX: 92, scatterY:  -3, phase: 2.8 },
  { text: "风", x: -42, y:  8, size: 12, rot: -0.36, scatterX: 20, scatterY:  40, phase: 3.5 },
  { text: "o",  x:  2,  y: 13, size: 11, rot:  0.22, scatterX: 66, scatterY:  56, phase: 4.2 },
];

function sceneBaseAlpha(scene: HealingSceneState): number {
  if (scene.phase === "entering") return easeOutCubic(clamp(scene.phaseAge / 2100, 0, 1));
  if (scene.phase === "leaving") return 1 - easeInOutCubic(clamp(scene.phaseAge / 1700, 0, 1));
  return 1;
}

function motifMotion(scene: HealingSceneState): { assemble: number; alpha: number; drift: number } {
  if (scene.phase === "leaving") {
    const disperse = 1 - easeInOutCubic(clamp(scene.phaseAge / 1550, 0, 1));
    return { assemble: disperse, alpha: clamp(disperse * 1.15, 0, 0.96), drift: 1 - disperse };
  }

  if (scene.phase === "entering") {
    const raw = clamp((scene.phaseAge - 780) / 2600, 0, 1);
    const assemble = easeInOutCubic(raw);
    return { assemble, alpha: clamp(raw * 1.1, 0, 0.82), drift: 1 - assemble };
  }

  if (scene.phase === "revealing") {
    const raw = clamp(scene.phaseAge / 2400, 0, 1);
    const assemble = easeInOutCubic(raw);
    return { assemble, alpha: clamp(raw * 1.24, 0, 0.95), drift: 1 - assemble };
  }

  return { assemble: 1, alpha: 0.82, drift: 0 };
}

function drawHandwrittenScenery(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  seed: number,
  scene: HealingSceneState
): void {
  const alpha = sceneBaseAlpha(scene);
  if (alpha <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = alpha;

  if (scene.motif === "bird") {
    drawHandwrittenBird(ctx, w, h, t, seed, scene);
  } else if (scene.motif === "moon") {
    drawHandwrittenMoon(ctx, w, h, t, seed, scene);
  } else {
    drawHandwrittenIsland(ctx, w, h, t, seed, scene);
  }

  ctx.restore();
}

function drawHandwrittenBird(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  seed: number,
  scene: HealingSceneState
): void {
  const motion = motifMotion(scene);
  if (motion.alpha <= 0.01) return;

  const base = {
    x: w * (0.705 + Math.sin(t * 0.00010) * 0.004),
    y: h * (0.430 + Math.sin(t * 0.00012 + 1.3) * 0.003),
  };
  const scale = motifScale(w, h) * 1.28;
  const quiet = 1 - scene.tension * 0.35;

  drawGlyphSet(ctx, BIRD_GLYPHS, base, scale, t, seed, motion, quiet);

  ctx.save();
  ctx.globalAlpha = motion.alpha * 0.82;
  ctx.strokeStyle = inkRgba(0.52);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(0.55, 0.9 * scale);

  drawLocalStroke(ctx, base, scale, [
    { x: -35, y:  6 }, { x: -17, y: -7 }, { x:  8, y: -8 }, { x:  38, y: -1 },
  ], seed ^ 0x84c1, 0.78 + motion.drift * 0.6);
  drawLocalStroke(ctx, base, scale, [
    { x: -10, y: -8 }, { x: -1, y: -31 }, { x:  20, y: -16 },
  ], seed ^ 0x24e3, 0.75 + motion.drift * 0.5);
  drawLocalStroke(ctx, base, scale, [
    { x: -33, y:  9 }, { x: -54, y:  19 }, { x: -44, y:  4 },
  ], seed ^ 0x726a, 0.85);
  drawLocalStroke(ctx, base, scale, [
    { x:  2, y:  13 }, { x:  2, y:  20 }, { x: -4, y:  22 },
  ], seed ^ 0x335d, 0.55);
  drawLocalStroke(ctx, base, scale, [
    { x:  11, y:  12 }, { x:  11, y:  20 }, { x:  18, y:  22 },
  ], seed ^ 0x7bd5, 0.55);

  ctx.restore();
}

function drawHandwrittenMoon(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  seed: number,
  scene: HealingSceneState
): void {
  const motion = motifMotion(scene);
  if (motion.alpha <= 0.01) return;

  const base = {
    x: w * (0.205 + Math.sin(t * 0.00007 + 0.9) * 0.003),
    y: h * (0.250 + Math.sin(t * 0.00009) * 0.004),
  };
  const scale = motifScale(w, h) * 1.08;

  drawGlyphSet(ctx, MOON_GLYPHS, base, scale, t, seed, motion, 0.76);

  ctx.save();
  ctx.globalAlpha = motion.alpha * 0.48;
  ctx.strokeStyle = inkRgba(0.30);
  ctx.lineWidth = Math.max(0.7, 1.1 * scale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  drawLocalStroke(ctx, base, scale, [
    { x: -20, y: -34 }, { x: -37, y: -5 }, { x: -23, y: 31 }, { x: 9, y: 38 },
  ], seed ^ 0xa415, 1.0);
  drawLocalStroke(ctx, base, scale, [
    { x: 15, y: -30 }, { x: -2, y: -8 }, { x: 8, y: 20 }, { x: 31, y: 30 },
  ], seed ^ 0x51ef, 0.75);
  ctx.restore();
}

function drawHandwrittenIsland(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  seed: number,
  scene: HealingSceneState
): void {
  const motion = motifMotion(scene);
  if (motion.alpha <= 0.01) return;

  const base = {
    x: w * (0.775 + Math.sin(t * 0.00008 + 2.2) * 0.004),
    y: h * (0.570 + Math.sin(t * 0.00010) * 0.003),
  };
  const scale = motifScale(w, h) * 0.96;

  drawGlyphSet(ctx, ISLAND_GLYPHS, base, scale, t, seed, motion, 0.82);

  ctx.save();
  ctx.globalAlpha = motion.alpha * 0.58;
  ctx.strokeStyle = inkRgba(0.38);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(0.6, 1.0 * scale);
  drawLocalStroke(ctx, base, scale, [
    { x: -58, y: 18 }, { x: -22, y: 10 }, { x: 9, y: 14 }, { x: 55, y: 8 },
  ], seed ^ 0xc651, 0.95);
  drawLocalStroke(ctx, base, scale, [
    { x: -23, y: 4 }, { x: -15, y: -17 }, { x: -7, y: 3 },
  ], seed ^ 0x4512, 0.7);
  drawLocalStroke(ctx, base, scale, [
    { x: 11, y: 8 }, { x: 22, y: -12 }, { x: 29, y: 5 },
  ], seed ^ 0x85aa, 0.7);
  ctx.restore();
}

function drawGlyphSet(
  ctx: CanvasRenderingContext2D,
  glyphs: TextGlyph[],
  base: { x: number; y: number },
  scale: number,
  t: number,
  seed: number,
  motion: { assemble: number; alpha: number; drift: number },
  quiet: number
): void {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    const wobble = Math.sin(t * 0.00042 + g.phase) * 1.2 * quiet;
    const slowLift = Math.sin(t * 0.00013 + g.phase * 1.4) * 0.9;
    const boiledX = Math.sin((seed % 1543) * 0.006 + g.phase * 1.9) * 0.65;
    const boiledY = Math.cos((seed % 1187) * 0.007 + g.phase * 1.3) * 0.55;
    const scatterNoise = 1 + Math.sin(g.phase + seed * 0.00001) * 0.06;
    const x = base.x + lerp(g.scatterX * scatterNoise, g.x, motion.assemble) * scale + wobble + boiledX;
    const y = base.y + lerp(g.scatterY * scatterNoise, g.y, motion.assemble) * scale + slowLift + boiledY;
    const rotate = g.rot * motion.assemble + Math.sin(t * 0.00024 + g.phase) * 0.035;
    const alpha = motion.alpha * (0.56 + (i % 3) * 0.06);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotate);
    ctx.font = `${Math.max(9, g.size * scale).toFixed(2)}px ${HAND_FONT}`;
    ctx.fillStyle = inkRgba(alpha);
    ctx.fillText(g.text, 0, 0);
    ctx.globalAlpha = 0.32;
    ctx.fillText(g.text, 0.55 * scale, -0.35 * scale);
    ctx.restore();
  }

  ctx.restore();
}

function drawLocalStroke(
  ctx: CanvasRenderingContext2D,
  base: { x: number; y: number },
  scale: number,
  pts: Vec2[],
  seed: number,
  jitter: number
): void {
  const boiled = pts.map((p, i) => ({
    x: base.x + (p.x + Math.sin(seed * 0.011 + i * 1.8) * jitter) * scale,
    y: base.y + (p.y + Math.cos(seed * 0.013 + i * 1.4) * jitter) * scale,
  }));

  if (boiled.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(boiled[0].x, boiled[0].y);

  for (let i = 1; i < boiled.length; i++) {
    if (i < boiled.length - 1) {
      const mx = (boiled[i].x + boiled[i + 1].x) / 2;
      const my = (boiled[i].y + boiled[i + 1].y) / 2;
      ctx.quadraticCurveTo(boiled[i].x, boiled[i].y, mx, my);
    } else {
      ctx.lineTo(boiled[i].x, boiled[i].y);
    }
  }

  ctx.stroke();
}

function motifScale(w: number, h: number): number {
  return clamp(Math.min(w, h) / 720, 0.68, 1.18);
}

function inkRgba(alpha: number): string {
  return `rgba(${HAND_INK.r},${HAND_INK.g},${HAND_INK.b},${clamp(alpha, 0, 1).toFixed(3)})`;
}

function easeOutCubic(t: number): number {
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}

function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function computeSceneViewport(w: number, h: number): SceneViewport {
  const aspect = w / Math.max(1, h);

  if (aspect < 0.78) {
    const portraitAspect = aspect < 0.55 ? 0.72 : 0.84;
    const width = h * portraitAspect;
    return {
      x: (w - width) * 0.52,
      y: 0,
      width,
      height: h,
    };
  }

  const landscapeAspect = aspect > 2.05 ? 1.92 : 1.66;

  if (aspect > landscapeAspect) {
    const width = h * landscapeAspect;
    return {
      x: (w - width) * 0.5,
      y: 0,
      width,
      height: h,
    };
  }

  const height = w / landscapeAspect;
  return {
    x: 0,
    y: (h - height) * 0.48,
    width: w,
    height,
  };
}

// ─── Main draw ───────────────────────────────────────────────────────────────

function draw(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  frame: number,
  t: number,
  patches: ReturnType<typeof buildGrassPatches>,
  drag: WireDragState,
  scene: HealingSceneState
): void {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, w, h);

  const seed = frameSeed(frame);
  const baseAlpha = sceneBaseAlpha(scene);
  const viewport = computeSceneViewport(w, h);

  ctx.save();
  ctx.translate(viewport.x, viewport.y);
  ctx.globalAlpha = baseAlpha;

  // 1. Grass banks under the path
  drawGrassPatches(ctx, patches, viewport.width, viewport.height, t, seed);

  // 2. Reserve blank paper around the path before repainting the path.
  drawPathReserve(ctx, viewport.width, viewport.height);

  // 3. Path base
  drawPath(ctx, viewport.width, viewport.height, seed);

  // 4. Poles back-to-front
  for (let i = POLES.length - 1; i >= 0; i--) {
    drawPole(ctx, i, viewport.width, viewport.height, seed);
  }

  // 5. Wires
  for (let i = 0; i < WIRES.length; i++) {
    drawWire(ctx, i, t, viewport.width, viewport.height, seed, drag);
  }

  ctx.restore();

  // 6. Handwritten scenery, assembled from glyph-like ink marks.
  ctx.save();
  ctx.translate(viewport.x, viewport.y);
  drawHandwrittenScenery(ctx, viewport.width, viewport.height, t, seed, scene);
  ctx.restore();

  // 7. Post-processing
  drawGrain(ctx, w, h, 0.11 * Math.max(0.35, baseAlpha), 0.16);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function InkPolesCanvas({
  motif = "bird",
  phase = "entering",
  sceneKey = 0,
  onWireRelease,
  onWireTensionChange,
}: InkPolesCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number | null>(null);
  const frameRef  = useRef(0);
  const startRef  = useRef<number | null>(null);
  const timeRef   = useRef(0);
  const phaseRef  = useRef({
    motif,
    phase,
    sceneKey,
    startedAt: 0,
  });
  const dragRef   = useRef<WireDragState>({
    active: false,
    wireIndex: -1,
    pointer: { x: 0, y: 0 },
    tension: 0,
  });

  // Build patches once — stable geometry, animation is time-driven
  const patches = useMemo(() => buildGrassPatches(), []);

  useEffect(() => {
    phaseRef.current = {
      motif,
      phase,
      sceneKey,
      startedAt: timeRef.current,
    };
  }, [motif, phase, sceneKey]);

  const animate = useCallback(function animateFrame(ts: number) {
    if (startRef.current === null) startRef.current = ts;
    const t = ts - startRef.current;
    timeRef.current = t;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr  = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;

    if (
      canvas.width  !== Math.round(cssW * dpr) ||
      canvas.height !== Math.round(cssH * dpr)
    ) {
      canvas.width  = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    relaxReleasedWire(dragRef.current);
    const phaseMarker = phaseRef.current;
    draw(ctx, cssW, cssH, frameRef.current, t, patches, dragRef.current, {
      motif: phaseMarker.motif,
      phase: phaseMarker.phase,
      phaseAge: Math.max(0, t - phaseMarker.startedAt),
      sceneKey: phaseMarker.sceneKey,
      tension: dragRef.current.tension,
    });
    frameRef.current++;
    rafRef.current = requestAnimationFrame(animateFrame);
  }, [patches]);

  const updateDragPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const mapped = pointerToScenePoint(event, canvas);
    const pointer = mapped.point;
    const drag = dragRef.current;
    drag.pointer = pointer;
    drag.tension = drag.active
      ? wireTension(drag.wireIndex, pointer, mapped.viewport.width, mapped.viewport.height)
      : 0;
    onWireTensionChange?.(drag.tension);
  }, [onWireTensionChange]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const mapped = pointerToScenePoint(event, canvas);
    const pointer = mapped.point;
    const hit = nearestWire(pointer, mapped.viewport.width, mapped.viewport.height, timeRef.current);
    if (hit.wireIndex === -1 || hit.distancePx > 28) return;

    canvas.setPointerCapture(event.pointerId);
    dragRef.current.active = true;
    dragRef.current.wireIndex = hit.wireIndex;
    dragRef.current.pointer = pointer;
    dragRef.current.tension = wireTension(hit.wireIndex, pointer, mapped.viewport.width, mapped.viewport.height);
    onWireTensionChange?.(dragRef.current.tension);
    event.preventDefault();
  }, [onWireTensionChange]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current.active) return;
    updateDragPoint(event);
    event.preventDefault();
  }, [updateDragPoint]);

  const handlePointerEnd = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    const wasActive = dragRef.current.active;
    const releasedTension = dragRef.current.tension;
    dragRef.current.active = false;
    if (!wasActive) return;
    onWireTensionChange?.(0);
    onWireRelease?.(releasedTension);
  }, [onWireRelease, onWireTensionChange]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [animate]);

  return (
    <canvas
      ref={canvasRef}
      className="ink-canvas"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={handlePointerEnd}
    />
  );
}

function pointerToScenePoint(
  event: React.PointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement
): { point: Vec2; viewport: SceneViewport } {
  const rect = canvas.getBoundingClientRect();
  const viewport = computeSceneViewport(rect.width, rect.height);
  return {
    point: {
      x: clamp((event.clientX - rect.left - viewport.x) / viewport.width, -0.12, 1.12),
      y: clamp((event.clientY - rect.top - viewport.y) / viewport.height, -0.12, 1.12),
    },
    viewport,
  };
}

function nearestWire(pointer: Vec2, w: number, h: number, t: number): { wireIndex: number; distancePx: number } {
  let best = { wireIndex: -1, distancePx: Number.POSITIVE_INFINITY };

  for (let i = 0; i < WIRES.length; i++) {
    const wire = WIRES[i];
    const pts = wirePoints({ ...wire, sag: wire.sag + swayOffset(i, t) });
    const distancePx = distanceToPolylinePx(pointer, pts, w, h);
    if (distancePx < best.distancePx) {
      best = { wireIndex: i, distancePx };
    }
  }

  return best;
}

function wireTension(wireIndex: number, pointer: Vec2, w: number, h: number): number {
  if (wireIndex < 0) return 0;
  const pts = wirePoints(WIRES[wireIndex]);
  const mid = pts[Math.floor(pts.length / 2)];
  const dx = (pointer.x - mid.x) * w;
  const dy = (pointer.y - mid.y) * h;
  return clamp(Math.sqrt(dx * dx + dy * dy) / 170, 0, 1);
}

function relaxReleasedWire(drag: WireDragState): void {
  if (drag.active || drag.wireIndex < 0 || drag.tension <= 0) return;

  const pts = wirePoints(WIRES[drag.wireIndex]);
  const mid = pts[Math.floor(pts.length / 2)];
  drag.pointer = {
    x: lerp(drag.pointer.x, mid.x, 0.10),
    y: lerp(drag.pointer.y, mid.y, 0.10),
  };
  drag.tension *= 0.90;

  if (drag.tension < 0.018) {
    drag.wireIndex = -1;
    drag.tension = 0;
  }
}

function distanceToPolylinePx(point: Vec2, pts: Vec2[], w: number, h: number): number {
  let minDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < pts.length - 1; i++) {
    const distance = distanceToSegmentPx(point, pts[i], pts[i + 1], w, h);
    if (distance < minDistance) minDistance = distance;
  }

  return minDistance;
}

function distanceToSegmentPx(point: Vec2, a: Vec2, b: Vec2, w: number, h: number): number {
  const px = point.x * w;
  const py = point.y * h;
  const ax = a.x * w;
  const ay = a.y * h;
  const bx = b.x * w;
  const by = b.y * h;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const u = lenSq === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1);
  const closestX = ax + dx * u;
  const closestY = ay + dy * u;
  return Math.hypot(px - closestX, py - closestY);
}
