# Simulador Artemis II

Simulador web de la misión Artemis II: un vuelo tripulado alrededor de la Luna con retorno libre, desde la plataforma de lanzamiento hasta la entrada a la atmósfera. Nada está dibujado de antemano. El cohete sube con el empuje y la masa de sus motores, y la trayectoria la decide la gravedad de la Tierra y de la Luna.

A la izquierda está el panel de la nave, inspirado en la cabina de Orion. A la derecha, el mapa 2D de la trayectoria y, debajo, una vista 3D que sigue a la nave de cerca.

> Proyecto educativo. No está afiliado ni avalado por NASA.

## Cómo correrlo

Hace falta Node 22 o más nuevo.

```
npm install
npm run dev
```

Abrí la dirección que muestra la terminal. Desde la pantalla de inicio podés:

- **Iniciar la misión** y volarla vos.
- Hacer el **tutorial guiado**, que explica la nave y el panel y te acompaña en el despegue y el primer encendido.
- Marcar el **modo demostración**, en el que la tripulación automática vuela todo.

## Cómo se vuela

1. El ascenso y los dos primeros encendidos son automáticos, como en el vuelo real.
2. Después, la página **Procs** del display muestra cada procedimiento y su paso actual, resaltado en magenta.
3. La simulación se pausa sola antes de cada acción de la tripulación. Con el warp (×1 a ×10000) no hay que esperar.
4. Para un encendido: confirmá el Δv con la tecla **CONF ΔV**, levantá la guarda del motor y accioná la palanca. El motor enciende solo en el instante planeado y se apaga cuando entregó el Δv.
5. Si llegás tarde, cambiás el Δv, apuntás mal la nave o no encendés, la física decide: podés quedar en órbita, errarle a la Luna, chocarla o volver fuera del corredor de entrada.

| Tecla | Acción |
|---|---|
| Espacio | Play / pausa |
| `+` y `−` | Subir y bajar el warp |
| `A` | Reconocer las alarmas |
| `1` a `5` | Cámara del mapa: automática, general, nave, Tierra, Luna |
| `←` y `→` | Rotar la nave (con el piloto automático en MAN) |
| `↑` y `↓` | Empujar hacia adelante o atrás con los propulsores chicos |

En el mapa se puede cambiar entre marco inercial y rotante (en el rotante se ve el "8" del retorno libre) y colorear el trazo por fase o por red de comunicaciones. En la vista 3D se ve cómo se desprenden los boosters, la torre de escape y cada etapa.

## Qué simula y qué no

**Simula:**

- El ascenso del cohete con el empuje, el consumo y la masa de cada etapa, el arrastre del aire y la rotación de la Tierra.
- Los encendidos en el espacio con su duración real y el propelente que gastan.
- La gravedad de la Tierra y de la Luna (problema restringido de tres cuerpos circular).
- La orientación de la nave: los motores empujan hacia donde apunta.
- La caída de las partes que se desprenden.
- La red de comunicaciones activa y la pérdida de señal detrás de la Luna.

**No simula:**

- La entrada atmosférica: la física termina en la interfaz de entrada, a 122 km.
- La tercera dimensión: todo ocurre en el plano de la órbita lunar, y la nave solo cabecea.
- La inercia de la nave al rotar.

**No reproduce el vuelo real.** Los tiempos de los primeros eventos y los datos del final del ascenso son los publicados; las órbitas y la duración total (8,5 días) son las que da este modelo. Varios datos del vehículo son supuestos, y están marcados como tales en el código.

## Desarrollo

| Comando | Qué hace |
|---|---|
| `npm test` | Tests de la física y de la misión |
| `npm run build` | Chequeo de tipos y build en `dist/` |
| `npm run tune` | Recalcula el guiado del ascenso, los encendidos y el retorno libre |
| `npm run palette` | Extrae la paleta de las imágenes de referencia |

En Windows, corré los tests desde PowerShell.

El código está en tres capas: `src/sim/` (física y misión, TypeScript puro), `src/render/` (Three.js) y `src/ui/` (React). Las decisiones técnicas, las fuentes de los datos y los problemas abiertos están en [process.md](process.md).

## Créditos

Las imágenes de `docs/reference/` son material de referencia de NASA y no forman parte de la aplicación. Las imágenes que use la aplicación se registran en [ASSETS.md](ASSETS.md) con su crédito. Tipografía IBM Plex Mono (SIL Open Font License). Gráficos con Three.js (MIT).
