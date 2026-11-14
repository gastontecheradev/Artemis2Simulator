import { describe, expect, it } from 'vitest';
import { fly, flyFrom, withBurn } from '../scripts/lib/calibration';
import { advance, executeManeuver, powerInputOf, produce, setManeuver } from '../src/sim/advance';
import { airVelocity } from '../src/sim/atmosphere';
import * as cmd from '../src/sim/commands';
import {
  ENTRY_CORRIDOR,
  FLYBY_ALTITUDE_TARGET,
  INSERTION_ALTITUDE,
  INSERTION_SPEED_REL,
  MECO_ALTITUDE,
  MET_E4_PERIGEE_RAISE,
  MET_E5_APOGEE_RAISE,
  R_EARTH,
  TLI_HALF_BURN,
} from '../src/sim/constants';
import { solveCorrection } from '../src/sim/guidance';
import { angleBetween, length, normalize, sub } from '../src/sim/math/vec3';
import { ASCENT_SEQUENCE } from '../src/sim/mission/ascent';
import { MISSION_PARAMS } from '../src/sim/mission/params';
import { procedureView } from '../src/sim/mission/procedures';
import { nextEvent, timelineStatus } from '../src/sim/mission/timeline';
import { forces } from '../src/sim/power';
import { SimState, altitudeOf, createInitialState, ephemerisOf } from '../src/sim/state';
import { ENGINES, FULL_TANKS, G0, MASS, TANK, burnDuration, totalMass } from '../src/sim/vehicle';

const P = MISSION_PARAMS;
const DAY = 86400;
const S = ASCENT_SEQUENCE;

const launch = (): SimState => createInitialState(P, { headless: true, autoCrew: true });
/** Velocidad relativa a la Tierra en rotación (la de las tablas de ascenso). */
const speedRel = (s: SimState): number => length(sub(s.ship.v, airVelocity(s.ship.r, ephemerisOf(s).earth(s.t))));

/** Corre el bucle de frames como lo hace la app. `crew` actúa cuando la sim se pausa. */
function runFrames(s0: SimState, crew: (s: SimState) => SimState, until = Infinity, maxFrames = 400000): SimState {
  let s = s0;
  for (let i = 0; i < maxFrames && !s.outcome && s.t < until; i++) {
    if (!s.clock.running) s = cmd.setWarp(cmd.play(crew(s)), 10000);
    s = cmd.tick(s, 1 / 60);
  }
  return s;
}

/** Tripulación que sigue los procedimientos con los interruptores del panel. */
function followProcedures(s: SimState): SimState {
  // Como una tripulación real: no actúa hasta que el primer paso (la espera) esté cumplido.
  if (!procedureView(s, s.proc.activeId).steps[0].done) return s;
  switch (s.proc.activeId) {
    case 'SEP_ICPS':
      return cmd.fireIcpsSeparation(cmd.setSwitch(s, 'icpsSepArm', true));
    case 'SEP_CM':
      return cmd.fireCmSeparation(cmd.setSwitch(s, 'cmSepArm', true));
    case 'E7':
      return cmd.fireEngine(cmd.confirmDv(cmd.setSwitch(s, 'auxArm', true)), 'AUX');
    case 'E8':
    case 'E9':
      return cmd.fireEngine(cmd.confirmDv(cmd.setSwitch(s, 'mainArm', true)), 'MAIN');
    default:
      return s;
  }
}

describe('ascenso simulado (E1–E3)', () => {
  it('el cohete despega con sus motores y masas reales y reproduce los datos publicados', () => {
    let s = flyFrom(launch(), S.pitchStart);
    // Torre despejada: 468 ft y 70 mph publicados.
    expect(altitudeOf(s)).toBeGreaterThan(0.08);
    expect(altitudeOf(s)).toBeLessThan(0.2);
    expect(speedRel(s)).toBeCloseTo(0.031, 2);
    // Separación de los boosters: 45,2 km y 1,34 km/s publicados (no son objetivo del ajuste).
    s = flyFrom(s, S.srbSeparation);
    expect(s.vehicle.srbSeparated).toBe(true);
    expect(Math.abs(altitudeOf(s) - 45.23)).toBeLessThan(8);
    expect(Math.abs(speedRel(s) - 1.344)).toBeLessThan(0.15);
    expect(s.propulsion.prop[TANK.SRB]).toBe(0);
    // MECO y separación de la etapa central: los tres datos que sí ajusta el guiado.
    s = flyFrom(s, S.meco);
    expect(altitudeOf(s)).toBeCloseTo(MECO_ALTITUDE, 3);
    expect(s.propulsion.prop[TANK.CORE]).toBeGreaterThan(0);
    s = flyFrom(s, S.coreSeparation);
    expect(s.phase).toBe('INSERCION');
    expect(s.record.insertion!.altitude).toBeCloseTo(INSERTION_ALTITUDE, 3);
    expect(s.record.insertion!.speedRel).toBeCloseTo(INSERTION_SPEED_REL, 5);
    // La velocidad inercial es mayor: el dato publicado es relativo a la Tierra en rotación.
    expect(s.record.insertion!.speed - INSERTION_SPEED_REL).toBeGreaterThan(0.35);
    expect(s.markers.map((m) => m.eventId)).toEqual(['E1', 'E2', 'E3']);
  });

  it('Max Q cae en el primer minuto y medio, y la aceleración respeta el límite de los RS‑25', () => {
    let s = flyFrom(launch(), 100);
    const q = s.record.maxQ!;
    expect(q.t).toBeGreaterThan(40);
    expect(q.t).toBeLessThan(90);
    expect(q.q).toBeGreaterThan(15000);
    expect(q.q).toBeLessThan(45000);
    expect(s.log.some((l) => l.text.startsWith('Max Q'))).toBe(true);
    // Cerca del final del quemado la masa es chica: sin el límite pasaría de 4 g.
    s = flyFrom(s, 470);
    const f = forces(powerInputOf(s)!, s.t, s.ship.r, s.ship.v, s.propulsion.prop);
    expect(f.thrustAccel).toBeCloseTo(P.ascent.gLimit, 3);
    expect(f.thrustAccel / G0).toBeLessThan(3.2);
  });

  it('en la plataforma la masa es la de despegue publicada y el empuje supera al peso', () => {
    const s = launch();
    expect(totalMass(s.vehicle, s.propulsion.prop) / 1e6).toBeCloseTo(2.61, 1);
    const f = forces(powerInputOf(s)!, 0, s.ship.r, s.ship.v, s.propulsion.prop);
    expect(f.thrustAccel / G0).toBeGreaterThan(1.2);
    expect(f.thrustAccel / G0).toBeLessThan(1.7);
  });

  it('con un guiado malo el cohete no llega a la órbita', () => {
    const bad = flyFrom(createInitialState({ ...P, ascent: { ...P.ascent, kickDeg: 25 } }, { headless: true, autoCrew: true }), 3000);
    expect(['crash', 'reentry-early']).toContain(bad.outcome?.kind);
  });
});

describe('H6 · fase en órbita terrestre', () => {
  const s = fly(P, P.burns.E9.met - 1);
  const apsides = s.record.apsides;

  it('sin E4 la nave reentra: el perigeo de inserción queda bajo la interfaz de entrada', () => {
    const noE4 = fly(withBurn(withBurn(P, 'E4', { prograde: 0 }), 'E5', { prograde: 0 }), 4 * 3600);
    expect(noE4.outcome?.kind).toBe('reentry-early');
  });

  it('E4 y E5 encienden solos en los MET publicados y entregan el Δv pedido', () => {
    const e4 = s.log.find((l) => l.eventId === 'E4')!;
    const e5 = s.log.find((l) => l.eventId === 'E5')!;
    expect(e4.t).toBe(MET_E4_PERIGEE_RAISE);
    expect(e5.t).toBe(MET_E5_APOGEE_RAISE);
    expect(s.propulsion.icpsBurns).toBe(2);
    expect(s.propulsion.icpsDvUsed).toBeCloseTo(P.burns.E4.dv.prograde + P.burns.E5.dv.prograde, 6);
    expect(s.autoBurns.E5.status).toBe('done');
  });

  it('el encendido de E5 dura lo que dice la ecuación del cohete y queda centrado en el perigeo', () => {
    const before = fly(P, MET_E5_APOGEE_RAISE);
    const mass = totalMass(before.vehicle, before.propulsion.prop);
    const duration = burnDuration(ENGINES.RL10, mass, P.burns.E5.dv.prograde);
    expect(before.burn!.tEnd - before.burn!.tStart).toBeCloseTo(duration, 6);
    expect(duration).toBeGreaterThan(600);
    // Sin E5, el perigeo de esa órbita cae en el medio del encendido.
    const coast = fly(withBurn(P, 'E5', { prograde: 0 }), MET_E5_APOGEE_RAISE + 3000);
    const peri = coast.record.apsides.find((a) => a.type === 'periapsis' && a.t > MET_E4_PERIGEE_RAISE + 600)!;
    expect(Math.abs(peri.t - (MET_E5_APOGEE_RAISE + duration / 2))).toBeLessThan(5);
  });

  it('la órbita alta es estable durante el chequeo y vuelve al perigeo para el TLI', () => {
    expect(s.outcome).toBeNull();
    expect(s.phase).toBe('ORBITA_ALTA');
    const high = apsides.find((a) => a.type === 'apoapsis' && a.t > MET_E5_APOGEE_RAISE + 3000)!;
    expect(high.radius - R_EARTH).toBeGreaterThan(60000);
    const next = fly(withBurn(P, 'E9', { prograde: 0 }), P.burns.E9.met + 1200);
    const peri = next.record.apsides.find((a) => a.type === 'periapsis' && a.t > high.t)!;
    expect(Math.abs(peri.t - (P.burns.E9.met + TLI_HALF_BURN))).toBeLessThan(5);
    expect(peri.radius - R_EARTH).toBeGreaterThan(300);
  });
});

describe('H7 · retorno libre', () => {
  const s = fly(P);

  it('la misión completa corre sola desde la plataforma hasta la interfaz de entrada', () => {
    expect(s.outcome?.kind).toBe('success');
    expect(s.record.perilune!.altitude).toBeCloseTo(FLYBY_ALTITUDE_TARGET, 0);
    expect(s.record.ei!.fpaDeg).toBeGreaterThan(ENTRY_CORRIDOR.min);
    expect(s.record.ei!.fpaDeg).toBeLessThan(ENTRY_CORRIDOR.max);
    expect(s.record.ei!.fpaDeg).toBeCloseTo(ENTRY_CORRIDOR.target, 2);
    expect(s.t / DAY).toBeGreaterThan(8);
    expect(s.t / DAY).toBeLessThan(11);
    for (const id of ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10', 'E11', 'E12', 'E13', 'E14']) {
      expect(s.markers.some((m) => m.eventId === id)).toBe(true);
    }
  });

  it('coincide con los valores nominales guardados en params.json', () => {
    expect(s.record.perilune!.t).toBeCloseTo(P.nominal.flybyMet, 0);
    expect(s.record.ei!.t).toBeCloseTo(P.nominal.eiMet, 0);
    expect(s.record.insertion!.speed).toBeCloseTo(P.nominal.insertionSpeed, 6);
  });

  it('H9 · LOS durante el sobrevuelo y AOS al salir', () => {
    const los = s.log.find((l) => l.text.startsWith('LOS'))!;
    const aos = s.log.find((l) => l.text.startsWith('AOS'))!;
    const flyby = s.record.perilune!.t;
    expect(los.t).toBeLessThan(flyby);
    expect(aos.t).toBeGreaterThan(flyby);
    expect(aos.t - los.t).toBeLessThan(2 * 3600);
    expect(s.trail.some((p) => p.net === 'LOS')).toBe(true);
  });

  it('H9 · el Δv entregado y el propelente gastado son coherentes con los encendidos', () => {
    const b = P.burns;
    const orion = b.E7.dv.prograde + b.E8.dv.prograde + b.E9.dv.prograde;
    expect(s.propulsion.orionDvUsed).toBeCloseTo(orion, 6);
    expect(s.propulsion.mainBurns).toBe(2);
    expect(s.propulsion.auxBurns).toBe(1);
    // Antes de separar el módulo de servicio, el propelente gastado es el de la ecuación del cohete.
    const pre = fly(P, P.nominal.eiMet - 2 * 3600);
    const used = FULL_TANKS[TANK.ESM] - pre.propulsion.prop[TANK.ESM];
    const m0 = MASS.cm + MASS.smDry + MASS.esmProp;
    const ideal = m0 * (1 - Math.exp((-orion * 1000) / (G0 * ENGINES.MAIN.ispVac)));
    expect(used / ideal).toBeGreaterThan(0.98);
    expect(used / ideal).toBeLessThan(1.02);
  });

  it('da el mismo resultado avanzando frame a frame con warp ×10000', () => {
    let f = cmd.setWarp(cmd.play(launch()), 10000);
    for (let i = 0; i < 400000 && !f.outcome; i++) f = cmd.tick(f, 1 / 60);
    expect(f.outcome?.kind).toBe('success');
    expect(f.record.perilune!.altitude).toBeCloseTo(s.record.perilune!.altitude, 0);
    expect(f.record.ei!.fpaDeg).toBeCloseTo(s.record.ei!.fpaDeg, 1);
  });
});

describe('H8 · la misión se vuela desde el panel', () => {
  it('siguiendo los procedimientos se llega al amerizaje sin WARNING', () => {
    const s = runFrames(cmd.reset(P), followProcedures);
    expect(s.outcome?.kind).toBe('success');
    expect(s.record.perilune!.altitude).toBeCloseTo(FLYBY_ALTITUDE_TARGET, -1);
    expect(s.log.filter((l) => l.level === 'WARNING')).toEqual([]);
    expect(s.maneuvers.E9.status).toBe('done');
    expect(s.record.cmSepAt).not.toBeNull();
  });

  it('la predicción tras el TLI anticipa el sobrevuelo y la entrada', () => {
    let s = cmd.play(createInitialState(P, { autoCrew: true }));
    while (s.record.tliAt === null) s = advance(s, 600, Infinity);
    const p = s.prediction!;
    expect(p.end).toBe('ei');
    expect(p.perilune!.altitude).toBeCloseTo(FLYBY_ALTITUDE_TARGET, -1);
    expect(p.ei!.fpaDeg).toBeCloseTo(ENTRY_CORRIDOR.target, 1);
    expect(s.alarms).toEqual([]);
  });

  it('sin acción de la tripulación en el TLI: ventana perdida y la nave queda en órbita', () => {
    const idle = (s: SimState): SimState => (s.proc.activeId === 'E9' ? s : followProcedures(s));
    const s = runFrames(cmd.reset(P), idle, 2.5 * DAY);
    expect(s.outcome).toBeNull();
    expect(s.phase).toBe('ORBITA_ALTA');
    expect(s.maneuvers.E9.status).toBe('missed');
    expect(s.alarms.some((a) => a.id === 'missed:E9' && a.level === 'WARNING')).toBe(true);
  });

  it('los motores de Orion no encienden mientras siga acoplado al ICPS', () => {
    let s = cmd.reset(P);
    s = cmd.selectProcedure(s, 'MAN');
    s = cmd.adjustDv(cmd.toggleAdvanced(s), 0.01);
    s = cmd.fireEngine(cmd.confirmDv(cmd.setSwitch(s, 'mainArm', true)), 'MAIN');
    expect(s.burn).toBeNull();
    expect(s.log[s.log.length - 1].level).toBe('WARNING');
  });

  it('bajar la guarda con el motor encendido corta el encendido', () => {
    let s = flyFrom(createInitialState(P, { headless: true, autoCrew: true }), P.burns.E9.met + 100);
    expect(s.burn?.id).toBe('E9');
    expect(s.maneuvers.E9.status).toBe('burning');
    // La tripulación automática no arma el interruptor: se arma y se baja para cortar.
    s = cmd.setSwitch(cmd.setSwitch(s, 'mainArm', true), 'mainArm', false);
    expect(s.burn).toBeNull();
    expect(s.maneuvers.E9.status).toBe('done');
    const delivered = s.propulsion.mainDvUsed - P.burns.E8.dv.prograde;
    expect(delivered).toBeGreaterThan(0.05);
    expect(delivered).toBeLessThan(P.burns.E9.dv.prograde * 0.5);
  });
});

describe('partes que se desprenden', () => {
  it('boosters, torre de escape y etapa central siguen su propia trayectoria y caen', () => {
    let s = cmd.play(createInitialState(P, { autoCrew: true }));
    s = flyFrom(s, S.srbSeparation + 1);
    const boosters = s.debris.filter((d) => d.kind === 'SRB');
    expect(boosters.length).toBe(2);
    // Se alejan uno para cada lado.
    expect(length(sub(boosters[0].ship.r, boosters[1].ship.r))).toBeGreaterThan(0.012);
    s = flyFrom(s, S.lasJettison + 1);
    expect(s.debris.some((d) => d.kind === 'LAS')).toBe(true);
    s = flyFrom(s, S.coreSeparation + 60);
    const core = s.debris.find((d) => d.kind === 'CORE')!;
    expect(length(sub(core.ship.r, s.ship.r))).toBeGreaterThan(0.05);
    // Los boosters caen en minutos; la etapa central reentra en la primera vuelta.
    s = flyFrom(s, 3 * 3600);
    expect(s.debris.some((d) => d.kind === 'SRB')).toBe(false);
    expect(s.debris.some((d) => d.kind === 'CORE')).toBe(false);
    expect(s.log.some((l) => l.text.startsWith('Los boosters caen'))).toBe(true);
    expect(s.log.some((l) => l.text.startsWith('La etapa central reingresa'))).toBe(true);
  });

  it('el ICPS queda en la órbita alta después de la separación', () => {
    let s = cmd.play(createInitialState(P, { autoCrew: true }));
    s = flyFrom(s, 6 * 3600);
    const icps = s.debris.find((d) => d.kind === 'ICPS')!;
    expect(icps).toBeDefined();
    expect(length(sub(icps.ship.r, ephemerisOf(s).earth(icps.t).r)) - R_EARTH).toBeGreaterThan(10000);
  });
});

describe('actitud y controladores manuales', () => {
  // Orion ya separada del ICPS, en crucero.
  const base = fly(P, 4 * 3600);

  it('durante el ascenso el piloto automático no se puede sacar de AUTO', () => {
    const s = cmd.setDapMode(flyFrom(launch(), 60), 'MAN');
    expect(s.attitude.mode).toBe('AUTO');
  });

  it('en AUTO la nave apunta al prograde; con el RHC en MAN rota al ritmo comandado', () => {
    const eph = ephemerisOf(base);
    const prograde = normalize(sub(base.ship.v, eph.earth(base.t).v));
    expect(angleBetween(base.attitude.dir, prograde)).toBeLessThan(0.02);
    let s = cmd.setRhc(cmd.setDapMode(base, 'MAN'), 1);
    s = flyFrom(s, base.t + 30);
    // 3°/s durante 30 s = 90°.
    expect(angleBetween(s.attitude.dir, base.attitude.dir)).toBeCloseTo(Math.PI / 2, 2);
    s = flyFrom(cmd.setRhc(s, 0), s.t + 30);
    expect(angleBetween(s.attitude.dir, base.attitude.dir)).toBeCloseTo(Math.PI / 2, 2);
  });

  it('el THC empuja con el RCS sobre el eje de la nave y gasta propelente', () => {
    const coast = flyFrom(base, base.t + 100);
    const pushed = flyFrom(cmd.setThc(cmd.setDapMode(base, 'INRTL'), 1), base.t + 100);
    const dv = sub(pushed.ship.v, coast.ship.v);
    // 880 N sobre ~26,5 t durante 100 s ≈ 3,3 m/s.
    expect(length(dv) * 1000).toBeGreaterThan(3);
    expect(length(dv) * 1000).toBeLessThan(3.7);
    expect(angleBetween(normalize(dv), base.attitude.dir)).toBeLessThan(0.02);
    expect(pushed.propulsion.prop[TANK.ESM]).toBeLessThan(coast.propulsion.prop[TANK.ESM]);
    expect(pushed.propulsion.rcsDvUsed).toBeGreaterThan(0.003);
  });

  it('un encendido con la nave mal orientada empuja para donde apunta la nave', () => {
    // Nave girada 180° y actitud fija: el encendido "prograde" de E7 frena en vez de acelerar.
    let s = flyFrom(cmd.setRhc(cmd.setDapMode(base, 'MAN'), 1), base.t + 60);
    s = cmd.setDapMode(cmd.setRhc(s, 0), 'INRTL');
    const good = fly(P, P.burns.E7.met + 60);
    const wrong = flyFrom(s, P.burns.E7.met + 60);
    expect(wrong.maneuvers.E7.status).toBe('done');
    const eph = ephemerisOf(good);
    const vGood = length(sub(good.ship.v, eph.earth(good.t).v));
    const vWrong = length(sub(wrong.ship.v, eph.earth(wrong.t).v));
    expect((vGood - vWrong) * 1000).toBeGreaterThan(1.5);
  });
});

describe('guiado de correcciones', () => {
  it('una OTC recupera la altitud de sobrevuelo con el TLI desviado', () => {
    const off = withBurn(P, 'E9', { prograde: P.burns.E9.dv.prograde + 0.0003 });
    expect(Math.abs(fly(off, P.nominal.flybyMet + DAY).record.perilune!.altitude - FLYBY_ALTITUDE_TARGET)).toBeGreaterThan(50);
    let s = fly(off, P.burns.E9.met + DAY);
    expect(s.phase).toBe('TRANSITO_IDA');
    const res = solveCorrection(s, 'flyby', 'radial');
    expect(res.ok).toBe(true);
    expect(Math.abs(res.dv)).toBeLessThan(0.05);
    s = produce(s, (d) => {
      setManeuver(d, 'E10', { dv: { prograde: 0, normal: 0, radial: res.dv } });
      executeManeuver(d, 'E10');
    });
    while (!s.record.perilune && !s.outcome) s = advance(s, DAY, Infinity);
    // El guiado supone un impulso instantáneo y el encendido real dura: queda un error chico.
    expect(Math.abs(s.record.perilune!.altitude - FLYBY_ALTITUDE_TARGET)).toBeLessThan(25);
    expect(s.propulsion.auxBurns).toBe(2);
  });

  it('una RTC devuelve al corredor una trayectoria con el TLI desviado', () => {
    const off = withBurn(P, 'E9', { prograde: P.burns.E9.dv.prograde + 0.0002 });
    // Sin corrección la entrada queda fuera del corredor.
    const bad = fly(off, P.nominal.eiMet + DAY);
    expect(bad.outcome?.kind).not.toBe('success');
    // Con una corrección un día y medio después del sobrevuelo, vuelve a entrar.
    let s = fly(off, P.nominal.flybyMet + 1.5 * DAY);
    expect(s.phase).toBe('REGRESO');
    const res = solveCorrection(s, 'entry', 'radial');
    expect(res.ok).toBe(true);
    expect(Math.abs(res.dv)).toBeLessThan(0.05);
    s = produce(s, (d) => {
      setManeuver(d, 'E12', { dv: { prograde: 0, normal: 0, radial: res.dv } });
      executeManeuver(d, 'E12');
    });
    while (!s.outcome) s = advance(s, DAY, Infinity);
    expect(s.outcome.kind).toBe('success');
    expect(Math.abs(s.record.ei!.fpaDeg - ENTRY_CORRIDOR.target)).toBeLessThan(0.5);
  });
});

describe('línea de tiempo y warp', () => {
  it('el próximo evento sale del plan y, tras el TLI, de la predicción', () => {
    const start = cmd.reset(P);
    expect(nextEvent(start)).toMatchObject({ id: 'E2', t: 128 });
    let s = cmd.play(createInitialState(P, { autoCrew: true }));
    while (s.record.tliAt === null) s = advance(s, 600, Infinity);
    const next = nextEvent(s)!;
    expect(next.id).toBe('E11');
    expect(next.t).toBeCloseTo(P.nominal.flybyMet, -2);
  });

  it('al terminar la misión todos los eventos figuran como hechos', () => {
    const rows = timelineStatus(fly(P));
    expect(rows.length).toBe(15);
    expect(rows.every((r) => r.done)).toBe(true);
  });

  it('el warp baja a ×10 antes de E4 y vuelve solo al valor anterior', () => {
    let s = cmd.setWarp(cmd.play(cmd.reset(P)), 1000);
    let min = Infinity;
    for (let i = 0; i < 100000 && s.t < MET_E4_PERIGEE_RAISE + 60; i++) {
      s = cmd.tick(s, 1 / 60);
      min = Math.min(min, s.clock.warp);
    }
    expect(min).toBe(10);
    expect(s.clock.warp).toBe(1000);
    expect(s.warpRestore).toBeNull();
  });
});
