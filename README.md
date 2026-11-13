# Simulador Artemis II

Simulador web de la misión Artemis II: un vuelo tripulado alrededor de la Luna con retorno libre. La trayectoria no está dibujada de antemano, la calcula la física (gravedad de la Tierra y de la Luna) a partir de los encendidos que hace la tripulación.

A la izquierda está el panel de la nave, inspirado en la cabina de Orion. A la derecha, la trayectoria en 2D o 3D.

> Proyecto educativo. No está afiliado ni avalado por NASA.

## Cómo correrlo

Hace falta Node 22 o más nuevo.

```
npm install
npm run dev
```

Abrí la dirección que muestra la terminal y elegí desde dónde empezar: desde el lanzamiento o desde la órbita. Si solo querés mirar, marcá el modo demostración y la tripulación automática vuela la misión completa.

## Cómo se vuela

1. La página **Procs** del display muestra el próximo procedimiento y su paso actual, resaltado en magenta.
2. La simulación se pausa sola antes de cada acción de la tripulación. Con el warp (×1 a ×10000) no hay que esperar.
3. Para un encendido: levantá la guarda del motor, confirmá el Δv con la tecla **CONF ΔV** y accioná la palanca. El motor enciende solo en el instante planeado.
4. Si llegás tarde, cambiás el Δv o no encendés, la física decide: podés quedar en órbita, errarle a la Luna, chocarla o volver fuera del corredor de entrada.

| Tecla | Acción |
|---|---|
| Espacio | Play / pausa |
| `+` y `−` | Subir y bajar el warp |
| `A` | Reconocer las alarmas |
| `1` a `5` | Cámara: automática, general, nave, Tierra, Luna |

En la vista se puede cambiar entre marco inercial y rotante (en el rotante se ve el "8" del retorno libre), colorear el trazo por fase o por red de comunicaciones, y pasar de 2D a 3D.

## Qué simula y qué no

- **Simula:** el problema restringido de tres cuerpos circular (Tierra y Luna en órbitas circulares, la nave siente a las dos), con encendidos instantáneos. También la red de comunicaciones activa, la pérdida de señal detrás de la Luna y el consumo de Δv.
- **No simula:** el ascenso (reproduce datos publicados y lo indica en pantalla), la atmósfera (la física termina en la interfaz de entrada, a 122 km), la actitud de la nave ni los encendidos de duración finita.
- **No reproduce el vuelo real:** los tiempos de los primeros eventos son los publicados, pero las órbitas y la duración total (8,5 días) son las que da este modelo simplificado.

## Desarrollo

| Comando | Qué hace |
|---|---|
| `npm test` | Tests de la física y de la misión |
| `npm run build` | Chequeo de tipos y build en `dist/` |
| `npm run tune` | Recalcula los parámetros del retorno libre |
| `npm run palette` | Extrae la paleta de las imágenes de referencia |

En Windows, corré los tests desde PowerShell.

El código está en tres capas: `src/sim/` (física y misión, TypeScript puro), `src/render/` (Three.js) y `src/ui/` (React). Las decisiones técnicas y los problemas abiertos están en [process.md](process.md).

## Créditos

Las imágenes de `docs/reference/` son material de referencia de NASA y no forman parte de la aplicación. Las imágenes que use la aplicación se registran en [ASSETS.md](ASSETS.md) con su crédito. Tipografía IBM Plex Mono (SIL Open Font License). Gráficos con Three.js (MIT).
