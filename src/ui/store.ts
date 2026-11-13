import { useSyncExternalStore } from 'react';
import type { ViewSettings } from '../render/scene';
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
 * - `?e3`: arranca en E3, sin el ascenso guionado.
 * Cualquiera de ellos saltea la pantalla de inicio.
 */
const skipIntro = ['met', 'auto', 'warp', 'e3'].some((k) => query.has(k));

function initialState(): SimState {
  let s = reset(MISSION_PARAMS, { fromLaunch: !query.has('e3') && !query.has('met') });
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

// Ajustes de la vista. También por URL: ?cam=overview&frame=rotating&color=network&dim=3d&big
const view = createValue<ViewSettings>({
  cameraMode: pick('cam', ['auto', 'overview', 'ship', 'earth', 'moon'] as const, 'auto'),
  frame: pick('frame', ['inertial', 'rotating'] as const, 'inertial'),
  colorMode: pick('color', ['phase', 'network'] as const, 'phase'),
  exaggerate: query.has('big'),
  dim: pick('dim', ['2d', '3d'] as const, '2d'),
});

export const getViewSettings = view.get;
export const useViewSettings = view.use;
export const setViewSettings = (patch: Partial<ViewSettings>): void => view.set({ ...view.get(), ...patch });

// Pantalla de inicio: visible hasta que se elige cómo empezar.
const intro = createValue(!skipIntro);
export const useIntro = intro.use;

/** Vuelve a la pantalla de inicio con la misión lista en la plataforma. */
export function showIntro(): void {
  act(() => reset(MISSION_PARAMS, { fromLaunch: true }));
  intro.set(true);
}

/** Empieza una misión nueva desde el lanzamiento (ascenso guionado) o desde E3. */
export function startMission(opts: { fromLaunch: boolean; autoCrew: boolean }): void {
  act(() => {
    const s = reset(MISSION_PARAMS, { fromLaunch: opts.fromLaunch, autoCrew: opts.autoCrew });
    return play(opts.autoCrew ? setWarp(s, opts.fromLaunch ? 10 : 100) : s);
  });
  intro.set(false);
}
