import {
  DIRECTOR_AWP_KILL,
  DIRECTOR_SSG_KILL,
  DIRECTOR_DAMAGE,
} from "../constants.mjs";
import { gsiState } from "../state/gsi.mjs";
import { distanceUnits } from "../util/geometry.mjs";

export function pruneEventBonuses(eventBonuses, nowMs) {
  for (const [k, v] of eventBonuses) {
    if (v.until <= nowMs) eventBonuses.delete(k);
  }
}

export function addEventBonus(eventBonuses, steamId, evt, nowMs) {
  const existing = eventBonuses.get(steamId);
  if (existing && existing.bonus >= evt.bonus && existing.until > nowMs) return;
  eventBonuses.set(steamId, {
    until: nowMs + evt.ttlMs,
    bonus: evt.bonus,
    label: evt.label,
  });
}

export function detectEventsAndApplyBonuses(eventBonuses, nowMs) {
  pruneEventBonuses(eventBonuses, nowMs);
  for (const p of gsiState.players.values()) {
    if (p.roundKills > p.prevRoundKills) {
      if (p.activeSniper === "weapon_awp") {
        addEventBonus(eventBonuses, p.steamId, DIRECTOR_AWP_KILL, nowMs);
      } else if (p.activeSniper === "weapon_ssg08") {
        addEventBonus(eventBonuses, p.steamId, DIRECTOR_SSG_KILL, nowMs);
      }
    }
    // GSI doesn't expose shooter id, so we award the damage bonus to
    // the nearest alive enemy as a proxy.
    const hpDelta = p.prevHealth - p.health;
    if (hpDelta >= DIRECTOR_DAMAGE.minHp && p.alive) {
      let bestEnemy = null;
      let bestDist = Infinity;
      for (const other of gsiState.players.values()) {
        if (other.steamId === p.steamId) continue;
        if (!other.alive) continue;
        if (!other.team || other.team === p.team) continue;
        const d = distanceUnits(p.position, other.position);
        if (d < bestDist) { bestDist = d; bestEnemy = other; }
      }
      const maxRange = bestEnemy && bestEnemy.activeSniper ? 3_000 : 1_500;
      if (bestEnemy && bestDist <= maxRange) {
        addEventBonus(eventBonuses, bestEnemy.steamId, DIRECTOR_DAMAGE, nowMs);
      }
    }
  }
}
