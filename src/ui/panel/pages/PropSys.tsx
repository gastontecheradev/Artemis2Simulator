import { ORION_DV_BUDGET } from '../../../sim/constants';
import { formatNumber } from '../../../sim/format';
import { PropSystem, SystemStatus, isDvLow, orionDvRemaining, systemStatus, tankFraction } from '../../../sim/propulsion';
import { SimState } from '../../../sim/state';

const STATUS_CLASS: Readonly<Record<SystemStatus, string>> = {
  DISPONIBLE: 'ok',
  ACOPLADO: 'idle',
  SEPARADO: 'idle',
  AGOTADO: 'bad',
};

function Unit({ x, y, name, sub, status }: { x: number; y: number; name: string; sub: string; status: SystemStatus }): JSX.Element {
  return (
    <g transform={`translate(${x} ${y})`} className={`unit-box ${STATUS_CLASS[status]}`}>
      <rect width="92" height="40" />
      <text x="46" y="13" className="u-name">{name}</text>
      <text x="46" y="25" className="u-status">{status}</text>
      <text x="46" y="35" className="u-sub">{sub}</text>
    </g>
  );
}

/**
 * Prop.Sys: esquema de propulsión (inspirado en 11.png). Solo muestra lo que el
 * simulador modela: el presupuesto de Δv como nivel de tanques y el estado de cada sistema.
 */
export function PropSys({ s }: { s: SimState }): JSX.Element {
  const p = s.propulsion;
  const frac = tankFraction(p);
  const low = isDvLow(p);
  const st = (sys: PropSystem): SystemStatus => systemStatus(sys, p, s.vehicle);
  const tankH = 78;
  const level = tankH * frac;
  const gone = s.vehicle.cmSeparated;
  return (
    <div className="page prop">
      <svg className="prop-svg" viewBox="0 0 330 150">
        {/* Tanques del módulo de servicio: nivel = Δv restante / presupuesto */}
        <g className={gone ? 'tank gone' : low ? 'tank low' : 'tank'}>
          <rect x="14" y="20" width="44" height={tankH} rx="14" className="tank-shell" />
          <clipPath id="tank-clip">
            <rect x="14" y="20" width="44" height={tankH} rx="14" />
          </clipPath>
          <rect x="14" y={20 + tankH - level} width="44" height={level} className="tank-level" clipPath="url(#tank-clip)" />
          <text x="36" y="14" className="u-name">TANQUES SM</text>
          <text x="36" y="64" className="tank-pct">{gone ? '---' : `${formatNumber(frac * 100, 0)}%`}</text>
        </g>
        {/* Líneas de alimentación */}
        <path className="feed" d="M58 40 H120 M90 40 V95 H120" />
        <Unit x={120} y={20} name="MOTOR PRINCIPAL" sub={`${p.mainBurns} ENC · ${formatNumber(p.mainDvUsed * 1000, 1)} m/s`} status={st('MAIN')} />
        <Unit x={120} y={75} name="AUXILIARES" sub={`${p.auxBurns} ENC · ${formatNumber(p.auxDvUsed * 1000, 1)} m/s`} status={st('AUX')} />
        <Unit x={226} y={20} name="RCS" sub="ACTITUD" status={st('RCS')} />
        <Unit x={226} y={75} name="ICPS" sub={`${p.icpsBurns} ENC · ${formatNumber(p.icpsDvUsed * 1000, 0)} m/s`} status={st('ICPS')} />
        <text x="14" y="126" className="p-lbl">ΔV USADO</text>
        <text x="100" y="126" className="p-val">{formatNumber(p.orionDvUsed * 1000, 1)} m/s</text>
        <text x="180" y="126" className="p-lbl">DISPONIBLE</text>
        <text x="270" y="126" className={low ? 'p-val warn' : 'p-val'}>{gone ? '---' : `${formatNumber(orionDvRemaining(p) * 1000, 1)} m/s`}</text>
        <text x="14" y="142" className="p-lbl">PRESUPUESTO</text>
        <text x="100" y="142" className="p-val">{formatNumber(ORION_DV_BUDGET * 1000, 0)} m/s</text>
      </svg>
    </div>
  );
}
