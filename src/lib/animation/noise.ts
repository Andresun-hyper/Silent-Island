/**
 * Minimal smooth noise utilities for the grass breathing / ripple effect.
 * Uses value noise with cubic interpolation — no external dependency.
 */

// Precomputed permutation table (256 entries, doubled)
const PERM = (() => {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Fisher-Yates with a fixed seed for determinism
  let s = 987654321;
  for (let i = 255; i > 0; i--) {
    s = (s ^ (s << 13)) >>> 0;
    s = (s ^ (s >>> 17)) >>> 0;
    s = (s ^ (s << 5)) >>> 0;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  const pp = new Uint8Array(512);
  for (let i = 0; i < 512; i++) pp[i] = p[i & 255];
  return pp;
})();

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function grad1(hash: number, x: number): number {
  return (hash & 1) === 0 ? x : -x;
}

/** 1-D Perlin noise, returns value in [-1, 1] */
export function noise1(x: number): number {
  const X = Math.floor(x) & 255;
  const xf = x - Math.floor(x);
  const u = fade(xf);
  const a = PERM[X];
  const b = PERM[X + 1];
  return lerp(grad1(a, xf), grad1(b, xf - 1), u);
}

/** 2-D value noise, returns value in [0, 1] */
export function noise2(x: number, y: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);

  const aa = PERM[PERM[X]     + Y];
  const ab = PERM[PERM[X]     + Y + 1];
  const ba = PERM[PERM[X + 1] + Y];
  const bb = PERM[PERM[X + 1] + Y + 1];

  const x1 = lerp(
    grad2(aa, xf,     yf    ),
    grad2(ba, xf - 1, yf    ),
    u
  );
  const x2 = lerp(
    grad2(ab, xf,     yf - 1),
    grad2(bb, xf - 1, yf - 1),
    u
  );
  return (lerp(x1, x2, v) + 1) * 0.5;
}

function grad2(hash: number, x: number, y: number): number {
  const h = hash & 3;
  const gx = h < 2 ? x : -x;
  const gy = (h & 1) === 0 ? y : -y;
  return gx + gy;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Fractional Brownian Motion — layered octaves of noise2.
 * Returns [0, 1].
 */
export function fbm(x: number, y: number, octaves = 4): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  let max = 0;
  for (let i = 0; i < octaves; i++) {
    val += noise2(x * freq, y * freq) * amp;
    max += amp;
    amp  *= 0.5;
    freq *= 2.1;
  }
  return val / max;
}
