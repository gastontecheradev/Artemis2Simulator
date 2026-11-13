import { describe, expect, it } from 'vitest';
import { createCircularEphemeris, createEarthOnlyEphemeris } from '../src/sim/bodies';
import { applyBurn } from '../src/sim/burns';
import { commsStatus, losClearance } from '../src/sim/comms';
import {
  C_LIGHT,
  EARTH_MOON_DISTANCE,
  FT_TO_KM,
  GM_EARTH,
  GM_MOON,
  INSERTION_ALTITUDE,
  MOON_SIDEREAL_PERIOD,
  MPH_TO_KMS,
  R_EARTH,
  R_MOON,
} from '../src/sim/constants';
import { integrateWithEvents } from '../src/sim/events';
import { ShipState, integrate } from '../src/sim/integrator';
import { add, distance, length, scale, vec3 } from '../src/sim/math/vec3';
import { earthElements, jacobiConstant } from '../src/sim/orbit';
import { propagate } from '../src/sim/propagate';

describe('constantes', () => {
  it('convierte unidades imperiales con factores exactos', () => {
    expect(534564 * FT_TO_KM).toBeCloseTo(162.94, 2);
    expect(17627 * MPH_TO_KMS).toBeCloseTo(7.88, 3);
    expect(INSERTION_ALTITUDE).toBeCloseTo(162.935, 2);
  });
});

describe('H2 · cuerpos', () => {
  const eph = createCircularEphemeris(0.3);
  it('la Luna completa una vuelta en ~27,32 días', () => {
    const start = eph.moon(0).r;
    const half = eph.moon(MOON_SIDEREAL_PERIOD / 2).r;
    const end = eph.moon(MOON_SIDEREAL_PERIOD).r;
    expect(distance(start, end)).toBeLessThan(1e-6);
    expect(distance(start, half)).toBeGreaterThan(EARTH_MOON_DISTANCE * 1.9);
    expect(MOON_SIDEREAL_PERIOD / 86400).toBeCloseTo(27.32, 2);
  });
  it('mantiene la distancia Tierra‑Luna y el baricentro en el origen', () => {
    for (const t of [0, 1e5, 7e5, 2e6]) {
      const e = eph.earth(t);
      const m = eph.moon(t);
      expect(distance(e.r, m.r)).toBeCloseTo(EARTH_MOON_DISTANCE, 6);
      const bary = add(scale(e.r, GM_EARTH), scale(m.r, GM_MOON));
      expect(length(bary) / GM_EARTH).toBeLessThan(1e-9);
    }
  });
  it('la velocidad es la derivada de la posición', () => {
    const dt = 1;
    const m0 = eph.moon(1000);
    const m1 = eph.moon(1000 + dt);
    expect((m1.r.x - m0.r.x) / dt).toBeCloseTo(m0.v.x, 5);
    expect((m1.r.y - m0.r.y) / dt).toBeCloseTo(m0.v.y, 5);
  });
});

describe('H3 · integrador en dos cuerpos', () => {
  const eph = createEarthOnlyEphemeris();
  const energy = (s: ShipState): number => earthElements(s, 0, eph).energy;

  it('órbita circular baja: vuelve al punto de partida en un período kepleriano', () => {
    const r = R_EARTH + 400;
    const v = Math.sqrt(GM_EARTH / r);
    const period = 2 * Math.PI * Math.sqrt((r * r * r) / GM_EARTH);
    const s0: ShipState = { r: vec3(r, 0, 0), v: vec3(0, v, 0) };
    const res = integrate(s0, 0, period, eph);
    expect(distance(res.state.r, s0.r)).toBeLessThan(1e-3);
  });

  it('órbita elíptica: período entre perigeos con error < 0,1 %', () => {
    const rp = R_EARTH + 300;
    const ra = R_EARTH + 30000;
    const a = (rp + ra) / 2;
    const vp = Math.sqrt(GM_EARTH * (2 / rp - 1 / a));
    const period = 2 * Math.PI * Math.sqrt((a * a * a) / GM_EARTH);
    // Arranca apenas pasado el perigeo para detectar los dos siguientes.
    const s0 = integrate({ r: vec3(rp, 0, 0), v: vec3(0, vp, 0) }, 0, 60, eph).state;
    const res = integrateWithEvents(s0, 60, 60 + 2.2 * period, eph);
    const perigees = res.events.filter((e) => e.type === 'periapsis');
    expect(perigees.length).toBe(2);
    const measured = perigees[1].t - perigees[0].t;
    expect(Math.abs(measured - period) / period).toBeLessThan(1e-3);
    expect(Math.abs(measured - period)).toBeLessThan(1e-3);
    const apogee = res.events.find((e) => e.type === 'apoapsis');
    expect(length(apogee!.state.r)).toBeCloseTo(ra, 3);
  });

  it('energía estable en 100 vueltas', () => {
    const rp = R_EARTH + 200;
    const ra = R_EARTH + 2000;
    const a = (rp + ra) / 2;
    const vp = Math.sqrt(GM_EARTH * (2 / rp - 1 / a));
    const period = 2 * Math.PI * Math.sqrt((a * a * a) / GM_EARTH);
    const s0: ShipState = { r: vec3(rp, 0, 0), v: vec3(0, vp, 0) };
    const res = integrate(s0, 0, 100 * period, eph);
    const e0 = energy(s0);
    expect(Math.abs((energy(res.state) - e0) / e0)).toBeLessThan(1e-8);
    expect(distance(res.state.r, s0.r)).toBeLessThan(0.5);
  });
});

describe('H4 · constante de Jacobi en CR3BP', () => {
  it('se conserva sin encendidos en una trayectoria que pasa cerca de la Luna', () => {
    const eph = createCircularEphemeris(2.2);
    const e = eph.earth(0);
    const r = R_EARTH + 300;
    // Velocidad casi de escape: llega a la zona lunar.
    const v = Math.sqrt(GM_EARTH * (2 / r - 1 / 200000));
    const s0: ShipState = { r: add(e.r, vec3(r, 0, 0)), v: add(e.v, vec3(0, v, 0)) };
    const c0 = jacobiConstant(s0, 0, eph);
    let worst = 0;
    let t = 0;
    let s = s0;
    for (let i = 0; i < 40; i++) {
      const res = integrate(s, t, t + 0.25 * 86400, eph);
      s = res.state;
      t = res.t;
      worst = Math.max(worst, Math.abs((jacobiConstant(s, t, eph) - c0) / c0));
    }
    expect(worst).toBeLessThan(1e-9);
  });

  it('el resultado no depende de cómo se cortan los pasos', () => {
    const eph = createCircularEphemeris(1.0);
    const e = eph.earth(0);
    const r = R_EARTH + 300;
    const v = Math.sqrt(GM_EARTH * (2 / r - 1 / 150000));
    const s0: ShipState = { r: add(e.r, vec3(r, 0, 0)), v: add(e.v, vec3(0, v, 0)) };
    const tEnd = 2 * 86400;
    const once = integrate(s0, 0, tEnd, eph).state;
    let s = s0;
    let t = 0;
    let h: number | undefined;
    while (t < tEnd) {
      const res = integrate(s, t, Math.min(tEnd, t + 167), eph, { hInit: h });
      s = res.state;
      t = res.t;
      h = res.hNext;
    }
    expect(distance(once.r, s.r)).toBeLessThan(1e-3);
  });
});

describe('H5 · encendidos y trayectoria predicha', () => {
  const eph = createEarthOnlyEphemeris();
  it('un encendido prograde en el perigeo sube el apogeo según vis‑viva', () => {
    const r = R_EARTH + 300;
    const v = Math.sqrt(GM_EARTH / r);
    const dv = 0.5;
    const s0: ShipState = { r: vec3(r, 0, 0), v: vec3(0, v, 0) };
    const s1 = applyBurn(s0, { prograde: dv, normal: 0, radial: 0 }, eph.earth(0));
    expect(length(s1.v)).toBeCloseTo(v + dv, 12);
    // vis‑viva: v² = GM(2/r − 1/a)  →  a, y ra = 2a − rp
    const a = 1 / (2 / r - ((v + dv) * (v + dv)) / GM_EARTH);
    const raExpected = 2 * a - r;
    expect(earthElements(s1, 0, eph).ra).toBeCloseTo(raExpected, 6);
    const pred = propagate(s1, 0, 2 * Math.PI * Math.sqrt((a * a * a) / GM_EARTH), eph);
    const apo = pred.events.find((e) => e.type === 'apoapsis');
    expect(length(apo!.state.r)).toBeCloseTo(raExpected, 3);
    expect(pred.end).toBe('horizon');
    expect(pred.points.length).toBeGreaterThan(50);
  });

  it('los ejes del marco local: radial hacia afuera, normal según el momento angular', () => {
    const s0: ShipState = { r: vec3(7000, 0, 0), v: vec3(0, 7.5, 0) };
    const sr = applyBurn(s0, { prograde: 0, normal: 0, radial: 0.1 }, eph.earth(0));
    expect(sr.v.x).toBeCloseTo(0.1, 12);
    const sn = applyBurn(s0, { prograde: 0, normal: 0.1, radial: 0 }, eph.earth(0));
    expect(sn.v.z).toBeCloseTo(0.1, 12);
  });

  it('la predicción corta en la interfaz de entrada si el perigeo queda bajo', () => {
    const r = R_EARTH + 300;
    const v = Math.sqrt(GM_EARTH / r) - 0.2;
    const pred = propagate({ r: vec3(r, 0, 0), v: vec3(0, v, 0) }, 0, 6000, eph);
    expect(pred.end).toBe('ei');
    expect(pred.ei!.fpaDeg).toBeLessThan(0);
  });
});

describe('comunicaciones', () => {
  const earth = vec3(0, 0, 0);
  const moon = vec3(EARTH_MOON_DISTANCE, 0, 0);
  it('LOS solo cuando la Luna tapa la línea de vista', () => {
    expect(losClearance(vec3(EARTH_MOON_DISTANCE + 8000, 0, 0), earth, moon)).toBeLessThan(0);
    expect(losClearance(vec3(EARTH_MOON_DISTANCE + 8000, 5000, 0), earth, moon)).toBeGreaterThan(0);
    // Del lado cercano la Luna no tapa nada aunque esté alineada.
    expect(losClearance(vec3(EARTH_MOON_DISTANCE - 8000, 0, 0), earth, moon)).toBeCloseTo(8000 - R_MOON, 6);
  });
  it('red por altitud y retardo de señal', () => {
    const eph = createEarthOnlyEphemeris();
    expect(commsStatus(vec3(R_EARTH + 500, 0, 0), 0, eph).network).toBe('NSN');
    const far = commsStatus(vec3(300000, 100, 0), 0, eph);
    expect(far.network).toBe('DSN');
    expect(far.delay).toBeCloseTo((far.distance - R_EARTH) / C_LIGHT, 9);
    expect(far.delay).toBeGreaterThan(0.9);
  });
});
