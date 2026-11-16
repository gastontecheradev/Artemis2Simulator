import { APOLLO_13_RECORD_DISTANCE, BURN_LEAD_TIME, CM_SEP_PROMPT_LEAD_TIME, MET_E6_PROX_OPS_START, PUBLISHED_MET } from './constants';
import { formatDuration, formatMet, formatNumber } from './format';
import { Locale, getLocale, tr } from './i18n';
import { distance } from './math/vec3';
import { MANEUVER_TITLE } from './mission/procedures';
import { INITIAL_MET, ManeuverId, SimState, ephemerisOf } from './state';

/**
 * Mission control (CAPCOM): what Houston tells the crew at each moment.
 * Derived from the simulation state, not stored: the "go" for each maneuver, the
 * event confirmations, the loss-of-signal notices and the alarms. While
 * the Moon blocks the link nothing arrives (messages in that interval are lost, as
 * in the real flight).
 */
export type CapcomKind = 'go' | 'info' | 'caution';

export interface CapcomMessage {
  readonly t: number;
  readonly kind: CapcomKind;
  readonly text: string;
}

const EN = {
  engineStart: 'Launch team: go for main engine start. Six seconds to booster ignition.',
  liftoff: 'Liftoff of Artemis II. Orion, Houston: good roll program, the vehicle is clear of the tower.',
  maxQ: 'Orion, Houston: through max Q. Vehicle is flying as expected.',
  srbSep: 'Booster separation confirmed. Four good RS‑25s.',
  las: 'Launch abort system jettison confirmed. You are now committed to the core stage.',
  meco: 'MECO. Standing by for core stage separation.',
  coreSep: 'Core stage separation confirmed. Orion and ICPS in orbit. Welcome to space.',
  icpsGo: 'Orion, Houston: ICPS {name} is go. Ignition in {lead}.',
  icpsDone: 'Burn complete. Good burn; we will have the orbit after tracking.',
  sepGo: 'Orion, Houston: you are go for ICPS separation. The stage is safed; proximity operations are yours.',
  sepDone: 'Separation confirmed. Enjoy the view; the ICPS stays passive while you fly around it.',
  burnGo: 'Orion, Houston: you are go for {title}. TIG {tig}, Δv {dv} m/s on {system}. Configure per Procs.',
  burnDone: '{id} complete. We confirm {dv} m/s delivered.',
  tliDone: 'Orion, Houston: TLI complete. You are on your way to the Moon. Lunar closest approach predicted at {flyby}.',
  windowLost: 'Orion, Houston: we show no burn for {id}. Stand by for a new plan; the Procs page has your options.',
  otc: 'Orion, Houston: {id} window. Run the guidance (CALC) and report the Δv; expect a small correction or a no‑burn.',
  soiEnter: 'Orion, you are now inside the lunar sphere of influence. Expect loss of signal behind the Moon.',
  losSoon: 'Orion, Houston: loss of signal in about {min} minutes. See you on the other side.',
  aos: 'Orion, Houston: we have you back. Welcome around the Moon. Closest approach was {alt} km.',
  soiExit: 'You have left the lunar sphere of influence. Entry interface predicted at {ei}.',
  cmSepGo: 'Orion, Houston: entry interface in {min} minutes. You are go for CM/SM separation.',
  cmSepDone: 'Separation confirmed. Capsule attitude is yours to the entry interface.',
  ei: 'Entry interface. Expect communications blackout. Recovery forces are on station. Godspeed, Artemis II.',
  alarm: 'Houston copies the {text}. Recommend you work the procedure in Procs.',
  record: 'Orion, Houston: you have just passed the Apollo 13 distance record. Farthest humans have ever been from Earth.',
} as const;

type Key = keyof typeof EN;

const ES: Readonly<Record<Key, string>> = {
  engineStart: 'Equipo de lanzamiento: go para arranque de motores. Seis segundos para la ignición de los boosters.',
  liftoff: 'Despegue de Artemis II. Orion, Houston: buen programa de rolido, el vehículo despejó la torre.',
  maxQ: 'Orion, Houston: pasaron Max Q. El vehículo vuela como esperábamos.',
  srbSep: 'Separación de boosters confirmada. Cuatro RS‑25 en buen estado.',
  las: 'Eyección de la torre de escape confirmada. Ya están comprometidos con la etapa central.',
  meco: 'MECO. A la espera de la separación de la etapa central.',
  coreSep: 'Separación de la etapa central confirmada. Orion e ICPS en órbita. Bienvenidos al espacio.',
  icpsGo: 'Orion, Houston: el ICPS tiene go para {name}. Ignición en {lead}.',
  icpsDone: 'Encendido completo. Buen encendido; tendremos la órbita después del seguimiento.',
  sepGo: 'Orion, Houston: tienen go para separar el ICPS. La etapa está asegurada; las operaciones de proximidad son suyas.',
  sepDone: 'Separación confirmada. Disfruten la vista; el ICPS queda pasivo mientras vuelan alrededor.',
  burnGo: 'Orion, Houston: tienen go para {title}. TIG {tig}, Δv {dv} m/s con {system}. Configuren según Procs.',
  burnDone: '{id} completo. Confirmamos {dv} m/s entregados.',
  tliDone: 'Orion, Houston: TLI completo. Van camino a la Luna. Máximo acercamiento previsto a las {flyby}.',
  windowLost: 'Orion, Houston: no vemos encendido para {id}. Esperen un plan nuevo; la página Procs tiene sus opciones.',
  otc: 'Orion, Houston: ventana de {id}. Corran el guiado (CALC) e informen el Δv; esperamos una corrección chica o ningún encendido.',
  soiEnter: 'Orion, ya están dentro de la esfera de influencia lunar. Esperen pérdida de señal detrás de la Luna.',
  losSoon: 'Orion, Houston: pérdida de señal en unos {min} minutos. Nos vemos del otro lado.',
  aos: 'Orion, Houston: los tenemos de vuelta. Bienvenidos de la vuelta a la Luna. El máximo acercamiento fue de {alt} km.',
  soiExit: 'Salieron de la esfera de influencia lunar. Interfaz de entrada prevista a las {ei}.',
  cmSepGo: 'Orion, Houston: interfaz de entrada en {min} minutos. Tienen go para la separación CM/SM.',
  cmSepDone: 'Separación confirmada. La actitud de la cápsula es suya hasta la interfaz de entrada.',
  ei: 'Interfaz de entrada. Esperen corte de comunicaciones. Las fuerzas de recuperación están en posición. Buen viaje, Artemis II.',
  alarm: 'Houston copia la alarma {text}. Recomendamos trabajar el procedimiento en Procs.',
  record: 'Orion, Houston: acaban de superar el récord de distancia del Apollo 13. Nunca un ser humano estuvo tan lejos de la Tierra.',
};

const TABLES: Readonly<Record<Locale, Readonly<Record<Key, string>>>> = { en: EN, es: ES };

function say(key: Key, params: Readonly<Record<string, string | number>> = {}): string {
  return TABLES[getLocale()][key].replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

/** Intervals without link (LOS → AOS) according to the log. */
function losIntervals(s: SimState): [number, number][] {
  const out: [number, number][] = [];
  let open: number | null = null;
  for (const l of s.log) {
    if (l.text.startsWith('LOS')) open = l.t;
    else if (l.text.startsWith('AOS') && open !== null) {
      out.push([open, l.t]);
      open = null;
    }
  }
  if (open !== null) out.push([open, Infinity]);
  return out;
}

/** Houston messages up to the current instant, in order. */
export function capcomFeed(s: SimState): CapcomMessage[] {
  const now = s.t;
  const out: CapcomMessage[] = [];
  const add = (t: number, kind: CapcomKind, text: string): void => {
    if (t <= now) out.push({ t, kind, text });
  };
  const marker = (id: string): number | null => s.markers.find((m) => m.eventId === id)?.t ?? null;
  const logAt = (prefix: string): number | null => s.log.find((l) => l.text.startsWith(prefix))?.t ?? null;

  // Countdown and ascent.
  add(INITIAL_MET, 'go', say('engineStart'));
  const e1 = marker('E1');
  if (e1 !== null) add(e1 + 7, 'info', say('liftoff'));
  const maxQ = s.record.maxQ;
  if (maxQ?.logged) add(maxQ.t + 4, 'info', say('maxQ'));
  if (s.vehicle.srbSeparated) add(128 + 3, 'info', say('srbSep'));
  if (s.vehicle.lasJettisoned) add(208 + 3, 'info', say('las'));
  const meco = logAt('MECO');
  if (meco !== null) add(meco + 2, 'info', say('meco'));
  const e3 = marker('E3');
  if (e3 !== null) add(e3 + 5, 'info', say('coreSep'));

  // Automatic ICPS burns.
  for (const id of ['E4', 'E5'] as const) {
    const ab = s.autoBurns[id];
    if (ab.status === 'cancelled') continue;
    add(ab.met - BURN_LEAD_TIME, 'go', say('icpsGo', { name: `${id} · ${tr(`burn.${id}`)}`, lead: formatDuration(BURN_LEAD_TIME) }));
    const end = s.log.find((l) => l.text.startsWith(`${id} ·`) && !l.eventId);
    if (end && ab.status === 'done') add(end.t + 3, 'info', say('icpsDone'));
  }

  // ICPS separation and demo.
  if (now >= MET_E6_PROX_OPS_START) add(MET_E6_PROX_OPS_START, 'go', say('sepGo'));
  if (s.record.icpsSepAt !== null) add(s.record.icpsSepAt + 4, 'info', say('sepDone'));

  // Crew burns with a TIG.
  for (const id of ['E7', 'E8', 'E9'] as ManeuverId[]) {
    const m = s.maneuvers[id];
    if (m.tig === null) continue;
    add(m.tig - BURN_LEAD_TIME, 'go', say('burnGo', { title: MANEUVER_TITLE[id], tig: formatMet(m.tig), dv: formatNumber(m.dv.prograde * 1000, 1), system: m.system }));
    if (m.status === 'done' && m.lastExecutedAt !== null) {
      if (id === 'E9' && s.record.tliAt !== null) {
        const flyby = s.prediction?.perilune?.t ?? s.params.nominal.flybyMet;
        add(s.record.tliAt + 5, 'info', say('tliDone', { flyby: formatMet(flyby) }));
      } else {
        add(m.lastExecutedAt + 3, 'info', say('burnDone', { id, dv: formatNumber(m.dv.prograde * 1000, 1) }));
      }
    }
    if (m.status === 'missed') add(m.tig + 300, 'caution', say('windowLost', { id }));
  }

  // Corrections: windows with the published timeline offsets relative to the TLI and the flyby.
  const tli = s.record.tliAt;
  if (tli !== null) {
    const offs: [string, number][] = [
      ['OTC‑1', PUBLISHED_MET.otc1 - PUBLISHED_MET.tli],
      ['OTC‑2', PUBLISHED_MET.otc2 - PUBLISHED_MET.tli],
      ['OTC‑3', PUBLISHED_MET.otc3 - PUBLISHED_MET.tli],
    ];
    for (const [id, dt] of offs) add(tli + dt, 'go', say('otc', { id }));
  }
  const per = s.record.perilune;
  if (per) {
    const offs: [string, number][] = [
      ['RTC‑1', PUBLISHED_MET.rtc1 - PUBLISHED_MET.flyby],
      ['RTC‑2', PUBLISHED_MET.rtc2 - PUBLISHED_MET.flyby],
      ['RTC‑3', PUBLISHED_MET.rtc3 - PUBLISHED_MET.flyby],
    ];
    for (const [id, dt] of offs) add(per.t + dt, 'go', say('otc', { id }));
  }

  // Moon: sphere of influence, LOS/AOS, distance record.
  const soiIn = s.log.find((l) => !l.eventId && /sphere of influence|esfera de influencia/.test(l.text));
  if (soiIn) add(soiIn.t + 2, 'info', say('soiEnter'));
  const los = losIntervals(s);
  for (const [a, b] of los) {
    add(a - 600, 'caution', say('losSoon', { min: 10 }));
    if (Number.isFinite(b)) add(b + 2, 'info', say('aos', { alt: per ? formatNumber(per.altitude, 0) : '—' }));
  }
  const e12 = marker('E12');
  if (e12 !== null) {
    const ei = s.prediction?.ei?.t ?? s.params.nominal.eiMet;
    add(e12 + 2, 'info', say('soiExit', { ei: formatMet(ei) }));
  }
  if (s.phase === 'SOBREVUELO' || per) {
    // Apollo 13's record is broken near closest approach if the trajectory reaches that far.
    const eph = ephemerisOf(s);
    const rec = s.trail.find((p) => p.t > (tli ?? 0) + 2 * 86400 && distance(p.r, eph.earth(p.t).r) > APOLLO_13_RECORD_DISTANCE);
    if (rec) add(rec.t, 'info', say('record'));
  }

  // CM/SM separation and entry.
  if (s.oneShots.includes('cm:prompt')) {
    const promptT = s.log.find((l) => l.text.startsWith('E13 ·') && !l.eventId)?.t;
    if (promptT !== undefined) add(promptT, 'go', say('cmSepGo', { min: Math.round(CM_SEP_PROMPT_LEAD_TIME / 60) }));
  }
  if (s.record.cmSepAt !== null) add(s.record.cmSepAt + 3, 'info', say('cmSepDone'));
  if (s.record.ei) add(s.record.ei.t, 'info', say('ei'));

  // Alarms: Houston echoes them (except the LOS itself).
  for (const a of s.alarms) {
    if (a.id === 'los') continue;
    add(a.since + 2, 'caution', say('alarm', { text: a.text }));
  }

  // Without link nothing arrives.
  const linked = (t: number): boolean => !los.some(([a, b]) => t >= a && t <= b);
  return out
    .filter((m) => linked(m.t))
    .sort((p, q) => p.t - q.t);
}
