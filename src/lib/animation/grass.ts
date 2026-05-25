/**
 * Dense ink-line grass rendering.
 *
 * The grass is built from clustered strokes that use the same visual language
 * as the poles and wires: boiled ink lines, translucent warm/olive washes,
 * and a barely moving sway.
 */

import { boilPoints } from "./boil";
import { POLES, PATH_CONTROLS, Vec2 } from "./geometry";
import { fbm, noise2 } from "./noise";

interface GrassTone {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface GrassPatch {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  angle: number;
  colorIdx: number;
  colorIdx2: number;
  noiseOffX: number;
  noiseOffY: number;
  breathPhase: number;
  breathAmp: number;
  breathFreq: number;
  points: number;
  density: number;
}

const GRASS_TONES: GrassTone[] = [
  { r: 42,  g: 39,  b: 27, a: 0.54 }, // ink earth
  { r: 61,  g: 70,  b: 42, a: 0.18 }, // dark olive accent
  { r: 86,  g: 86,  b: 48, a: 0.14 }, // muted green accent
  { r: 105, g: 78,  b: 47, a: 0.54 }, // warm brown
  { r: 132, g: 101, b: 65, a: 0.42 }, // dry ochre
  { r: 80,  g: 58,  b: 36, a: 0.48 }, // dark earth
];

const FIELD_WASHES = [
  { cx: 0.26, cy: 0.91, rx: 0.24, ry: 0.145, angle: -0.82, colorIdx: 4, phase: 5.0, noiseOff: 9.4 },
  { cx: 0.35, cy: 0.80, rx: 0.29, ry: 0.155, angle: -0.46, colorIdx: 3, phase: 0.3, noiseOff: 11.2 },
  { cx: 0.52, cy: 0.70, rx: 0.32, ry: 0.150, angle: -0.16, colorIdx: 3, phase: 1.9, noiseOff: 13.7 },
  { cx: 0.67, cy: 0.62, rx: 0.33, ry: 0.140, angle:  0.08, colorIdx: 4, phase: 3.1, noiseOff: 16.4 },
  { cx: 0.58, cy: 0.78, rx: 0.25, ry: 0.125, angle: -0.12, colorIdx: 5, phase: 2.7, noiseOff: 19.6 },
];

const EARTH_LINE_TONES = [5, 3, 4, 0, 3, 5, 4, 1];

/** Generate stable grass clusters at pole bases and along both path edges. */
export function buildGrassPatches(): GrassPatch[] {
  const patches: GrassPatch[] = [];

  function patch(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    angle: number,
    ci: number,
    ci2: number,
    noiseOff: number,
    density: number,
    bPhase = 0
  ): GrassPatch {
    return {
      cx,
      cy,
      rx,
      ry,
      angle,
      colorIdx: ci,
      colorIdx2: ci2,
      noiseOffX: noiseOff * 3.7,
      noiseOffY: noiseOff * 2.3,
      breathPhase: bPhase,
      breathAmp: Math.max(rx * 0.025, 0.0012),
      breathFreq: 0.000020 + (noiseOff % 5) * 0.0000025,
      points: 26,
      density,
    };
  }

  [
    patch(0.27, 0.91, 0.20, 0.108, -0.78, 5, 4, 24.2, 72, 1.3),
    patch(0.35, 0.82, 0.23, 0.126, -0.52, 3, 5, 26.4, 86, 2.0),
    patch(0.50, 0.71, 0.25, 0.120, -0.22, 3, 4, 29.1, 96, 3.4),
    patch(0.64, 0.64, 0.28, 0.118,  0.05, 4, 5, 31.7, 100, 4.1),
    patch(0.56, 0.84, 0.22, 0.104, -0.18, 5, 3, 34.6, 80, 5.2),
  ].forEach((bank) => patches.push(bank));

  POLES.forEach((pole, i) => {
    patches.push(patch(
      pole.base.x + (i === 1 ? 0.006 : -0.010),
      pole.base.y + 0.010,
      0.070 + i * 0.010,
      0.036 + i * 0.004,
      i * 0.35,
      i % 3,
      (i + 3) % GRASS_TONES.length,
      i * 1.1 + 2,
      18 + i * 3,
      i * 1.2
    ));

    patches.push(patch(
      pole.base.x + (i % 2 === 0 ? 0.040 : -0.038),
      pole.base.y + 0.018,
      0.050 + i * 0.006,
      0.026,
      i * -0.3 + 0.2,
      (i + 1) % GRASS_TONES.length,
      (i + 4) % GRASS_TONES.length,
      i * 1.7 + 6,
      14 + i * 3,
      i * 0.8 + 2.1
    ));
  });

  const pathEdges: { x: number; y: number; side: number }[] = [
    { x: PATH_CONTROLS[0].x - 0.050, y: PATH_CONTROLS[0].y - 0.055, side: -1 },
    { x: PATH_CONTROLS[0].x + 0.065, y: PATH_CONTROLS[0].y - 0.082, side:  1 },
    { x: PATH_CONTROLS[1].x - 0.060, y: PATH_CONTROLS[1].y + 0.012, side: -1 },
    { x: PATH_CONTROLS[1].x + 0.072, y: PATH_CONTROLS[1].y + 0.008, side:  1 },
    { x: PATH_CONTROLS[2].x - 0.072, y: PATH_CONTROLS[2].y + 0.010, side: -1 },
    { x: PATH_CONTROLS[3].x + 0.062, y: PATH_CONTROLS[3].y + 0.010, side:  1 },
    { x: PATH_CONTROLS[4].x - 0.052, y: PATH_CONTROLS[4].y + 0.004, side: -1 },
    { x: PATH_CONTROLS[5].x + 0.057, y: PATH_CONTROLS[5].y - 0.004, side:  1 },
  ];

  pathEdges.forEach((pt, i) => {
    patches.push(patch(
      pt.x,
      pt.y,
      0.060 + (i % 3) * 0.014,
      0.028 + (i % 2) * 0.008,
      pt.side * (0.15 + i * 0.10),
      (i + 1) % GRASS_TONES.length,
      (i + 4) % GRASS_TONES.length,
      i * 2.3 + 9,
      16 + (i % 3) * 4,
      i * 1.4 + 0.5
    ));
  });

  return patches;
}

export function drawGrassPatches(
  ctx: CanvasRenderingContext2D,
  patches: GrassPatch[],
  w: number,
  h: number,
  t: number,
  seed: number
): void {
  drawGrassFieldWash(ctx, w, h, t, seed);

  for (const p of patches) {
    const outerPoly = patchPolygon(p, t, 1.12);
    const outerBoiled = boilPoints(outerPoly, seed ^ 0xab12, 0.0016);
    drawGradientPatch(ctx, outerBoiled, p, w, h, p.colorIdx2, 0.42, 10);

    drawGrassLineBlock(ctx, p, w, h, t, seed);
    drawGroundHatching(ctx, p, w, h, t, seed);
  }
}

function patchPolygon(p: GrassPatch, t: number, noiseScale = 1.0): Vec2[] {
  const pts: Vec2[] = [];
  const breathR = Math.sin(t * p.breathFreq + p.breathPhase) * p.breathAmp;
  const cosA = Math.cos(p.angle);
  const sinA = Math.sin(p.angle);

  for (let i = 0; i <= p.points; i++) {
    const theta = (i / p.points) * Math.PI * 2;
    const n = fbm(
      p.noiseOffX + Math.cos(theta) * noiseScale + t * 0.000007,
      p.noiseOffY + Math.sin(theta) * noiseScale + t * 0.000006,
      3
    );
    const fringe = 1 + (n - 0.5) * 0.18 + breathR / p.rx;
    const localX = Math.cos(theta) * p.rx * fringe;
    const localY = Math.sin(theta) * p.ry * fringe;

    pts.push({
      x: p.cx + localX * cosA - localY * sinA,
      y: p.cy + localX * sinA + localY * cosA,
    });
  }

  return pts;
}

function drawGrassLineBlock(
  ctx: CanvasRenderingContext2D,
  p: GrassPatch,
  w: number,
  h: number,
  t: number,
  seed: number
): void {
  const count = p.density;
  const cosA = Math.cos(p.angle);
  const sinA = Math.sin(p.angle);

  ctx.save();
  ctx.filter = "blur(0.25px)";

  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(noise2(p.noiseOffX + i * 0.71, p.noiseOffY + i * 0.37));
    const theta = noise2(p.noiseOffX + i * 1.13, p.noiseOffY + i * 0.89) * Math.PI * 2;
    const localX = Math.cos(theta) * p.rx * r * 0.90;
    const localY = Math.sin(theta) * p.ry * r * 0.78;
    const baseX = p.cx + localX * cosA - localY * sinA;
    const baseY = p.cy + localX * sinA + localY * cosA;

    const lenNoise = noise2(p.noiseOffX + i * 1.7, p.noiseOffY + i * 1.9);
    const leanNoise = noise2(p.noiseOffX + i * 2.1, p.noiseOffY + i * 1.3) - 0.5;
    const phase = p.breathPhase + i * 0.47;
    const sway = Math.sin(t * 0.00030 + phase) * (0.0012 + lenNoise * 0.0020);
    const length = p.ry * (0.14 + lenNoise * 0.34);
    const lean = leanNoise * p.rx * 0.16 + Math.sin(p.angle) * p.rx * 0.05;
    const hook = (noise2(p.noiseOffX + i * 0.43, p.noiseOffY + i * 1.57) - 0.5) * p.rx * 0.075;

    const blade: Vec2[] = [
      { x: baseX, y: baseY },
      { x: baseX + lean * 0.24 + sway * 0.35, y: baseY - length * 0.34 },
      { x: baseX + lean * 0.62 + hook + sway * 0.75, y: baseY - length * 0.70 },
      { x: baseX + lean + hook * 0.65 + sway, y: baseY - length },
    ];

    const width = 0.36 + lenNoise * 0.54;
    const toneIdx = earthLineTone(p.colorIdx + i);
    grassStroke(ctx, boilPoints(blade, seed ^ (0x6419 + i * 97), 0.00120), w, h, width, tone(toneIdx, 0.94), 1);

    if (i % 4 === 0) {
      grassStroke(
        ctx,
        boilPoints(blade.slice(1), seed ^ (0x91c3 + i * 53), 0.0010),
        w,
        h,
        Math.max(0.28, width * 0.52),
        tone(earthLineTone(toneIdx + i + 2), 0.46),
        1
      );
    }
  }

  ctx.restore();
}

function drawGroundHatching(
  ctx: CanvasRenderingContext2D,
  p: GrassPatch,
  w: number,
  h: number,
  t: number,
  seed: number
): void {
  const lines = Math.max(5, Math.floor(p.density * 0.28));
  const cosA = Math.cos(p.angle);
  const sinA = Math.sin(p.angle);

  for (let i = 0; i < lines; i++) {
    const u = (i / Math.max(1, lines - 1) - 0.5) * 1.55;
    const v = noise2(p.noiseOffX + i * 0.9, p.noiseOffY + i * 1.2) - 0.5;
    const sway = Math.sin(t * 0.00020 + p.breathPhase + i) * 0.0010;
    const x0 = p.cx + (u * p.rx * 0.55) * cosA - (v * p.ry * 0.55) * sinA;
    const y0 = p.cy + (u * p.rx * 0.55) * sinA + (v * p.ry * 0.55) * cosA;
    const span = p.rx * (0.20 + noise2(p.noiseOffY + i, p.noiseOffX + i) * 0.22);
    const hatch: Vec2[] = [
      { x: x0 - span * 0.55, y: y0 + sway },
      { x: x0, y: y0 - p.ry * 0.06 + sway * 0.7 },
      { x: x0 + span * 0.55, y: y0 + sway * 0.2 },
    ];

    grassStroke(
      ctx,
      boilPoints(hatch, seed ^ (0x2b17 + i * 31), 0.0012),
      w,
      h,
      0.45,
      tone(earthLineTone(p.colorIdx2 + i), 0.58),
      1
    );
  }
}

function drawGrassFieldWash(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  seed: number
): void {
  for (let i = 0; i < FIELD_WASHES.length; i++) {
    const wash = FIELD_WASHES[i];
    const poly = washPolygon(wash, t);
    const boiled = boilPoints(poly, seed ^ (0x8171 + i * 0x111), 0.0018);
    drawWashPolygon(
      ctx,
      boiled,
      wash.cx,
      wash.cy,
      Math.max(wash.rx * w, wash.ry * h) * 1.78,
      wash.colorIdx,
      1.32,
      24,
      w,
      h
    );
    drawDenseGrassMass(ctx, wash, w, h, t, seed ^ (0x5d23 + i * 0x101));
    drawBankBristles(ctx, wash, w, h, t, seed ^ (0x2f41 + i * 0x193));
  }
}

function drawDenseGrassMass(
  ctx: CanvasRenderingContext2D,
  wash: (typeof FIELD_WASHES)[number],
  w: number,
  h: number,
  t: number,
  seed: number
): void {
  const cosA = Math.cos(wash.angle);
  const sinA = Math.sin(wash.angle);
  const seedPhase = (seed & 2047) * 0.009;
  const layers = [
    { count: 140 + Math.floor(wash.rx * 220), colorIdx: wash.colorIdx, alpha: 0.78, width: 0.70, blur: 0.90, span: 0.95 },
    { count: 100 + Math.floor(wash.rx * 170), colorIdx: 5, alpha: 0.58, width: 0.48, blur: 0.55, span: 0.86 },
    { count: 70 + Math.floor(wash.rx * 120), colorIdx: 3, alpha: 0.42, width: 0.34, blur: 0.30, span: 0.76 },
    { count: 40 + Math.floor(wash.rx * 70), colorIdx: 1, alpha: 0.16, width: 0.28, blur: 0.35, span: 0.66 },
  ];

  for (let layer = 0; layer < layers.length; layer++) {
    const cfg = layers[layer];

    ctx.save();
    ctx.filter = `blur(${cfg.blur}px)`;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = cfg.width;
    ctx.strokeStyle = tone(cfg.colorIdx, cfg.alpha);
    ctx.beginPath();

    for (let i = 0; i < cfg.count; i++) {
      const n0 = noise2(wash.noiseOff + layer * 3.1 + i * 0.71, wash.noiseOff * 0.61 + i * 0.37);
      const n1 = noise2(wash.noiseOff * 1.3 + i * 1.07, wash.noiseOff + layer * 2.7 + i * 0.83);
      const r = Math.sqrt(n0);
      const theta = n1 * Math.PI * 2;
      const localX = Math.cos(theta) * wash.rx * r * cfg.span;
      const localY = Math.sin(theta) * wash.ry * r * cfg.span * 0.72;
      const baseX = wash.cx + localX * cosA - localY * sinA;
      const baseY = wash.cy + localX * sinA + localY * cosA;
      const boilX = (noise2(seedPhase + i * 0.41, wash.noiseOff + layer) - 0.5) * 0.0020;
      const boilY = (noise2(wash.noiseOff + layer, seedPhase + i * 0.47) - 0.5) * 0.0015;
      const sway = Math.sin(t * 0.00031 + wash.phase + i * 0.23 + layer) * 0.0018;
      const len = wash.ry * (0.040 + noise2(wash.noiseOff + i * 1.9, wash.noiseOff * 1.7 + i) * 0.125);
      const lean = (noise2(i * 0.79 + wash.noiseOff, i * 0.43 + wash.noiseOff) - 0.5) * wash.rx * 0.075;

      ctx.moveTo((baseX + boilX) * w, (baseY + boilY) * h);
      ctx.lineTo((baseX + lean + sway + boilX) * w, (baseY - len + boilY) * h);
    }

    ctx.stroke();
    ctx.restore();
  }
}

function drawBankBristles(
  ctx: CanvasRenderingContext2D,
  wash: (typeof FIELD_WASHES)[number],
  w: number,
  h: number,
  t: number,
  seed: number
): void {
  const cosA = Math.cos(wash.angle);
  const sinA = Math.sin(wash.angle);
  const boilPhase = (seed & 1023) * 0.013;
  const count = Math.floor(100 + wash.rx * 220);

  ctx.save();
  ctx.filter = "blur(0.55px)";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 0.62;
  ctx.strokeStyle = tone(wash.colorIdx, 0.92);
  ctx.beginPath();

  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(noise2(wash.noiseOff + i * 0.73, wash.noiseOff * 0.7 + i * 0.41));
    const theta = noise2(wash.noiseOff + i * 1.17, wash.noiseOff * 1.31 + i * 0.79) * Math.PI * 2;
    const localX = Math.cos(theta) * wash.rx * r * 0.92;
    const localY = Math.sin(theta) * wash.ry * r * 0.76;
    const baseX = wash.cx + localX * cosA - localY * sinA;
    const baseY = wash.cy + localX * sinA + localY * cosA;
    const jitterX = (noise2(boilPhase + i * 0.43, wash.noiseOff) - 0.5) * 0.0022;
    const jitterY = (noise2(wash.noiseOff, boilPhase + i * 0.37) - 0.5) * 0.0017;
    const phase = wash.phase + i * 0.33;
    const sway = Math.sin(t * 0.00032 + phase) * 0.0021;
    const len = wash.ry * (0.045 + noise2(wash.noiseOff + i, wash.noiseOff + i * 1.9) * 0.13);
    const lean = (noise2(wash.noiseOff * 1.8 + i, wash.noiseOff * 0.5 + i) - 0.5) * wash.rx * 0.09;

    ctx.moveTo((baseX + jitterX) * w, (baseY + jitterY) * h);
    ctx.lineTo((baseX + lean + sway + jitterX) * w, (baseY - len + jitterY) * h);
  }

  ctx.stroke();
  ctx.strokeStyle = tone(earthLineTone(wash.colorIdx + 2), 0.42);
  ctx.lineWidth = 0.42;
  ctx.beginPath();

  for (let i = 0; i < Math.floor(count * 0.48); i++) {
    const r = Math.sqrt(noise2(wash.noiseOff * 1.4 + i * 0.91, wash.noiseOff + i * 0.67));
    const theta = noise2(wash.noiseOff + i * 0.51, wash.noiseOff * 1.9 + i * 1.07) * Math.PI * 2;
    const localX = Math.cos(theta) * wash.rx * r * 0.86;
    const localY = Math.sin(theta) * wash.ry * r * 0.70;
    const baseX = wash.cx + localX * cosA - localY * sinA;
    const baseY = wash.cy + localX * sinA + localY * cosA;
    const sway = Math.sin(t * 0.00029 + wash.phase + i) * 0.0015;
    const len = wash.ry * (0.045 + noise2(i, wash.noiseOff) * 0.10);

    ctx.moveTo(baseX * w, baseY * h);
    ctx.lineTo((baseX + sway) * w, (baseY - len) * h);
  }

  ctx.stroke();
  ctx.restore();
}

function washPolygon(
  wash: (typeof FIELD_WASHES)[number],
  t: number
): Vec2[] {
  const pts: Vec2[] = [];
  const cosA = Math.cos(wash.angle);
  const sinA = Math.sin(wash.angle);
  const breath = 1 + Math.sin(t * 0.000024 + wash.phase) * 0.018;

  for (let i = 0; i <= 28; i++) {
    const theta = (i / 28) * Math.PI * 2;
    const n = fbm(
      wash.noiseOff + Math.cos(theta) * 0.95 + t * 0.000008,
      wash.noiseOff * 0.73 + Math.sin(theta) * 0.95 + t * 0.000007,
      3
    );
    const fringe = 1 + (n - 0.5) * 0.16;
    const localX = Math.cos(theta) * wash.rx * breath * fringe;
    const localY = Math.sin(theta) * wash.ry * breath * fringe;

    pts.push({
      x: wash.cx + localX * cosA - localY * sinA,
      y: wash.cy + localX * sinA + localY * cosA,
    });
  }

  return pts;
}

function drawGradientPatch(
  ctx: CanvasRenderingContext2D,
  pts: Vec2[],
  p: GrassPatch,
  w: number,
  h: number,
  colorIdx: number,
  alphaScale: number,
  blurPx: number
): void {
  const radius = Math.max(p.rx * w, p.ry * h) * 1.55;
  drawWashPolygon(ctx, pts, p.cx, p.cy, radius, colorIdx, alphaScale, blurPx, w, h);
}

function drawWashPolygon(
  ctx: CanvasRenderingContext2D,
  pts: Vec2[],
  cx: number,
  cy: number,
  radius: number,
  colorIdx: number,
  alphaScale: number,
  blurPx: number,
  w: number,
  h: number
): void {
  if (pts.length < 3) return;

  const grad = ctx.createRadialGradient(cx * w, cy * h, 0, cx * w, cy * h, radius);
  grad.addColorStop(0, tone(colorIdx, alphaScale));
  grad.addColorStop(0.62, tone(colorIdx, alphaScale * 0.34));
  grad.addColorStop(1, tone(colorIdx, 0));

  ctx.save();
  ctx.filter = `blur(${blurPx}px)`;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(pts[0].x * w, pts[0].y * h);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x * w, pts[i].y * h);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function grassStroke(
  ctx: CanvasRenderingContext2D,
  pts: Vec2[],
  w: number,
  h: number,
  lineWidth: number,
  color: string,
  passes = 1
): void {
  if (pts.length < 2) return;

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let pass = 0; pass < passes; pass++) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x * w, pts[0].y * h);
    for (let i = 1; i < pts.length; i++) {
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
}

function tone(index: number, alphaScale: number): string {
  const toneDef = GRASS_TONES[index % GRASS_TONES.length];
  const alpha = Math.max(0, Math.min(1, toneDef.a * alphaScale));
  return `rgba(${toneDef.r},${toneDef.g},${toneDef.b},${alpha.toFixed(3)})`;
}

function earthLineTone(index: number): number {
  return EARTH_LINE_TONES[Math.abs(index) % EARTH_LINE_TONES.length];
}
