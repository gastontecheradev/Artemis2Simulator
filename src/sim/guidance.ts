import { DeltaV, ZERO_DV, applyBurn, referenceBody } from './burns';
import { EI_ALTITUDE, ENTRY_CORRIDOR, FLYBY_ALTITUDE_TARGET, GM_EARTH, R_EARTH } from './constants';
import { tr } from './i18n';
import { earthElements } from './orbit';
import { propagate } from './propagate';
import { SimState, ephemerisOf } from './state';

/**
 * Perigee radius (without atmosphere) that corresponds to crossing entry interface
 * with flight-path angle `fpaDeg`, for an orbit of energy `energy`.
 */
export function perigeeRadiusForEntry(energy: number, fpaDeg: number, gm = GM_EARTH): number {
  const r = R_EARTH + EI_ALTITUDE;
  const v = Math.sqrt(2 * (energy + gm / r));
  const h = r * v * Math.cos((fpaDeg * Math.PI) / 180);
  const e = Math.sqrt(Math.max(0, 1 + (2 * energy * h * h) / (gm * gm)));
  return (h * h) / gm / (1 + e);
}

export type CorrectionTarget = 'flyby' | 'entry';

export interface CorrectionResult {
  readonly ok: boolean;
  /** Δv along the requested axis (km/s). */
  readonly dv: number;
  readonly message: string;
}

const HORIZON = 10 * 86400;
const MAX_DV = 0.2; // km/s

/**
 * Simple guidance for a trajectory correction: searches (secant method) for the Δv
 * along a local-frame axis that takes the predicted trajectory to the target:
 * - 'flyby': lunar flyby altitude of 6,513 km.
 * - 'entry': target flight-path angle at entry interface.
 */
export function solveCorrection(state: SimState, target: CorrectionTarget, axis: keyof DeltaV): CorrectionResult {
  const eph = ephemerisOf(state);
  const body = referenceBody(state.ship, state.t, eph);
  const tol = target === 'flyby' ? 1 : 0.2; // km

  const miss = (x: number): number => {
    const ship = applyBurn(state.ship, { ...ZERO_DV, [axis]: x }, body);
    const p = propagate(ship, state.t, HORIZON, eph, { rtol: 1e-10 });
    if (target === 'flyby') return p.perilune ? p.perilune.altitude - FLYBY_ALTITUDE_TARGET : NaN;
    const el = earthElements(p.final, p.tEnd, eph);
    const rp = p.ei ? el.rp : p.periapsis ? p.periapsis.rp : NaN;
    return rp - perigeeRadiusForEntry(el.energy, ENTRY_CORRIDOR.target);
  };

  let x0 = 0;
  let f0 = miss(x0);
  if (Number.isNaN(f0)) {
    return { ok: false, dv: 0, message: tr(target === 'flyby' ? 'guid.noFlyby' : 'guid.noReturn') };
  }
  if (Math.abs(f0) < tol) return { ok: true, dv: 0, message: tr('guid.inTolerance') };
  let x1 = 0.0005;
  let f1 = miss(x1);
  for (let i = 0; i < 20; i++) {
    if (Number.isNaN(f1) || f1 === f0) break;
    if (Math.abs(f1) < tol) return { ok: true, dv: x1, message: tr('guid.found') };
    let x2 = x1 - (f1 * (x1 - x0)) / (f1 - f0);
    // Limits the jump so it does not leave the region where the prediction is valid.
    const maxJump = Math.max(0.002, 4 * Math.abs(x1 - x0));
    x2 = Math.max(x1 - maxJump, Math.min(x1 + maxJump, x2));
    if (Math.abs(x2) > MAX_DV) break;
    x0 = x1;
    f0 = f1;
    x1 = x2;
    f1 = miss(x1);
  }
  return { ok: false, dv: 0, message: tr('guid.noConverge') };
}
