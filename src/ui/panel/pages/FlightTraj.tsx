import { ASCENT_TABLE, ENTRY_CORRIDOR, MOON_SOI, R_EARTH, R_MOON } from '../../../sim/constants';
import { formatDuration, formatMet, formatNumber } from '../../../sim/format';
import { distance } from '../../../sim/math/vec3';
import { ascentSample } from '../../../sim/mission/ascent';
import { earthElements, moonElements } from '../../../sim/orbit';
import { SimState, ephemerisOf } from '../../../sim/state';

function Box({ label, value, unit }: { label: string; value: string; unit: string }): JSX.Element {
  return (
    <div className="pfd-box">
      <span className="lbl">{label}</span>
      <span className="pfd-value">{value}</span>
      <span className="unit">{unit}</span>
    </div>
  );
}

function Row({ label, value, unit, cls = 'val' }: { label: string; value: string; unit?: string; cls?: string }): JSX.Element {
  return (
    <div className="row">
      <span className="lbl">{label}</span>
      <span className={cls}>{value}</span>
      <span className="unit">{unit ?? ''}</span>
    </div>
  );
}

const W = 200;
const H = 110;

/** Mini‑gráfico de altitud en función del tiempo (escala logarítmica), como la curva de 10.png. */
function AltitudeGraph({ s }: { s: SimState }): JSX.Element {
  const trail = s.trail;
  const t0 = trail[0].t;
  const span = Math.max(600, s.t - t0);
  const lo = Math.log10(100);
  const hi = Math.log10(500000);
  const x = (t: number): number => 14 + ((t - t0) / span) * (W - 20);
  const y = (alt: number): number => H - 12 - ((Math.log10(Math.max(100, alt)) - lo) / (hi - lo)) * (H - 20);
  const stride = Math.max(1, Math.floor(trail.length / 220));
  let d = '';
  for (let i = 0; i < trail.length; i += stride) {
    d += `${d ? 'L' : 'M'}${x(trail[i].t).toFixed(1)} ${y(trail[i].alt).toFixed(1)} `;
  }
  const eph = ephemerisOf(s);
  const altNow = distance(s.ship.r, eph.earth(s.t).r) - R_EARTH;
  d += `L${x(s.t).toFixed(1)} ${y(altNow).toFixed(1)}`;
  return (
    <svg className="mini-graph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <path className="axis" d={`M14 4 V${H - 12} H${W - 4}`} />
      <text className="axis-lbl" x="2" y="10">H</text>
      <text className="axis-lbl" x={W - 22} y={H - 2}>MET</text>
      {[1e3, 1e4, 1e5].map((a) => (
        <path key={a} className="grid" d={`M14 ${y(a).toFixed(1)} H${W - 4}`} />
      ))}
      <path className="curve" d={d} />
      {s.markers.map((m) => (
        <circle key={m.eventId} className="pt" cx={x(m.t)} cy={y(distance(m.r, eph.earth(m.t).r) - R_EARTH)} r="2.6" />
      ))}
      <path className="now" d={`M${x(s.t) - 4} ${y(altNow) + 5} L${x(s.t)} ${y(altNow) - 2} L${x(s.t) + 4} ${y(altNow) + 5} Z`} />
    </svg>
  );
}

/**
 * Durante el ascenso no hay física: se muestran los valores de la tabla de 3.png,
 * marcados como guionados. La velocidad es relativa a la Tierra, no inercial.
 */
function AscentView({ s }: { s: SimState }): JSX.Element {
  const a = ascentSample(s.t);
  return (
    <div className="page traj">
      <div className="pfd-top">
        <Box label="V" value={formatNumber(a.speed, 3)} unit="km/s" />
        <Box label="H" value={formatNumber(a.altitude, 1)} unit="km" />
        <Box label="Ḣ" value={formatNumber(a.verticalSpeed, 3)} unit="km/s" />
      </div>
      <div className="ascent-note">ASCENSO GUIONADO · TABLA PUBLICADA · V RELATIVA A TIERRA</div>
      <div className="ascent-table">
        {ASCENT_TABLE.map((p) => (
          <div key={p.label} className={s.t >= p.met ? 'asc-row done' : 'asc-row'}>
            <span className="tick">{s.t >= p.met ? '✓' : ''}</span>
            <span className="asc-name">{p.label}</span>
            <span className="asc-t">{formatMet(p.met).slice(4)}</span>
            <span className="asc-v">{formatNumber(p.speed, 3)}</span>
            <span className="asc-h">{formatNumber(p.altitude, 1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Flight.Traj: datos de vuelo (inspirada en la PFD de 10.png, sin bola de actitud). */
export function FlightTraj({ s }: { s: SimState }): JSX.Element {
  if (s.phase === 'ASCENSO') return <AscentView s={s} />;
  const eph = ephemerisOf(s);
  const el = earthElements(s.ship, s.t, eph);
  const dMoon = distance(s.ship.r, eph.moon(s.t).r);
  const inSoi = dMoon < MOON_SOI;
  const ml = inSoi ? moonElements(s.ship, s.t, eph) : null;
  const p = s.prediction;
  const eiOk = p?.ei ? p.ei.fpaDeg <= ENTRY_CORRIDOR.max && p.ei.fpaDeg >= ENTRY_CORRIDOR.min : false;
  return (
    <div className="page traj">
      <div className="pfd-top">
        <Box label="Vi" value={formatNumber(el.speed, 3)} unit="km/s" />
        <Box label="H" value={formatNumber(el.r - R_EARTH, el.r - R_EARTH < 10000 ? 1 : 0)} unit="km" />
        <Box label="Ḣ" value={formatNumber(el.radialSpeed, 3)} unit="km/s" />
      </div>
      <div className="traj-cols">
        <div className="rows">
          <Row label="DIST TIERRA" value={formatNumber(el.r, 0)} unit="km" />
          <Row label="DIST LUNA" value={formatNumber(dMoon, 0)} unit="km" />
          <Row label="PERIGEO" value={formatNumber(el.rp - R_EARTH, 0)} unit="km" />
          <Row label="APOGEO" value={Number.isFinite(el.ra) ? formatNumber(el.ra - R_EARTH, 0) : 'ABIERTA'} unit={Number.isFinite(el.ra) ? 'km' : ''} />
          <Row label="PERÍODO" value={Number.isFinite(el.period) ? formatDuration(el.period) : '---'} />
          {ml && <Row label="H LUNA" value={formatNumber(ml.r - R_MOON, 0)} unit="km" />}
          {ml && <Row label="PERILUNA" value={formatNumber(ml.rp - R_MOON, 0)} unit="km" />}
          {p?.perilune && p.perilune.t > s.t && (
            <Row label="PRED SOBREV" value={formatNumber(p.perilune.altitude, 0)} unit="km" cls="pred" />
          )}
          {p?.ei && <Row label="PRED EI ÁNG" value={formatNumber(p.ei.fpaDeg, 2)} unit="°" cls={eiOk ? 'pred' : 'pred bad'} />}
        </div>
        <AltitudeGraph s={s} />
      </div>
    </div>
  );
}
