import {
  APOLLO_13_RECORD_DISTANCE,
  CUBESAT_DEPLOYMENTS,
  E7_BURN_DURATION,
  EARTH_MOON_DISTANCE,
  FLYBY_ALTITUDE_TARGET,
  HEO_ORBIT,
  INSERTION_ORBIT,
  MET_E4_PERIGEE_RAISE,
  MET_E5_APOGEE_RAISE,
  MET_E6_PROX_OPS_START,
  MET_E7_DEPARTURE,
  MET_ICPS_DISPOSAL,
  MET_ICPS_SPLASHDOWN,
  MOON_ORBIT,
  POST_ARB_ORBIT,
  POST_PRM_ORBIT,
  PUBLISHED_MET,
} from '../../sim/constants';
import { dvMagnitude } from '../../sim/burns';
import { formatDuration, formatMet, formatNumber } from '../../sim/format';
import { Locale } from '../../sim/i18n';
import { MISSION_PARAMS } from '../../sim/mission/params';
import { CONFIG_AT_LIFTOFF, CUBESAT_COUNT, ENGINES, MASS, SRB_ISP, SRB_THRUST_PROFILE, dryMass, idealDv } from '../../sim/vehicle';
import { GuideId } from '../store';

/** Texto según idioma. */
const L = (locale: Locale, en: string, es: string): string => (locale === 'es' ? es : en);

export interface GuideSection {
  readonly title: string;
  readonly paragraphs?: readonly string[];
  readonly bullets?: readonly string[];
  readonly table?: { readonly head: readonly string[]; readonly rows: readonly (readonly string[])[] };
  /** Enlaces externos (se abren en otra pestaña). */
  readonly links?: readonly GuideLink[];
  /** Nota al pie: fuentes o aclaraciones. */
  readonly note?: string;
}

export interface GuideLink {
  readonly label: string;
  readonly url: string;
  /** Qué trae, en una línea. */
  readonly desc: string;
}

export interface GuideContent {
  readonly title: string;
  readonly sections: readonly GuideSection[];
}

const t = (kg: number): string => formatNumber(kg / 1000, 1);
const kn = (n: number): string => formatNumber(n / 1000, 0);
const ms = (kms: number): string => formatNumber(kms * 1000, 0);
const P = MISSION_PARAMS;

const SRC_SLS = 'NASA, "Space Launch System Reference Guide for Artemis II" (SLS‑5558, 2025)';
const SRC_A2 = 'NASA, "Artemis II Reference Guide" (2026)';
const SRC_TL = 'NASA, "Artemis II Overview Timeline" (18/03/2026)';
const SRC_OBJ = 'NASA, "Artemis II Priorities and Objectives" (2026)';
const SRC_JPL = 'NASA/JPL, Horizons ephemeris system';

// ---------- Objetivo ----------

function objective(l: Locale): GuideContent {
  return {
    title: L(l, 'MISSION OBJECTIVE', 'OBJETIVO DE LA MISIÓN'),
    sections: [
      {
        title: L(l, 'Primary goal', 'Meta principal'),
        paragraphs: [
          L(
            l,
            'Artemis II is a crewed test flight in lunar space: four astronauts fly around the Moon on a free-return trajectory and come back. It is the first crewed flight of the SLS rocket and the Orion spacecraft, and the first human flight beyond low Earth orbit since Apollo 17 in 1972.',
            'Artemis II es un vuelo de prueba tripulado en el espacio lunar: cuatro astronautas rodean la Luna en una trayectoria de retorno libre y vuelven. Es el primer vuelo tripulado del cohete SLS y de la nave Orion, y el primer vuelo humano más allá de la órbita baja desde el Apollo 17, en 1972.',
          ),
          L(
            l,
            'The mission does not land on the Moon. Its job is to prove that the spacecraft keeps a crew alive and in control in deep space, so that the following missions can land.',
            'La misión no aluniza. Su trabajo es demostrar que la nave mantiene a una tripulación viva y con control en el espacio profundo, para que las misiones siguientes puedan aterrizar.',
          ),
        ],
      },
      {
        title: L(l, 'Mission priorities (in order)', 'Prioridades de la misión (en orden)'),
        bullets: [
          L(l, 'Crew: sustain the flight crew in the flight environment and through their return to Earth.', 'Tripulación: sostener a la tripulación en el entorno de vuelo y hasta su regreso a la Tierra.'),
          L(l, 'Systems: demonstrate the systems and operations essential to a crewed lunar campaign.', 'Sistemas: demostrar los sistemas y operaciones esenciales para una campaña lunar tripulada.'),
          L(l, 'Hardware and data: retrieve the flight hardware and the data to assess performance.', 'Hardware y datos: recuperar el hardware de vuelo y los datos para evaluar el desempeño.'),
          L(l, 'Emergency operations: demonstrate the emergency capabilities, such as abort and rescue, as far as practical.', 'Operaciones de emergencia: demostrar las capacidades de emergencia, como abortos y rescate, en lo que sea practicable.'),
          L(l, 'Data and subsystems: complete additional objectives to verify subsystems and validate data.', 'Datos y subsistemas: completar objetivos adicionales para verificar subsistemas y validar datos.'),
        ],
      },
      {
        title: L(l, 'What the crew tests', 'Qué prueba la tripulación'),
        bullets: [
          L(l, 'Manual proximity operations with the spent upper stage (ICPS) as a docking target: handling qualities, thruster plume effects and bearing measurements with the docking camera.', 'Operaciones de proximidad manuales con la etapa superior gastada (ICPS) como blanco de acoplamiento: manejo, efecto de los propulsores y medición de dirección con la cámara de acoplamiento.'),
          L(l, "The service module propulsion upgrades, the life support system (including a metabolic stress test), the suits, the exercise equipment and the radiation shelter.", 'Las mejoras de propulsión del módulo de servicio, el sistema de soporte vital (con una prueba de carga metabólica), los trajes, el equipo de ejercicio y el refugio contra radiación.'),
          L(l, 'Communications and navigation: the Near Space and Deep Space Networks, an optical communications demonstration, GPS, star trackers and optical navigation.', 'Comunicaciones y navegación: las redes Near Space y Deep Space, una demostración de comunicaciones ópticas, GPS, rastreadores de estrellas y navegación óptica.'),
          L(l, 'The heat shield during re-entry from cislunar velocity, the parachutes, the uprighting system and the crew recovery.', 'El escudo térmico en la reentrada a velocidad cislunar, los paracaídas, el sistema de enderezado y la recuperación de la tripulación.'),
          L(l, `Four CubeSats ride in the stage adapter: ${CUBESAT_DEPLOYMENTS.map((c) => c.name).join(', ')}.`, `Cuatro CubeSats viajan en el adaptador de la etapa: ${CUBESAT_DEPLOYMENTS.map((c) => c.name).join(', ')}.`),
        ],
      },
      {
        title: L(l, 'In the simulator', 'En el simulador'),
        paragraphs: [
          L(
            l,
            `Your objective is the same flight: reach the high orbit, fly around the Moon at ${formatNumber(FLYBY_ALTITUDE_TARGET)} km above the far side and come back into the entry corridor. Every burn is yours to confirm, arm and fire; physics decides the rest.`,
            `Tu objetivo es el mismo vuelo: llegar a la órbita alta, rodear la Luna a ${formatNumber(FLYBY_ALTITUDE_TARGET)} km sobre la cara oculta y volver dentro del corredor de entrada. Cada encendido lo confirmás, armás y accionás vos; el resto lo decide la física.`,
          ),
        ],
        note: SRC_OBJ,
      },
    ],
  };
}

// ---------- Etapas ----------

function stages(l: Locale): GuideContent {
  const n = P.nominal;
  const row = (id: string, what: string, published: string, model: string): string[] => [id, what, published, model];
  const met = (s: number): string => formatMet(s);
  return {
    title: L(l, 'MISSION STAGES', 'ETAPAS DE LA MISIÓN'),
    sections: [
      {
        title: L(l, 'Event by event', 'Evento por evento'),
        paragraphs: [
          L(
            l,
            'The 15 numbered events follow NASA’s mission map. "Published" is NASA’s pre-launch estimate; "model" is what this simulator computes with its physics (the ascent and the ICPS burns are automatic, the rest is flown by the crew).',
            'Los 15 eventos numerados siguen el mapa de misión de NASA. "Publicado" es la estimación previa al lanzamiento de NASA; "modelo" es lo que calcula este simulador con su física (el ascenso y los encendidos del ICPS son automáticos, el resto lo vuela la tripulación).',
          ),
        ],
        table: {
          head: ['#', L(l, 'Event', 'Evento'), L(l, 'Published MET', 'MET publicado'), L(l, 'Model MET', 'MET del modelo')],
          rows: [
            row('E1', L(l, 'Liftoff from LC‑39B. The RS‑25 engines start 6 s before T‑0; the boosters at T‑0.', 'Despegue desde LC‑39B. Los RS‑25 arrancan 6 s antes de T‑0; los boosters en T‑0.'), '000/00:00:00', '000/00:00:00'),
            row('E2', L(l, 'Booster separation at 2:08; launch abort system jettison at 3:28.', 'Separación de boosters a 2:08; eyección de la torre de escape a 3:28.'), '000/00:02:08', '000/00:02:08'),
            row('E3', L(l, `MECO at 8:06 and core stage separation into a ${formatNumber(INSERTION_ORBIT.perigee)} × ${formatNumber(INSERTION_ORBIT.apogee)} km orbit.`, `MECO a 8:06 y separación de la etapa central en una órbita de ${formatNumber(INSERTION_ORBIT.perigee)} × ${formatNumber(INSERTION_ORBIT.apogee)} km.`), '000/00:08:18', '000/00:08:18'),
            row('E4', L(l, `ICPS perigee raise (~30 s) to ${formatNumber(POST_PRM_ORBIT.perigee)} km.`, `Elevación del perigeo con el ICPS (~30 s) a ${formatNumber(POST_PRM_ORBIT.perigee)} km.`), met(MET_E4_PERIGEE_RAISE), met(P.burns.E4.met)),
            row('E5', L(l, `ICPS apogee raise (~20 min), perigee left at zero so the stage re-enters by itself. The SLS guide gives a ${formatNumber(POST_ARB_ORBIT.apogee)} km apogee; the model sizes it so the TLI falls on the timeline’s time (a slightly lower apogee).`, `Elevación del apogeo con el ICPS (~20 min), con el perigeo en cero para que la etapa reentre sola. La guía del SLS da un apogeo de ${formatNumber(POST_ARB_ORBIT.apogee)} km; el modelo lo ajusta para que el TLI caiga en el horario del cronograma (un apogeo algo más bajo).`), met(MET_E5_APOGEE_RAISE), met(P.burns.E5.met)),
            row('E6', L(l, 'Orion/ICPS separation and ~90 min of manual proximity operations.', 'Separación Orion/ICPS y ~90 min de operaciones de proximidad manuales.'), met(MET_E6_PROX_OPS_START), met(MET_E6_PROX_OPS_START)),
            row('E7', L(l, `Orion departure burn: ${E7_BURN_DURATION} s on the auxiliary thrusters. Then the ICPS does its disposal burn (${met(MET_ICPS_DISPOSAL)}), releases the CubeSats and falls into the Pacific at ${met(MET_ICPS_SPLASHDOWN)}.`, `Encendido de salida de Orion: ${E7_BURN_DURATION} s con los auxiliares. Después el ICPS hace su encendido de eliminación (${met(MET_ICPS_DISPOSAL)}), libera los CubeSats y cae al Pacífico a las ${met(MET_ICPS_SPLASHDOWN)}.`), met(MET_E7_DEPARTURE), met(P.burns.E7.met)),
            row('E8', L(l, `Orion perigee raise at apogee, to ${formatNumber(HEO_ORBIT.perigee)} km (${ms(P.burns.E8.dv.prograde)} m/s).`, `Elevación del perigeo de Orion en el apogeo, a ${formatNumber(HEO_ORBIT.perigee)} km (${ms(P.burns.E8.dv.prograde)} m/s).`), `~${met(PUBLISHED_MET.prb)}`, met(P.burns.E8.met)),
            row('E9', L(l, `Translunar injection at perigee: ${ms(P.burns.E9.dv.prograde)} m/s with the main engine.`, `Inyección translunar en el perigeo: ${ms(P.burns.E9.dv.prograde)} m/s con el motor principal.`), met(PUBLISHED_MET.tli), met(P.burns.E9.met)),
            row('E10', L(l, 'Outbound transit with up to three correction burns (OTC‑1, 2 and 3).', 'Tránsito de ida con hasta tres correcciones (OTC‑1, 2 y 3).'), `${met(PUBLISHED_MET.otc1)} …`, '—'),
            row('E11', L(l, `Lunar flyby at ${formatNumber(FLYBY_ALTITUDE_TARGET)} km over the far side, out of contact; farthest humans ever (past Apollo 13’s ${formatNumber(APOLLO_13_RECORD_DISTANCE)} km).`, `Sobrevuelo lunar a ${formatNumber(FLYBY_ALTITUDE_TARGET)} km sobre la cara oculta, sin contacto; el punto más lejano alcanzado por humanos (más allá de los ${formatNumber(APOLLO_13_RECORD_DISTANCE)} km del Apollo 13).`), met(PUBLISHED_MET.flyby), met(n.flybyMet)),
            row('E12', L(l, 'Return transit with up to three corrections (RTC‑1, 2 and 3).', 'Tránsito de regreso con hasta tres correcciones (RTC‑1, 2 y 3).'), `${met(PUBLISHED_MET.rtc1)} …`, '—'),
            row('E13', L(l, 'Crew module / service module separation, 20 min before entry.', 'Separación módulo de tripulación / módulo de servicio, 20 min antes de la entrada.'), met(PUBLISHED_MET.cmSep), met(n.eiMet - 1200)),
            row('E14', L(l, `Entry interface at 121.9 km and ~${formatNumber(n.eiSpeed, 1)} km/s.`, `Interfaz de entrada a 121,9 km y ~${formatNumber(n.eiSpeed, 1)} km/s.`), met(PUBLISHED_MET.ei), met(n.eiMet)),
            row('E15', L(l, 'Parachutes and splashdown in the Pacific off San Diego (not simulated).', 'Paracaídas y amerizaje en el Pacífico frente a San Diego (no se simula).'), met(PUBLISHED_MET.splashdown), '—'),
          ],
        },
        note: L(
          l,
          `Entry interface: ${met(PUBLISHED_MET.ei)} published versus ${met(n.eiMet)} in the model. Splashdown, which is not simulated, comes ${formatDuration(PUBLISHED_MET.splashdown - PUBLISHED_MET.ei)} later: ${formatDuration(PUBLISHED_MET.splashdown)} in total. The Moon moves on its real orbit for April 2026, close to apogee (about ${formatNumber(Math.round(MOON_ORBIT.a * (1 + MOON_ORBIT.e) / 100) * 100)} km from Earth at the flyby, against an average of ${formatNumber(EARTH_MOON_DISTANCE)} km), and the high orbit is sized so the TLI falls on the published time. The remaining difference is within the model’s simplifications: a single orbital plane and a Keplerian Moon. Sources: ${SRC_SLS}; ${SRC_TL}; ${SRC_JPL}.`,
          `Interfaz de entrada: ${met(PUBLISHED_MET.ei)} publicado contra ${met(n.eiMet)} en el modelo. El amerizaje, que no se simula, llega ${formatDuration(PUBLISHED_MET.splashdown - PUBLISHED_MET.ei)} después: ${formatDuration(PUBLISHED_MET.splashdown)} en total. La Luna recorre su órbita real de abril de 2026, cerca del apogeo (a unos ${formatNumber(Math.round(MOON_ORBIT.a * (1 + MOON_ORBIT.e) / 100) * 100)} km de la Tierra en el sobrevuelo, contra ${formatNumber(EARTH_MOON_DISTANCE)} km de promedio), y la órbita alta está ajustada para que el TLI caiga en el horario publicado. La diferencia que queda entra en las simplificaciones del modelo: un único plano orbital y una Luna kepleriana. Fuentes: ${SRC_SLS}; ${SRC_TL}; ${SRC_JPL}.`,
        ),
      },
    ],
  };
}

// ---------- Presupuesto ----------

function budget(l: Locale): GuideContent {
  // Capacidad del ICPS con el apilado que queda después de separar la etapa central.
  const afterCore = { ...CONFIG_AT_LIFTOFF, srbSeparated: true, lasJettisoned: true, coreSeparated: true };
  const stackAtE4 = dryMass(afterCore) + MASS.icpsProp + MASS.esmProp + MASS.cmProp;
  const icpsCapability = idealDv(ENGINES.RL10, stackAtE4, MASS.icpsProp);
  const icpsPlanned = dvMagnitude(P.burns.E4.dv) + dvMagnitude(P.burns.E5.dv);
  // Orion sola, con el módulo de servicio lleno.
  const orionFull = dryMass({ ...afterCore, icpsSeparated: true }) + MASS.esmProp + MASS.cmProp;
  const orionCapability = idealDv(ENGINES.MAIN, orionFull, MASS.esmProp);
  const orionPlanned = P.burns.E7.dv.prograde + P.burns.E8.dv.prograde + P.burns.E9.dv.prograde;
  return {
    title: L(l, 'BUDGET', 'PRESUPUESTO'),
    sections: [
      {
        title: L(l, 'Δv budget: what each stage can give and what the plan spends', 'Presupuesto de Δv: lo que puede dar cada etapa y lo que gasta el plan'),
        paragraphs: [
          L(
            l,
            'In spaceflight the budget that matters is velocity change (Δv). Each stage can deliver a fixed amount, set by the rocket equation from its propellant, its mass and the exhaust speed of its engine. What is not spent on the plan is the margin for corrections and contingencies.',
            'En vuelo espacial el presupuesto que importa es el cambio de velocidad (Δv). Cada etapa puede entregar una cantidad fija, que sale de la ecuación del cohete con su propelente, su masa y la velocidad de escape de su motor. Lo que no gasta el plan es el margen para correcciones y contingencias.',
          ),
        ],
        table: {
          head: [L(l, 'Stage', 'Etapa'), L(l, 'Propellant', 'Propelente'), L(l, 'Capability', 'Capacidad'), L(l, 'Planned', 'Planeado'), L(l, 'Margin', 'Margen')],
          rows: [
            [L(l, 'Boosters (×2)', 'Boosters (×2)'), `${t(MASS.srbProp)} t`, L(l, '126 s of burn', '126 s de quemado'), L(l, 'all of it, during ascent', 'todo, en el ascenso'), '—'],
            [L(l, 'Core stage', 'Etapa central'), `${t(MASS.coreProp)} t`, L(l, '486 s of burn', '486 s de quemado'), L(l, 'to orbit (a few % remain at MECO)', 'hasta la órbita (queda un pequeño % en MECO)'), '—'],
            ['ICPS', `${t(MASS.icpsProp)} t`, `${ms(icpsCapability)} m/s`, `${ms(icpsPlanned)} m/s (E4 + E5)`, `${ms(icpsCapability - icpsPlanned)} m/s`],
            [L(l, 'Orion service module', 'Módulo de servicio de Orion'), `${t(MASS.esmProp)} t`, `${ms(orionCapability)} m/s`, `${ms(orionPlanned)} m/s (E7 + E8 + E9)`, `${ms(orionCapability - orionPlanned)} m/s`],
          ],
        },
        note: L(
          l,
          'Capabilities are ideal Δv (rocket equation, no gravity losses). Orion’s margin pays for the trajectory corrections (OTC/RTC), attitude control and any off-nominal recovery: that is what you spend when you fire the auxiliaries or the RCS by hand.',
          'Las capacidades son Δv ideal (ecuación del cohete, sin pérdidas por gravedad). El margen de Orion paga las correcciones de trayectoria (OTC/RTC), el control de actitud y cualquier recuperación fuera de lo nominal: eso es lo que gastás cuando encendés los auxiliares o el RCS a mano.',
        ),
      },
      {
        title: L(l, 'Mass budget at liftoff', 'Presupuesto de masa al despegue'),
        table: {
          head: [L(l, 'Element', 'Elemento'), L(l, 'Mass', 'Masa')],
          rows: [
            [L(l, 'Two boosters, loaded', 'Dos boosters cargados'), `${t(MASS.srbDry + MASS.srbProp)} t`],
            [L(l, 'Core stage with engines and propellant', 'Etapa central con motores y propelente'), `${t(MASS.coreDry + MASS.coreProp)} t`],
            [L(l, 'Stage adapter (LVSA)', 'Adaptador de etapas (LVSA)'), `${t(MASS.lvsa)} t`],
            [L(l, 'ICPS, loaded', 'ICPS cargado'), `${t(MASS.icpsDry + MASS.icpsProp)} t`],
            [L(l, `Orion stage adapter and ${CUBESAT_COUNT} CubeSats`, `Adaptador de Orion y ${CUBESAT_COUNT} CubeSats`), `${t(MASS.osa + CUBESAT_COUNT * MASS.cubesat)} t`],
            [L(l, 'Orion: crew module, service module, adapter, panels and abort system', 'Orion: módulo de tripulación, módulo de servicio, adaptador, paneles y torre de escape'), `${t(MASS.cm + MASS.cmProp + MASS.smDry + MASS.esmProp + MASS.spacecraftAdapter + MASS.fairing + MASS.las)} t`],
          ],
        },
        note: L(l, `Published: SLS 2,604 t fueled plus Orion. Sources: ${SRC_SLS}; ${SRC_A2}.`, `Publicado: SLS 2.604 t cargado más Orion. Fuentes: ${SRC_SLS}; ${SRC_A2}.`),
      },
      {
        title: L(l, 'Money', 'Dinero'),
        paragraphs: [
          L(
            l,
            'NASA’s Office of Inspector General estimated the production and operations cost of each of the first four Artemis launches (SLS, Orion and ground systems) at about 4.1 billion dollars, and the whole Artemis program at about 93 billion dollars from fiscal year 2012 through 2025.',
            'La Oficina del Inspector General de NASA estimó el costo de producción y operación de cada uno de los cuatro primeros lanzamientos Artemis (SLS, Orion y sistemas de tierra) en unos 4.100 millones de dólares, y el programa Artemis completo en unos 93.000 millones de dólares entre los años fiscales 2012 y 2025.',
          ),
        ],
        note: L(l, 'Source: NASA OIG, "NASA’s Management of the Artemis Missions", IG‑22‑003, November 2021. These figures are not part of the simulation.', 'Fuente: NASA OIG, "NASA’s Management of the Artemis Missions", IG‑22‑003, noviembre de 2021. Estas cifras no forman parte de la simulación.'),
      },
    ],
  };
}

// ---------- Energía ----------

function power(l: Locale): GuideContent {
  return {
    title: L(l, 'POWER MANAGEMENT', 'MANEJO DE ENERGÍA'),
    sections: [
      {
        title: L(l, 'Where the power comes from', 'De dónde sale la energía'),
        bullets: [
          L(l, 'The European service module carries four solar array wings that generate about 11 kW. They deploy right after the core stage separates and are angled for the ICPS burns.', 'El módulo de servicio europeo lleva cuatro alas de paneles solares que generan unos 11 kW. Se despliegan apenas se separa la etapa central y se orientan para los encendidos del ICPS.'),
          L(l, 'Orion runs on a 120 V bus with batteries in the crew module. The batteries cover launch (before the arrays deploy), eclipses and the final descent after the service module is gone.', 'Orion funciona con un bus de 120 V y baterías en el módulo de tripulación. Las baterías cubren el lanzamiento (antes de desplegar los paneles), los eclipses y el descenso final, cuando el módulo de servicio ya no está.'),
          L(l, 'On the pad the vehicle switches from ground power to internal power during the terminal count (T‑10 min).', 'En la plataforma el vehículo pasa de la energía de tierra a la interna durante la cuenta terminal (T‑10 min).'),
        ],
      },
      {
        title: L(l, 'How the crew manages it', 'Cómo lo maneja la tripulación'),
        bullets: [
          L(l, 'Attitude is the main tool. During most of the cruise Orion holds a "tail to Sun" attitude (called Bias −XSI in the flight plan) so the arrays see the Sun and the thermal loads stay balanced.', 'La actitud es la herramienta principal. En casi todo el crucero Orion mantiene una actitud "cola al Sol" (llamada Bias −XSI en el plan de vuelo) para que los paneles vean el Sol y las cargas térmicas queden equilibradas.'),
          L(l, 'Burns interrupt it: the spacecraft turns to the burn attitude a few minutes before ignition and goes back afterwards.', 'Los encendidos la interrumpen: la nave gira a la actitud del encendido unos minutos antes de la ignición y vuelve después.'),
          L(l, 'The flight plan includes a test with the arrays in full shadow during the first day, to characterize the batteries, and the lunar flyby itself happens partly in the Moon’s shadow.', 'El plan de vuelo incluye una prueba con los paneles en sombra total durante el primer día, para caracterizar las baterías, y el propio sobrevuelo lunar ocurre en parte en la sombra de la Luna.'),
        ],
      },
      {
        title: L(l, 'In the simulator', 'En el simulador'),
        paragraphs: [
          L(
            l,
            'The simulator does not model the electrical system: no battery charge, no eclipse accounting and no power page. The numbers above are NASA’s published figures, shown here for context only. The one energy-related readout on the panel is the skin temperature, a simplified radiative estimate.',
            'El simulador no modela el sistema eléctrico: no hay carga de baterías, ni contabilidad de eclipses, ni página de energía. Los números de arriba son los publicados por NASA y están solo como contexto. El único dato relacionado con energía en el panel es la temperatura de la piel, una estimación radiativa simplificada.',
          ),
        ],
        note: L(l, `Sources: ${SRC_A2}; ${SRC_TL}.`, `Fuentes: ${SRC_A2}; ${SRC_TL}.`),
      },
    ],
  };
}

// ---------- Nave ----------

function ship(l: Locale): GuideContent {
  const srbMax = Math.max(...SRB_THRUST_PROFILE.map(([, f]) => f));
  return {
    title: L(l, 'ABOUT THE SPACECRAFT', 'ACERCA DE LA NAVE'),
    sections: [
      {
        title: L(l, 'The stack, bottom to top', 'El apilado, de abajo hacia arriba'),
        table: {
          head: [L(l, 'Part', 'Parte'), L(l, 'Mass', 'Masa'), L(l, 'Propulsion', 'Propulsión'), L(l, 'Role', 'Función')],
          rows: [
            [L(l, 'Solid rocket boosters (×2)', 'Boosters de combustible sólido (×2)'), `${t((MASS.srbDry + MASS.srbProp) / 2)} t ${L(l, 'each', 'cada uno')}`, `${kn(srbMax * 1000)} kN ${L(l, 'max each', 'máx. cada uno')}, Isp ${formatNumber(SRB_ISP, 0)} s`, L(l, 'About 75 % of the liftoff thrust for two minutes.', 'Cerca del 75 % del empuje del despegue durante dos minutos.')],
            [L(l, 'Core stage', 'Etapa central'), `${t(MASS.coreDry)} t + ${t(MASS.coreProp)} t`, `4 RS‑25, ${kn(ENGINES.RS25.thrustVac / 4)} kN ${L(l, 'each in vacuum at 109 %', 'cada uno en vacío al 109 %')}`, L(l, 'Burns for eight minutes, from the pad to orbit.', 'Quema ocho minutos, de la plataforma a la órbita.')],
            [L(l, 'Stage adapter (LVSA)', 'Adaptador de etapas (LVSA)'), `${t(MASS.lvsa)} t`, '—', L(l, 'Cone between the core stage and the ICPS; falls with the core.', 'Cono entre la etapa central y el ICPS; cae con la etapa.')],
            ['ICPS', `${t(MASS.icpsDry)} t + ${t(MASS.icpsProp)} t`, `RL10C‑2, ${kn(ENGINES.RL10.thrustVac)} kN, Isp ${formatNumber(ENGINES.RL10.ispVac, 1)} s`, L(l, 'Two burns to the high orbit; then disposal.', 'Dos encendidos hasta la órbita alta; después, eliminación.')],
            [L(l, 'Orion stage adapter', 'Adaptador de Orion'), `${t(MASS.osa)} t`, '—', L(l, `Holds the ${CUBESAT_COUNT} CubeSats.`, `Aloja los ${CUBESAT_COUNT} CubeSats.`)],
            [L(l, 'Service module (ESA)', 'Módulo de servicio (ESA)'), `${t(MASS.smDry)} t + ${t(MASS.esmProp)} t`, `${L(l, 'Main', 'Principal')} ${kn(ENGINES.MAIN.thrustVac)} kN · 8 aux ${ENGINES.AUX.thrustVac / 8} N · 24 RCS 222 N`, L(l, 'Propulsion, power, water and air for the crew. Separated before entry.', 'Propulsión, energía, agua y aire para la tripulación. Se separa antes de la entrada.')],
            [L(l, 'Crew module', 'Módulo de tripulación'), `${t(MASS.cm)} t`, `12 RCS ${ENGINES.CMRCS.thrustVac / 2} N`, L(l, 'The capsule: four seats, heat shield and parachutes. The only part that comes back.', 'La cápsula: cuatro asientos, escudo térmico y paracaídas. Lo único que vuelve.')],
            [L(l, 'Launch abort system', 'Torre de escape'), `${t(MASS.las)} t`, L(l, 'Abort motor 1,779 kN', 'Motor de aborto 1.779 kN'), L(l, 'Pulls the capsule away in an ascent emergency; jettisoned at 3:28.', 'Arranca la cápsula en una emergencia del ascenso; se eyecta a 3:28.')],
          ],
        },
        note: L(
          l,
          `Height 98 m, 2,604 t at liftoff (SLS) and 36,787 kN of launch thrust. Sources: ${SRC_SLS}; ${SRC_A2}. Values marked as assumptions in the code (Isp of the small thrusters, drag coefficient, capsule RCS propellant) are not NASA data.`,
          `Altura 98 m, 2.604 t al despegue (SLS) y 36.787 kN de empuje al despegue. Fuentes: ${SRC_SLS}; ${SRC_A2}. Los valores marcados como supuestos en el código (Isp de los propulsores chicos, coeficiente de arrastre, propelente del RCS de la cápsula) no son datos de NASA.`,
        ),
      },
      {
        title: L(l, 'What changes along the flight', 'Qué cambia a lo largo del vuelo'),
        bullets: [
          L(l, 'Liftoff: full stack, 98 m tall. Boosters off at 2:08, abort tower and panels at 3:28, core stage at 8:18.', 'Despegue: apilado completo, 98 m de alto. Boosters fuera a 2:08, torre y paneles a 3:28, etapa central a 8:18.'),
          L(l, 'Orbit: Orion plus ICPS, solar arrays deployed. The ICPS leaves at 3 h 23 min with the adapter and the CubeSats.', 'Órbita: Orion más ICPS, paneles desplegados. El ICPS se va a las 3 h 23 min con el adaptador y los CubeSats.'),
          L(l, 'Cruise: Orion alone, about 26 t. The main engine, the auxiliaries and the RCS share the service module tanks.', 'Crucero: Orion sola, unas 26 t. El motor principal, los auxiliares y el RCS comparten los tanques del módulo de servicio.'),
          L(l, 'Entry: the capsule alone, about 10 t, steering with its own RCS.', 'Entrada: la cápsula sola, unas 10 t, orientándose con su propio RCS.'),
        ],
      },
    ],
  };
}

// ---------- Documentación de NASA ----------

function docs(l: Locale): GuideContent {
  return {
    title: L(l, 'NASA DOCUMENTATION', 'DOCUMENTACIÓN DE NASA'),
    sections: [
      {
        title: L(l, 'Mission pages', 'Páginas de la misión'),
        links: [
          {
            label: 'Artemis II Press Kit',
            url: 'https://www.nasa.gov/artemis-ii-press-kit/',
            desc: L(l, 'Mission overview, crew, timeline and media resources.', 'Resumen de la misión, tripulación, cronograma y recursos para prensa.'),
          },
          {
            label: 'Space Launch System Gallery',
            url: 'https://www.nasa.gov/gallery/space-launch-system-gallery/',
            desc: L(l, 'Photos of the SLS rocket.', 'Fotos del cohete SLS.'),
          },
          {
            label: 'How to Fly NASA’s Orion Spacecraft',
            url: 'https://www.nasa.gov/missions/artemis/orion/how-to-fly-nasas-orion-spacecraft/',
            desc: L(l, 'The cockpit, its displays and its controls, explained by NASA.', 'La cabina, sus pantallas y sus controles, explicados por NASA.'),
          },
        ],
      },
      {
        title: L(l, 'Reference guides (PDF)', 'Guías de referencia (PDF)'),
        links: [
          {
            label: 'Artemis II Reference Guide',
            url: 'https://www.nasa.gov/wp-content/uploads/2026/01/a2-reference-guide-012825.pdf',
            desc: L(l, 'Orion, the crew and the mission objectives.', 'Orion, la tripulación y los objetivos de la misión.'),
          },
          {
            label: 'Space Launch System Reference Guide for Artemis II',
            url: 'https://www.nasa.gov/wp-content/uploads/2026/01/sls-5558-artemis-ii-sls-reference-guide-final-review-508-012026.pdf',
            desc: L(l, 'Masses, engines, booster thrust curve and the ascent event table.', 'Masas, motores, curva de empuje de los boosters y tabla de eventos del ascenso.'),
          },
          {
            label: 'Orion Reference Guide (2022)',
            url: 'https://www.nasa.gov/wp-content/uploads/2023/02/orion-reference-guide-111022.pdf',
            desc: L(l, 'Orion’s systems in detail. Written before Artemis I: its Artemis II flight profile is outdated.', 'Los sistemas de Orion en detalle. Es anterior a Artemis I: su perfil de vuelo de Artemis II está desactualizado.'),
          },
        ],
        note: L(
          l,
          'External links to nasa.gov; they open in a new tab. The simulator’s vehicle and mission data come mostly from these guides, cited in each number. This project is not affiliated with or endorsed by NASA.',
          'Enlaces externos a nasa.gov; se abren en otra pestaña. Los datos del vehículo y de la misión del simulador salen sobre todo de estas guías, citadas en cada número. Este proyecto no está afiliado ni avalado por NASA.',
        ),
      },
    ],
  };
}

const BUILDERS: Readonly<Record<GuideId, (l: Locale) => GuideContent>> = { objective, stages, budget, power, ship, docs };

export const guideContent = (id: GuideId, locale: Locale): GuideContent => BUILDERS[id](locale);
