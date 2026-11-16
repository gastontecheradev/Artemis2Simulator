# Análisis de la "Orion Reference Guide" contra el simulador

**Documento:** NASA, *Orion Reference Guide*, 10/11/2022 (`orion-reference-guide-111022.pdf`, 131 páginas, en el escritorio de Gastón). Se cita como **[ORG]** y las páginas son las impresas al pie.
**Alcance:** solo el texto, no las imágenes. Es una guía de **antes de Artemis I**: los datos de Orion siguen valiendo, pero el perfil de Artemis II que describe es un plan viejo, reemplazado por la guía del SLS (oct. 2025) y el cronograma oficial (18/03/2026).
**Fecha del análisis:** 2026-11-15 (sesión 18). Ninguna propuesta está implementada todavía.

## 1. Lo que coincide con el modelo (no hay que cambiar nada)

| Dato | [ORG] | Modelo | Página |
|---|---|---|---|
| Módulo de tripulación, masa al despegue (Artemis II) | 22.900 lb = 10.387 kg | 10,39 t | 12 |
| Módulo de servicio, masa (Artemis II) | 34.400 lb = 15.604 kg | 6,94 t + 8,62 t = 15,56 t | 15 |
| Propelente usable de Orion | 19.000 lb = 8.618 kg | 8,62 t | 6 |
| Torre de escape (LAS) al despegue | 17.000 lb = 7.711 kg | 7,71 t | 8 |
| Orion completa al despegue (Artemis II) | 78.000 lb = 35.380 kg | 10,39 + 15,56 + 7,71 + 0,45 + 1,27 = 35,38 t | 6 |
| Motor principal (OMS‑E) | 6.000 lbf = 26,7 kN | 26,7 kN | 15–16 |
| Auxiliares | 8 × 110 lbf = 489 N | 8 × 490 N | 15 |
| RCS del módulo de servicio | 24 × 50 lbf = 222 N | 24 × 222 N | 15 |
| RCS de la cápsula | 12 × 160 lbf = 712 N, traslación y rotación | 12 × 712 N (THC después de E13) | 12 |
| RL10 del ICPS | 24.750 lbf = 110,1 kN | 110,1 kN | 36, 39 |
| RS‑25 en vacío | 512.300 lbf = 2.279 kN | 2.279 kN | 39 |
| Boosters | 3,6 Mlbf = 16.014 kN cada uno, 126 s | 16.014 kN, 126 s | 39 |
| Etapa central | ~500 s de funcionamiento, > 530.000 ft al separarse; vacía ~188.000 lb = 85,3 t | MECO a 486 s; separación a 534.564 ft; 85,3 t | 35, 39 |
| Cabina | 3 pantallas, 7 paneles de interruptores (~60 interruptores físicos), 2 RHC, 2 THC, 2 dispositivos de cursor; procedimientos electrónicos enlazados con el sistema de alarmas | igual (ver `CLAUDE.md`, "Panel de la nave") | 20, 68 |
| Comunicaciones | Near Space Network (directo a Tierra y TDRS) cerca de la Tierra, Deep Space Network lejos; en la órbita alta Orion sale "brevemente" del alcance de GPS y TDRS para probar la DSN | cambio NSN/DSN por altitud (35.786 km) | 19, 22, 62, 67 |
| Velocidad de entrada | ~25.000 mph = 11,2 km/s | 10,99 km/s en EI | 11, 62 |

Los datos de masa y motores del modelo, que salen de la guía de Artemis II [A2] y de la del SLS [SLS], quedan confirmados por una tercera fuente.

Una diferencia menor: [ORG] da 416.300 lbf (1.851,8 kN) para el RS‑25 a nivel del mar, y el modelo usa 1.859 kN al despegue (109 %). La diferencia es del 0,4 % y no vale la pena tocarla.

## 2. Propuestas de cambio (ordenadas por prioridad)

### 2.1 Velocidad de eyección de la torre de escape (física, chico)

- **Hoy:** `jettisonLas` (`sim/advance.ts`) suelta la torre con 45 m/s a lo largo del eje y 12 m/s de costado, marcados como **supuestos**.
- **[ORG] p. 8 y 106:** el motor de eyección empuja **40.000 lbf (177,9 kN) durante ~1,5 s**. Es el único motor de la torre que enciende en todos los vuelos.
- **Propuesta:** derivar la velocidad axial del impulso, igual que la de los boosters sale de sus motores de separación: 177,9 kN × 1,5 s / ~7.550 kg (la torre menos el propelente que quema) ≈ **35 m/s**. La componente lateral (la desvía el motor de control de actitud) sigue como supuesto.
- **Después:** `npm test` (las partes desprendidas no afectan la calibración).

### 2.2 Paneles solares: tamaño y orientación al Sol (render)

- **[ORG] p. 15:** cuatro alas de **tres paneles de 2 × 2 m**, ala de ~7 m, **62 ft (18,9 m) de punta a punta**, 15.000 celdas y 11 kW. Las alas **giran en dos ejes para seguir al Sol**.
- **Hoy:** `WING` en `render/vehicle.ts` tiene 1,9 m de ancho y ~18,2 m de punta a punta, con la cara hacia el eje de la nave (decisión de la sesión 14, tomada de 4.png).
- **Propuesta:**
  1. Ancho de 2,0 m y radio para que la envergadura dé 18,9 m.
  2. En la vista 3D, girar cada ala hacia `sunDirection(t)`, que ya existe desde la sesión 11. Así el modelo se ve como vuela de verdad y las alas se iluminan de frente. Reemplaza la decisión de la sesión 14 solo en 3D; el ícono 2D queda igual.
- **Después:** captura con cámara NAVE.

### 2.3 Sistema eléctrico (EPS) con eclipses (función nueva, mediana)

- **[ORG] p. 21:** las alas generan ~11 kW; **cuatro baterías de 120 V en la cápsula** alimentan la nave antes de desplegar las alas, **cuando las alas no pueden apuntar al Sol o la nave está a la sombra de la Tierra o de la Luna**, y desde la separación del módulo de servicio (las alas se van con él) hasta **24 h después del amerizaje**.
- **Hoy:** la página EPS.Sum no existe porque faltaba la dirección del Sol. Ya existe (`sunDirection`), así que se puede calcular el eclipse con un cilindro de sombra de la Tierra y de la Luna.
- **Propuesta:** primero un indicador honesto (fuente: alas o baterías, sombra de la Tierra o de la Luna, potencia de las alas de 11 kW cuando están iluminadas). **[ORG] no da la capacidad de las baterías**, así que el estado de carga no se muestra, o se agrega como supuesto marcado.
- **Después:** test del eclipse (por ejemplo, la sombra de la Tierra en la órbita de inserción) y captura.

### 2.4 Demo de operaciones de proximidad (E6) con medición (función nueva, mediana)

- **[ORG] p. 61:** la tripulación pasa la nave a modo manual y pilotea la trayectoria y la actitud; usa las cámaras y las ventanas para alinearse con el ICPS, **acercarse y alejarse**, y así evaluar el manejo. Después devuelve el control a Houston.
- **Hoy:** se puede maniobrar con RHC y THC, pero no hay referencia respecto del ICPS (pendiente en `CLAUDE.md`). El ICPS ya es un objeto propio simulado.
- **Propuesta:** una página (o un bloque de Flight.PFD) con la **distancia y la velocidad relativa al ICPS** durante E6, más dos mensajes de Houston (inicio y fin de la demo). Sin puntaje ni distancias objetivo: [ORG] no las da.

### 2.5 Descenso después de la interfaz de entrada (datos para E15)

- **[ORG] p. 11, 62, 108 y 109:**
  - La atmósfera frena la cápsula de ~25.000 mph a **~325 mph (145 m/s)**.
  - **11 paracaídas** empiezan a abrirse **a poco menos de 5 millas (~8 km)**: 3 de la cubierta delantera (7 ft), 2 drogues (23 ft), 3 pilotos (11 ft) y 3 principales (116 ft, de 270 lb cada uno).
  - El amerizaje es a **~17 mph (7,6 m/s)**, y en ningún caso a más de 20 mph.
  - El escudo térmico llega a **~5.000 °F (~2.760 °C)**.
  - La masa de la cápsula al amerizar es de **20.500 lb (9.299 kg)** en Artemis II.
- **Propuesta:** como la entrada atmosférica no se simula, usar estos datos en el cartel de fin y en la guía "Acerca de la nave", con la fuente. Un descenso simulado necesitaría la aerodinámica de la cápsula (sustentación/arrastre), que [ORG] no da.

### 2.6 Textos de la guía "Acerca de la nave" (texto, chico)

Datos con fuente que se pueden sumar:

- Dimensiones: cápsula de 11 ft (3,35 m) de alto y 16,5 ft (5,03 m) de diámetro; módulo de servicio de 15,7 ft (4,8 m); cápsula más módulo de servicio, 26 ft (7,9 m); con la torre, 67 ft (20,4 m).
- Computadoras: 4 módulos de vuelo redundantes; uno que falla se reinicia y se reincorpora en 22 s.
- Navegación: GPS cerca de la Tierra, DSN lejos, seguidores de estrellas y cámara de navegación óptica.
- Trajes: el traje OCSS mantiene a la tripulación hasta 6 días (144 h) si la cabina pierde presión.
- Refugio contra tormentas solares: bajo el piso de la cabina, con las bolsas de estiba.

**Antes de agregarlas:** verificar las dimensiones del modelo 3D (`render/vehicle.ts`) contra estos valores.

## 3. Contradicciones y datos viejos (no se usan; para `process.md`)

- **Perfil de Artemis II desactualizado** (p. 60):
  - Órbita inicial de 115 × 1.800 millas y órbita alta de 235 × 68.000 millas de ~42 h. Es el plan de 2022.
  - La guía del SLS (2025) da 15 × 1.200 NM y 100 × 40.000 NM, y el cronograma (2026) implica ~23,4 h de período. **No se usa.**
- **Duración:** "just over 10 days" (p. 62) contra 9 d 01:42:48 del cronograma.
- **Distancias de Artemis I copiadas en Artemis II:** "40,000 miles around the far side" y "280,000 miles from Earth" (p. 62). El sobrevuelo de Artemis II es a ~4.000 millas (6.513 km) y la distancia máxima ronda las 250.000 millas.
- **Masas de TLI:**
  - Hay una inconsistencia interna: 58.000 / 57.000 lb en p. 6 contra 58.500 / 57.500 lb en p. 62.
  - Una diferencia de ~1.000 lb (450 kg) entre antes y después del TLI no alcanza para un TLI de ~340 m/s con el motor de Orion. Ya figura en "Problemas abiertos" de `process.md`.
- **Propelente de los motores de la torre:**
  - Motor de eyección: 350 lb (p. 8) contra 360 lb (p. 106).
  - Motor de aborto: 4.700 lb (p. 8) contra 4.500 lb (p. 103).
- **Descenso:** "de Mach 32 a cero en ~20 minutos" (p. 62) contra 13 min 48 s entre EI y el amerizaje en el cronograma. La velocidad de amerizaje figura como 20 mph o menos (p. 12, 108) y como 17 mph (p. 109).
