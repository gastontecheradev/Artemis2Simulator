import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SimState } from '../../sim/state';
import { setTour } from '../store';
import { TOUR_STEPS } from './steps';

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const MARGIN = 10;

/**
 * Tutorial guiado: un cartel junto al elemento que explica cada paso, con el elemento
 * resaltado. No bloquea la pantalla: los pasos de acción se cumplen usando el panel de
 * verdad y avanzan solos cuando la simulación registra la acción.
 */
export function Tour({ s, index }: { s: SimState; index: number }): JSX.Element | null {
  const step = TOUR_STEPS[index];
  const cardRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<Box | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const done = step?.until ? step.until(s) : true;

  // Los pasos de acción avanzan solos al cumplirse.
  useEffect(() => {
    if (step?.until && done) {
      const id = setTimeout(() => setTour(index + 1 < TOUR_STEPS.length ? index + 1 : null), 700);
      return () => clearTimeout(id);
    }
  }, [step, done, index]);

  // Ubica el resaltado sobre el elemento señalado (se revisa seguido: el panel cambia de tamaño y se desplaza).
  useEffect(() => {
    const measure = (): void => {
      const el = step?.target ? document.querySelector(`[data-tour="${step.target}"]`) : null;
      if (!el) {
        setTarget(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setTarget((prev) =>
        prev && prev.left === r.left && prev.top === r.top && prev.width === r.width && prev.height === r.height
          ? prev
          : { left: r.left, top: r.top, width: r.width, height: r.height },
      );
    };
    measure();
    const id = setInterval(measure, 250);
    window.addEventListener('resize', measure);
    return () => {
      clearInterval(id);
      window.removeEventListener('resize', measure);
    };
  }, [step]);

  // Ubica el cartel al lado del elemento, donde haya lugar, sin salirse de la ventana.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clamp = (v: number, max: number): number => Math.max(MARGIN, Math.min(max - MARGIN, v));
    if (!target) {
      setPos({ left: (vw - w) / 2, top: Math.max(MARGIN, (vh - h) / 2) });
      return;
    }
    const cx = target.left + target.width / 2;
    const cy = target.top + target.height / 2;
    let left: number;
    let top: number;
    if (vw - (target.left + target.width) > w + 2 * MARGIN) {
      left = target.left + target.width + MARGIN;
      top = cy - h / 2;
    } else if (target.left > w + 2 * MARGIN) {
      left = target.left - w - MARGIN;
      top = cy - h / 2;
    } else if (vh - (target.top + target.height) > h + 2 * MARGIN) {
      left = cx - w / 2;
      top = target.top + target.height + MARGIN;
    } else if (target.top > h + 2 * MARGIN) {
      left = cx - w / 2;
      top = target.top - h - MARGIN;
    } else {
      // No entra en ningún costado: va encima, abajo a la derecha del elemento.
      left = target.left + target.width - w - MARGIN;
      top = target.top + target.height - h - MARGIN;
    }
    setPos({ left: clamp(left, vw - w), top: clamp(top, vh - h) });
  }, [target, index]);

  if (!step) return null;
  const last = index === TOUR_STEPS.length - 1;
  return (
    <div className="tour">
      {target && (
        <div className="tour-spot" style={{ left: target.left - 4, top: target.top - 4, width: target.width + 8, height: target.height + 8 }} />
      )}
      <div className="tour-card" ref={cardRef} style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}>
        <span className="tour-count">
          PASO {index + 1} DE {TOUR_STEPS.length}
          {step.until ? ' · ACCIÓN' : ''}
        </span>
        <h3>{step.title}</h3>
        <div className="tour-body">{step.body}</div>
        {step.until && <p className={done ? 'tour-status ok' : 'tour-status'}>{done ? '✓ HECHO' : 'ESPERANDO LA ACCIÓN…'}</p>}
        <div className="tour-actions">
          <button className="tb-btn" disabled={index === 0} onClick={() => setTour(index - 1)}>
            ANTERIOR
          </button>
          <button className={step.until ? 'tb-btn' : 'tb-btn on'} onClick={() => setTour(last ? null : index + 1)}>
            {last ? 'TERMINAR' : step.until ? 'SALTEAR' : 'SIGUIENTE'}
          </button>
          <button className="tb-btn tour-exit" onClick={() => setTour(null)}>
            SALIR
          </button>
        </div>
      </div>
    </div>
  );
}
