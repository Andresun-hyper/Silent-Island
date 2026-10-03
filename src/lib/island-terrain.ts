const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mound = (x: number, z: number, cx: number, cz: number, rx: number, rz: number) =>
  Math.exp(-(((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2));

export function terrainHeight(x: number, z: number): number {
  const backHill = 2.7 * mound(x, z, -4.2, -14.8, 5.1, 4.1);
  const farHill = 3.5 * mound(x, z, -5.6, -21.5, 6.1, 4.7);
  const meadow = Math.sin(x * .46 + z * .15) * Math.cos(z * .3) * .13;
  const courtyard = -.38 * mound(x, z, -.8, -6.3, 2.7, 2.3);
  let height = backHill + farHill + meadow + courtyard;
  const waterDistance = Math.sqrt(((x - 2.45) / 3.5) ** 2 + ((z + 2.15) / 2.2) ** 2);
  height = -.13 + (height + .13) * smooth(.84, 1.18, waterDistance);
  // A level terrace contains the full building, roof eaves and foundation.
  const terraceDistance = Math.max(Math.abs(x + 2.1) / 2.05, Math.abs(z + 8.7) / 1.7);
  const terrace = 1 - smooth(1, 1.38, terraceDistance);
  return height * (1 - terrace) + .24 * terrace;
}
