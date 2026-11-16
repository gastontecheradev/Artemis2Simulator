import { useSyncExternalStore } from 'react';
import type { CameraMode, ViewDim, ViewSettings } from '../render/scene';
import { advance } from '../sim/advance';
import { pause, play, reset, setSwitch, setWarp } from '../sim/commands';
import { MISSION_PARAMS } from '../sim/mission/params';
import { Locale } from '../sim/i18n';
import { SimState, createStore } from '../sim/state';
import { setUiLocale } from './i18n';

const query = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);

/**
 * URL parameters for testing and demos:
 * - `?met=<seconds>`: the mission starts fast-forwarded to that MET, flown by the
 *   automatic crew (`?met=406000` is shortly before the lunar flyby).
 * - `?auto`: leaves the automatic crew enabled.
 * - `?warp=<n>`: starts running at that simulation speed.
 * - `?tour=<n>`: opens the tutorial at step n (from 0).
 * Any of them skips the start screen.
 */
const skipIntro = ['met', 'auto', 'warp', 'tour'].some((k) => query.has(k));
// ?lang=es sets the language without going through the menu.
const queryLang = query.get('lang');
if (queryLang === 'es' || queryLang === 'en') setUiLocale(queryLang);

function initialState(): SimState {
  let s = reset(MISSION_PARAMS);
  const met = Number(query.get('met'));
  if (query.has('met') && met > s.t) {
    let f = play(setSwitch(s, 'autoCrew', true));
    while (f.t < met && !f.outcome) {
      // In short segments, so the active procedure and the jettisoned parts keep advancing.
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

/** Simulation store. The UI only modifies it by dispatching commands from sim/commands.ts. */
export const simStore = createStore(initialState());

// The simulation changes every frame; the panel redraws at ~10 Hz with a snapshot of the state.
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

/** Simulation state for React components (updated at ~10 Hz). */
export const useSim = (): SimState => useSyncExternalStore(subscribeUi, () => snapshot);

/** Dispatches a command and refreshes the panel immediately (so clicks respond instantly). */
export function act(command: (s: SimState) => SimState): void {
  simStore.dispatch(command);
  flush();
}

// --- UI state that is not part of the simulation ---

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

/** Settings shared by both views, plus each one's camera. */
export interface ViewState {
  readonly mapFrame: ViewSettings['mapFrame'];
  readonly camera: Readonly<Record<ViewDim, CameraMode>>;
}

// Also via URL: ?cam3d=earth, ?map=inertial (2D map only).
const view = createValue<ViewState>({
  mapFrame: pick('map', ['inertial', 'rotating'] as const, 'rotating'),
  camera: { '2d': 'overview', '3d': pick('cam3d', CAMERAS, 'auto'), inset: 'earth' },
});

export const useViewState = view.use;
export const setViewState = (patch: Partial<ViewState>): void => view.set({ ...view.get(), ...patch });
export const setCamera = (dim: ViewDim, mode: CameraMode): void =>
  view.set({ ...view.get(), camera: { ...view.get().camera, [dim]: mode } });

// The scene compares by identity to know whether something changed: the same object is returned while nothing changes.
const settingsCache: { [K in ViewDim]?: { from: ViewState; value: ViewSettings } } = {};
export function getViewSettings(dim: ViewDim): ViewSettings {
  const v = view.get();
  const hit = settingsCache[dim];
  if (hit && hit.from === v) return hit.value;
  const value: ViewSettings = { cameraMode: v.camera[dim], frame: 'inertial', // the 3D view is always in the inertial frame
     mapFrame: v.mapFrame };
  settingsCache[dim] = { from: v, value };
  return value;
}

/** Pre-mission screens: language, guides and start screen. null = mission in progress. */
export type IntroStep = 'lang' | 'guides' | 'start' | null;
const intro = createValue<IntroStep>(skipIntro ? null : 'lang');
export const useIntro = intro.use;
export const setIntro = intro.set;

/** Picks the language (first menu) and moves on to the guides menu. */
export function chooseLanguage(locale: Locale): void {
  setUiLocale(locale);
  // The initial state already exists in the previous language: it is recreated with the new one.
  act(() => reset(MISSION_PARAMS));
  intro.set('guides');
}

export type GuideId = 'objective' | 'stages' | 'budget' | 'power' | 'ship' | 'docs';
/** Guide open in the viewer (from the start menu or the GUIDES button). */
const GUIDES = ['objective', 'stages', 'budget', 'power', 'ship', 'docs'] as const;
// ?guide=stages opens a guide directly (for screenshots).
const guide = createValue<GuideId | null>(query.has('guide') ? pick('guide', GUIDES, 'objective') : null);
export const useGuide = guide.use;
export const setGuide = guide.set;

// Guided tutorial: index of the current step, or null if not running.
const tour = createValue<number | null>(query.has('tour') ? Number(query.get('tour')) || 0 : null);
export const useTour = tour.use;
export const setTour = tour.set;

/** Returns to the start screen with the rocket on the pad (the language is already chosen). */
export function showIntro(): void {
  act(() => reset(MISSION_PARAMS));
  tour.set(null);
  intro.set('start');
}

/** Starts a new mission. With `tutorial` it starts paused and with the guided tour. */
export function startMission(opts: { autoCrew: boolean; tutorial: boolean }): void {
  act(() => {
    const s = reset(MISSION_PARAMS, { autoCrew: opts.autoCrew });
    if (opts.tutorial) return s;
    return play(opts.autoCrew ? setWarp(s, 10) : s);
  });
  tour.set(opts.tutorial ? 0 : null);
  intro.set(null);
}
