import { describe, expect, it } from 'vitest';
import { fly, withBurn } from '../scripts/lib/calibration';
import { advance, executeManeuver, produce, setManeuver } from '../src/sim/advance';
import * as cmd from '../src/sim/commands';
import {
  ENTRY_CORRIDOR,
  FLYBY_ALTITUDE_TARGET,
  MET_E4_PERIGEE_RAISE,
  MET_E5_APOGEE_RAISE,
  ORION_DV_BUDGET,
  R_EARTH,
} from '../src/sim/constants';
import { solveCorrection } from '../src/sim/guidance';
import { distance } from '../src/sim/math/vec3';
import { ascentSample, ascentState } from '../src/sim/mission/ascent';
import { MISSION_PARAMS } from '../src/sim/mission/params';
import { procedureView } from '../src/sim/mission/procedures';
import { nextEvent, timelineStatus } from '../src/sim/mission/timeline';
import { orionDvRemaining } from '../src/sim/propulsion';
import { SimState, createInitialState, ephemerisOf } from '../src/sim/state';

const P = MISSION_PARAMS;
const DAY = 86400;

/** Corre el bucle de frames como lo hace la app. `crew` actúa cuando la sim se pausa. */
function runFrames(s0: SimState, crew: (s: SimState) => SimState, maxFrames = 400000): SimState {
  let s = s0;
  for (let i = 0; i < maxFrames && !s.outcome; i++) {
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

describe('H6 · fase en órbita terrestre', () => {
  const s = fly(P, P.burns.E9.met - 1);
  const apsides = s.record.apsides;

  it('el apogeo de la órbita de inserción cae cerca de MET 00:49:52', () => {
    const apo = apsides.find((a) => a.type === 'apoapsis')!;
    expect(Math.abs(apo.t - MET_E4_PERIGEE_RAISE)).toBeLessThan(2);
  });

  it('sin E4 la nave reentra: el perigeo de inserción queda bajo la interfaz de entrada', () => {
    const noE4 = fly(withBurn(withBurn(P, 'E4', { prograde: 0 }), 'E5', { prograde: 0 }), 3 * 3600);
    expect(noE4.outcome?.kind).toBe('reentry-early');
  });

  it('E4 y E5 ocurren solos en los MET de 3.png', () => {
    const e4 = s.log.find((l) => l.eventId === 'E4')!;
    const e5 = s.log.find((l) => l.eventId === 'E5')!;
    expect(e4.t).toBe(MET_E4_PERIGEE_RAISE);
    expect(e5.t).toBe(MET_E5_APOGEE_RAISE);
    // E5 se hace en el perigeo.
    const peri = apsides.find((a) => a.type === 'periapsis' && a.t > MET_E4_PERIGEE_RAISE)!;
    expect(Math.abs(peri.t - MET_E5_APOGEE_RAISE)).toBeLessThan(2);
  });

  it('la órbita alta es estable durante el chequeo y vuelve al perigeo para el TLI', () => {
    expect(s.outcome).toBeNull();
    expect(s.phase).toBe('ORBITA_ALTA');
    const after = apsides.filter((a) => a.t > MET_E5_APOGEE_RAISE + 60);
    expect(after[0].type).toBe('apoapsis');
    expect(after[0].radius - R_EARTH).toBeGreaterThan(60000);
    // El perigeo de la órbita alta cae en el TIG del TLI (23,5 h después de E5).
    const next = fly(withBurn(P, 'E9', { prograde: 0 }), P.burns.E9.met + 600);
    const peri = next.record.apsides.find((a) => a.type === 'periapsis' && a.t > after[0].t)!;
    expect(Math.abs(peri.t - P.burns.E9.met)).toBeLessThan(2);
    expect(peri.radius - R_EARTH).toBeGreaterThan(1000);
  });
});

describe('H7 · retorno libre', () => {
  const s = fly(P);

  it('la misión completa corre sola desde E3 hasta la interfaz de entrada', () => {
    expect(s.outcome?.kind).toBe('success');
    expect(s.record.perilune!.altitude).toBeCloseTo(FLYBY_ALTITUDE_TARGET, 0);
    expect(s.record.ei!.fpaDeg).toBeGreaterThan(ENTRY_CORRIDOR.min);
    expect(s.record.ei!.fpaDeg).toBeLessThan(ENTRY_CORRIDOR.max);
    expect(s.record.ei!.fpaDeg).toBeCloseTo(ENTRY_CORRIDOR.target, 2);
    expect(s.t / DAY).toBeGreaterThan(8);
    expect(s.t / DAY).toBeLessThan(11);
    for (const id of ['E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10', 'E11', 'E12', 'E13', 'E14']) {
      expect(s.markers.some((m) => m.eventId === id)).toBe(true);
    }
  });

  it('coincide con los valores nominales guardados en params.json', () => {
    expect(s.record.perilune!.t).toBeCloseTo(P.nominal.flybyMet, 0);
    expect(s.record.ei!.t).toBeCloseTo(P.nominal.eiMet, 0);
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

  it('H9 · el Δv consumido es coherente con los encendidos', () => {
    const b = P.burns;
    const orion = b.E7.dv.prograde + b.E8.dv.prograde + b.E9.dv.prograde;
    expect(s.propulsion.orionDvUsed).toBeCloseTo(orion, 12);
    expect(s.propulsion.icpsDvUsed).toBeCloseTo(b.E4.dv.prograde + b.E5.dv.prograde, 12);
    expect(orionDvRemaining(s.propulsion)).toBeCloseTo(ORION_DV_BUDGET - orion, 12);
  });

  it('da el mismo resultado avanzando frame a frame con warp ×10000', () => {
    let f = createInitialState(P, { headless: true, autoCrew: true });
    f = cmd.setWarp(cmd.play(f), 10000);
    for (let i = 0; i < 400000 && !f.outcome; i++) f = cmd.tick(f, 1 / 60);
    expect(f.outcome?.kind).toBe('success');
    expect(f.record.perilune!.altitude).toBeCloseTo(s.record.perilune!.altitude, 1);
    expect(f.record.ei!.fpaDeg).toBeCloseTo(s.record.ei!.fpaDeg, 2);
  });
});

describe('H8 · la misión se vuela desde el panel', () => {
  it('siguiendo los procedimientos se llega al amerizaje sin WARNING', () => {
    const s = runFrames(cmd.reset(P), followProcedures);
    expect(s.outcome?.kind).toBe('success');
    expect(s.record.perilune!.altitude).toBeCloseTo(FLYBY_ALTITUDE_TARGET, 0);
    expect(s.log.filter((l) => l.level === 'WARNING')).toEqual([]);
    expect(s.maneuvers.E9.status).toBe('done');
    expect(s.record.cmSepAt).not.toBeNull();
  });

  it('la predicción tras el TLI anticipa el sobrevuelo y la entrada', () => {
    let s = createInitialState(P, { autoCrew: true });
    s = cmd.play(s);
    while (s.record.tliAt === null) s = advance(s, 600, Infinity);
    const p = s.prediction!;
    expect(p.end).toBe('ei');
    expect(p.perilune!.altitude).toBeCloseTo(FLYBY_ALTITUDE_TARGET, -1);
    expect(p.ei!.fpaDeg).toBeCloseTo(ENTRY_CORRIDOR.target, 1);
    expect(s.alarms).toEqual([]);
  });

  it('sin acción de la tripulación en el TLI: ventana perdida y la nave queda en órbita', () => {
    const idle = (s: SimState): SimState => (s.proc.activeId === 'E9' ? s : followProcedures(s));
    let s = cmd.reset(P);
    for (let i = 0; i < 400000 && s.t < 2.5 * DAY && !s.outcome; i++) {
      if (!s.clock.running) s = cmd.setWarp(cmd.play(idle(s)), 10000);
      s = cmd.tick(s, 1 / 60);
    }
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
    expect(s.propulsion.orionDvUsed).toBe(0);
    expect(s.log[s.log.length - 1].level).toBe('WARNING');
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
    expect(Math.abs(s.record.perilune!.altitude - FLYBY_ALTITUDE_TARGET)).toBeLessThan(2);
    expect(s.propulsion.auxBurns).toBe(2);
  });

  it('una RTC devuelve al corredor una trayectoria con el TLI desviado', () => {
    const off = withBurn(P, 'E9', { prograde: P.burns.E9.dv.prograde + 0.0002 });
    // Sin corrección la entrada queda fuera del corredor.
    const bad = fly(off);
    expect(bad.outcome?.kind).not.toBe('success');
    // Con una corrección un día después de salir de la esfera de influencia, vuelve a entrar.
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
    expect(s.record.ei!.fpaDeg).toBeCloseTo(ENTRY_CORRIDOR.target, 1);
  });
});

describe('ascenso guionado (E1–E3)', () => {
  const launch = (): SimState => cmd.play(createInitialState(P, { headless: true, autoCrew: true, fromLaunch: true }));

  it('sigue la tabla de 3.png y deja los eventos E1 y E2', () => {
    let s = launch();
    expect(s.phase).toBe('ASCENSO');
    expect(s.t).toBe(0);
    s = advance(s, 128, Infinity);
    expect(s.t).toBe(128);
    expect(ascentSample(128).altitude).toBeCloseTo(45.23, 2);
    expect(ascentSample(128).speed).toBeCloseTo(1.344, 3);
    expect(s.markers.map((m) => m.eventId)).toEqual(['E1', 'E2']);
    expect(s.prediction).toBeNull();
  });

  it('empalma en E3 con el estado inicial calibrado de la física', () => {
    const eph = ephemerisOf({ params: P });
    const e3 = createInitialState(P).ship;
    // La posición guionada llega al punto de inserción sin salto.
    expect(distance(ascentState(P.insertion.met, eph).r, e3.r)).toBeLessThan(1e-6);
    expect(distance(ascentState(P.insertion.met - 1, eph).r, e3.r)).toBeLessThan(10);
    let s = launch();
    s = advance(s, P.insertion.met, Infinity);
    expect(s.phase).toBe('INSERCION');
    expect(s.ship).toEqual(e3);
    expect(s.markers.some((m) => m.eventId === 'E3')).toBe(true);
  });

  it('la misión desde el lanzamiento termina igual que desde E3', () => {
    let s = launch();
    while (!s.outcome) s = advance(s, 40 * DAY, Infinity);
    const ref = fly(P);
    expect(s.outcome.kind).toBe('success');
    expect(s.record.ei!.fpaDeg).toBeCloseTo(ref.record.ei!.fpaDeg, 6);
    expect(s.record.perilune!.altitude).toBeCloseTo(ref.record.perilune!.altitude, 3);
  });
});

describe('línea de tiempo y warp', () => {
  it('el próximo evento sale del plan y, tras el TLI, de la predicción', () => {
    const start = cmd.reset(P);
    expect(nextEvent(start)).toMatchObject({ id: 'E4', t: MET_E4_PERIGEE_RAISE });
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
