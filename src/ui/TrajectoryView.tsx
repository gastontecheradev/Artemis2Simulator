import { useEffect, useRef } from 'react';
import { CameraMode, createTrajectoryView } from '../render/scene';
import { tick } from '../sim/commands';
import { getViewSettings, setViewSettings, simStore, useViewSettings } from './store';

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

/** Vista de la trayectoria (Three.js) con su barra de herramientas y leyenda. */
export function TrajectoryView({ onCredits }: { onCredits: () => void }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const view = useViewSettings();

  useEffect(() => {
    if (!ref.current) return;
    const handle = createTrajectoryView(ref.current, {
      getState: simStore.getState,
      getSettings: getViewSettings,
      // El loop de dibujo marca el paso del tiempo; el avance pasa por sim/commands.
      onFrame: (dt) => simStore.dispatch((s) => tick(s, dt)),
    });
    return () => handle.dispose();
  }, []);

  return (
    <>
      <div className="view-canvas-host" ref={ref} />
      <div className="toolbar">
        <Group title="CÁMARA" options={CAMERA_MODES} value={view.cameraMode} onChange={(cameraMode) => setViewSettings({ cameraMode })} />
        <Group
          title="MARCO"
          options={[
            { id: 'inertial', label: 'INERCIAL' },
            { id: 'rotating', label: 'ROTANTE' },
          ]}
          value={view.frame}
          onChange={(frame) => setViewSettings({ frame })}
        />
        <Group
          title="TRAZO"
          options={[
            { id: 'phase', label: 'FASE' },
            { id: 'network', label: 'RED' },
          ]}
          value={view.colorMode}
          onChange={(colorMode) => setViewSettings({ colorMode })}
        />
        <Group
          title="VISTA"
          options={[
            { id: '2d', label: '2D' },
            { id: '3d', label: '3D' },
          ]}
          value={view.dim}
          onChange={(dim) => setViewSettings({ dim })}
        />
        <div className="tb-group">
          <button className={view.exaggerate ? 'tb-btn on' : 'tb-btn'} onClick={() => setViewSettings({ exaggerate: !view.exaggerate })}>
            CUERPOS ×6
          </button>
          <button className="tb-btn" onClick={onCredits}>
            CRÉDITOS
          </button>
        </div>
      </div>
      <div className="legend">
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
        <span className="hint">{view.dim === '2d' ? 'RUEDA / PELLIZCO: ZOOM' : 'ARRASTRAR: ORBITAR · RUEDA: ZOOM'}</span>
      </div>
    </>
  );
}
