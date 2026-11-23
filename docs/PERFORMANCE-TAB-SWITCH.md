# Cambio de pestaña en el plugin Desktop: diagnóstico y optimización

Medianas medidas en Chromium headless con el arnés común (`desktop/test/arnes.mjs`),
solo datos sintéticos, sin red. Worktree `perf/stability-ci`, base `6009602`.

## Síntesis

| Pestaña | Antes | Después | Mejora |
|---|---:|---:|---:|
| `configuración → dungeons` | 4 337 – 4 368 ms | 83 – 124 ms | **~50×** |
| `perfil → profesiones` | 287 – 289 ms | 20 – 22 ms | **~13×** |
| `perfil → ruta` (control) | 40 – 42 ms | 38 – 44 ms | sin cambio (ruido) |
| Long tasks totales por barrido | ~29 100 ms | ~2 000 – 2 200 ms | **~93 % menos** |

## Causa raíz

`IconoItem` (`desktop/src/ui.jsx`) ponía el sprite de miniaturas completo en el
`style` en línea de **cada** icono: `ICONOS.sprite` son **2 292 956 caracteres**
en base64. La vista de dungeons monta cientos de `NombreItem`; React llamaba a
`setValueForStyle` con ese string megabyte por icono.

Perfilado con CDP (`Profiler.start/stop`, intervalo 200 µs, 4 idas y vueltas a
dungeons) atribuyó el **61,7 % de las muestras a `setValueForStyle`** y solo el
0,1 % a `misionesDeDungeon`. No era computación de datos: era CSS reparsado.

En Profesiones, además, `catalogoMercado(D.items, D.dungeons)` (22 821 ítems)
se recalculaba en cada montaje con `useMemo(..., [])`; el perfilado posterior
le atribuyó ~16 ms de los ~52 ms que quedaban.

## Cambios

1. `desktop/src/ui.jsx`: el data URI se escribe **una sola vez** en una hoja
   `<style id="wf-iconos-sprite">` inyectada de forma perezosa e idempotente.
   `IconoItem` conserva `role`, `aria-label`, `title` y dimensiones, y pasa a
   usar `className="wf-icono"` con solo `width`, `height`, `backgroundSize` y
   `backgroundPosition` en línea. La imagen, el tamaño (1280×680 px) y las
   coordenadas son idénticos: solo cambia dónde se declara el `background-image`.
2. `desktop/src/vistas/profesiones.jsx`: caché perezosa de `catalogoMercado`
   para datos inmutables (`items.json` + `dungeons.json`). El objeto es de solo
   lectura; no se comparte ningún estado mutable entre montajes.
3. `desktop/test/tab-performance.mjs`: nueva suite de regresión (13 checks).
4. `docs/PERFORMANCE-TAB-SWITCH.md`: este documento.

No se tocó `app.jsx`, la navegación agrupada, los sincronizadores ni ningún
parser. La integración regenera `desktop/plugin.js` y su `BUNDLE.json`, e incluye
la suite nueva en el gate canónico.

## Metodología

- Bundle de control y tratamiento construidos desde el mismo árbol: el control
  revierte **solo** `ui.jsx` y `profesiones.jsx` a `HEAD`; difieren en esos dos
  archivos. La integración conserva ambos cambios en el bundle distribuido.
- Secuencia A/B/B/A (`control2`, `treat1`, `treat2`, `control3`), 6 repeticiones
  por par, 2 cambios de calentamiento descartados, mediana del click al
  contenido del panel vía `MutationObserver` + `performance.now()`.
- Load average durante las corridas: 12,5 – 13,2 en 12 CPU (máquina cargada).
  El tratamiento se midió con carga igual o mayor que el control: la mejora es
  conservadora.
- Umbrales de la suite: dungeons < 500 ms, profesiones < 150 ms, ruta < 250 ms.
  Son guardas de regresión con holgura (5×–7× sobre lo medido), no SLO.

## Verificación

- `node test/tab-performance.mjs` con el bundle de tratamiento: **13/13 PASS**,
  0 errores JS, 0 peticiones de red. Con el bundle de control: falla
  (`sprite inyectado una sola vez: 0`) y las medianas vuelven a ~4,3 s / ~287 ms.
- Suite existente contra el bundle de tratamiento: **395/395 PASS**, 0 errores
  JS, 0 red (`navegador`, `vista-guia`, `vista-mercado`, `vista-pawn`,
  `vista-personaje-simc`, `vista-profesiones`, `vista-ruta-dungeons`,
  `vista-subasta-pawn`, `vista-davi`, `mercado-auto`, `mercado-procedencia`,
  `tsm`, `bridge`).
- La suite nueva comprueba también navegación agrupada, persistencia del perfil
  al ida y vuelta, unicidad de la hoja de estilo, ausencia de data URI en estilos
  en línea, `background-size`/posiciones idénticos y que Profesiones se rerenderiza
  igual al revisitarla.

## Verificación final tras revisión adversarial

La suite integrada tiene ahora **14 checks**: añade recuperación de una hoja CSS
antigua sin duplicarla. La escritura del sprite ocurre en `useInsertionEffect`,
no durante render; una nueva carga del módulo actualiza la hoja existente. La
regresión falla contra el bundle anterior (`backgroundImage: none`) y pasa contra
el nuevo. En una repetición local del tratamiento: medianas de 55,7 ms a dungeons,
23,7 ms a profesiones y 22,5 ms a ruta. Son mediciones headless de esa corrida,
no promesas para todos los equipos. Los gates finales incluyen 420 checks de
navegador y la CI ejecuta esos checks solo en Linux.

## Limitaciones

- Solo fixtures sintéticos: no hay archivos de juego, cuentas ni SavedVariables
  reales, conforme a las restricciones del worktree.
- Medido en modo headless con `--disable-gpu`; el sprite no se decodifica en GPU.
  La mejora viene de no reparsar 2,3 MB por icono, así que debería trasladarse al
  desktop real, pero no se ha medido allí.
- Cargas >10 en 12 CPU introducen ruido de ±10–20 ms en las pestañas rápidas;
  por eso las comparaciones usan medianas, repetición y control al final.
- No se probó keep-alive de vistas: habría eliminado el remontaje por completo,
  pero cambia el ciclo de vida (efectos, estado local y selects), rompe
  expectativas de los tests existentes sobre tabpanels y aumenta el coste de
  arranque. El enfoque elegido mantiene el ciclo de vida intacto.
- React y Playwright se resuelven desde las dependencias locales fijadas por el
  proyecto. No se necesita una instalación privada de Hermes para repetir la prueba.
