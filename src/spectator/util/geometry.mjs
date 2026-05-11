import { DIRECTOR_DIST_BANDS } from "../constants.mjs";

export function parsePosition(s) {
  if (typeof s !== "string") return null;
  const parts = s.split(",").map((x) => Number.parseFloat(x.trim()));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return [parts[0], parts[1], parts[2]];
}

export function distanceUnits(a, b) {
  if (!a || !b) return Infinity;
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function distanceBonus(d) {
  for (const band of DIRECTOR_DIST_BANDS) {
    if (d < band.upTo) return band.bonus;
  }
  return null;
}
