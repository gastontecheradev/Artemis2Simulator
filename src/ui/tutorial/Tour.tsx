import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SimState } from '../../sim/state';
import { useLocale, useT } from '../i18n';
import { setTour } from '../store';
import { tourSteps } from './steps';

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const MARGIN = 10;
/** Lugar que necesita la mano debajo del botón (px); si no lo hay, señala desde arriba. */
const HAND_ROOM = 64;

const boxOf = (selector: string | null): Box | null => {
  const el = selector ? document.querySelector(selector) : null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
};
const sameBox = (a: Box | null, b: Box | null): boolean =>
  a === b || (!!a && !!b && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height);

/**
 * Mano con el índice extendido (dibujo propio) que toca el botón que hay que apretar.
 * La punta del dedo queda sobre el centro del botón; si abajo no hay lugar, señala desde arriba.
 */
function Hand({ box }: { box: Box }): JSX.Element {
  const above = box.top + box.height + HAND_ROOM > window.innerHeight;
  return (
    <div className={above ? 'tour-hand above' : 'tour-hand'} style={{ left: box.left + box.width / 2, top: box.top + box.height / 2 }} aria-hidden="true">
      <span className="tour-hand-ring" />
      <svg className="tour-hand-svg" viewBox="0 0 48 60" width="48" height="60">
        <path
          className="tour-hand-fill"
          d="M10 36 V7 A4 4 0 0 1 18 7 V22 A4 4 0 0 1 26 23 V25 A4 4 0 0 1 34 26 V28 A3.8 3.8 0 0 1 41.6 29.5 V42 C41.6 52 36 57 28 57 H22 C16 57 13 53 10 48 L4 41 A3.6 3.6 0 0 1 9.5 36.6 Z"
        />
        <path className="tour-hand-line" d="M18 22 V31 M26 24 V32 M34 27 V33" />
      </svg>
    </div>
  );
}

/**
 * Tutorial guiado: un cartel junto al elemento que explica cada paso, con el elemento
 * resaltado. No bloquea la pantalla: los pasos de acción se cumplen usando el panel de
 * verdad y avanzan solos cuando la simulación registra la acción.
 */
export function Tour({ s, index }: { s: SimState; index: number }): JSX.Element | null {
  const t = useT();
  const TOUR_STEPS = tourSteps(useLocale());
  const step = TOUR_STEPS[index];
  const cardRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<Box | null>(null);
  const [press, setPress] = useState<Box | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const done = step?.until ? step.until(s) : true;
  const pressId = !done && step?.press ? step.press(s) : null;

  // Los pasos de acción avanzan solos al cumplirse.
  useEffect(() => {
    if (step?.until && done) {
      const id = setTimeout(() => setTour(index + 1 < TOUR_STEPS.length ? index + 1 : null), 700);
      return () => clearTimeout(id);
    }
  }, [step, done, index]);

  // Ubica el resaltado sobre el elemento señalado y la mano sobre el botón que hay que
  // apretar (se revisa seguido: el panel cambia de tamaño y se desplaza).
  useEffect(() => {
    const measure = (): void => {
      const next = boxOf(step?.target ? `[data-tour="${step.target}"]` : null);
      setTarget((prev) => (sameBox(prev, next) ? prev : next));
      const hand = boxOf(pressId ? `[data-press="${pressId}"]` : null);
      setPress((prev) => (sameBox(prev, hand) ? prev : hand));
    };
    measure();
    const id = setInterval(measure, 250);
    window.addEventListener('resize', measure);
    return () => {
      clearInterval(id);
      window.removeEventListener('resize', measure);
    };
  }, [step, pressId]);

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
      {press && pressId && <Hand box={press} />}
      <div className="tour-card" ref={cardRef} style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}>
        <span className="tour-count">
          {t('tour.step', { n: index + 1, total: TOUR_STEPS.length })}
          {step.until ? t('tour.action') : ''}
        </span>
        <h3>{step.title}</h3>
        <div className="tour-body">{step.body}</div>
        {step.until && <p className={done ? 'tour-status ok' : 'tour-status'}>{done ? t('tour.done') : t('tour.waiting')}</p>}
        <div className="tour-actions">
          <button className="tb-btn" disabled={index === 0} onClick={() => setTour(index - 1)}>
            {t('tour.prev')}
          </button>
          <button className={step.until ? 'tb-btn' : 'tb-btn on'} onClick={() => setTour(last ? null : index + 1)}>
            {last ? t('tour.finish') : step.until ? t('tour.skip') : t('tour.next')}
          </button>
          <button className="tb-btn tour-exit" onClick={() => setTour(null)}>
            {t('tour.exit')}
          </button>
        </div>
      </div>
    </div>
  );
}
