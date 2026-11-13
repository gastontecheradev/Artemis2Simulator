# Registro de sesiones

## Estado actual

- **Hito en curso:** H1–H12 con primera pasada completa, más el ascenso guionado (era opcional). Falta la revisión manual en un navegador real y el deploy.
- **Funciona** (con cómo se verificó):
  - Simulación de E1 a E15: 35 tests en verde (`npm test`, desde PowerShell).
  - Panel, vista 2D/3D, pantalla de inicio y de fin: capturas en Chrome headless a 700, 1500 y 1920 px.
  - `npm run build` compila sin errores de tipos.
- **Sin verificar:** la interacción a mano. Nadie hizo clic todavía en un navegador real: interruptores, soft keys, atajos de teclado, rueda, pellizco, arrastre de la vista 3D y tooltips de los marcadores solo están cubiertos a nivel de comandos o de captura estática.
- **Publicado** en https://gastontecheradev.github.io/Artemis2Simulator/ (deploy por GitHub Actions en cada push a `main`; verificado: workflow en verde y la página responde 200).
- **Sin hacer:** texturas y fotos de NASA (ver `ASSETS.md`) y los opcionales listados en `CLAUDE.md`.
- **Próximo paso:** `npm run dev`, volar la misión completa a mano siguiendo Procs y anotar acá lo que falle o resulte incómodo.

## Decisiones vigentes

Valores calibrados actuales (fuente de verdad: `src/sim/mission/params.json`):

| Parámetro | Valor |
|---|---|
| Inserción (E3) | 8,1636 km/s inercial, ángulo 4,05°, perigeo −6 km |
| E4 / E5 (ICPS) | +380,7 m/s / +2.417,1 m/s |
| Órbitas | 1.486 × 1.684 km tras E4; 1.674 × 68.973 km tras E5 y E8 |
| E7 / E8 (supuestos) | +1 m/s en MET 05:10:00 / +10 m/s en el apogeo, MET 13:32:44 |
| TLI (E9) | +400,581 m/s en MET 001/01:18:48, fase lunar 69,2196° |
| Sobrevuelo (E11) | 6.513,0 km en MET 004/17:49:48; LOS de ~42 min |
| Entrada (E14) | −5,660° y 10,990 km/s en MET 008/13:15:21 |
| Δv de Orion usado | 411,6 m/s de 1.050 |

1. **La velocidad de 3.png no es inercial.** Con 7,880 km/s inercial es imposible cumplir los tiempos de E4 y E5. Se priorizan los tiempos y la velocidad se calibra. Contradice el CLAUDE.md original; ya está corregido ahí.
2. **Integrador Dormand–Prince 5(4) con `rtol = 1e-11`.** Descartado RK4 de paso fijo: no da la reproducibilidad que exige el retorno libre.
3. **E4 y E5 se disparan por MET** y la calibración hace que caigan en el apogeo y el perigeo.
4. **Encendidos de la tripulación comprometidos al TIG.** Descartado ejecutar en el instante del clic: un error de segundos en el TLI saca la entrada del corredor y la misión nominal sería imposible a mano.
5. **Corredor de entrada: objetivo −5,66°** (Artemis I, NASA AAS 24‑174; coincide además la velocidad, 36.063 ft/s = 10,99 km/s). Ancho ±1°: supuesto.
6. **Presupuesto de Δv: 1.050 m/s** (Wikipedia, no es fuente primaria).
7. **Límite NSN/DSN: 35.786 km** (altitud geoestacionaria, donde orbitan los relés de la NSN). 2.png no da el valor.
8. **Guiado de correcciones:** secante sobre el eje radial del marco local. OTC apunta a 6.513 km; RTC al ángulo objetivo.
9. **Ascenso guionado:** interpolación lineal de la tabla de 3.png. Al llegar a E3 la velocidad mostrada pasa de 7,880 (relativa) a 8,164 km/s (inercial): es el salto del punto 1 a la vista, y la pantalla lo rotula.
10. **Cámara automática por defecto** y **arranque desde el lanzamiento** con pantalla de inicio.
11. **Estrellas decorativas:** posiciones al azar con semilla fija. No es un catálogo y `CLAUDE.md` lo dice.
12. **`CLAUDE.md` no se commitea** (está en `.gitignore`). El original quedó en `CLAUDE.md.bak`, también ignorado.

## Problemas abiertos

- Interacción sin probar a mano (ver "Estado actual").
- Duración total 8,55 d contra los ~10 d de 1.png.
- Ancho del corredor y presupuesto de Δv sin fuente primaria. No se encontró dato público del ángulo de entrada de Artemis II; algunas notas hablan de una entrada más empinada que la de Artemis I.
- Referencias de la misión real encontradas en prensa (sin fuente primaria): TLI de 5 min 50 s y apogeo de la órbita alta de ~74.000 km. El modelo da 69.000 km.
- El lockfile solo lo acepta npm ≥ 11.6 (con versiones anteriores, `npm ci` da "Missing: @emnapi/runtime … from lock file", por las dependencias opcionales WASM de rolldown). El workflow fija `npm@11.6.2`. Si se cambia de npm en local, revisar que `npm ci` siga pasando en CI.
- Vitest falla desde Git Bash por las mayúsculas de la ruta; desde PowerShell funciona.
- El bundle pesa ~800 kB (215 kB gzip) por Three.js; sin code‑splitting.
- El color de los paneles solares del modelo 3D sale gris azulado de 4.png (`#9398a5`): la muestra agarra el dorso de los paneles, no las celdas.
- El guiado de RTC converge en los casos probados (TLI desviado 0,2–0,3 m/s); con desvíos grandes puede no converger y hay que usar la maniobra manual.

## Diferencias del panel contra 9.png y 11.png

- **Se parece:** bisel gris metálico con marco oscuro alrededor de la pantalla negra; teclas en los cuatro lados; menú con la página activa recuadrada en verde; barra de título central con `Sistema.Página`, reloj y barra verde con corte en diagonal; acciones en cajas verdes junto a las teclas; paso actual en magenta; placas negras F1–F3 con tornillos; guardas de franjas amarillas y negras; Master Alarm en dos mitades.
- **Difiere:** 6 teclas por lado horizontal (la referencia tiene 8) y sin perillas; interruptores SVG planos, no palancas fotográficas; la guarda es una tapa translúcida con botón, no una tapa con bisagra; sin controladores manuales ni bola de actitud; la barra de estado superior no existe en la cabina real; una o dos pantallas en vez de tres.

## Historial de sesiones

## Sesión 2 — 2026-11-13 — Mejoras posteriores a H12
**Hecho:**
- Verificación con fuentes: ángulo de entrada (−5,66°, Artemis I) y Δv de Orion (1.050 m/s). `constants.ts` actualizado y retorno libre reajustado.
- Ascenso guionado E1–E3 (`sim/mission/ascent.ts`, `advance.ts`), con su vista en Flight.Traj.
- Pantalla de inicio (`ui/StartScreen.tsx`) con modo demostración; REINICIAR vuelve ahí.
- Página Mission.Tl (`pages/Timeline.tsx`) y cuenta regresiva al próximo evento en la barra de estado (`timeline.ts`: `timelineStatus`, `nextEvent`).
- Cámara automática por fase, campo de estrellas (`render/stars.ts`), anillo de EI y esfera de influencia lunar, puntos para cuerpos chicos, destello de encendido, tooltips en los marcadores.
- El warp vuelve solo a su valor después de E4 y E5 (`warpRestore`).
- Atajos de teclado. Colores del modelo 3D sacados de 4.png. Tapa visible en las guardas.
- `CLAUDE.md` reescrito para reflejar el proyecto real; `README.md` nuevo.

**Decisiones:** 5, 6 y 9–12 de arriba.

**Problemas:** al parchear archivos con `node -e "..."` desde Bash, el shell expandía los `${}` de los template strings y rompía el reemplazo; se pasó a scripts temporales con heredoc entre comillas o a la herramienta de edición.

**Tests:** 6 nuevos en `tests/mission.test.ts` (ascenso: tabla, empalme con E3 y misma misión desde el lanzamiento; próximo evento; línea de tiempo completa; restauración del warp). Total 35, todos pasan.

**Próximo paso:** prueba manual en navegador; elegir imágenes de NASA; push cuando Gastón lo decida.

## Sesión 1 — 2026-11-13 — Hitos H1–H12 (primera pasada)
**Hecho:** esqueleto; núcleo `src/sim/` completo; scripts de calibración y retorno libre; paleta extraída; panel (`ui/panel/*`); vista 2D/3D (`render/*`); fin de misión, créditos, layout angosto, workflow de GitHub Pages, `ASSETS.md`.

**Decisiones:** 1–4, 7 y 8 de arriba. Además: `SimState` inmutable salvo `trail`; panel a ~10 Hz; origen flotante desde el 2D; capa HTML propia en vez de `CSS2DRenderer`.

**Problemas:**
- La tripulación automática no separaba el CM/SM porque los disparadores por altitud solo se evaluaban al final de un tramo largo. Resuelto acotando el tramo después del TLI (`maxChunk`).
- Dos tests del panel fallaban por un error del test: la "tripulación" separaba el ICPS en el segundo 0 y la nave reentraba (la física hizo lo correcto).
- Las teclas derechas del Display Unit quedaban amontonadas por la auto‑ubicación de CSS grid. Resuelto con posiciones explícitas.

**Tests:** `tests/physics.test.ts` (14) y `tests/mission.test.ts` (15 en ese momento).
