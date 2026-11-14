import { useEffect, useRef } from 'react';
import { CameraMode, ViewDim, createTrajectoryView } from '../render/scene';
import { tick } from '../sim/commands';
import { getViewSettings, setCamera, setViewState, simStore, useViewState } from './store';

export const CAMERA_MODES: readonly { id: CameraMode; label: string }[] = [
  { id: 'auto', label: 'AUTO' },
  { id: 'overview', label: 'GENERAL' },
  { id: 'ship', label: 'NAVE' },
  { id: 'earth', label: 'TIERRA' },
  { id: 'moon', label: 'LUNA' },
];

interface GroupProps<T extends string> {
  title: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}

function Group<T extends string>({ title, options, value, onChange }: GroupProps<T>): JSX.Element {
  return (
    <div className="tb-group">
      <span className="tb-title">{title}</span>
      {options.map((o) => (
        <button key={o.id} className={o.id === value ? 'tb-btn on' : 'tb-btn'} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Una de las dos vistas: su lienzo, su título y su selector de cámara. */
function Pane({ dim, title, children }: { dim: ViewDim; title: string; children?: React.ReactNode }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const view = useViewState();

  useEffect(() => {
    if (!ref.current) return;
    const handle = createTrajectoryView(ref.current, dim, {
      getState: simStore.getState,
      getSettings: () => getViewSettings(dim),
      // Una sola vista marca el paso del tiempo; el avance pasa por sim/commands.
      onFrame: dim === '2d' ? (dt) => simStore.dispatch((s) => tick(s, dt)) : undefined,
    });
    return () => handle.dispose();
  }, [dim]);

  return (
    <section className={`pane pane-${dim}`} data-tour={`view-${dim}`}>
      <div className="view-canvas-host" ref={ref} />
      <div className="toolbar">
        <span className="pane-title">{title}</span>
        <Group title="CÁMARA" options={CAMERA_MODES} value={view.camera[dim]} onChange={(mode) => setCamera(dim, mode)} />
        {children}
      </div>
      <div className="legend">
        <span className="hint">{dim === '2d' ? 'RUEDA / PELLIZCO: ZOOM' : 'ARRASTRAR: ORBITAR · RUEDA: ZOOM'}</span>
      </div>
    </section>
  );
}

/**
 * Área de la derecha, dividida en dos: arriba el mapa 2D de la trayectoria y abajo la
 * vista 3D, que por defecto sigue a la nave de cerca y a escala real.
 */
export function TrajectoryView({ onCredits, onTutorial }: { onCredits: () => void; onTutorial: () => void }): JSX.Element {
  const view = useViewState();
  return (
    <>
      <Pane dim="2d" title="MAPA 2D">
        <Group
          title="MARCO"
          options={[
            { id: 'inertial', label: 'INERCIAL' },
            { id: 'rotating', label: 'ROTANTE' },
          ]}
          value={view.frame}
          onChange={(frame) => setViewState({ frame })}
        />
        <Group
          title="TRAZO"
          options={[
            { id: 'phase', label: 'FASE' },
            { id: 'network', label: 'RED' },
          ]}
          value={view.colorMode}
          onChange={(colorMode) => setViewState({ colorMode })}
        />
        <div className="tb-group">
          <button className={view.exaggerate ? 'tb-btn on' : 'tb-btn'} onClick={() => setViewState({ exaggerate: !view.exaggerate })}>
            CUERPOS ×6
          </button>
          <button className="tb-btn" onClick={onTutorial}>
            TUTORIAL
          </button>
          <button className="tb-btn" onClick={onCredits}>
            CRÉDITOS
          </button>
        </div>
      </Pane>
      <Pane dim="3d" title="VISTA 3D" />
      <div className="legend legend-colors">
        {view.colorMode === 'phase' ? (
          <>
            <span><i className="swatch out" /> ÓRBITA E IDA</span>
            <span><i className="swatch prox" /> PROXIMIDAD</span>
            <span><i className="swatch ret" /> REGRESO</span>
          </>
        ) : (
          <>
            <span><i className="swatch nsn" /> NSN</span>
            <span><i className="swatch dsn" /> DSN</span>
            <span><i className="swatch los" /> LOS</span>
          </>
        )}
        <span><i className="swatch pred" /> PREDICHA</span>
      </div>
    </>
  );
}
