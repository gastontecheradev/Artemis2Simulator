import { BURN_LEAD_TIME, MET_E6_PROX_OPS_START } from '../../sim/constants';
import { SimState } from '../../sim/state';

export interface TourStep {
  /** Valor de `data-tour` del elemento a señalar. Sin esto, el cartel va centrado. */
  readonly target?: string;
  readonly title: string;
  readonly body: JSX.Element;
  /** Paso de acción: se completa solo cuando la simulación cumple esta condición. */
  readonly until?: (s: SimState) => boolean;
}

/** Diagrama del vehículo con sus partes numeradas. */
function VehicleDiagram(): JSX.Element {
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
        <li><b>Torre de escape (LAS).</b> Arranca la cápsula del cohete si algo falla en el ascenso. Se eyecta a los 3 min 28 s.</li>
        <li><b>Módulo de tripulación (CM).</b> La cápsula donde viajan los cuatro astronautas. Es lo único que vuelve.</li>
        <li><b>Módulo de servicio (SM).</b> Motor principal, propulsores, tanques y paneles solares de Orion. Se separa antes de la entrada.</li>
        <li><b>Etapa superior (ICPS).</b> Un motor RL10 que sube a Orion a la órbita alta. Se separa a las 3 h 25 min.</li>
        <li><b>Etapa central.</b> Cuatro motores RS‑25 que queman durante ocho minutos. Se separa a los 8 min 18 s.</li>
        <li><b>Boosters.</b> Dos cohetes de combustible sólido que dan casi todo el empuje del despegue. Se separan a los 2 min 8 s.</li>
      </ol>
    </div>
  );
}

function MissionDiagram(): JSX.Element {
  return (
    <ol className="tour-mission">
      <li><b>E1–E3 · Ascenso.</b> Ocho minutos hasta la órbita. Lo vuela el cohete solo.</li>
      <li><b>E4–E5 · Órbita alta.</b> El ICPS enciende dos veces, también solo, y deja a Orion en una órbita de casi un día.</li>
      <li><b>E6–E8 · Chequeo.</b> Orion se separa del ICPS y la tripulación hace sus primeros encendidos.</li>
      <li><b>E9 · Inyección translunar.</b> El encendido que manda la nave hacia la Luna.</li>
      <li><b>E10–E12 · Ida, sobrevuelo y regreso.</b> Casi cuatro días de ida, la vuelta por detrás de la Luna sin señal, y casi cuatro de regreso.</li>
      <li><b>E13–E15 · Entrada.</b> La cápsula se separa del módulo de servicio y entra a la atmósfera.</li>
    </ol>
  );
}

const e7 = (s: SimState): SimState['maneuvers']['E7'] => s.maneuvers.E7;
const fired = (s: SimState): boolean => ['committed', 'burning', 'done'].includes(e7(s).status);

/** Recorrido guiado: primero la nave y el panel, después los primeros pasos de la misión hechos a mano. */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    title: 'TUTORIAL GUIADO',
    body: (
      <>
        <p>Primero un recorrido por la nave y el panel. Después vas a despegar, separar la etapa superior y hacer tu primer encendido.</p>
        <p>Los pasos con una acción avanzan solos cuando la hacés. Podés salir cuando quieras.</p>
      </>
    ),
  },
  { title: 'EL COHETE Y LA NAVE', body: <VehicleDiagram /> },
  { title: 'LA MISIÓN', body: <MissionDiagram /> },
  {
    target: 'status',
    title: 'BARRA DE ESTADO',
    body: (
      <p>
        El tiempo de misión (MET), la fase, la red de comunicaciones, la velocidad de simulación y la cuenta regresiva al próximo evento. A la
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
    target: 'time',
    title: 'TIEMPO',
    body: <p>Play, pausa y velocidad de simulación. La misión dura más de ocho días: sin el warp no se termina nunca. La simulación se pausa sola antes de cada acción tuya.</p>,
  },
  {
    target: 'view-2d',
    title: 'MAPA 2D',
    body: <p>La trayectoria vista desde arriba. El trazo lleno es lo recorrido y el punteado, lo que predice la física si no encendés ningún motor. Con MARCO ROTANTE se ve el "8" del retorno libre.</p>,
  },
  {
    target: 'view-3d',
    title: 'VISTA 3D',
    body: <p>La nave de cerca y a escala real. Acá se ve cómo se desprenden los boosters, la torre de escape y cada etapa. Arrastrá para girar la cámara.</p>,
  },
  {
    target: 'time',
    title: 'DESPEGUE',
    body: <p>Apretá <b>PLAY</b>. Los motores encienden y el cohete sale de la plataforma.</p>,
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
    body: <p>Queda la etapa central. En la página <b>PFD</b> podés ver la aceleración: los motores bajan el empuje para no pasar de 3 g. A los 8 min 18 s se separa y quedás en órbita.</p>,
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
    body: <p>A las 3 h 25 min se abre la ventana para separar Orion del ICPS. Seguí con warp alto: la simulación se pausa sola cuando llega.</p>,
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
    body: <p>Accioná la <b>palanca</b> de AUX THR. El encendido queda comprometido: el motor va a encender solo en el instante planeado (TIG).</p>,
    until: fired,
  },
  {
    target: 'time',
    title: 'IGNICIÓN',
    body: <p>Apretá <b>PLAY</b>. Cuando llegue el TIG el motor enciende, empuja lo necesario y se apaga solo.</p>,
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
