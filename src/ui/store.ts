import { useSyncExternalStore } from 'react';
import type { CameraMode, ViewDim, ViewSettings } from '../render/scene';
import { advance } from '../sim/advance';
import { pause, play, reset, setSwitch, setWarp } from '../sim/commands';
import { MISSION_PARAMS } from '../sim/mission/params';
import { SimState, createStore } from '../sim/state';

const query = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);

/**
 * Parámetros de URL para pruebas y demostraciones:
 * - `?met=<segundos>`: la misión arranca adelantada hasta ese MET, volada por la
 *   tripulación automática (`?met=406000` es poco antes del sobrevuelo lunar).
 * - `?auto`: deja activada la tripulación automática.
 * - `?warp=<n>`: arranca corriendo con esa velocidad de simulación.
 * - `?tour=<n>`: abre el tutorial en el paso n (desde 0).
 * Cualquiera de ellos saltea la pantalla de inicio.
 */
const skipIntro = ['met', 'auto', 'warp', 'tour'].some((k) => query.has(k));

function initialState(): SimState {
  let s = reset(MISSION_PARAMS);
  const met = Number(query.get('met'));
  if (met > s.t) {
    let f = play(setSwitch(s, 'autoCrew', true));
    while (f.t < met && !f.outcome) {
      // Por tramos cortos, para que el procedimiento activo y las partes desprendidas vayan avanzando.
      const next = advance(f, Math.min(600, met - f.t), Infinity);
      if (next === f) break;
      f = next;
    }
    if (f.outcome) return f;
    s = pause(setSwitch(f, 'autoCrew', false));
  }
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

// --- Estado de UI que no es de la simulación ---

function createValue<T>(initial: T): { get(): T; set(next: T): void; use(): T } {
  let value = initial;
  const listeners = new Set<() => void>();
  const subscribe = (l: () => void): (() => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  return {
    get: () => value,
    set(next) {
      value = next;
      listeners.forEach((l) => l());
    },
    use: () => useSyncExternalStore(subscribe, () => value),
  };
}

const pick = <T extends string>(key: string, options: readonly T[], fallback: T): T => {
  const v = query.get(key);
  return options.includes(v as T) ? (v as T) : fallback;
};

const CAMERAS = ['auto', 'overview', 'ship', 'earth', 'moon'] as const;

/** Ajustes compartidos por las dos vistas, más la cámara de cada una. */
export interface ViewState {
  readonly frame: ViewSettings['frame'];
  readonly colorMode: ViewSettings['colorMode'];
  readonly exaggerate: boolean;
  readonly camera: Readonly<Record<ViewDim, CameraMode>>;
}

// También por URL: ?cam=overview (2D), ?cam3d=earth, ?frame=rotating, ?color=network, ?big
const view = createValue<ViewState>({
  frame: pick('frame', ['inertial', 'rotating'] as const, 'inertial'),
  colorMode: pick('color', ['phase', 'network'] as const, 'phase'),
  exaggerate: query.has('big'),
  camera: { '2d': pick('cam', CAMERAS, 'auto'), '3d': pick('cam3d', CAMERAS, 'auto') },
});

export const useViewState = view.use;
export const setViewState = (patch: Partial<ViewState>): void => view.set({ ...view.get(), ...patch });
export const setCamera = (dim: ViewDim, mode: CameraMode): void =>
  view.set({ ...view.get(), camera: { ...view.get().camera, [dim]: mode } });

// La escena compara por identidad para saber si algo cambió: se devuelve el mismo objeto mientras no cambie nada.
const settingsCache: { [K in ViewDim]?: { from: ViewState; value: ViewSettings } } = {};
export function getViewSettings(dim: ViewDim): ViewSettings {
  const v = view.get();
  const hit = settingsCache[dim];
  if (hit && hit.from === v) return hit.value;
  const value: ViewSettings = { cameraMode: v.camera[dim], frame: v.frame, colorMode: v.colorMode, exaggerate: v.exaggerate };
  settingsCache[dim] = { from: v, value };
  return value;
}

// Pantalla de inicio: visible hasta que se elige cómo empezar.
const intro = createValue(!skipIntro);
export const useIntro = intro.use;

// Tutorial guiado: índice del paso actual, o null si no está en curso.
const tour = createValue<number | null>(query.has('tour') ? Number(query.get('tour')) || 0 : null);
export const useTour = tour.use;
export const setTour = tour.set;

/** Vuelve a la pantalla de inicio con el cohete en la plataforma. */
export function showIntro(): void {
  act(() => reset(MISSION_PARAMS));
  tour.set(null);
  intro.set(true);
}

/** Empieza una misión nueva. Con `tutorial` arranca en pausa y con el recorrido guiado. */
export function startMission(opts: { autoCrew: boolean; tutorial: boolean }): void {
  act(() => {
    const s = reset(MISSION_PARAMS, { autoCrew: opts.autoCrew });
    if (opts.tutorial) return s;
    return play(opts.autoCrew ? setWarp(s, 10) : s);
  });
  tour.set(opts.tutorial ? 0 : null);
  intro.set(false);
}
