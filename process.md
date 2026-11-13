# Registro de sesiones

## Estado actual

- **Hito en curso:** primera pasada completa de H1 a H12. Falta la revisión manual en un navegador real y el deploy (ver "Próximo paso").
- **Funciona:**
  - Simulación (`src/sim/`): física CR3BP con Dormand–Prince 5(4), eventos, encendidos, predicción, comunicaciones, alarmas, procedimientos y guiado de correcciones. La misión nominal corre sola de E3 a E15.
  - Panel (`src/ui/`): barra de estado con Master Alarm, Display Unit con soft keys (uno o dos según el ancho), páginas Flight.Traj, Procs, Prop.Sys y Comm.Sum, interruptores con guarda, controles de tiempo, log, pantalla final y créditos.
  - Vista (`src/render/`): 2D y 3D, marco inercial y rotante, trazo por fase o por red, marcadores numerados, cuatro modos de cámara, zoom.
  - 29 tests en verde (`npm test`, desde PowerShell). `npm run build` compila.
- **Verificado solo con capturas en Chrome headless y con tests a nivel de comandos.** Nadie hizo clic todavía en un navegador real: los interruptores, las soft keys, la rueda, el pellizco y el arrastre de la vista 3D están sin probar a mano.
- **Sin hacer:** texturas y fotos de NASA (pendientes de elegir, ver `ASSETS.md`), deploy efectivo en GitHub Pages (el workflow está escrito pero no se hizo push), y los opcionales posteriores a H12.
- **Próximo paso:** abrir `npm run dev`, volar la misión completa a mano siguiendo Procs y anotar acá lo que falle o resulte incómodo.

## Decisiones vigentes

1. **Integrador:** Dormand–Prince 5(4) adaptativo con `rtol = 1e-11`. Es exigente a propósito: el retorno libre es muy sensible y el resultado no puede depender de cómo los frames cortan los pasos (hay un test que compara una corrida de un tirón con una frame a frame en warp ×10000).
2. **La velocidad de 3.png (17.627 mph = 7,880 km/s) no es inercial.** Con 7,880 km/s inercial no hay forma de que el apogeo caiga en 00:49:52 y el perigeo siguiente en 01:48:48. La calibración da **8,1636 km/s** inercial; la diferencia (~0,28 km/s) es del orden de la rotación terrestre, así que el dato de la imagen es casi seguro relativo a la Tierra. **Contradicción con CLAUDE.md anotada**: se priorizan los tiempos de 3.png.
3. **Estado inicial (E3):** altitud 162,94 km (3.png); velocidad vertical 0,576 km/s, sacada de la subida de 511.884 a 534.564 ft en los 12 s entre MECO y separación (3.png) → ángulo de trayectoria **4,05°**; velocidad 8,1636 km/s ajustada para que el apogeo caiga en MET 00:49:52. Perigeo de inserción: −6 km (bajo la superficie, como dice CLAUDE.md).
4. **E4 y E5 se disparan por MET** (los de 3.png) y la calibración hace que coincidan con el apogeo y el perigeo. E4 = +380,7 m/s (el perigeo siguiente cae en 01:48:48), E5 = +2.417,1 m/s (órbita alta cuyo perigeo cae 23,5 h después de E5).
5. **Órbita terrestre resultante:** 1.486 × 1.684 km tras E4 y 1.674 × 68.973 km tras E5/E8. No coincide con las altitudes reales de la misión; es lo que imponen los tiempos de 3.png con encendidos impulsivos.
6. **Parámetros sin dato en las imágenes (supuestos, editables en `params.json`):** E7 en MET 05:10:00 con +1 m/s; E8 en el apogeo de la órbita alta con +10 m/s; TLI en el perigeo, MET 001/01:18:48.
7. **Retorno libre:** variables = fase lunar (`moonAngle0Deg`, equivale a la fecha de lanzamiento) y Δv del TLI. Resultado: 69,2227° y 400,586 m/s → sobrevuelo a 6.513,00 km, EI con γ = −6,000° y 10,99 km/s. Ida 3,69 d, vuelta 3,81 d, **total 8,55 d** (1.png dice ~10 d con ~4 d por tramo; el modelo circular con estos perigeos da un poco menos).
8. **Corredor de entrada:** −6° ± 1° (`ENTRY_CORRIDOR`). **Sin verificar** con fuentes de NASA.
9. **Presupuesto de Δv de Orion:** 1,2 km/s (`ORION_DV_BUDGET`). **Sin verificar.** La misión nominal usa 411,6 m/s.
10. **Límite NSN/DSN:** 35.786 km de altitud (geoestacionaria: ahí orbitan los satélites relé de la NSN). 2.png no da el valor.
11. **Encendidos de la tripulación:** al accionar el interruptor dentro de la ventana (TIG − 120 s) el encendido queda *comprometido* y se ejecuta solo exactamente en el TIG. Si se acciona después del TIG, se ejecuta en el momento. Ventana perdida a TIG + 300 s (WARNING). Así la misión nominal es reproducible y los errores de la tripulación siguen teniendo consecuencias físicas.
12. **Tripulación automática** (`CREW AUTO`): interruptor real del panel que ejecuta las acciones manuales en su momento nominal. La usan los scripts y los tests. Con ella activa no hay auto‑pausa ni bajada de warp.
13. **Estado:** `SimState` inmutable salvo `trail`, que es un buffer al que solo se le agregan puntos (compartido entre estados por rendimiento).
14. **Archivos fuera de la estructura de CLAUDE.md:** en `src/sim/` (TypeScript puro): `advance.ts` (avance por tramos y eventos), `orbit.ts` (elementos osculantes, Jacobi), `guidance.ts` (guiado de OTC/RTC), `format.ts`, `mission/params.ts`. En `src/ui/`: `store.ts`, `styles.css` (layout; `theme.css` queda para paleta y tipografía), `TrajectoryView.tsx`, `EndScreen.tsx`, `Credits.tsx`, `panel/pages/index.ts`. Además `scripts/lib/calibration.ts`.
15. **Paleta:** `scripts/extract-palette.ts` muestrea 9.png y 10.png (panel y pantalla), 1.png (trazo por fase y color liso de los cuerpos) y 2.png (trazo por red) y reescribe el bloque marcado de `theme.css`. Los demás tonos son mezclas de esos colores con blanco o negro (`color-mix`), sin matices nuevos. El verde de valores sale oscuro en la captura (`#08990d`); en pantalla se usa aclarado con blanco para que se lea.
16. **Panel pinta a ~10 Hz** con una foto del estado (`useSim`); la vista de trayectoria dibuja en cada frame leyendo el store directo. Los comandos refrescan el panel al instante.
17. **Origen flotante desde el 2D:** `worldToScene()` resta el punto que sigue la cámara antes de pasar a unidades de escena (1 unidad = 1.000 km). Los trazos se construyen anclados al baricentro y se desplazan como objeto.
18. **Correcciones (OTC/RTC):** el guiado busca por secante el Δv sobre el eje *radial* del marco local (perpendicular a la velocidad, en el plano). OTC apunta a 6.513 km de sobrevuelo; RTC al ángulo objetivo del corredor.
19. **Parámetros de URL** (ayuda para pruebas y demos): `?met=<s>` arranca adelantado, `?auto` deja la tripulación automática, `?warp=<n>` arranca corriendo, y `?cam=`, `?frame=`, `?color=`, `?dim=`, `?big` fijan la vista.
20. **Sin imágenes de NASA todavía:** Tierra y Luna son esferas de color liso y la pantalla final tiene un recuadro vacío. Pendientes anotados en `ASSETS.md`.

## Problemas abiertos

- Corredor de entrada y presupuesto de Δv sin verificar (decisiones 8 y 9).
- Duración total 8,55 d contra los ~10 d de 1.png (decisión 7).
- Interacción sin probar a mano en un navegador real (ver "Estado actual").
- Vitest falla si se lanza desde Git Bash (`Cannot read properties of undefined (reading 'config')`, por la diferencia de mayúsculas en la ruta `c:/` vs `C:/`). Desde PowerShell funciona.
- A escala real la Luna mide ~3 px en la vista general y queda tapada por el ícono de la nave durante el sobrevuelo. El toggle "CUERPOS ×6" lo compensa, pero tapa las órbitas bajas.
- Los colores del modelo 3D de Orion (blanco, gris, azul de paneles) están puestos a mano en `render/ship.ts`, no salen de la paleta extraída.
- El bundle pesa 793 kB (215 kB gzip) por Three.js; Vite avisa del tamaño. No se hizo code‑splitting.
- Cuando la tripulación no es automática, el warp baja a ×10 antes de E4 y E5 y no vuelve solo al valor anterior.

## Diferencias del panel contra 9.png y 11.png (cierre de H8)

Comparado con capturas a 1400 y 1920 px de ancho.

- **Se parece:** bisel gris metálico con marco oscuro alrededor de la pantalla negra; teclas arriba, abajo y a los costados; menú de páginas con la activa recuadrada en verde; barra de título central con `Sistema.Página` a la izquierda, reloj al medio y título en barra verde con corte en diagonal a la derecha; acciones en cajas verdes pegadas a las teclas laterales; paso actual en magenta; placas negras F1–F3 con tornillos; guardas de franjas amarillas y negras; Master Alarm en dos mitades WARNING/CAUTION.
- **Difiere:** 6 teclas por lado horizontal (la referencia tiene 8) y no hay perillas Pwr/Src/Brt; los interruptores son SVG planos, no palancas fotográficas; la guarda es un botón sobre la palanca en vez de una tapa con bisagra; no hay controladores manuales ni bola de actitud (fuera de alcance); la barra de estado superior no existe en la cabina real; la referencia muestra tres pantallas y acá son una o dos.

## Historial de sesiones

## Sesión 1 — 2026-11-13 — Hitos H1–H12 (primera pasada)
**Hecho:**
- H1: esqueleto Vite + TS + React + Three + Vitest, layout dividido (`ui/App.tsx`).
- H2–H5: `sim/math/vec3`, `constants`, `bodies`, `gravity`, `integrator`, `events`, `orbit`, `burns`, `propulsion`, `propagate`.
- H6–H7: `state`, `advance`, `commands`, `mission/*`, `scripts/calibrate-insertion.ts`, `scripts/tune-free-return.ts` → `params.json`.
- H8–H9: `scripts/extract-palette.ts`, `ui/theme.css`, `ui/styles.css`, `ui/panel/*` (StatusBar, DisplayUnit, páginas, SwitchPanel, TimeControls, EventLog), `sim/comms`, `sim/alarms`, `sim/guidance`.
- H10–H11: `render/*` (worldToScene, camera con rigs 2D y 3D, bodies, ship con ícono SVG y modelo procedural, trails con `Line2`, markers como capa HTML, scene).
- H12: `ui/EndScreen.tsx` (siete finales posibles), `ui/Credits.tsx` (lee `ASSETS.md`), layout apilado bajo 900 px, `.github/workflows/deploy.yml`, `scripts/optimize-images.ts`, `ASSETS.md`.

**Decisiones:** ver "Decisiones vigentes" 1–20. Alternativas descartadas: RK4 de paso fijo (no da la reproducibilidad que pide el retorno libre); ejecutar los encendidos en el instante del clic (un error de segundos en el TLI saca la entrada del corredor, la misión nominal sería imposible a mano); `CSS2DRenderer` para etiquetas (una capa HTML propia alcanza y sirve igual en 2D y 3D).

**Problemas:**
- La tripulación automática no separaba el CM/SM: los disparadores por altitud solo se evaluaban al final de un tramo largo. Resuelto acotando el tramo después del TLI (`maxChunk`).
- Los dos primeros tests del panel fallaban por un error del test: la "tripulación" separaba el ICPS en el segundo 0 y la nave reentraba (la física hizo lo correcto). Ahora espera a que el primer paso del procedimiento esté cumplido.
- Las teclas derechas del Display Unit quedaban amontonadas por la auto‑ubicación de CSS grid. Resuelto con posiciones explícitas.
- Los heredocs largos con comillas simples fallan en Git Bash; los archivos se escribieron con la herramienta de escritura.

**Tests:** `tests/physics.test.ts` (14: constantes, Luna, Kepler, energía, Jacobi, independencia del corte de pasos, vis‑viva, marco local, EI, LOS, red y retardo) y `tests/mission.test.ts` (15: H6, H7, LOS/AOS, Δv, frame a frame, misión volada con los comandos del panel, predicción, ventana perdida, inhibición con ICPS acoplado, OTC y RTC). Los 29 pasan.

**Próximo paso:** probar a mano en el navegador (`npm run dev`), elegir las imágenes de NASA para `ASSETS.md` y, cuando esté conforme, hacer push para que corra el workflow de GitHub Pages (hay que activar Pages con origen "GitHub Actions" en el repo).
