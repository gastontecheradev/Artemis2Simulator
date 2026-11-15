# Registro de sesiones

## Estado actual

- **Hito en curso:** H1–H12 con primera pasada completa, más vuelo propulsado, datos de las guías de NASA para Artemis II, interfaz bilingüe, guías, mapa fijo y control de misión.
- **Funciona** (con cómo se verificó):
  - Simulación de T‑6 s a E15 con motores, masa y arrastre reales, calibrada contra las órbitas publicadas: 49 tests en verde (`npx vitest run`, desde PowerShell).
  - `npm run build` compila sin errores de tipos (bundle ~957 kB).
  - Capturas en Chrome headless a 1700 × 950: menú de idioma; vista en español en MET 12.500 s (mapa, recuadro, HUD, Houston, panel traducido); vista en inglés en MET 100 s (ascenso: plan tenue, recuadro, HUD, Houston, cohete en 3D); guía de etapas en inglés sobre la vista en MET 12.500 s.
- **Sin verificar:** la interacción a mano (clics, teclas, arrastre en 3D, pasos del tutorial, navegación de los menús de idioma y guías). Solo hay capturas estáticas y tests a nivel de comandos. Tampoco hay captura de las guías de objetivo, presupuesto, energía y nave, ni de la pantalla final en inglés.
- **Publicado:** el código de la sesión 5 ya está en `main` y en GitHub (commit `abc9397`, hecho por Gastón); el deploy de GitHub Actions corre en cada push.
- **Sin hacer:** texturas y fotos de NASA (ver `ASSETS.md`) y los pendientes de `CLAUDE.md`.
- **Próximo paso:** recorrer a mano en un navegador el flujo idioma → guías → inicio → tutorial y volar la misión en los dos idiomas; anotar acá lo que falle. Después, las texturas.

## Decisiones vigentes

Valores calibrados actuales (fuente de verdad: `src/sim/mission/params.json`):

| Parámetro | Valor |
|---|---|
| Guiado del ascenso | cabeceo 4,145°, tangente 1,050·10⁻³ 1/s, tope de aceleración 35,47 m/s² (3,62 g) |
| Inserción (E3) | 162,94 km, 7,880 km/s relativos = 8,298 km/s inerciales, ángulo 4,03°; órbita 31 × 2.246 km (publicada 28 × 2.222) |
| E4 (ICPS, 00:49:52) | 43,4 m/s en ~25 s → perigeo 185,2 km |
| E5 (ICPS, 01:46:37) | 2.624,5 m/s prograde y −450,1 m/s radial, actitud fija; ~2.663 m/s en 1.108 s → 0 × 74.080 km |
| E7 (auxiliares, 04:53:15) | 18,1 m/s en 120 s |
| E8 (motor principal) | 6,7 m/s en el apogeo, MET 14:24:01 → 185 × 74.080 km |
| TLI (E9) | 340,9 m/s, ignición MET 001/02:53:38; fase lunar 186,363° |
| Sobrevuelo (E11) | 6.513,0 km en MET 004/20:38:12 |
| Entrada (E14) | −5,658° y 10,991 km/s en MET 008/14:32:55 |

1. **Todo el vuelo es física, sin tramos guionados.** Lo programado es lo que en el vehículo real también lo está: la secuencia por tiempo y las leyes de guiado.
2. **La velocidad publicada del ascenso es relativa a la Tierra en rotación;** en órbita las tablas de NASA dan velocidad inercial.
3. **El guiado del ascenso se ajusta a tres datos publicados** (altitud en MECO, altitud y velocidad en la separación). El resto de las tablas publicadas (`ASCENT_TABLE`, `ORBIT_TABLE`) son control, con tolerancias en los tests.
4. **Órbitas terrestres publicadas como objetivo** (reemplaza el criterio propio de la sesión 3): E4 deja el perigeo en 100 NM, E5 deja 0 × 40.000 NM medido después de E7, E8 sube el perigeo a 100 NM. Fuente: "Artemis II by the Numbers" de la guía del SLS.
5. **E5 vuela con actitud inercial fija** (`hold`). Con guiado prograde local el perigeo no baja a cero con el Δv disponible; con la actitud congelada y una componente radial sí.
6. **Horarios de E1–E7 de la tabla de eventos de la guía del SLS** (ARB 01:46:37, separación 03:22:46, salida 04:53:15) cuando los documentos se contradicen.
7. **Vehículo con datos de las guías de NASA** ([SLS] y [A2], ver `CLAUDE.md`): curva de empuje publicada de los boosters (interpretada en vacío con corrección a nivel del mar), programa de potencia de los RS‑25, cinco tanques, RCS de la cápsula. Isp efectivo de los boosters derivado de la curva (~262 s).
8. **Cuenta regresiva desde T‑6 s** con los RS‑25 encendidos y el cohete sujeto (solo baja el propelente).
9. **ICPS después de la separación:** encendido de eliminación (5 m/s, supuesto), cuatro CubeSats como objetos propios, caída en el primer perigeo (~25 h).
10. **Se mantienen** el sobrevuelo de 6.513 km (1.png), MECO en 486 s y el límite NSN/DSN en 35.786 km (altitud geoestacionaria; 2.png no da el valor).
11. **Integrador Dormand–Prince 5(4) con `rtol = 1e-11`**, llevando el propelente de cada tanque como estado. El avance se corta en cada discontinuidad.
12. **Encendidos de la tripulación comprometidos al TIG**; bajar la guarda con el motor encendido lo corta.
13. **Los motores empujan hacia donde apunta la nave.** Actitud cinemática y solo en cabeceo, 3°/s (supuesto).
14. **Corredor de entrada: objetivo −5,66°** (Artemis I, NASA AAS 24‑174). Ancho ±1°: supuesto.
15. **Separación CM/SM:** se pide a EI − 40 min y la tripulación automática la hace a EI − 20 min (cronograma de NASA), con el tiempo a la entrada calculado por Kepler (`timeToEntry`).
16. **Guiado de correcciones:** secante sobre el eje radial, estimando con un impulso instantáneo.
17. **Idiomas:** inglés por defecto y español. Textos de la simulación en `sim/i18n.ts` (`tr`), de la interfaz en `ui/i18n.ts` (`useT`). Siglas de cabina en inglés en los dos. Los tests comparan en español.
18. **Mapa 2D fijo:** marco rotante, encuadre calculado del plan nominal (`nominal-path.json`), sin zoom; cuerpos ×3; sin recuadro del entorno terrestre (se quitó en la sesión 6: no va). La vista 3D conserva cámara y marco.
19. **Control de misión (CAPCOM):** función pura del estado (`sim/capcom.ts`), sin guardarse en `SimState`; los mensajes dentro de una LOS no llegan.
20. **Guías** con números tomados del modelo (`vehicle.ts`, `params.json`); costo del programa del informe IG‑22‑003 de la OIG de NASA. La de energía aclara que el sistema eléctrico no se simula.
21. **La plataforma está sobre +y** ("arriba" en el mapa); la fase lunar se mide desde ahí.
22. **Estrellas decorativas** con semilla fija; no es un catálogo.
23. **`CLAUDE.md` no se commitea** (está en `.gitignore`).

## Problemas abiertos

- Interacción sin probar a mano (ver "Estado actual").
- **Cronograma contra el "Artemis II Overview Timeline"** (NASA, 18/03/2026): el TLI cae a 1/02:53:38 (publicado 1/01:08:42), porque el período de la órbita publicada de 74.080 km de apogeo es de ~25 h y el modelo enciende en su perigeo. Sobrevuelo 4/20:38 (publicado 5/00:30), EI 8/14:33 (publicado 9/01:29): los tránsitos son más cortos, probablemente por la distancia Tierra‑Luna fija. El modelo no supera el récord de Apollo 13 (400.171 km), que el cronograma marca antes del acercamiento.
- **Primeros dos minutos del ascenso ~10 % rápidos:** Max Q a los 57 s (publicado 71 s), boosters a 51,6 km y 1,37 km/s (publicado 45,2 km y 1,34 km/s). De la eyección del LAS en adelante coincide. Los tests tienen tolerancias anchas para eso.
- **Contradicciones entre documentos** (se eligió la tabla de eventos de la guía del SLS salvo que se diga otra cosa):
  - ARB: 01:48:48 (3.png), 01:46:37 (tabla del SLS, usada), 0/01:47 (cronograma).
  - Separación ICPS/Orion: 03:25:41 (3.png), 03:22:46 (usada), 0/03:23 (cronograma).
  - TLI: 25:00:00 (tabla del SLS) y 1/01:08:42 (cronograma).
  - CubeSats: 05:20:23–05:24:23 (tabla del SLS), ~05:27 (cronograma), 05:29:10–05:33:10 (tabla de cargas, usada).
  - RS‑25 al 85 %: 2:04–2:08 (tabla, usada) contra ~123–132 s (texto).
  - Propelente de la etapa central: 987,5 t, 998 t o 1.003,7 t (cargada menos vacía, usada).
  - E7: "motor del módulo de servicio" en el texto, "AUX DEPARTURE" en el diagrama (se usan los auxiliares).
  - Sobrevuelo: ~7.560 km en la guía de Artemis II contra 6.513 km de 1.png (se mantiene 6.513).
  - MECO: ~483 s en la guía de Artemis II contra 486 s (se mantiene 486).
  - La "masa post‑TLI" de 25.854 kg no es compatible con un TLI de Orion; no se usa.
  - Duración: 9 d 1 h 43 min (cronograma) contra "~10 días" (1.png y las guías).
- **RL10C‑2:** el Isp del modelo (465,5 s) es el del RL10B‑2; ningún documento da el del C‑2.
- **Temperatura de piel simplificada** (`thermal.ts`): Sutton–Graves + equilibrio radiativo instantáneo; da ~645 °C en el ascenso a 31 km. Es una estimación, no un modelo térmico.
- **Procs durante el ascenso** muestra el procedimiento de E6 (el primero de la tripulación); podría mostrar la secuencia automática del ascenso. Menor.
- Supuestos sin fuente primaria: ver la lista en `CLAUDE.md`, sección "El vehículo".
- La demo de operaciones de proximidad (E6) no tiene guía ni medición respecto del ICPS.
- En 3D la nave se ve oscura cuando el Sol queda del otro lado (luz ambiente baja).
- El lockfile solo lo acepta npm ≥ 11.6. El workflow fija `npm@11.6.2`.
- Vitest falla desde Git Bash por las mayúsculas de la ruta; desde PowerShell funciona (`npx vitest run`; redirigido con `Out-File` sale vacío).
- El bundle pesa ~957 kB por Three.js; sin code‑splitting.
- El color de los paneles solares sale gris azulado de 4.png (`#9398a5`).
- Los heredocs largos fallan en Git Bash en esta máquina; los archivos grandes se escriben con la herramienta de escritura.
- Chrome headless a veces termina con "Abnormal renderer termination" o se cuelga; con un `--user-data-dir` nuevo en cada captura y `Start-Process` con espera acotada funciona.

## Diferencias del panel contra 9.png y 11.png

- **Se parece:** bisel gris metálico con marco oscuro alrededor de la pantalla negra; teclas en los cuatro lados; menú con la página activa recuadrada en verde; barra de título central; acciones en cajas verdes junto a las teclas; paso actual en magenta; placas negras F1–F4 con tornillos; guardas de franjas amarillas y negras; Master Alarm en dos mitades; botones del DAP; tres pantallas en monitores anchos.
- **Difiere:** 6 teclas por lado horizontal (la referencia tiene 8) y sin perillas; interruptores SVG planos; la guarda es una tapa translúcida con botón; los controladores manuales son botones, no palancas; el indicador de actitud solo cabecea; la barra de estado superior no existe en la cabina real; no hay dispositivo de cursor.

## Historial de sesiones

## Sesión 6 — 2026-11-15 — Mapa 2D sin recuadro
**Hecho:** se quitó del mapa 2D el recuadro "Entorno terrestre" (`ui/TrajectoryView.tsx`), su clave `map.inset` (`ui/i18n.ts`), su CSS (`ui/styles.css`) y la frase del tutorial que lo nombraba (`ui/tutorial/steps.tsx`).
**Decisiones:** Gastón pidió que no esté. El soporte del modo `inset` en `render/scene.ts` queda sin uso (no se borró, por si se quiere recuperar). Con esto deja de aplicar el problema del recuadro durante el ascenso.
**Problemas:** ninguno.
**Tests:** 49 en verde; build sin errores; captura headless en MET 12.500 s (español) sin el recuadro.
**Próximo paso:** el mismo de "Estado actual".

## Sesión 5 — 2026-11-15 — Datos oficiales, idiomas, guías, mapa fijo y control de misión
**Hecho:**
- **Vehículo** (`sim/vehicle.ts` reescrito): masas y motores de las guías del SLS y de Artemis II; curva de empuje publicada de los boosters; programa de potencia de los RS‑25; cinco tanques; RCS de la cápsula (THC después de E13).
- **Misión** (`sim/constants.ts` reescrito): tablas publicadas de ascenso y órbita, órbitas publicadas, horarios de la tabla de eventos, cronograma oficial como control (`PUBLISHED_MET`), CubeSats, eliminación del ICPS.
- **Física:** cuenta regresiva desde T‑6 s (`padState`), encendidos con actitud fija, `timeToDescendTo` / `timeToEntry` en `orbit.ts`, temperatura de piel (`sim/thermal.ts`), CubeSats y encendido de eliminación del ICPS en `advance.ts`.
- **Calibración** (`scripts/lib/calibration.ts`, `tune-free-return.ts`): E4 a perigeo 100 NM, E5 con Newton 2D a 0 × 40.000 NM, E7 de 120 s, E8 en el apogeo; semilla del retorno libre elegida por la fecha de regreso publicada; `nominal-path.json` y `npm run path`.
- **Idiomas:** `sim/i18n.ts` y `ui/i18n.ts`; todo el panel, el log, los procedimientos, las alarmas, el tutorial y las pantallas en inglés y español.
- **Flujo de inicio:** `LanguageScreen` → `guides/Guides.tsx` (cinco guías de `guides/content.tsx`) → `StartScreen`; botón GUÍAS; `?lang` y `?guide`.
- **Mapa 2D fijo** (`render/scene.ts` reescrito): marco rotante, encuadre del plan, plan nominal tenue, recuadro del entorno terrestre, `MapHud`. Los atajos `1`–`5` pasaron a la cámara 3D.
- **Control de misión:** `sim/capcom.ts` y `ui/panel/Capcom.tsx`.
- `CLAUDE.md`, `README.md` y este archivo actualizados.

**Decisiones:** 4–10, 15 y 17–20 de arriba. Descartados: guiado prograde local para E5 (no llega a perigeo cero); tomar la curva de los boosters como empuje a nivel del mar (el ascenso salía mucho más rápido); elegir la semilla del retorno libre por el sobrevuelo (convergía a una rama de 11,8 días).

**Problemas:**
- El empuje de los boosters en t = 0 daba cero (borde de la interpolación).
- "REENTRADA PREDICHA" falsa durante E5 y el TLI: la alarma se suprime durante un encendido y mientras E8 siga programado.
- Import circular al poner `timeToEntry` en `advance.ts`: se movió a `orbit.ts`.
- `?met` vacío se leía como 0 y salteaba la cuenta regresiva: ahora se mira si el parámetro existe.
- Error al iniciar la vista ("lastCameraKey before initialization").
- El recuadro tapaba la Luna: pasó abajo a la derecha.
- Siguen abiertos el desfasaje del cronograma y el ascenso temprano rápido (ver "Problemas abiertos").

**Tests:** 49 (físicos 17, misión 32), todos pasan. Nuevos o cambiados: cuenta regresiva, empuje al despegue (36.787 kN), Isp de los boosters, tablas publicadas con tolerancias, órbitas publicadas, duraciones de E4/E5/E7, reentrada sin E8, separación CM/SM a EI − 20 min, ICPS y CubeSats, programa de potencia de los RS‑25, `timeToDescendTo` (3).

**Próximo paso:** prueba manual en navegador del flujo completo en los dos idiomas.

## Sesión 4 — 2026-11-14 — Análisis de la guía de referencia
**Hecho:** lectura de la guía de referencia de Artemis II, la guía del SLS para Artemis II (oct. 2025), el cronograma general (18/03/2026), las ventanas de lanzamiento de abril de 2026 y la lista de prioridades y objetivos; contraste con el modelo y propuestas a Gastón. Sin cambios de código.
**Tests:** sin cambios (43 en verde).

## Sesión 3 — 2026-11-14 — Física completa, controles y vistas
**Hecho:** vuelo propulsado (`vehicle.ts`, `atmosphere.ts`, `power.ts`, integrador con propelente), ascenso simulado, encendidos finitos con corte manual, DAP/RHC/THC y Flight.PFD, partes desprendidas, calibración con vuelo propulsado, vista dividida 2D + 3D, modelo por partes, Prop.Sys por etapas, placa F4, tercera pantalla, tutorial guiado.
**Problemas resueltos:** el retorno libre medía la segunda pasada (ahora el primer regreso); centrado de E5 sin descontar el propelente de E4; partes desprendidas atrasadas tras avances largos; lanzamiento del lado nocturno en 3D.
**Tests:** 43.

## Sesión 2 — 2026-11-13 — Mejoras posteriores a H12
**Hecho:** ángulo de entrada con fuente; pantalla de inicio; Mission.Tl y cuenta regresiva; cámara automática; estrellas, anillo de EI, esfera de influencia, destello; atajos; `CLAUDE.md` y `README.md`.
**Problemas:** `node -e` desde Bash expandía `${}`; se pasó a scripts temporales.

## Sesión 1 — 2026-11-13 — Hitos H1–H12 (primera pasada)
**Hecho:** esqueleto; núcleo `src/sim/`; calibración y retorno libre; paleta; panel; vistas; fin de misión, créditos, layout angosto, workflow de GitHub Pages, `ASSETS.md`.
**Problemas:** la separación CM/SM automática fallaba con tramos largos (se acotó el tramo); teclas del Display Unit amontonadas por la auto‑ubicación de CSS grid.
