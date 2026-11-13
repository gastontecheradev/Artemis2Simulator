# Registro de sesiones

## Estado actual

- **Hito en curso:** H8–H12 (panel, vista, 3D, pulido). El núcleo de simulación (H2–H7) está cerrado.
- **Funciona:** física CR3BP con Dormand–Prince 5(4), detección de eventos, encendidos, predicción, comunicaciones, alarmas, procedimientos, guiado de correcciones, calibración contra 3.png y retorno libre. La misión nominal corre sola de E3 a E14 (28 tests en verde).
- **Roto / pendiente:** ver "Problemas abiertos".
- **Próximo paso:** ver la última entrada del historial.

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
12. **Tripulación automática** (`autoCrew`): interruptor real del panel que ejecuta las acciones manuales en su momento nominal. La usan los scripts y los tests.
13. **Estado:** `SimState` inmutable salvo `trail`, que es un buffer al que solo se le agregan puntos (compartido entre estados por rendimiento).
14. **Archivos fuera de la estructura de CLAUDE.md** (todos en `src/sim/`, TypeScript puro): `advance.ts` (avance por tramos y eventos), `orbit.ts` (elementos osculantes, Jacobi), `guidance.ts` (guiado de OTC/RTC), `format.ts`, `mission/params.ts` (tipos de `params.json`), `scripts/lib/calibration.ts` (compartido por los dos scripts).

## Problemas abiertos

- Corredor de entrada y presupuesto de Δv sin verificar (decisiones 8 y 9).
- Duración total 8,55 d contra los ~10 d de 1.png (decisión 7).
- Vitest falla si se lanza desde Git Bash (`Cannot read properties of undefined (reading 'config')`, por la diferencia de mayúsculas en la ruta `c:/` vs `C:/`). Desde PowerShell funciona.

## Historial de sesiones

## Sesión 1 — 2026-11-13 — Hitos H1–H7 (en curso)
**Hecho:** esqueleto Vite + TS + React + Three + Vitest. Núcleo `src/sim/` completo: `math/vec3`, `constants`, `bodies`, `gravity`, `integrator`, `events`, `orbit`, `burns`, `propulsion`, `propagate`, `comms`, `alarms`, `guidance`, `state`, `advance`, `commands`, `mission/*`. Scripts `calibrate-insertion.ts` y `tune-free-return.ts` (generan `params.json`).
**Decisiones:** ver "Decisiones vigentes" 1–14.
**Problemas:** la primera versión de la tripulación automática no separaba el CM/SM porque los disparadores por altitud solo se evaluaban al final de un tramo largo; se resolvió acotando el largo del tramo después del TLI (`maxChunk`).
**Tests:** `tests/physics.test.ts` (14) y `tests/mission.test.ts` (14), todos pasan.
**Próximo paso:** panel (H8–H9) y vista de trayectoria (H1, H10, H11).
