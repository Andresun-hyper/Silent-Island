/**
 * Wire sway animation.
 *
 * Each wire's lowest catenary point drifts sinusoidally in Y, simulating an
 * imperceptible breeze. The displacement is so small it reads as stillness
 * with just a hint of life.
 */

export interface SwayState {
  /** Current sag offset added to the wire's base sag value (normalized units) */
  sagOffset: number;
}

const BASE_SWAY_AMP = 0.0015;  // max ±Y offset in normalized space
const BASE_FREQ = 0.00025;     // radians per millisecond (≈1 cycle / ~25 s)

/**
 * Per-wire sway parameters so each wire moves at a slightly different rhythm.
 */
export const SWAY_PARAMS: { amp: number; freq: number; phase: number }[] = [
  { amp: BASE_SWAY_AMP * 1.0,  freq: BASE_FREQ * 1.00, phase: 0.0 },
  { amp: BASE_SWAY_AMP * 0.85, freq: BASE_FREQ * 0.93, phase: 1.1 },
  { amp: BASE_SWAY_AMP * 1.1,  freq: BASE_FREQ * 1.07, phase: 2.3 },
  { amp: BASE_SWAY_AMP * 0.9,  freq: BASE_FREQ * 0.97, phase: 3.7 },
];

/**
 * Compute the current sag offset for wire `i` at time `t` (milliseconds).
 */
export function swayOffset(wireIndex: number, t: number): number {
  const p = SWAY_PARAMS[wireIndex % SWAY_PARAMS.length];
  return Math.sin(t * p.freq + p.phase) * p.amp;
}
