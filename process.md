# Registro de sesiones

## Estado actual

- **Hito en curso:** H1–H12 con primera pasada completa, más vuelo propulsado, datos de las guías de NASA para Artemis II, interfaz bilingüe, guías, mapa fijo (marco rotante o inercial) y control de misión.
- **Funciona** (con cómo se verificó):
  - Simulación de T‑6 s a E15 con motores, masa y arrastre reales, calibrada contra las órbitas publicadas: 52 tests en verde (`npx vitest run`, desde PowerShell).
  - `npm run build` compila sin errores de tipos (bundle ~957 kB).
  - Capturas en Chrome headless a 1700 × 950: menú de idioma; vista en español en MET 12.500 s (mapa, recuadro, HUD, Houston, panel traducido); vista en inglés en MET 100 s (ascenso: plan tenue, recuadro, HUD, Houston, cohete en 3D); guía de etapas en inglés sobre la vista en MET 12.500 s.
- **Sin verificar:** la interacción a mano (clics, teclas, arrastre en 3D, zoom y arrastre del mapa 2D, pasos del tutorial, navegación de los menús de idioma y guías). Solo hay capturas estáticas y tests a nivel de comandos. Tampoco hay captura de las guías de objetivo, presupuesto, energía y nave, ni de la pantalla final en inglés.
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
13. **Los motores empujan hacia donde apunta la nave.** Actitud cinemática y solo en cabeceo, 3°/s (supuesto). Con la cápsula sola (después de E13) el DAP AUTO la pone retrógrada: el escudo térmico va por delante (sesión 10).
25. **Sol** (sesión 11): `sunDirection(t)` en `sim/bodies.ts`, en el plano del modelo; al despegue faltan 1,28 h para la puesta en la plataforma ([AV], apertura de la ventana del 01/04/2026, 22:24 UTC) y avanza con el año sidéreo. Solo ilumina el 3D. La Tierra 3D tiene brillo propio (30 % de su color) y su lado diurno aclarado (30 % de blanco).
24. **3D a escala real** (sesión 10): nave, partes, Tierra y Luna sin agrandar; lo que mide menos de 3 px se marca con un punto. El cohete se apoya en su base hasta separar la etapa central. La cámara de la nave encuadra de costado y desde arriba del plano, y nunca entra en un cuerpo (`keepOutside`). La Tierra en 3D gira con la plataforma para que el sitio de lanzamiento caiga en un vértice de la esfera.
14. **Corredor de entrada: objetivo −5,66°** (Artemis I, NASA AAS 24‑174). Ancho ±1°: supuesto.
15. **Separación CM/SM:** se pide a EI − 40 min y la tripulación automática la hace a EI − 20 min (cronograma de NASA), con el tiempo a la entrada calculado por Kepler (`timeToEntry`).
16. **Guiado de correcciones:** secante sobre el eje radial, estimando con un impulso instantáneo.
17. **Idiomas:** inglés por defecto y español. Textos de la simulación en `sim/i18n.ts` (`tr`), de la interfaz en `ui/i18n.ts` (`useT`). Siglas de cabina en inglés en los dos. Los tests comparan en español.
18. **Mapa 2D:** marco rotante por defecto o inercial a elección (sesión 7), encuadre inicial calculado del plan nominal (`nominal-path.json`); cuerpos ×3. **Desde la sesión 9, Tierra a la derecha y Luna a la izquierda en los dos marcos** (`mapAngleFor` en `render/scene.ts`; en el inercial, la Luna del sobrevuelo nominal, con el contorno punteado de su posición futura). Solo giro, nunca espejo: vista desde el norte (+z), comprobado con el plan nominal (nave antihoraria alrededor de la Tierra, horaria alrededor de la Luna en el rotante, periselenio en la cara oculta), igual que 1.png girada 180°. **Zoom** con rueda o pellizco hacia el cursor, arrastre para mover y doble clic para volver al encuadre (`render/camera.ts`); se reencuadra solo al cambiar de marco o de tamaño. En el mapa la Luna va aclarada (35 % de blanco) y su órbita y su esfera de influencia más opacas. La vista 3D conserva cámara y marco y comparte su área con el recuadro, en una columna de alto completo a la derecha, con la misma orientación que el mapa: **entorno terrestre** (centrado en la Tierra, ±9.000 km hasta E5, ±95.000 km después) o, dentro de la esfera de influencia lunar (`insetTarget`), **entorno lunar** (centrado en la Luna, radio fijo de (12.000 km + 1,1 × SOI) / 2 ≈ 42.400 km desde la sesión 10; antes seguía a la nave y se veía como un zoom). Estaba sobre el mapa y se movió en la sesión 6 para no tapar la Luna.
19. **Control de misión (CAPCOM):** función pura del estado (`sim/capcom.ts`), sin guardarse en `SimState`; los mensajes dentro de una LOS no llegan.
20. **Guías** con números tomados del modelo (`vehicle.ts`, `params.json`); costo del programa del informe IG‑22‑003 de la OIG de NASA. La de energía aclara que el sistema eléctrico no se simula.
21. **La plataforma está sobre +y** inercial; la fase lunar se mide desde ahí. (En el mapa 2D ya no queda "arriba": el mapa va girado 90°.)
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
- **Recuadro del entorno terrestre durante el ascenso:** a ±9.000 km el cohete casi no se mueve en pantalla.
- **Procs durante el ascenso** muestra el procedimiento de E6 (el primero de la tripulación); podría mostrar la secuencia automática del ascenso. Menor.
- Supuestos sin fuente primaria: ver la lista en `CLAUDE.md`, sección "El vehículo".
- La demo de operaciones de proximidad (E6) no tiene guía ni medición respecto del ICPS.
- En 3D la nave se ve oscura cuando el Sol queda del otro lado (luz ambiente baja).
- **Fase lunar al despegue:** con el Sol de la ventana del 01/04/2026, la elongación de la Luna en el modelo es 169,5°; la real era ~178° (luna llena el 02/04/2026 hacia las 02 UTC, dato de memoria, sin verificar contra una fuente). La diferencia sale de que `moonAngle0Deg` lo fija el retorno libre del modelo, no la fecha.
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

## Sesión 11 — 2026-11-15 — Iluminación del Sol en 3D
**Hecho:** `LAUNCH_BEFORE_SUNSET` y `EARTH_ORBIT_RATE` en `sim/constants.ts` (fuente [AV]); `sunDirection(t)` en `sim/bodies.ts`; `render/scene.ts` orienta la luz direccional con esa dirección en cada frame (antes era fija y no giraba con el marco rotante); `render/bodies.ts`: la Tierra 3D con brillo propio en el lado nocturno y lado diurno aclarado.
**Decisiones:** el Sol se ubica con la hora de despegue, no con la fase lunar, porque la fase la fija el retorno libre del modelo; así el despegue es de día, como el real, y la Luna sale casi llena (169,5°). Se usa la rotación en el plano del modelo (Ω·cos latitud) para que la puesta en la simulación caiga 1,28 h después del despegue. La Luna no tiene brillo propio: su lado oscuro queda oscuro.
**Tests:** 52 en verde (nuevos: la puesta en la plataforma ocurre 1,28 h después del despegue; Luna casi llena al despegue); build sin errores; capturas headless de la plataforma (de día), cámara TIERRA en MET 3.000 s y 700.000 s (terminador y lado nocturno visibles) y cámara LUNA en el sobrevuelo (Luna menguante, gibosa).
**Próximo paso:** el de "Estado actual".

## Sesión 10 — 2026-11-15 — 3D a escala real, entorno lunar fijo, actitud de la cápsula, menú de idioma
**Hecho:** `render/scene.ts`: en 3D los cuerpos y la nave van a escala real (se quitó `EXAGGERATION` y el agrandamiento `MIN_APPARENT`); punto HTML para la nave y las partes cuando miden < 3 px (`render/markers.ts`, `.ship-dot`, `.debris-marker.dot`); `aimFromSide` y `keepOutside` para la cámara; la Tierra 3D gira con la plataforma; encuadres de las cámaras TIERRA (22.000 km) y LUNA (7.000 km) acordes a la escala real. `render/vehicle.ts`: `update(..., anchorBase)` apoya el cohete en sus toberas hasta separar la etapa central. Entorno lunar con radio fijo. `sim/advance.ts`: `commandedDirection` retrógrada con la cápsula sola. `LanguageScreen.tsx`: sin opción resaltada por defecto (sin clase `on` ni `autoFocus`; los textos no cambian).
**Decisiones:** la nave "atravesaba la Tierra" por dos causas: la Tierra ×6 en 3D (la órbita baja quedaba adentro) y la cámara, que por defecto miraba desde el lado del planeta y en la plataforma quedaba bajo tierra (con la Tierra culleada). La orientación 2D se verificó con un script temporal que voló la misión y midió la actitud contra la velocidad en cada fase: ascenso según la ley de guiado, E5 con actitud fija (−24° de la velocidad), crucero prograde (inercial; en el mapa rotante el ícono puede diferir hasta ~60° del trazo a mitad de tránsito, porque el trazo es la velocidad rotante y la actitud es inercial: es correcto), sobrevuelo prograde respecto de la Luna. El único error era la cápsula después de E13, que iba con la punta hacia adelante.
**Problemas:** la primera versión de `aimFromSide` leía la distancia después de pisar la posición (encuadraba a 360 km); corregido con una captura de diagnóstico.
**Tests:** 50 en verde (nuevo: la cápsula va retrógrada después de la separación CM/SM); build sin errores; capturas headless del menú de idioma, MET 1 s (cohete en la plataforma), 3.000 s (nave y cámara TIERRA), 405.000 s (entorno lunar) y 743.000 s (cápsula con el escudo por delante). **Sin probar a mano:** orbitar la cámara 3D cerca del suelo.
**Próximo paso:** el de "Estado actual".

## Sesión 9 — 2026-11-15 — Mapa con la Tierra a la derecha, zoom y entorno lunar
**Hecho:** `mapAngleFor` (`render/scene.ts`) reemplaza a `MAP_TURN`: rotante girado 180° (Luna a la izquierda) e inercial girado para que la Luna del sobrevuelo quede a la izquierda de la Tierra; el recuadro usa la misma orientación. `render/camera.ts`: la cámara ortográfica tiene desplazamiento (`getPan`/`setPan`), zoom hacia el cursor (rueda y pellizco) y arrastre; el mapa la activa y vuelve al encuadre con doble clic. `insetTarget` decide entorno terrestre o lunar (dentro de la SOI); título del recuadro `map.insetMoon`. Ayuda del zoom visible abajo a la derecha del mapa (`vw.hintMapZoom`, antes la ayuda del mapa estaba oculta). Textos del tutorial del mapa y de la 3D en los dos idiomas. El encuadre incluye el disco completo de la Tierra.
**Decisiones:** girar, no espejar (pedido explícito): se verificó con un script temporal sobre `nominal-path.json` que el sentido de giro y la cara oculta coinciden con 1.png. El criterio del entorno lunar es la esfera de influencia (el mismo de la física y del círculo punteado); el radio sigue a la nave en vez de dos escalas fijas para que no salte. El recuadro sigue sin zoom.
**Tests:** 49 en verde; build sin errores; capturas headless en MET 100 s (inglés), 12.500 s y 416.000 s (español, rotante, entorno lunar) y 416.000 s (inglés, inercial). **Sin probar a mano:** rueda, arrastre, pellizco y doble clic.
**Próximo paso:** probar el zoom y el arrastre a mano en un navegador; después, el de "Estado actual".

## Sesión 8 — 2026-11-15 — Mapa 2D girado y Luna con más contraste
**Hecho:** el mapa 2D gira 90° en sentido horario en los dos marcos (`MAP_TURN` en `render/scene.ts`; `toDisplayFrame` en `render/worldToScene.ts` ahora aplica el giro fijo también en el rotante). El encuadre usa los márgenes de barra y HUD en los dos marcos y, en el rotante, incluye la esfera de influencia lunar completa (antes tocaba el HUD). `createBodies` (`render/bodies.ts`) recibe `contrast`: en el mapa la Luna se mezcla con 35 % de blanco y la órbita lunar (0,18 → 0,42) y la esfera de influencia (0,3 → 0,5) son más opacas. La 3D y el recuadro no cambian.
**Decisiones:** el contraste se deriva mezclando la paleta con blanco (regla de la paleta), no con un color nuevo.
**Tests:** 49 en verde; build sin errores; capturas headless en MET 200.000 s (español) de los dos marcos.
**Próximo paso:** el mismo de "Estado actual".

## Sesión 7 — 2026-11-15 — Mapa 2D en marco inercial
**Hecho:** selector MARCO (rotante / inercial) en la barra del mapa 2D (`ui/TrajectoryView.tsx`, `mapFrame` en `ui/store.ts`, `?map=inertial`). En el inercial la Luna recorre su órbita (se ve la circunferencia), el dibujo va girado un ángulo fijo (`angle` en `ViewFrame`, `render/worldToScene.ts`) para que la Luna del sobrevuelo nominal quede arriba, y un contorno punteado con la etiqueta "LUNA EN EL SOBREVUELO" marca dónde va a estar la Luna cuando llegue la nave (`render/markers.ts`, se oculta pasado el sobrevuelo). `mapFraming` (`render/scene.ts`) incluye el arco de la Luna durante la misión y deja libres 40 px arriba (barra) y 100 px abajo (HUD) en el inercial; el rotante queda igual. Textos de ayuda y paso del tutorial del mapa en los dos idiomas.
**Decisiones:** rotante sigue por defecto. Orientación del inercial con el sobrevuelo arriba: el arco de la Luna queda apaisado (de derecha a izquierda por encima de la Tierra) y entra mejor en el área ancha del mapa; con la Luna inicial a la derecha el sobrevuelo quedaba en una esquina. La posición futura usa el sobrevuelo nominal (`params.nominal.flybyMet`), no la predicción, para que sea un objetivo estable.
**Problemas:** la primera versión encuadraba sin márgenes y la barra tapaba el sobrevuelo y el HUD a la Tierra; se agregaron los márgenes en píxeles.
**Tests:** 49 en verde; build sin errores; capturas headless del mapa inercial en MET 100 s (inglés), 200.000 s (español) y 600.000 s (inglés), y del rotante en 200.000 s (sin cambios). El clic en el selector quedó sin probar a mano.
**Próximo paso:** el mismo de "Estado actual".

## Sesión 6 — 2026-11-15 — Recuadro del entorno terrestre a la vista 3D
**Hecho:** el recuadro "Entorno terrestre" pasó del mapa 2D al área de la vista 3D (`ui/TrajectoryView.tsx`, `ui/styles.css`): ocupa una columna de alto completo a la derecha (`--inset-w`, min(30 %, 280 px)) y la escena 3D, su barra y su ayuda se achican a lo que queda, así no se tapan. La ayuda de la 3D subió una línea para no pisar la leyenda de colores. La frase del tutorial que lo presenta pasó del paso del mapa al de la vista 3D (`ui/tutorial/steps.tsx`).
**Decisiones:** primero se quitó (commit `965a511`), pero hace falta para ver la nave en detalle al principio; se restauró con un revert y se movió para no tapar la Luna del mapa. Mismo contenido y escalas que antes.
**Problemas:** la primera versión (recuadro flotante en la esquina) tapaba al cohete en el ascenso; se pasó a la columna.
**Tests:** 49 en verde; build sin errores; capturas headless en MET 100 s y 12.500 s (español) con el recuadro en columna junto a la 3D, sin superposiciones, y la Luna del mapa libre.
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
