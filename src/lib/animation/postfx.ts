/**
 * Post-processing overlay: film grain + radial vignette.
 * Both are painted onto the canvas each frame after all scene elements.
 */

const GRAIN_TILE = 256;
let grainTile: HTMLCanvasElement | null = null;

function ensureGrainTile(): HTMLCanvasElement {
  if (grainTile) return grainTile;

  grainTile = document.createElement("canvas");
  grainTile.width = GRAIN_TILE;
  grainTile.height = GRAIN_TILE;
  const ctx = grainTile.getContext("2d");
  if (!ctx) return grainTile;

  const image = ctx.createImageData(GRAIN_TILE, GRAIN_TILE);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const bright = Math.random() > 0.5 ? 255 : 0;
    const alpha = Math.random() * 255;
    data[i] = bright;
    data[i + 1] = bright;
    data[i + 2] = bright;
    data[i + 3] = alpha;
  }
  ctx.putImageData(image, 0, 0);
  return grainTile;
}

/**
 * Draw a heavy radial vignette that smudges the painted edges into
 * the background color. The gradient is wide enough to eat into the
 * composition, pushing the subject toward the center.
 */
export function drawVignette(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bgColor: string
): void {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.sqrt(cx * cx + cy * cy) * 1.05;

  const grad = ctx.createRadialGradient(cx, cy, r * 0.28, cx, cy, r);
  grad.addColorStop(0,   "rgba(0,0,0,0)");
  grad.addColorStop(0.55, "rgba(0,0,0,0)");
  grad.addColorStop(0.78, hexToRgba(bgColor, 0.45));
  grad.addColorStop(0.90, hexToRgba(bgColor, 0.80));
  grad.addColorStop(1.0,  hexToRgba(bgColor, 1.00));

  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/**
 * Draw film grain by tiling a pre-built noise texture.
 * Replaces per-frame random fillRect loops (was ~300k calls at 1080p).
 */
export function drawGrain(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  intensity = 0.13,
  density = 0.18
): void {
  const tile = ensureGrainTile();
  const alpha = intensity * (density / 0.18);

  ctx.save();
  ctx.globalAlpha = alpha;
  for (let y = 0; y < h; y += GRAIN_TILE) {
    for (let x = 0; x < w; x += GRAIN_TILE) {
      ctx.drawImage(tile, x, y);
    }
  }
  ctx.restore();
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
