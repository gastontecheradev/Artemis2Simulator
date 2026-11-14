import { useState } from 'react';
import { formatDuration } from '../sim/format';
import { MISSION_PARAMS } from '../sim/mission/params';
import { startMission } from './store';

/** Pantalla de inicio: qué es, cómo se vuela y cómo empezar. */
export function StartScreen({ onCredits }: { onCredits: () => void }): JSX.Element {
  const [autoCrew, setAutoCrew] = useState(false);
  const n = MISSION_PARAMS.nominal;
  return (
    <div className="modal intro">
      <div className="modal-card intro-card">
        <span className="end-kicker">SIMULADOR DE MISIÓN</span>
        <h2>ARTEMIS II</h2>
        <p>
          Vuelo tripulado alrededor de la Luna con retorno libre, desde la plataforma hasta la entrada a la atmósfera. Nada está dibujado
          de antemano: el cohete sube con el empuje y la masa de sus motores, y la trayectoria la decide la gravedad de la Tierra y de la
          Luna.
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
            El ascenso y los dos primeros encendidos son automáticos, como en el vuelo real. Después, la página <b>Procs</b> indica cada
            procedimiento y su paso actual, resaltado en magenta.
          </li>
          <li>
            La simulación se <b>pausa sola</b> antes de cada acción de la tripulación. Usá el warp para no esperar.
          </li>
          <li>
            Para un encendido: confirmar el Δv con la tecla <b>CONF ΔV</b>, levantar la <b>guarda</b> del motor y accionar la palanca. El
            motor enciende solo en el instante planeado y se apaga cuando entregó el Δv.
          </li>
          <li>
            Si llegás tarde, cambiás el Δv, apuntás mal la nave o no encendés, la física decide: podés quedar en órbita, errarle a la Luna
            o entrar fuera del corredor.
          </li>
        </ol>
        <p className="dim">
          Teclado: <b>Espacio</b> play/pausa · <b>+</b> y <b>−</b> warp · <b>A</b> reconocer alarmas · <b>1–5</b> cámara del mapa ·{' '}
          <b>← →</b> rotar la nave (DAP en MAN) · <b>↑ ↓</b> traslación.
        </p>
        <label className="intro-check">
          <input type="checkbox" checked={autoCrew} onChange={(e) => setAutoCrew(e.target.checked)} />
          Modo demostración: la tripulación automática vuela la misión completa
        </label>
        <div className="end-actions">
          <button className="tb-btn on" onClick={() => startMission({ autoCrew, tutorial: false })}>
            INICIAR MISIÓN
          </button>
          <button className="tb-btn" onClick={() => startMission({ autoCrew: false, tutorial: true })}>
            TUTORIAL GUIADO
          </button>
          <button className="tb-btn" onClick={onCredits}>
            CRÉDITOS
          </button>
        </div>
        <p className="dim intro-foot">Proyecto educativo, no afiliado ni avalado por NASA.</p>
      </div>
    </div>
  );
}
