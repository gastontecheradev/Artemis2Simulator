import { runningEngines } from '../../../sim/advance';
import { formatNumber } from '../../../sim/format';
import { PropSystem, SystemStatus, dvAvailable, isDvLow, systemStatus } from '../../../sim/propulsion';
import { SimState } from '../../../sim/state';
import { FULL_TANKS, TANK, totalMass } from '../../../sim/vehicle';

const STATUS_CLASS: Readonly<Record<SystemStatus, string>> = {
  DISPONIBLE: 'ok',
  ENCENDIDO: 'lit',
  ACOPLADO: 'idle',
  SEPARADO: 'idle',
  AGOTADO: 'bad',
};

type Presence = 'on' | 'gone' | 'lit';

/** Tanque con su nivel de propelente. */
function Tank({ x, name, tank, s, present, low }: { x: number; name: string; tank: number; s: SimState; present: boolean; low?: boolean }): JSX.Element {
  const h = 62;
  const frac = present ? s.propulsion.prop[tank] / FULL_TANKS[tank] : 0;
  const id = `tank-clip-${tank}`;
  return (
    <g transform={`translate(${x} 22)`} className={!present ? 'tank gone' : low ? 'tank low' : 'tank'}>
      <rect width="30" height={h} rx="9" className="tank-shell" />
      <clipPath id={id}>
        <rect width="30" height={h} rx="9" />
      </clipPath>
      <rect y={h - h * frac} width="30" height={h * frac} className="tank-level" clipPath={`url(#${id})`} />
      <text x="15" y="-5" className="u-name">{name}</text>
      <text x="15" y={h / 2 + 4} className="tank-pct">{present ? `${formatNumber(frac * 100, 0)}%` : '---'}</text>
      <text x="15" y={h + 10} className="u-sub">{present ? `${formatNumber(s.propulsion.prop[tank] / 1000, 1)} t` : 'SEPARADO'}</text>
    </g>
  );
}

function Engine({ x, y, name, sub, status }: { x: number; y: number; name: string; sub: string; status: SystemStatus }): JSX.Element {
  return (
    <g transform={`translate(${x} ${y})`} className={`unit-box ${STATUS_CLASS[status]}`}>
      <rect width="84" height="30" />
      <text x="42" y="10" className="u-name">{name}</text>
      <text x="42" y="20" className="u-status">{status}</text>
      <text x="42" y="27.5" className="u-sub">{sub}</text>
    </g>
  );
}

/** Silueta del vehículo por partes: se apaga cada parte a medida que se desprende. */
function Stack({ s }: { s: SimState }): JSX.Element {
  const v = s.vehicle;
  const run = runningEngines(s);
  const cls = (present: boolean, lit = false): Presence => (!present ? 'gone' : lit ? 'lit' : 'on');
  const srb = cls(!v.srbSeparated, run.includes('SRB'));
  const core = cls(!v.coreSeparated, run.includes('RS25'));
  const icps = cls(!v.icpsSeparated, run.includes('RL10'));
  const sm = cls(!v.cmSeparated, run.includes('MAIN') || run.includes('AUX') || run.includes('RCS'));
  return (
    <g transform="translate(8 14)" className="stack">
      <path d="M 12 0 L 13.5 10 L 10.5 10 Z M 10.5 10 H 13.5 L 16 20 H 8 Z" className={`part ${cls(!v.lasJettisoned)}`} />
      <path d="M 8 20 H 16 L 17 27 H 7 Z" className="part on" />
      <rect x="7" y="27" width="10" height="8" className={`part ${sm}`} />
      <rect x="6.5" y="35" width="11" height="17" className={`part ${icps}`} />
      <path d="M 6.5 52 H 17.5 L 20 58 V 108 H 4 V 58 Z" className={`part ${core}`} />
      <rect x="-1.5" y="64" width="4.5" height="46" rx="1.5" className={`part ${srb}`} />
      <rect x="21" y="64" width="4.5" height="46" rx="1.5" className={`part ${srb}`} />
      <text x="34" y="9" className="s-lbl">LAS</text>
      <text x="34" y="25" className="s-lbl">CM</text>
      <text x="34" y="33" className="s-lbl">SM</text>
      <text x="34" y="45" className="s-lbl">ICPS</text>
      <text x="34" y="82" className="s-lbl">ETAPA</text>
      <text x="34" y="89" className="s-lbl">CENTRAL</text>
      <text x="34" y="104" className="s-lbl">BOOSTERS</text>
    </g>
  );
}

/**
 * Prop.Sys: el vehículo por partes, el propelente de cada etapa y el estado de cada
 * motor (inspirado en el esquema de propulsión de la cabina). Solo muestra lo que el
 * simulador modela.
 */
export function PropSys({ s }: { s: SimState }): JSX.Element {
  const p = s.propulsion;
  const v = s.vehicle;
  const run = runningEngines(s);
  const st = (sys: PropSystem): SystemStatus => systemStatus(sys, p, v, run);
  const ascentStatus = (engine: 'SRB' | 'RS25', present: boolean): SystemStatus =>
    !present ? 'SEPARADO' : run.includes(engine) ? 'ENCENDIDO' : s.t > 0 ? 'AGOTADO' : 'DISPONIBLE';
  const dv = (sys: PropSystem): string => `${formatNumber(dvAvailable(sys, p, v) * 1000, 0)} m/s DISP`;
  return (
    <div className="page prop">
      <svg className="prop-svg" viewBox="0 0 330 150">
        <Stack s={s} />
        <Tank x={82} name="BOOST" tank={TANK.SRB} s={s} present={!v.srbSeparated} />
        <Tank x={120} name="CENTRAL" tank={TANK.CORE} s={s} present={!v.coreSeparated} />
        <Tank x={158} name="ICPS" tank={TANK.ICPS} s={s} present={!v.icpsSeparated} />
        <Tank x={196} name="SM" tank={TANK.ESM} s={s} present={!v.cmSeparated} low={isDvLow(p)} />
        {v.coreSeparated ? (
          <>
            <Engine x={240} y={6} name="ICPS · RL10" sub={v.icpsSeparated ? `${p.icpsBurns} ENC · ${formatNumber(p.icpsDvUsed * 1000, 0)} m/s` : dv('ICPS')} status={st('ICPS')} />
            <Engine x={240} y={40} name="MOTOR PRINCIPAL" sub={st('MAIN') === 'SEPARADO' ? `${p.mainBurns} ENC` : dv('MAIN')} status={st('MAIN')} />
            <Engine x={240} y={74} name="AUXILIARES ×8" sub={`${p.auxBurns} ENC · ${formatNumber(p.auxDvUsed * 1000, 1)} m/s`} status={st('AUX')} />
            <Engine x={240} y={108} name="RCS" sub={`${formatNumber(p.rcsDvUsed * 1000, 2)} m/s USADOS`} status={st('RCS')} />
          </>
        ) : (
          <>
            <Engine x={240} y={6} name="BOOSTERS ×2" sub="COMBUSTIBLE SÓLIDO" status={ascentStatus('SRB', !v.srbSeparated)} />
            <Engine x={240} y={40} name="RS‑25 ×4" sub="ETAPA CENTRAL" status={ascentStatus('RS25', true)} />
            <Engine x={240} y={74} name="ICPS · RL10" sub={dv('ICPS')} status={st('ICPS')} />
            <Engine x={240} y={108} name="ORION" sub="ACOPLADO AL ICPS" status={st('MAIN')} />
          </>
        )}
        <text x="82" y="118" className="p-lbl">MASA</text>
        <text x="134" y="118" className="p-val">{formatNumber(totalMass(v, p.prop) / 1000, 1)} t</text>
        <text x="82" y="130" className="p-lbl">ΔV ORION</text>
        <text x="134" y="130" className="p-val">{formatNumber(p.orionDvUsed * 1000, 1)} m/s</text>
        <text x="82" y="142" className="p-lbl">ΔV ICPS</text>
        <text x="134" y="142" className="p-val">{formatNumber(p.icpsDvUsed * 1000, 1)} m/s</text>
      </svg>
    </div>
  );
}
