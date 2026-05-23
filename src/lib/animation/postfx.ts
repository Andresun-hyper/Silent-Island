/**
 * Post-processing overlay: film grain + radial vignette.
 * Both are painted onto the canvas each frame after all scene elements.
 */

/**
 * Draw a heavy radial vignette that smudges the painted edges into
 * the background color. The gradient is wide enough to eat into the
 * composition, pushing the subject toward the center.
 *
 * @param ctx    2D rendering context
 * @param w      canvas width in px
 * @param h      canvas height in px
 * @param bgColor  the background color string (e.g. "#d8d4ce")
 */
export function drawVignette(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bgColor: string
): void {
  const cx = w / 2;
  const cy = h / 2;
  // Use the longer half-diagonal so corners are fully covered
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
 * Draw film grain: scatter random translucent pixels over the whole canvas.
 * Grain density and opacity are kept heavy to sell the lo-fi aesthetic.
 *
 * @param ctx       2D rendering context
 * @param w         canvas width
 * @param h         canvas height
 * @param intensity grain opacity 0-1 (default 0.13)
 * @param density   fraction of pixels to affect (default 0.18)
 */
export function drawGrain(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  intensity = 0.13,
  density = 0.18
): void {
  const count = Math.floor(w * h * density);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const bright = Math.random() > 0.5 ? 255 : 0;
    const a = Math.random() * intensity;
    ctx.fillStyle = `rgba(${bright},${bright},${bright},${a.toFixed(3)})`;
    ctx.fillRect(x | 0, y | 0, 1, 1);
  }
  ctx.restore();
}

/** Convert a 6-digit hex color + alpha to rgba(...) string */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
