import { useState } from 'react';
import { formatDuration } from '../sim/format';
import { MISSION_PARAMS } from '../sim/mission/params';
import { startMission } from './store';

/** Pantalla de inicio: qué es, cómo se vuela y desde dónde empezar. */
export function StartScreen({ onCredits }: { onCredits: () => void }): JSX.Element {
  const [autoCrew, setAutoCrew] = useState(false);
  const n = MISSION_PARAMS.nominal;
  return (
    <div className="modal intro">
      <div className="modal-card intro-card">
        <span className="end-kicker">SIMULADOR DE MISIÓN</span>
        <h2>ARTEMIS II</h2>
        <p>
          Vuelo tripulado alrededor de la Luna con retorno libre. La trayectoria no está dibujada: la calcula la física (gravedad de
          la Tierra y de la Luna) a partir de los encendidos que hagas.
        </p>
        <dl className="end-stats">
          <dt>SOBREVUELO LUNAR NOMINAL</dt>
          <dd>6.513 km</dd>
          <dt>DURACIÓN NOMINAL</dt>
          <dd>{formatDuration(n.eiMet)}</dd>
        </dl>
        <h3>CÓMO SE VUELA</h3>
        <ol className="intro-steps">
          <li>
            La página <b>Procs</b> del display indica el próximo procedimiento y su paso actual, resaltado en magenta.
          </li>
          <li>
            La simulación se <b>pausa sola</b> antes de cada acción de la tripulación. Usá el warp para no esperar.
          </li>
          <li>
            Para un encendido: levantar la <b>guarda</b> del motor, confirmar el Δv con la tecla <b>CONF ΔV</b> y accionar la palanca.
            El motor enciende solo en el instante planeado (TIG).
          </li>
          <li>
            Si llegás tarde, te equivocás de Δv o no encendés, la física decide: podés quedar en órbita, errarle a la Luna o entrar
            fuera del corredor.
          </li>
        </ol>
        <p className="dim">
          Teclado: <b>Espacio</b> play/pausa · <b>+</b> y <b>−</b> warp · <b>A</b> reconocer alarmas · <b>1–5</b> cámara.
        </p>
        <label className="intro-check">
          <input type="checkbox" checked={autoCrew} onChange={(e) => setAutoCrew(e.target.checked)} />
          Modo demostración: la tripulación automática vuela la misión completa
        </label>
        <div className="end-actions">
          <button className="tb-btn on" onClick={() => startMission({ fromLaunch: true, autoCrew })}>
            DESDE EL LANZAMIENTO
          </button>
          <button className="tb-btn" onClick={() => startMission({ fromLaunch: false, autoCrew })}>
            DESDE LA ÓRBITA (E3)
          </button>
          <button className="tb-btn" onClick={onCredits}>
            CRÉDITOS
          </button>
        </div>
        <p className="dim intro-foot">
          El ascenso hasta E3 es guionado con datos publicados, no simulado. Proyecto educativo, no afiliado ni avalado por NASA.
        </p>
      </div>
    </div>
  );
}
