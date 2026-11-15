# Registro de sesiones

## Estado actual

- **Hito en curso:** H1–H12 con primera pasada completa, más vuelo propulsado completo (sin tramos guionados), actitud y controladores manuales, partes desprendidas, vista dividida y tutorial.
- **Funciona** (con cómo se verificó):
  - Simulación de E1 a E15 con motores, masa y arrastre reales: 43 tests en verde (`npm test`, desde PowerShell).
  - Panel con hasta tres pantallas, vista 2D + 3D, pantalla de inicio, tutorial y pantalla final: capturas en Chrome headless a 1700, 1920 y 2600 px.
  - `npm run build` compila sin errores de tipos.
- **Sin verificar:** la interacción a mano. Nadie hizo clic todavía en un navegador real. Interruptores, soft keys, controladores manuales (botones y flechas del teclado, que actúan mientras se mantienen apretados), rueda, pellizco, arrastre de la vista 3D, tooltips y el avance de los pasos del tutorial solo están cubiertos a nivel de comandos o de captura estática.
- **Publicado** en https://gastontecheradev.github.io/Artemis2Simulator/ (deploy por GitHub Actions en cada push a `main`). Lo publicado es anterior a esta sesión: los cambios de la sesión 3 están en commits locales, sin push.
- **Sin hacer:** texturas y fotos de NASA (se dejaron para el final, ver `ASSETS.md`) y los pendientes listados en `CLAUDE.md`.
- **Próximo paso:** `npm run dev`, hacer el tutorial y volar la misión completa a mano; anotar acá lo que falle o resulte incómodo. Después, las texturas.

## Decisiones vigentes

Valores calibrados actuales (fuente de verdad: `src/sim/mission/params.json`):

| Parámetro | Valor |
|---|---|
| Guiado del ascenso | cabeceo 3,121°, tangente 9,60·10⁻⁴ 1/s, tope de aceleración 2,99 g |
| Inserción (E3) | 162,94 km, 7,880 km/s relativos = 8,298 km/s inerciales, ángulo 4,03° |
| Órbita de inserción | apogeo 2.266 km en MET 00:58:02; perigeo bajo la interfaz de entrada |
| E4 / E5 (ICPS) | 211,0 m/s en 110 s / 2.321,8 m/s en 925 s |
| Órbita alta | ~1.120 × 69.190 km; apogeo en MET 13:36:46 |
| E7 / E8 (supuestos) | +1 m/s en MET 05:10:00 / +10 m/s en el apogeo |
| TLI (E9) | 388,5 m/s en 361 s, ignición MET 001/01:15:43; fase lunar 191,66° |
| Sobrevuelo (E11) | 6.513,0 km en MET 004/18:13:41; LOS de ~42 min |
| Entrada (E14) | −5,660° y 10,990 km/s en MET 008/13:07:04 |
| Δv entregado | ICPS 2.532,8 m/s; Orion 399,5 m/s |
| Partes que caen | boosters MET 00:05:33, torre de escape 00:08:57, etapa central 01:49:28 |

1. **Todo el vuelo es física, sin tramos guionados.** El ascenso se integra con empuje, masa y arrastre; los encendidos duran lo que tarda el motor en entregar el Δv. Lo programado es lo que en el vehículo real también lo está: la secuencia por tiempo y las leyes de guiado.
2. **La velocidad publicada del ascenso es relativa a la Tierra en rotación.** Confirmado en la sesión 3: el ascenso con los datos reales del cohete da 7,89 km/s relativos en la separación con un guiado sin ajustar, contra los 7,880 publicados.
3. **El guiado del ascenso se ajusta a tres datos publicados** (altitud en MECO, altitud y velocidad en la separación) con tres parámetros. El resto de la tabla publicada queda como control y da parecido, no igual (ver `CLAUDE.md`).
4. **E4 y E5 encienden en los MET publicados; se calibra cuánto empujan.** Criterio para E4: que el encendido de E5 quede centrado en el perigeo. Es un criterio propio (minimiza pérdidas por gravedad y no necesita ningún número externo). Descartada la interpretación de la sesión 1 (E4 en el apogeo, E5 en el perigeo), que forzaba órbitas de 1.500 km que no se parecían a nada.
5. **Integrador Dormand–Prince 5(4) con `rtol = 1e-11`**, llevando el propelente de cada tanque como estado. El avance se corta en cada discontinuidad.
6. **Encendidos de la tripulación comprometidos al TIG**; bajar la guarda con el motor encendido lo corta.
7. **Los motores empujan hacia donde apunta la nave.** En DAP AUTO la dirección sigue la ley del encendido en cada instante; en INRTL o MAN, la actitud que tenga.
8. **Actitud cinemática y solo en cabeceo:** rota a 3°/s (supuesto), sin inercia. El modelo es plano.
9. **Corredor de entrada: objetivo −5,66°** (Artemis I, NASA AAS 24‑174). Ancho ±1°: supuesto.
10. **Masas y motores** de `sim/vehicle.ts`: mayormente de Wikipedia (que cita a NASA), con empujes confirmados por NASA y ESA. La suma reproduce la masa de despegue publicada. Los supuestos sin fuente están listados en `CLAUDE.md`.
11. **Límite NSN/DSN: 35.786 km** (altitud geoestacionaria). 2.png no da el valor.
12. **Guiado de correcciones:** secante sobre el eje radial, estimando con un impulso instantáneo. Con el encendido real queda un error de pocos km en el sobrevuelo.
13. **La plataforma está sobre +y** ("arriba" en el mapa) para que el cohete suba hacia arriba en pantalla. La fase lunar se mide desde ahí.
14. **Vista dividida:** dos renderers independientes (2D y 3D). Solo el 2D marca el paso del tiempo.
15. **Estrellas decorativas** con semilla fija; no es un catálogo.
16. **`CLAUDE.md` no se commitea** (está en `.gitignore`). El original de la sesión 1 quedó en `CLAUDE.md.bak`, también ignorado.

## Problemas abiertos

- Interacción sin probar a mano (ver "Estado actual").
- Duración total 8,55 d contra los ~10 d de 1.png.
- **Contradicciones con la guía de referencia de Artemis II** (NASA, "Artemis II Reference Guide", 2026; PDF en el escritorio, `a2-reference-guide-012825.pdf`), pendientes de decisión:
  - Sobrevuelo: la guía dice "aproximadamente 4.700 millas" más allá de la cara oculta (~7.560 km); 1.png dice 4.047 mi / 6.513 km "mean". Se mantiene 6.513 km.
  - MECO: la guía da ~T+483 s; 3.png y la tabla de eventos de la guía del SLS dan 8:06 (486 s). Se mantiene 486 s.
  - La "masa post‑TLI" de 25.854 kg no es compatible con un TLI hecho por Orion (implicaría ~80 m/s). Probablemente viene de Artemis I. No se usa.
  - La guía dice que Orion y el ICPS dan "tres vueltas" a la Tierra en un lugar y "dos órbitas elípticas" en otro.
- **Órbitas terrestres contra la guía del SLS** (NASA, "SLS Reference Guide for Artemis II", oct. 2025, tabla "Artemis II by the Numbers"). Ahora hay fuente primaria; la decisión 4 queda en revisión:
  - Inserción: publicada 28 × 2.222 km; el modelo da 31 × 2.246 km sin haberla ajustado.
  - Tras E4 (PRM, ~30 s cerca del apogeo): publicada 185 × 2.222 km; el modelo da 819 × 2.266 km con 110 s.
  - Tras E5 (ARB, ~20 min): publicada 0 × 74.080 km (perigeo a altitud cero, para la eliminación del ICPS); el modelo da 955 × 69.150 km con 15 min.
  - Tras E8 (PRB de Orion): publicada 185 × 74.080 km; el modelo da 1.124 × 69.194 km. Subir el perigeo de 0 a 185 km en el apogeo pide ~11 m/s (cuenta kepleriana), cerca del supuesto actual de 10 m/s.
  - La tabla de eventos de la guía da altitud y velocidad en el PRM, el ARB, la separación, la demo, la eliminación del ICPS y los CubeSats. En órbita las velocidades son inerciales (PRM: 6,323 km/s publicada, 6,310 en el modelo); en el ascenso son relativas, como en 3.png.
- **Cronograma contra el "Artemis II Overview Timeline"** (NASA, 18/03/2026): TLI 1/01:08:42 (modelo 1/01:15:43); máximo acercamiento lunar 5/00:29:59 (modelo 4/18:13:41); EI 9/01:29 (modelo 8/13:07); amerizaje 9/01:42:48. Cada tránsito dura ~6 h más que en el modelo. Probable causa: la distancia Tierra‑Luna fija de 384.400 km. El cronograma marca el récord de distancia de Apollo 13 (400.171 km, dato externo) antes del acercamiento; el modelo no pasa de 392.654 km.
- **Contradicciones entre los documentos nuevos:**
  - ARB: 01:48:48 (3.png), 01:46:37 (tabla del SLS), 0/01:47 (cronograma).
  - Separación ICPS/Orion: 03:25:41 (3.png, inicio de la demo), 03:22:46 (tabla del SLS), 0/03:23 (cronograma).
  - TLI: 25:00:00 (tabla del SLS) y 1/01:08:42 (cronograma).
  - CubeSats: 05:20:23–05:24:23 (tabla del SLS), ~05:27 (cronograma), 05:29:10–05:33:10 (tabla de cargas). La página 20 de la misma guía dice que se liberan después del TLI, a un tercio de la distancia a la Luna; parece texto viejo.
  - Caída de los boosters: ~5,5 min (texto) y 06:10 (tabla); el modelo da 5:33.
  - RS‑25 al 85 % y de vuelta al 109 %: 2:04 y 2:08 (tabla), ~123 y ~132 s (sección del motor).
  - Propelente de la etapa central: 987,5 t (suma de LH2 y LOX), 998 t ("total propellant weight") o 1.003,7 t (cargada menos vacía). El modelo usa 984 t.
  - El encendido de salida de Orion (E7) dura 2 min "con el motor del módulo de servicio"; el diagrama de la demo lo rotula "AUX DEPARTURE".
  - Duración: 9 d 1 h 43 min (cronograma) contra "~10 días" (1.png y las dos guías).
  - La guía del SLS también dice que Orion y el ICPS dan "tres vueltas" a la Tierra.
- **El ICPS de Artemis II usa un RL10C‑2**, no el RL10B‑2. El Isp del modelo (465,5 s) es el del RL10B‑2; ninguno de los documentos da el del C‑2.
- Max Q cae a los 62 s (publicado: 71 s) y los boosters se separan ~3 km más alto que lo publicado. El perfil de empuje de los boosters es una recta (supuesto); la curva real tiene más estructura.
- Supuestos sin fuente primaria: ver la lista en `CLAUDE.md`, sección "El vehículo".
- El ICPS desprendido no hace su encendido de eliminación: queda en la órbita alta.
- La demo de operaciones de proximidad (E6) no tiene guía ni medición respecto del ICPS.
- En 3D la nave se ve oscura cuando el Sol queda del otro lado (luz ambiente baja).
- El lockfile solo lo acepta npm ≥ 11.6. El workflow fija `npm@11.6.2`.
- Vitest falla desde Git Bash por las mayúsculas de la ruta; desde PowerShell funciona.
- El bundle pesa ~820 kB (220 kB gzip) por Three.js; sin code‑splitting.
- El color de los paneles solares sale gris azulado de 4.png (`#9398a5`): la muestra agarra el dorso de los paneles.
- Los heredocs largos fallan en Git Bash en esta máquina; los archivos grandes se escriben con la herramienta de escritura.

## Diferencias del panel contra 9.png y 11.png

- **Se parece:** bisel gris metálico con marco oscuro alrededor de la pantalla negra; teclas en los cuatro lados; menú con la página activa recuadrada en verde; barra de título central; acciones en cajas verdes junto a las teclas; paso actual en magenta; placas negras F1–F4 con tornillos; guardas de franjas amarillas y negras; Master Alarm en dos mitades; botones del DAP; tres pantallas en monitores anchos.
- **Difiere:** 6 teclas por lado horizontal (la referencia tiene 8) y sin perillas; interruptores SVG planos; la guarda es una tapa translúcida con botón; los controladores manuales son botones, no palancas; el indicador de actitud solo cabecea; la barra de estado superior no existe en la cabina real; no hay dispositivo de cursor.

## Historial de sesiones

## Sesión 4 — 2026-11-14 — Análisis de la guía de referencia
**Hecho:** lectura completa del texto de la guía de referencia de Artemis II y contraste con el modelo. Después, lo mismo con cuatro documentos más de NASA: la guía del SLS para Artemis II (oct. 2025), el cronograma general (18/03/2026), las ventanas de lanzamiento de abril de 2026 y la lista de prioridades y objetivos. Sin cambios de código: se presentaron propuestas a Gastón.
**Decisiones:** ninguna todavía.
**Problemas:** contradicciones anotadas en "Problemas abiertos".
**Tests:** sin cambios (43 en verde).
**Próximo paso:** aplicar las propuestas que Gastón apruebe, empezando por los datos del vehículo con fuente primaria.

## Sesión 3 — 2026-11-14 — Física completa, controles y vistas
**Hecho:**
- **Vuelo propulsado:** `sim/vehicle.ts` (etapas, masas, motores), `sim/atmosphere.ts`, `sim/power.ts` (empuje, consumo, arrastre); integrador generalizado con el propelente como estado; `advance.ts` reescrito (motores, separaciones, cortes por tramo).
- **Ascenso simulado** (`mission/ascent.ts`): secuencia por tiempo y ley de guiado. Se eliminó el ascenso guionado y el arranque en E3.
- **Encendidos finitos** para ICPS y Orion, con corte manual bajando la guarda.
- **Actitud:** DAP (AUTO/INRTL/MAN), RHC y THC; página Flight.PFD con indicador de actitud.
- **Partes desprendidas** como objetos propios con gravedad y arrastre.
- **Calibración nueva** (`scripts/lib/calibration.ts`, `tune-free-return.ts`): guiado del ascenso, E4/E5 y retorno libre con vuelo propulsado.
- **Interfaz:** vista dividida 2D + 3D; modelo del vehículo por partes a escala real (`render/vehicle.ts`); Prop.Sys por etapas; placa F4; tercera pantalla; alarmas que abren su procedimiento; tutorial guiado (`ui/tutorial/`); pantalla de inicio nueva.
- Ningún texto de la interfaz nombra archivos del proyecto.
- `CLAUDE.md`, `README.md` y este archivo actualizados.

**Decisiones:** 1–4, 7, 8, 10 y 12–14 de arriba.

**Problemas:**
- El ajuste del retorno libre oscilaba entre dos puntos: en algunos casos la nave pasaba el perigeo sin entrar y entraba 11 días después, en la segunda pasada, y el script medía esa entrada. Ahora mide siempre el primer regreso.
- El centrado de E5 tenía 23 s de error porque la calibración no descontaba el propelente que gasta E4.
- Las partes desprendidas se atrasaban después de un avance de horas de un tirón: el presupuesto de pasos ahora crece con el atraso.
- El lanzamiento quedaba del lado nocturno en 3D: se movió la luz.

**Tests:** `tests/mission.test.ts` reescrito (29): ascenso contra los datos publicados, Max Q y tope de aceleración, masa y empuje al despegue, guiado malo que no llega a órbita, duración y centrado de E5, corte manual, partes desprendidas, DAP, RHC, THC, encendido con la nave mal orientada, y los de antes adaptados. Con `physics.test.ts` (14): 43, todos pasan.

**Próximo paso:** prueba manual en navegador; después las texturas de la Tierra y la Luna.

## Sesión 2 — 2026-11-13 — Mejoras posteriores a H12
**Hecho:** verificación con fuentes del ángulo de entrada; pantalla de inicio; página Mission.Tl y cuenta regresiva; cámara automática; estrellas, anillo de EI, esfera de influencia, destello de encendido; atajos de teclado; `CLAUDE.md` reescrito; `README.md`. El ascenso guionado y el presupuesto fijo de Δv de esta sesión fueron reemplazados en la sesión 3.

**Problemas:** al parchear archivos con `node -e "..."` desde Bash, el shell expandía los `${}`; se pasó a scripts temporales.

## Sesión 1 — 2026-11-13 — Hitos H1–H12 (primera pasada)
**Hecho:** esqueleto; núcleo `src/sim/`; scripts de calibración y retorno libre; paleta extraída; panel; vista 2D/3D; fin de misión, créditos, layout angosto, workflow de GitHub Pages, `ASSETS.md`. Los encendidos eran impulsivos y la física arrancaba en E3; ambas cosas cambiaron en la sesión 3.

**Problemas:** la tripulación automática no separaba el CM/SM porque los disparadores por altitud solo se evaluaban al final de un tramo largo (resuelto acotando el tramo); las teclas derechas del Display Unit quedaban amontonadas por la auto‑ubicación de CSS grid.
