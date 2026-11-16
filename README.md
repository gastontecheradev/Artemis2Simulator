# Artemis II Simulator

A web simulator of the Artemis II mission: a crewed free-return flight around the Moon, from the launch pad to atmospheric entry. Nothing is drawn in advance. The rocket climbs on the thrust and mass of its engines, and the trajectory is decided by the gravity of Earth and the Moon.

On the left is the spacecraft panel, inspired by Orion's cockpit, with a mission control window (Houston) that gives the calls for each stage. On the right, a fixed 2D map, like an infographic, with the whole mission plan and the flight data, and below it a 3D view that follows the spacecraft up close.

The interface is in **English** (default) and **Spanish**. The vehicle data, the timeline and the target orbits come from the reference guides NASA published for Artemis II.

> Educational project. Not affiliated with or endorsed by NASA.

## How to run it

You need Node 22 or newer.

```
npm install
npm run dev
```

Open the address shown in the terminal. First you pick the language; then the guides menu appears (mission objective, stages, budget, power management, about the spacecraft and NASA documentation), which you can reopen with the GUIDES button. From the start screen you can:

- **Start the mission** and fly it yourself.
- Take the **guided tutorial**, which explains the spacecraft and the panel and walks you through liftoff and the first burn.
- Turn on **demo mode**, where the automatic crew flies everything.

## How to fly

1. The countdown (from T‑6 s), the ascent and the two ICPS burns are automatic, as in the real flight.
2. After that, the display's **Procs** page shows each procedure and its current step, highlighted in magenta.
3. The simulation pauses on its own before each crew action. With the warp (×1 to ×10000) there is no need to wait.
4. For a burn: confirm the Δv with the **CONF ΔV** key, raise the engine guard and throw the switch. The engine ignites on its own at the planned instant and shuts down once it has delivered the Δv.
5. If you are late, change the Δv, point the spacecraft the wrong way or do not burn, physics decides: you may stay in orbit, miss the Moon, hit it or come back outside the entry corridor.

| Key | Action |
|---|---|
| Space | Play / pause |
| `+` and `−` | Raise and lower the warp |
| `A` | Acknowledge alarms |
| `1` to `5` | 3D view camera: automatic, overview, spacecraft, Earth, Moon |
| `←` and `→` | Rotate the spacecraft (with the autopilot in MAN) |
| `↑` and `↓` | Thrust forward or backward with the small thrusters |

The 2D map can be shown in the Earth‑Moon rotating frame (default: Earth and Moon stand still and you can see the free return's "figure 8") or in the inertial frame (the Moon travels along its orbit). It zooms with the mouse wheel or a pinch, pans by dragging, and a double-click brings back the whole mission. The nominal plan is drawn faintly from the start and gets filled in by the actual trail. The flight data (time, speed, distances, temperature and propellant) sit on top of the map. The trail is colored by phase. In the 3D view (which only shows the trail already flown) you pick the camera, an inset shows the Earth vicinity seen from above, and you can watch the boosters, the launch abort tower, each stage and the CubeSats separate.

## What it simulates and what it does not

**It simulates:**

- The rocket's ascent with the thrust, propellant flow and mass of each stage, air drag and Earth's rotation.
- Burns in space with their real duration and the propellant they use.
- The gravity of Earth and the Moon, with the Moon on its real April 2026 orbit.
- The spacecraft's orientation: the engines thrust where it points.
- The fall of the parts that separate, including the ICPS disposal burn and the four CubeSats.
- The published booster thrust curve and the RS‑25 power schedule.
- The active communications network and the loss of signal behind the Moon.

**It does not simulate:**

- Atmospheric entry: the physics ends at entry interface, at 122 km.
- The third dimension: everything happens in the plane of the lunar orbit, and the spacecraft only pitches.
- The spacecraft's inertia when rotating.
- The electrical system (the power guide explains it, but there are no simulated values).
- Temperature with a real thermal model: the one shown is a simple estimate.

**It does not reproduce the real flight to the second.** The times from E1 to E7 are the published ones, and the guidance and burns are tuned to reproduce the end of the ascent, the published Earth orbits and the TLI time in the official timeline. The Moon follows its real April 2026 orbit (fitted to JPL Horizons). Physics decides the rest: the flyby comes 17 minutes after the published one and entry interface 36 minutes before (9.04 days versus 9.06). Several vehicle figures are assumptions, and they are marked as such in the code.

## Development

| Command | What it does |
|---|---|
| `npm test` | Physics and mission tests |
| `npm run build` | Type check and build into `dist/` |
| `npm run tune` | Recomputes the ascent guidance, the burns and the free return |
| `npm run path` | Regenerates only the nominal plan the map draws faintly |
| `npm run palette` | Extracts the palette from the reference images |

On Windows, run the tests from PowerShell.

The code has three layers: `src/sim/` (physics and mission, pure TypeScript), `src/render/` (Three.js) and `src/ui/` (React). Data sources and assumptions are cited in comments next to each constant, in `src/sim/constants.ts` and `src/sim/vehicle.ts`.

## Credits

The NASA reference images used during development are not part of the repository or the application. The images the application uses are registered in [ASSETS.md](ASSETS.md) with their credit. IBM Plex Mono typeface (SIL Open Font License). Graphics with Three.js (MIT). Program cost cited from report IG‑22‑003 of NASA's Office of Inspector General.
