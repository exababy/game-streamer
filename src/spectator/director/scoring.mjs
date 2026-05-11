import {
  DIRECTOR_CLUTCH_ALIVE_THRESHOLD,
  DIRECTOR_DWELL_MAX_MS,
  DIRECTOR_STICKY_BONUS,
  DIRECTOR_STICKY_BONUS_CLUTCH,
  DIRECTOR_STICKY_PRIORITY_FLOOR,
} from "../constants.mjs";
import { aliveCount, gsiState, phaseKey } from "../state/gsi.mjs";
import { distanceBonus, distanceUnits } from "../util/geometry.mjs";

export function pickDirectorTarget(eventBonuses, ctx, nowMs) {
  const players = [...gsiState.players.values()].filter((p) => p.alive);
  if (players.length === 0) return null;

  const encounters = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i], b = players[j];
      if (!a.team || !b.team || a.team === b.team) continue;
      const d = distanceUnits(a.position, b.position);
      const distScore = distanceBonus(d);
      if (distScore == null) continue;
      let priority = distScore;
      priority += ((a.equipValue + b.equipValue) / 2) / 200;
      priority += ((a.roundKills + b.roundKills) / 2) * 3;
      const lowHp   = (h) => h > 0 && h < 50;
      const veryLow = (h) => h > 0 && h < 30;
      if (lowHp(a.health) || lowHp(b.health))     priority += 10;
      if (veryLow(a.health) || veryLow(b.health)) priority += 10;
      if (a.hasDefuser || b.hasDefuser) priority += 20;
      const snipers = [a.activeSniper, b.activeSniper].filter(Boolean);
      if (snipers.length === 2)           priority += 100;
      if (snipers.includes("weapon_awp")) priority += 30;
      encounters.push({ a, b, distance: d, priority });
    }
  }
  encounters.sort((x, y) => y.priority - x.priority);

  // Only the current target dying short-circuits the min-dwell timer.
  // Event bonuses (AWP kill, damage dealer, upset) are applied as
  // priority bumps and have to wait their turn.
  let forcedByDeath = false;
  if (ctx.targetSteamId) {
    const cur = gsiState.players.get(ctx.targetSteamId);
    if (cur && !cur.alive) forcedByDeath = true;
  }

  if (encounters.length === 0) {
    const cur = ctx.targetSteamId && gsiState.players.get(ctx.targetSteamId);
    if (cur && cur.alive) return { target: cur, priority: 0, forcedByDeath };
    const bySlot = players
      .filter((p) => typeof p.slot === "number")
      .sort((a, b) => a.slot - b.slot);
    return bySlot[0] ? { target: bySlot[0], priority: 0, forcedByDeath } : null;
  }

  const best = encounters[0];
  const stickyTarget =
    ctx.targetSteamId &&
    (best.a.steamId === ctx.targetSteamId || best.b.steamId === ctx.targetSteamId)
      ? gsiState.players.get(ctx.targetSteamId)
      : null;

  const isClutch = aliveCount() < DIRECTOR_CLUTCH_ALIVE_THRESHOLD;
  const dwellMs = nowMs - ctx.targetSinceMs;
  const dwellCapPhase = DIRECTOR_DWELL_MAX_MS[phaseKey()] ?? DIRECTOR_DWELL_MAX_MS.live;
  const dwellCap =
    best.priority > DIRECTOR_STICKY_PRIORITY_FLOOR || isClutch
      ? DIRECTOR_DWELL_MAX_MS.active
      : dwellCapPhase;

  if (stickyTarget && best.priority > DIRECTOR_STICKY_PRIORITY_FLOOR && dwellMs < dwellCap) {
    best.priority += isClutch ? DIRECTOR_STICKY_BONUS_CLUTCH : DIRECTOR_STICKY_BONUS;
  }

  const inEncounterScore = (p) => {
    let s = p.equipValue / 100 + p.roundKills * 10;
    s += p.health > 50 ? 5 : 0;
    const evt = eventBonuses.get(p.steamId);
    if (evt) s += evt.bonus;
    return s;
  };

  const sa = inEncounterScore(best.a);
  const sb = inEncounterScore(best.b);
  let chosen = sa >= sb ? best.a : best.b;
  if (stickyTarget && Math.abs(sa - sb) < 5) chosen = stickyTarget;

  return { target: chosen, priority: best.priority, forcedByDeath };
}
