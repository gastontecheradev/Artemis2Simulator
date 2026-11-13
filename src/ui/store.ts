import { useSyncExternalStore } from 'react';
import type { ViewSettings } from '../render/scene';
import { advance } from '../sim/advance';
import { pause, play, reset, setSwitch, setWarp } from '../sim/commands';
import { MISSION_PARAMS } from '../sim/mission/params';
import { SimState, createStore } from '../sim/state';

const query = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);

/**
 * Estado inicial. Con `?met=<segundos>` en la URL la misión arranca adelantada hasta
 * ese MET, volada por la tripulación automática (sirve para ir directo a un momento:
 * `?met=406000` es poco antes del sobrevuelo lunar).
 */
function initialState(): SimState {
  let s = reset(MISSION_PARAMS);
  const met = Number(query.get('met'));
  if (met > s.t) {
    let f = play(setSwitch(s, 'autoCrew', true));
    while (f.t < met && !f.outcome) {
      // Por tramos de una hora, para que el procedimiento activo vaya avanzando.
      const next = advance(f, Math.min(3600, met - f.t), Infinity);
      if (next === f) break;
      f = next;
    }
    if (f.outcome) return f;
    s = pause(setSwitch(f, 'autoCrew', false));
  }
  // Modo demostración: ?auto deja la tripulación automática y ?warp=1000 arranca corriendo.
  if (query.has('auto')) s = setSwitch(s, 'autoCrew', true);
  const warp = Number(query.get('warp'));
  if (warp > 0) s = play(setWarp(s, warp));
  return s;
}

/** Store de la simulación. La UI solo lo modifica despachando comandos de sim/commands.ts. */
export const simStore = createStore(initialState());

// La simulación cambia en cada frame; el panel se redibuja a ~10 Hz con una foto del estado.
const UI_INTERVAL_MS = 100;
let snapshot = simStore.getState();
let timer: ReturnType<typeof setTimeout> | null = null;
const uiListeners = new Set<() => void>();

function flush(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  const next = simStore.getState();
  if (next !== snapshot) {
    snapshot = next;
    uiListeners.forEach((l) => l());
  }
}

simStore.subscribe(() => {
  if (timer === null) timer = setTimeout(flush, UI_INTERVAL_MS);
});

const subscribeUi = (l: () => void): (() => void) => {
  uiListeners.add(l);
  return () => uiListeners.delete(l);
};

/** Estado de la simulación para componentes React (actualizado a ~10 Hz). */
export const useSim = (): SimState => useSyncExternalStore(subscribeUi, () => snapshot);

/** Despacha un comando y refresca el panel de inmediato (para que los clics respondan al instante). */
export function act(command: (s: SimState) => SimState): void {
  simStore.dispatch(command);
  flush();
}

// --- Ajustes de la vista de trayectoria (estado de UI, no de simulación) ---

const pick = <T extends string>(key: string, options: readonly T[], fallback: T): T => {
  const v = query.get(key);
  return options.includes(v as T) ? (v as T) : fallback;
};

// También se pueden fijar por URL: ?cam=overview&frame=rotating&color=network&dim=3d
let view: ViewSettings = {
  cameraMode: pick('cam', ['overview', 'ship', 'earth', 'moon'] as const, 'earth'),
  frame: pick('frame', ['inertial', 'rotating'] as const, 'inertial'),
  colorMode: pick('color', ['phase', 'network'] as const, 'phase'),
  exaggerate: query.has('big'),
  dim: pick('dim', ['2d', '3d'] as const, '2d'),
};
const viewListeners = new Set<() => void>();

export const getViewSettings = (): ViewSettings => view;

export function setViewSettings(patch: Partial<ViewSettings>): void {
  view = { ...view, ...patch };
  viewListeners.forEach((l) => l());
}

export const useViewSettings = (): ViewSettings =>
  useSyncExternalStore(
    (l) => {
      viewListeners.add(l);
      return () => viewListeners.delete(l);
    },
    () => view,
  );
