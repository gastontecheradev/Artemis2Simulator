import { useEffect, useRef } from 'react';
import { CameraMode, ViewDim, createTrajectoryView, insetTarget } from '../render/scene';
import { tick } from '../sim/commands';
import { useT } from './i18n';
import { MapHud } from './panel/MapHud';
import { getViewSettings, setCamera, setViewState, simStore, useSim, useViewState } from './store';

export const CAMERA_MODES: readonly CameraMode[] = ['auto', 'overview', 'ship', 'earth', 'moon'];

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

/** Canvas of one view: creates the renderer and destroys it on unmount. Only the map drives the passage of time. */
function Canvas({ dim, className }: { dim: ViewDim; className?: string }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const handle = createTrajectoryView(ref.current, dim, {
      getState: simStore.getState,
      getSettings: () => getViewSettings(dim),
      // Only one view drives the passage of time; the advance goes through sim/commands.
      onFrame: dim === '2d' ? (dt) => simStore.dispatch((s) => tick(s, dt)) : undefined,
    });
    return () => handle.dispose();
  }, [dim]);
  return <div className={className ?? 'view-canvas-host'} ref={ref} />;
}

/**
 * Right-hand area, split in two: on top the 2D map, fixed like an infographic
 * (rotating or inertial frame, scale covering the whole mission and flight data), and below the
 * 3D view, which follows the spacecraft up close and at real scale, with the Earth-vicinity inset.
 */
export function TrajectoryView({ onCredits, onTutorial, onGuides }: { onCredits: () => void; onTutorial: () => void; onGuides: () => void }): JSX.Element {
  const t = useT();
  const view = useViewState();
  const s = useSim();
  return (
    <>
      <section className="pane pane-2d" data-tour="view-2d">
        <Canvas dim="2d" />
        <MapHud s={s} />
        <div className="toolbar">
          <span className="pane-title">{t('vw.map')}</span>
          <Group
            title={t('vw.frame')}
            options={[
              { id: 'rotating', label: t('vw.rotating') },
              { id: 'inertial', label: t('vw.inertial') },
            ]}
            value={view.mapFrame}
            onChange={(mapFrame) => setViewState({ mapFrame })}
          />
          <div className="tb-group">
            <button className="tb-btn" onClick={onGuides}>
              {t('vw.guides')}
            </button>
            <button className="tb-btn" onClick={onTutorial}>
              {t('vw.tutorial')}
            </button>
            <button className="tb-btn" onClick={onCredits}>
              {t('vw.credits')}
            </button>
          </div>
        </div>
        <div className="legend">
          <span className="hint" title={t(view.mapFrame === 'rotating' ? 'vw.hintMap' : 'vw.hintMapInertial')}>
            {t('vw.hintMapZoom')}
          </span>
        </div>
      </section>
      <section className="pane pane-3d" data-tour="view-3d">
        <Canvas dim="3d" />
        {/* The Earth-vicinity inset goes over the 3D view so it does not cover the map's Moon. */}
        <div className="map-inset" data-tour="inset">
          <Canvas dim="inset" className="view-canvas-host" />
          <span className="inset-title">{t(insetTarget(s) === 'moon' ? 'map.insetMoon' : 'map.inset')}</span>
        </div>
        <div className="toolbar">
          <span className="pane-title">{t('vw.3d')}</span>
          <Group title={t('vw.camera')} options={CAMERA_MODES.map((id) => ({ id, label: t(`cam.${id}`) }))} value={view.camera['3d']} onChange={(mode) => setCamera('3d', mode)} />
        </div>
        <div className="legend">
          <span className="hint">{t('vw.hint3d')}</span>
        </div>
      </section>
      <div className="legend legend-colors">
        <span><i className="swatch out" /> {t('lg.out')}</span>
        <span><i className="swatch prox" /> {t('lg.prox')}</span>
        <span><i className="swatch ret" /> {t('lg.ret')}</span>
        <span><i className="swatch pred" /> {t('lg.pred')}</span>
        <span><i className="swatch plan" /> {t('lg.plan')}</span>
      </div>
    </>
  );
}
