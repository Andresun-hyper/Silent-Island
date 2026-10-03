export const ROUTE_STOPS = { field: 0, pond: .42, lamplight: .62, grove: 1 } as const;
export const ROUTE_VIEW_START = .07;
export const ROUTE_VIEW_SPAN = .88;
export const BRIDGE_ROUTE_START = (2 + .515 * 5) / 12;
export const BRIDGE_ROUTE_END = (2 + .81 * 5) / 12;

export const ROUTE_POINTS: [number, number, number][] = [
  [-5.5, 0, 16], [-3.6, 0, 12],
  [-1.3, 0, 8], [-2.2, 0, 5], [-0.8, 0, 2],
  [1.3, 0, -1], [0.6, 0, -4], [-.35, 0, -7.1],
  [.6, 0, -8.4], [1.5, 0, -11.5], [-1.2, 0, -14.5],
  [-3.8, 0, -17.5], [-2.3, 0, -21.5],
];

export function clampProgress(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

export function placeAtProgress(value: number): keyof typeof ROUTE_STOPS {
  const progress = clampProgress(value);
  return progress < .28 ? "field" : progress < .52 ? "pond" : progress < .78 ? "lamplight" : "grove";
}
