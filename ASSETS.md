# Registro de imágenes de NASA

Cada archivo de `public/assets/nasa/` tiene que tener una fila en "Imágenes en uso". La sección "Créditos" de la app se genera leyendo esa tabla.

Reglas (ver `CLAUDE.md`): solo imágenes elegidas por Gastón, con crédito "NASA" o "NASA/Nombre". Los originales van a `assets-src/` (fuera del repo) y se optimizan con `npm run images`. Las imágenes de `docs/reference/` no se registran acá porque no se usan en la app.

## Imágenes en uso

| Archivo | URL de origen | ID de NASA | Crédito | Fecha de descarga |
|---|---|---|---|---|

## Pendientes

Por ahora la app no usa ninguna imagen: la Tierra y la Luna son esferas de color liso y la pantalla final muestra un recuadro vacío.

| Uso | Nombre base esperado | Fuente sugerida | Estado |
|---|---|---|---|
| Textura de la Tierra (día) | `earth-day` | NASA Visible Earth, colección "Blue Marble" | Pendiente: falta elegir la imagen |
| Textura de la Luna (color) | `moon-color` | NASA SVS CGI Moon Kit (svs.gsfc.nasa.gov/4720) | Pendiente: falta elegir la imagen |
| Foto de amerizaje para la pantalla final (E15) | `splashdown` | images.nasa.gov, "Orion splashdown" | Pendiente. Ojo: `docs/reference/7.png` es de Artemis I y es una captura, no sirve como asset |
| Fotos para el log de eventos y pantalla de inicio | a definir | images.nasa.gov, "Artemis II" | Pendiente (opcional) |

`scripts/optimize-images.ts` reconoce esos nombres base: `earth-*` y `moon-*` se tratan como texturas equirectangulares (2048×1024 y 4096×2048) y el resto como fotos (1200 px de ancho).
