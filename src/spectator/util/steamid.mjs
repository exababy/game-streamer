import { STEAMID64_BASE } from "../constants.mjs";

export function steamIdToAccountId(s) {
  if (typeof s !== "string") return null;
  try {
    const n = BigInt(s);
    if (n <= STEAMID64_BASE) return Number(n);
    return Number(n - STEAMID64_BASE);
  } catch {
    return null;
  }
}
