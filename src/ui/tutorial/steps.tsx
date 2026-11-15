import { BURN_LEAD_TIME, MET_E6_PROX_OPS_START } from '../../sim/constants';
import { Locale } from '../../sim/i18n';
import { SimState } from '../../sim/state';

export interface TourStep {
  /** Valor de `data-tour` del elemento a señalar. Sin esto, el cartel va centrado. */
  readonly target?: string;
  readonly title: string;
  readonly body: JSX.Element;
  /** Paso de acción: se completa solo cuando la simulación cumple esta condición. */
  readonly until?: (s: SimState) => boolean;
}

type Parts = readonly { readonly name: string; readonly text: string }[];

/** Diagrama del vehículo con sus partes numeradas. */
function VehicleDiagram({ parts }: { parts: Parts }): JSX.Element {
  return (
    <div className="tour-diagram">
      <svg viewBox="0 0 120 190" className="tour-rocket">
        <path d="M 60 4 L 63 26 L 57 26 Z M 57 26 H 63 L 68 46 H 52 Z" className="part on" />
        <path d="M 52 46 H 68 L 70 58 H 50 Z" className="part on" />
        <rect x="50" y="58" width="20" height="14" className="part on" />
        <rect x="49" y="72" width="22" height="26" className="part on" />
        <path d="M 49 98 H 71 L 76 108 V 178 H 44 V 108 Z" className="part core" />
        <rect x="32" y="112" width="9" height="70" rx="3" className="part on" />
        <rect x="79" y="112" width="9" height="70" rx="3" className="part on" />
        {[
          [1, 68, 18],
          [2, 74, 52],
          [3, 76, 65],
          [4, 77, 85],
          [5, 82, 140],
          [6, 22, 146],
        ].map(([n, x, y]) => (
          <g key={n} transform={`translate(${x} ${y})`}>
            <circle r="6" className="tour-pin" />
            <text y="2.6" className="tour-pin-n">{n}</text>
          </g>
        ))}
      </svg>
      <ol className="tour-parts">
        {parts.map((p) => (
          <li key={p.name}>
            <b>{p.name}</b> {p.text}
          </li>
        ))}
      </ol>
    </div>
  );
}

function MissionDiagram({ items }: { items: Parts }): JSX.Element {
  return (
    <ol className="tour-mission">
      {items.map((p) => (
        <li key={p.name}>
          <b>{p.name}</b> {p.text}
        </li>
      ))}
    </ol>
  );
}

const e7 = (s: SimState): SimState['maneuvers']['E7'] => s.maneuvers.E7;
const fired = (s: SimState): boolean => ['committed', 'burning', 'done'].includes(e7(s).status);

const PARTS: Readonly<Record<Locale, Parts>> = {
  en: [
    { name: 'Launch abort system (LAS).', text: 'Pulls the capsule away from the rocket if something fails during ascent. Jettisoned at 3 min 28 s.' },
    { name: 'Crew module (CM).', text: 'The capsule where the four astronauts travel. It is the only part that comes back.' },
    { name: 'Service module (SM).', text: "Orion's main engine, thrusters, tanks and solar arrays. Separated before entry." },
    { name: 'Upper stage (ICPS).', text: 'One RL10 engine that lifts Orion to the high orbit. Separated at 3 h 23 min.' },
    { name: 'Core stage.', text: 'Four RS‑25 engines burning for eight minutes. Separated at 8 min 18 s.' },
    { name: 'Boosters.', text: 'Two solid rocket boosters giving most of the liftoff thrust. Separated at 2 min 8 s.' },
  ],
  es: [
    { name: 'Torre de escape (LAS).', text: 'Arranca la cápsula del cohete si algo falla en el ascenso. Se eyecta a los 3 min 28 s.' },
    { name: 'Módulo de tripulación (CM).', text: 'La cápsula donde viajan los cuatro astronautas. Es lo único que vuelve.' },
    { name: 'Módulo de servicio (SM).', text: 'Motor principal, propulsores, tanques y paneles solares de Orion. Se separa antes de la entrada.' },
    { name: 'Etapa superior (ICPS).', text: 'Un motor RL10 que sube a Orion a la órbita alta. Se separa a las 3 h 23 min.' },
    { name: 'Etapa central.', text: 'Cuatro motores RS‑25 que queman durante ocho minutos. Se separa a los 8 min 18 s.' },
    { name: 'Boosters.', text: 'Dos cohetes de combustible sólido que dan casi todo el empuje del despegue. Se separan a los 2 min 8 s.' },
  ],
};

const MISSION: Readonly<Record<Locale, Parts>> = {
  en: [
    { name: 'E1–E3 · Ascent.', text: 'Eight minutes to orbit, flown by the rocket itself.' },
    { name: 'E4–E5 · High orbit.', text: 'The ICPS fires twice, also on its own, and leaves Orion in a 25-hour orbit.' },
    { name: 'E6–E8 · Checkout.', text: 'Orion separates from the ICPS and the crew performs its first burns.' },
    { name: 'E9 · Translunar injection.', text: 'The burn that sends the spacecraft to the Moon.' },
    { name: 'E10–E12 · Outbound, flyby and return.', text: 'Almost four days out, the pass behind the Moon without signal, and almost four days back.' },
    { name: 'E13–E15 · Entry.', text: 'The capsule separates from the service module and enters the atmosphere.' },
  ],
  es: [
    { name: 'E1–E3 · Ascenso.', text: 'Ocho minutos hasta la órbita. Lo vuela el cohete solo.' },
    { name: 'E4–E5 · Órbita alta.', text: 'El ICPS enciende dos veces, también solo, y deja a Orion en una órbita de 25 horas.' },
    { name: 'E6–E8 · Chequeo.', text: 'Orion se separa del ICPS y la tripulación hace sus primeros encendidos.' },
    { name: 'E9 · Inyección translunar.', text: 'El encendido que manda la nave hacia la Luna.' },
    { name: 'E10–E12 · Ida, sobrevuelo y regreso.', text: 'Casi cuatro días de ida, la vuelta por detrás de la Luna sin señal, y casi cuatro de regreso.' },
    { name: 'E13–E15 · Entrada.', text: 'La cápsula se separa del módulo de servicio y entra a la atmósfera.' },
  ],
};

const STEPS_EN = (): TourStep[] => [
  {
    title: 'GUIDED TUTORIAL',
    body: (
      <>
        <p>First a tour of the spacecraft and the panel. Then you will lift off, separate the upper stage and perform your first burn.</p>
        <p>Steps with an action advance by themselves when you do it. You can exit at any time.</p>
      </>
    ),
  },
  { title: 'THE ROCKET AND THE SPACECRAFT', body: <VehicleDiagram parts={PARTS.en} /> },
  { title: 'THE MISSION', body: <MissionDiagram items={MISSION.en} /> },
  {
    target: 'status',
    title: 'STATUS BAR',
    body: (
      <p>
        Mission elapsed time (MET) and flight day, the phase, the communications network, the simulation speed and the countdown to the next event. On the right, the{' '}
        <b>Master Alarm</b>: it lights with every alarm and goes out with a click.
      </p>
    ),
  },
  {
    target: 'du',
    title: 'DISPLAY AND KEYS',
    body: (
      <>
        <p>Each display shows two pages. The <b>top</b> keys choose the upper page and the <b>bottom</b> keys the lower one. The <b>side</b> keys run the actions of the page.</p>
        <p><b>TRAJ</b> trajectory · <b>PFD</b> attitude and forces · <b>PROCS</b> procedures · <b>PROP</b> propulsion · <b>COMM</b> communications · <b>TL</b> timeline.</p>
      </>
    ),
  },
  {
    target: 'switches',
    title: 'SWITCHES',
    body: (
      <p>
        Critical switches have a <b>guard</b>. It is always two steps: lift the guard to arm and then actuate the lever. Lowering the guard disarms, and if the engine is firing it cuts it off.
      </p>
    ),
  },
  {
    target: 'flight-controls',
    title: 'FLIGHT CONTROL',
    body: (
      <>
        <p><b>DAP</b> is the autopilot: AUTO orients the spacecraft by itself, INRTL holds the attitude and MAN leaves it to you.</p>
        <p><b>RHC</b> rotates the spacecraft and <b>THC</b> pushes it forward or backwards with the small thrusters. They act while you hold them.</p>
      </>
    ),
  },
  {
    target: 'mcc',
    title: 'MISSION CONTROL',
    body: <p>Houston talks to you here: go/no-go calls, burn times and warnings. When the Moon blocks the link, the window goes quiet until signal is reacquired.</p>,
  },
  {
    target: 'time',
    title: 'TIME',
    body: <p>Play, pause and simulation speed. The mission lasts more than eight days: without the warp it never ends. The simulation pauses by itself before each of your actions.</p>,
  },
  {
    target: 'view-2d',
    title: '2D MAP',
    body: <p>A fixed map of the Earth‑Moon system seen from above, in the rotating frame: the Earth and the Moon stay still and the spacecraft moves along the faint nominal plan.</p>,
  },
  {
    target: 'view-3d',
    title: '3D VIEW',
    body: <p>The spacecraft up close and at real scale. Here you can watch the boosters, the launch abort system and each stage come off. Drag to orbit the camera. The inset in the corner shows the Earth vicinity, seen from above.</p>,
  },
  {
    target: 'time',
    title: 'LIFTOFF',
    body: <p>Press <b>PLAY</b>. The RS‑25 engines start six seconds before T‑0; at T‑0 the boosters ignite and the rocket leaves the pad.</p>,
    until: (s) => s.clock.running && s.t > 0,
  },
  {
    target: 'view-3d',
    title: 'BOOSTERS',
    body: <p>The rocket climbs vertically and starts to tilt at 7 seconds. Set the warp to <b>×10</b> and watch the booster separation at 2 min 8 s.</p>,
    until: (s) => s.vehicle.srbSeparated,
  },
  {
    target: 'du',
    title: 'TO ORBIT',
    body: <p>The core stage remains. On the <b>PFD</b> page you can see the acceleration: the engines throttle down to stay under the g limit. At 8 min 18 s it separates and you are in orbit.</p>,
    until: (s) => s.vehicle.coreSeparated,
  },
  {
    target: 'time',
    title: 'HIGH ORBIT',
    body: <p>Now the ICPS fires twice on its own. Raise the warp to <b>×100</b> or <b>×1000</b> and let it run.</p>,
    until: (s) => s.phase === 'ORBITA_ALTA',
  },
  {
    target: 'time',
    title: 'WAIT FOR THE SEPARATION',
    body: <p>At 3 h 23 min the window opens to separate Orion from the ICPS. Keep a high warp: the simulation pauses by itself when it arrives.</p>,
    until: (s) => s.t >= MET_E6_PROX_OPS_START || s.vehicle.icpsSeparated,
  },
  {
    target: 'switches',
    title: 'ARM THE SEPARATION',
    body: <p>Your first action. Lift the <b>guard</b> of <b>ICPS SEP</b>.</p>,
    until: (s) => s.switches.icpsSepArm || s.vehicle.icpsSeparated,
  },
  {
    target: 'switches',
    title: 'SEPARATE',
    body: <p>Now actuate the ICPS SEP <b>lever</b>. In the 3D view you will see Orion alone, with its solar arrays deployed.</p>,
    until: (s) => s.vehicle.icpsSeparated,
  },
  {
    target: 'time',
    title: 'WAIT FOR THE FIRST BURN',
    body: <p>Press <b>PLAY</b> with a high warp. Two minutes before the E7 burn the simulation pauses and the spacecraft orients itself.</p>,
    until: (s) => s.t >= (e7(s).tig ?? 0) - BURN_LEAD_TIME || fired(s),
  },
  {
    target: 'du',
    title: 'CONFIRM THE ΔV',
    body: <p>The <b>PROCS</b> page shows procedure E7 with the current step in magenta. Press the <b>CONF ΔV</b> key, at the lower right of that page.</p>,
    until: (s) => e7(s).confirmed || fired(s),
  },
  {
    target: 'switches',
    title: 'ARM THE ENGINE',
    body: <p>Lift the <b>guard</b> of <b>AUX THR</b>, the auxiliary thrusters.</p>,
    until: (s) => s.switches.auxArm || fired(s),
  },
  {
    target: 'switches',
    title: 'FIRE',
    body: <p>Actuate the AUX THR <b>lever</b>. The burn is committed: the engines will fire by themselves at the planned time (TIG).</p>,
    until: fired,
  },
  {
    target: 'time',
    title: 'IGNITION',
    body: <p>Press <b>PLAY</b>. At TIG the thrusters fire for two minutes, as in the real flight, and shut down by themselves.</p>,
    until: (s) => e7(s).status === 'done',
  },
  {
    title: 'FROM HERE ON, IT IS YOURS',
    body: (
      <>
        <p>Every burn works the same way: wait for the window, confirm the Δv, lift the guard and actuate. Two remain: <b>E8</b> and the <b>TLI</b>, which sends you to the Moon.</p>
        <p>Along the way, the <b>CALC</b> key in PROCS computes trajectory corrections. Before entry you have to separate the service module with <b>CM/SM SEP</b>.</p>
        <p>The PROCS page always tells you what comes next.</p>
      </>
    ),
  },
];

const STEPS_ES = (): TourStep[] => [
  {
    title: 'TUTORIAL GUIADO',
    body: (
      <>
        <p>Primero un recorrido por la nave y el panel. Después vas a despegar, separar la etapa superior y hacer tu primer encendido.</p>
        <p>Los pasos con una acción avanzan solos cuando la hacés. Podés salir cuando quieras.</p>
      </>
    ),
  },
  { title: 'EL COHETE Y LA NAVE', body: <VehicleDiagram parts={PARTS.es} /> },
  { title: 'LA MISIÓN', body: <MissionDiagram items={MISSION.es} /> },
  {
    target: 'status',
    title: 'BARRA DE ESTADO',
    body: (
      <p>
        El tiempo de misión (MET) y el día de vuelo, la fase, la red de comunicaciones, la velocidad de simulación y la cuenta regresiva al próximo evento. A la
        derecha, el <b>Master Alarm</b>: se enciende con cada alarma y se apaga con un clic.
      </p>
    ),
  },
  {
    target: 'du',
    title: 'PANTALLA Y TECLAS',
    body: (
      <>
        <p>Cada pantalla muestra dos páginas. Las teclas de <b>arriba</b> eligen la página superior y las de <b>abajo</b>, la inferior. Las teclas de los <b>costados</b> ejecutan las acciones de la página.</p>
        <p><b>TRAJ</b> trayectoria · <b>PFD</b> actitud y fuerzas · <b>PROCS</b> procedimientos · <b>PROP</b> propulsión · <b>COMM</b> comunicaciones · <b>TL</b> línea de tiempo.</p>
      </>
    ),
  },
  {
    target: 'switches',
    title: 'INTERRUPTORES',
    body: (
      <p>
        Los interruptores críticos tienen una <b>guarda</b>. Siempre son dos pasos: levantar la guarda para armar y después accionar la palanca.
        Bajar la guarda desarma, y si el motor está encendido lo corta.
      </p>
    ),
  },
  {
    target: 'flight-controls',
    title: 'CONTROL DE VUELO',
    body: (
      <>
        <p><b>DAP</b> es el piloto automático: en AUTO orienta la nave solo, en INRTL mantiene la actitud y en MAN te la deja a vos.</p>
        <p><b>RHC</b> rota la nave y <b>THC</b> la empuja hacia adelante o atrás con los propulsores chicos. Actúan mientras mantenés apretado.</p>
      </>
    ),
  },
  {
    target: 'mcc',
    title: 'CONTROL DE MISIÓN',
    body: <p>Houston te habla por acá: los "go" de cada maniobra, los horarios de los encendidos y los avisos. Cuando la Luna tapa el enlace, la ventana queda muda hasta recuperar la señal.</p>,
  },
  {
    target: 'time',
    title: 'TIEMPO',
    body: <p>Play, pausa y velocidad de simulación. La misión dura más de ocho días: sin el warp no se termina nunca. La simulación se pausa sola antes de cada acción tuya.</p>,
  },
  {
    target: 'view-2d',
    title: 'MAPA 2D',
    body: <p>Un mapa fijo del sistema Tierra‑Luna visto desde arriba, en el marco rotante: la Tierra y la Luna quedan quietas y la nave avanza sobre el plan nominal, dibujado tenue.</p>,
  },
  {
    target: 'view-3d',
    title: 'VISTA 3D',
    body: <p>La nave de cerca y a escala real. Acá se ve cómo se desprenden los boosters, la torre de escape y cada etapa. Arrastrá para girar la cámara. El recuadro de la esquina muestra el entorno terrestre visto desde arriba.</p>,
  },
  {
    target: 'time',
    title: 'DESPEGUE',
    body: <p>Apretá <b>PLAY</b>. Los RS‑25 arrancan seis segundos antes de T‑0; en T‑0 encienden los boosters y el cohete sale de la plataforma.</p>,
    until: (s) => s.clock.running && s.t > 0,
  },
  {
    target: 'view-3d',
    title: 'BOOSTERS',
    body: <p>El cohete sube vertical y a los 7 segundos empieza a inclinarse. Poné el warp en <b>×10</b> y mirá la separación de los boosters a los 2 min 8 s.</p>,
    until: (s) => s.vehicle.srbSeparated,
  },
  {
    target: 'du',
    title: 'HASTA LA ÓRBITA',
    body: <p>Queda la etapa central. En la página <b>PFD</b> podés ver la aceleración: los motores bajan el empuje para no pasar el límite de g. A los 8 min 18 s se separa y quedás en órbita.</p>,
    until: (s) => s.vehicle.coreSeparated,
  },
  {
    target: 'time',
    title: 'ÓRBITA ALTA',
    body: <p>Ahora el ICPS enciende dos veces por su cuenta. Subí el warp a <b>×100</b> o <b>×1000</b> y dejalo correr.</p>,
    until: (s) => s.phase === 'ORBITA_ALTA',
  },
  {
    target: 'time',
    title: 'ESPERAR LA SEPARACIÓN',
    body: <p>A las 3 h 23 min se abre la ventana para separar Orion del ICPS. Seguí con warp alto: la simulación se pausa sola cuando llega.</p>,
    until: (s) => s.t >= MET_E6_PROX_OPS_START || s.vehicle.icpsSeparated,
  },
  {
    target: 'switches',
    title: 'ARMAR LA SEPARACIÓN',
    body: <p>Tu primera acción. Levantá la <b>guarda</b> de <b>ICPS SEP</b>.</p>,
    until: (s) => s.switches.icpsSepArm || s.vehicle.icpsSeparated,
  },
  {
    target: 'switches',
    title: 'SEPARAR',
    body: <p>Ahora accioná la <b>palanca</b> de ICPS SEP. En la vista 3D vas a ver a Orion sola, con los paneles solares desplegados.</p>,
    until: (s) => s.vehicle.icpsSeparated,
  },
  {
    target: 'time',
    title: 'ESPERAR EL PRIMER ENCENDIDO',
    body: <p>Dale a <b>PLAY</b> con warp alto. Dos minutos antes del encendido E7 la simulación se pausa y la nave se orienta sola.</p>,
    until: (s) => s.t >= (e7(s).tig ?? 0) - BURN_LEAD_TIME || fired(s),
  },
  {
    target: 'du',
    title: 'CONFIRMAR EL ΔV',
    body: <p>En la página <b>PROCS</b> está el procedimiento E7 con el paso actual en magenta. Apretá la tecla <b>CONF ΔV</b>, abajo a la derecha de esa página.</p>,
    until: (s) => e7(s).confirmed || fired(s),
  },
  {
    target: 'switches',
    title: 'ARMAR EL MOTOR',
    body: <p>Levantá la <b>guarda</b> de <b>AUX THR</b>, los propulsores auxiliares.</p>,
    until: (s) => s.switches.auxArm || fired(s),
  },
  {
    target: 'switches',
    title: 'ENCENDER',
    body: <p>Accioná la <b>palanca</b> de AUX THR. El encendido queda comprometido: los propulsores van a encender solos en el instante planeado (TIG).</p>,
    until: fired,
  },
  {
    target: 'time',
    title: 'IGNICIÓN',
    body: <p>Apretá <b>PLAY</b>. Cuando llegue el TIG los propulsores encienden durante dos minutos, como en el vuelo real, y se apagan solos.</p>,
    until: (s) => e7(s).status === 'done',
  },
  {
    title: 'A PARTIR DE ACÁ, SEGUÍS VOS',
    body: (
      <>
        <p>Todos los encendidos son iguales: esperar la ventana, confirmar el Δv, levantar la guarda y accionar. Quedan dos: <b>E8</b> y el <b>TLI</b>, que te manda a la Luna.</p>
        <p>En el camino, la tecla <b>CALC</b> de PROCS calcula correcciones de trayectoria. Antes de la entrada hay que separar el módulo de servicio con <b>CM/SM SEP</b>.</p>
        <p>La página PROCS siempre dice qué sigue.</p>
      </>
    ),
  },
];

const cache: Partial<Record<Locale, readonly TourStep[]>> = {};

/** Recorrido guiado en el idioma pedido: primero la nave y el panel, después los primeros pasos de la misión hechos a mano. */
export function tourSteps(locale: Locale): readonly TourStep[] {
  return (cache[locale] ??= locale === 'es' ? STEPS_ES() : STEPS_EN());
}
