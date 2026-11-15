# Simulador Artemis II

Simulador web de la misión Artemis II: un vuelo tripulado alrededor de la Luna con retorno libre, desde la plataforma de lanzamiento hasta la entrada a la atmósfera. Nada está dibujado de antemano. El cohete sube con el empuje y la masa de sus motores, y la trayectoria la decide la gravedad de la Tierra y de la Luna.

A la izquierda está el panel de la nave, inspirado en la cabina de Orion, con una ventana de control de misión (Houston) que va dando las indicaciones de cada etapa. A la derecha, un mapa 2D fijo, como una infografía, con el plan completo de la misión y los datos de vuelo, y debajo una vista 3D que sigue a la nave de cerca.

La interfaz está en **inglés** (por defecto) y **español**. Los datos del vehículo, los horarios y las órbitas objetivo salen de las guías de referencia publicadas por NASA para Artemis II.

> Proyecto educativo. No está afiliado ni avalado por NASA.

## Cómo correrlo

Hace falta Node 22 o más nuevo.

```
npm install
npm run dev
```

Abrí la dirección que muestra la terminal. Primero se elige el idioma; después aparece el menú de guías (objetivo de la misión, etapas, presupuesto, manejo de energía y acerca de la nave), que se puede volver a abrir con el botón GUÍAS. Desde la pantalla de inicio podés:

- **Iniciar la misión** y volarla vos.
- Hacer el **tutorial guiado**, que explica la nave y el panel y te acompaña en el despegue y el primer encendido.
- Marcar el **modo demostración**, en el que la tripulación automática vuela todo.

## Cómo se vuela

1. La cuenta regresiva (desde T‑6 s), el ascenso y los dos encendidos del ICPS son automáticos, como en el vuelo real.
2. Después, la página **Procs** del display muestra cada procedimiento y su paso actual, resaltado en magenta.
3. La simulación se pausa sola antes de cada acción de la tripulación. Con el warp (×1 a ×10000) no hay que esperar.
4. Para un encendido: confirmá el Δv con la tecla **CONF ΔV**, levantá la guarda del motor y accioná la palanca. El motor enciende solo en el instante planeado y se apaga cuando entregó el Δv.
5. Si llegás tarde, cambiás el Δv, apuntás mal la nave o no encendés, la física decide: podés quedar en órbita, errarle a la Luna, chocarla o volver fuera del corredor de entrada.

| Tecla | Acción |
|---|---|
| Espacio | Play / pausa |
| `+` y `−` | Subir y bajar el warp |
| `A` | Reconocer las alarmas |
| `1` a `5` | Cámara de la vista 3D: automática, general, nave, Tierra, Luna |
| `←` y `→` | Rotar la nave (con el piloto automático en MAN) |
| `↑` y `↓` | Empujar hacia adelante o atrás con los propulsores chicos |

El mapa 2D no tiene zoom: la Tierra y la Luna quedan quietas (marco rotante, donde se ve el "8" del retorno libre), el plan nominal se dibuja tenue desde el principio y se va completando con el trazo real. Los datos de vuelo (tiempo, velocidad, distancias, temperatura y propelente) quedan sobre el mapa. El trazo se puede colorear por fase o por red de comunicaciones. En la vista 3D se elige cámara y marco, un recuadro muestra el entorno terrestre visto desde arriba, y se ve cómo se desprenden los boosters, la torre de escape, cada etapa y los CubeSats.

## Qué simula y qué no

**Simula:**

- El ascenso del cohete con el empuje, el consumo y la masa de cada etapa, el arrastre del aire y la rotación de la Tierra.
- Los encendidos en el espacio con su duración real y el propelente que gastan.
- La gravedad de la Tierra y de la Luna (problema restringido de tres cuerpos circular).
- La orientación de la nave: los motores empujan hacia donde apunta.
- La caída de las partes que se desprenden, incluido el encendido de eliminación del ICPS y los cuatro CubeSats.
- La curva de empuje publicada de los boosters y el programa de potencia de los RS‑25.
- La red de comunicaciones activa y la pérdida de señal detrás de la Luna.

**No simula:**

- La entrada atmosférica: la física termina en la interfaz de entrada, a 122 km.
- La tercera dimensión: todo ocurre en el plano de la órbita lunar, y la nave solo cabecea.
- La inercia de la nave al rotar.
- El sistema eléctrico (la guía de energía lo explica, pero no hay valores simulados).
- La temperatura con un modelo térmico de verdad: la que se muestra es una estimación simple.

**No reproduce el vuelo real.** Los tiempos de E1 a E7 son los publicados, y el guiado y los encendidos se ajustan para reproducir el final del ascenso y las órbitas terrestres publicadas. El resto lo decide la física: el sobrevuelo y la vuelta salen algo antes que en el cronograma oficial (duración total de 8,6 días contra 9,1), sobre todo porque el modelo usa una distancia Tierra‑Luna fija. Varios datos del vehículo son supuestos, y están marcados como tales en el código.

## Desarrollo

| Comando | Qué hace |
|---|---|
| `npm test` | Tests de la física y de la misión |
| `npm run build` | Chequeo de tipos y build en `dist/` |
| `npm run tune` | Recalcula el guiado del ascenso, los encendidos y el retorno libre |
| `npm run path` | Regenera solo el plan nominal que el mapa dibuja tenue |
| `npm run palette` | Extrae la paleta de las imágenes de referencia |

En Windows, corré los tests desde PowerShell.

El código está en tres capas: `src/sim/` (física y misión, TypeScript puro), `src/render/` (Three.js) y `src/ui/` (React). Las decisiones técnicas, las fuentes de los datos y los problemas abiertos están en [process.md](process.md).

## Créditos

Las imágenes de `docs/reference/` son material de referencia de NASA y no forman parte de la aplicación. Las imágenes que use la aplicación se registran en [ASSETS.md](ASSETS.md) con su crédito. Tipografía IBM Plex Mono (SIL Open Font License). Gráficos con Three.js (MIT). Costo del programa citado del informe IG‑22‑003 de la Oficina del Inspector General de NASA.
