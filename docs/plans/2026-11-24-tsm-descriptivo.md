# Valoración descriptiva personal TSM — Implementation Plan

> **For Hermes:** Ejecutar por tareas acotadas con revisión independiente, sin escrituras concurrentes en un mismo archivo.

**Goal:** Mostrar evidencia descriptiva de ventas propias de subasta, sin convertirla en predicción ni cruzarla con mercados no acreditados.
**Architecture:** Funciones puras sobre el snapshot TSM existente; React consume derivados efímeros, comparte un bloque descriptivo y actualiza el reloj sin nueva importación. Sin almacenamiento derivado nuevo.
**Tech Stack:** JavaScript ESM, React existente, Node test, arnés Chromium con SDK sintético.

## Restricciones globales

- Aprobación explícita de primera entrega recibida después de presentar diagnóstico y diseño.
- Base inspeccionada: `main`, `fa20b89`, checkout limpio al comenzar.
- No Lua, datos reales del juego, cambios al juego, red en el plugin, despliegue ni push.
- Solo imports externos admitidos por Desktop. Reutilizar `ctx.files`, almacenamiento, cola y lifecycle existentes; no modificarlos para añadir un segundo historial.
- Solo `kind === 'sale' && source === 'Auction'`; reino y variante literales.
- Cantidades TSM ya representan unidades; no multiplicar stackSize. Filas son registros contables, no transacciones independientes demostradas.
- Identidad económica TSM no acreditada: retirar comparación implícita por nombre de reino y objeto base; no inventar equivalencias.
- No beneficio, comisión inventada, demanda, liquidez, probabilidad de venta ni predicción.
- Fixtures nuevas explícitamente sintéticas; distinguir implementación, pruebas sintéticas, validación humana y despliegue.

## Contrato acordado

`valorarTsm(snapshot, realmName, itemString, { nowMs, windowDays=28, minDays=5, staleDays=7, dispersionLimit=0.5 })` y `listarValoracionesTsm(snapshot, realmName, options)`.

Fecha externa obligatoria en ms; registros TSM en segundos. Ventana inclusiva `[nowMs - 28 días, nowMs]`, días UTC. Cada reconstrucción usa solo el snapshot vigente. Mediana diaria ponderada por unidades por inversa CDF (primer precio cuyo acumulado alcanza la mitad); mediana convencional de esas medianas con igual peso por día; cuartiles interpolados tipo 7. No quitar extremos. Ceros, futuros e inválidos diagnosticados y excluidos de precios y unidades resumidos. Historial disponible fuera de la ventana consultable aparte.

Salida: versión, configuración, reino, variante, objeto base informativo, fecha de evaluación, inicio de ventana, `window` y `history` con unidades/registros/días/fechas/precios/resumen diario, exclusiones, motivos y suficiencia. Motivos: sin ventas válidas, menos de cinco días, última venta hace más de siete días, o IQR/mediana > 0.5. Son reglas operativas no calibradas, no niveles de confianza. Suficiencia descriptiva no habilita una predicción.

## Tareas y propiedad

### 1. Núcleo puro — agente de cálculo

Archivos exclusivos: `desktop/src/tsm-valoracion.js`, `tests/tsm-valoracion.test.mjs`.

1. Escribir fixtures sintéticas y tests del contrato antes del módulo.
2. Ejecutar `node --test tests/tsm-valoracion.test.mjs` y registrar fallo real.
3. Implementar cálculo puro, validar configuración y rangos seguros, sin reloj interno ni mutación del snapshot.
4. Ejecutar tests: filtros, variantes, ponderación, días, extremos, ceros/futuros, bordes, correcciones, recortes, reimportación y borrado.

### 2. Integración React — agente de UI

Archivos exclusivos: `desktop/src/vistas/mercado/valoracion-personal.jsx`, `mis-ventas.jsx`, `detalle.jsx`, `desktop/src/vistas/mercado.jsx`, `desktop/test/tsm-valoracion.mjs` y ajustes necesarios en `desktop/test/tsm.mjs`.

1. Añadir suite sintética con estado/acciones verificables antes del componente nuevo.
2. Usar el contrato de tarea 1, texto ES/EN y colores/componentes existentes.
3. Resumen breve, método y sincronización desplegables nativos accesibles.
4. Retirar cruce por reino/ID: fuentes no acreditadas se consultan separadas, sin delta económico. El detalle Auctionator declara el bloqueo explícito.
5. Reloj local con cleanup; reemplazo/borrado del snapshot invalida derivados.
6. Probar claro/oscuro, ancho estrecho, teclado, actualización de fecha, correcciones/recortes/borrado, ausencia de red y errores.

### 3. Entorno, documentación y gates — DAVI

Archivos: este plan, `docs/TSM-VALORACION.md`, `docs/DESKTOP.md`, `docs/TESTING.md`, `standalone/MARKET.md`, `scripts/run-gates.mjs`, bundle generado y manifiesto.

1. Restaurar dependencias fijadas con `npm ci --ignore-scripts --no-audit --no-fund` en `desktop/`, sin cambiar lock ni versiones.
2. Usar Chromium headless, sin abrir ventanas ni robar foco; ningún archivo real del juego.
3. Construir bundle después de la integración; comprobarlo y ejecutar gates pertinentes por separado, excluyendo explícitamente Lua.
4. Integrar nueva suite y conteos solo después de medir salidas reales. No cambiar expectativas para esconder fallos.
5. Revisión adversarial de cálculo, identidad, privacidad, lifecycle, límites numéricos y UI; arreglar hallazgos con regresiones.
6. Documentar resultados reales, exclusiones de pruebas y límites. No declarar validación con usuario ni despliegue.

## Registro de ejecución y cierre técnico

Primera entrega implementada y probada con fixtures sintéticas; no validada con Cristóbal durante el juego ni desplegada. Sin push ni cambios del juego.

- Ejecución integrada del padre: `CHROMIUM_PATH=/usr/sbin/chromium node scripts/run-gates.mjs --no-lua --keep-going` → **23/23 gates ejecutados verdes**: Node 413, Python 122, CJS 123, Chromium 563 checks en 17 suites; build y bundle-check OK. Lua excluido expresamente: no es verificación completa del addon.
- Bundle: 9.692.462 bytes; SHA256 `1d79dd116292fa35d4c90ef2670921edd1fce113116a77ab1fb5631a798eaf49`.
- Revisión inicial `deleg_8760fce9`: parcial por modificaciones concurrentes. La mediana insuficiente y los conteos eran hallazgos ya corregidos o documentales. Se aceptaron el defecto de selección tras borrar/reimportar, el reloj inmóvil del detalle y dos aserciones permisivas. El snapshot inválido en MisVentas no aportó un camino alcanzable: el store valida antes de publicar; sin refactor adicional.
- Remediación: pruebas RED reales para selección y reloj; GREEN posterior. Selección ligada al snapshot, reset al cambiarlo, timer del detalle con cleanup; comprobación monetaria exacta y ausencia DOM de datos TSM sin elección manual.
- Segunda revisión independiente `deleg_53fe1eba`: `verified=true` limitado a fixtures y alcance revisado, sin hallazgos vigentes con impacto; 17 huellas de archivo iguales al inicio/final. Ejecutó UI 90 checks (`red=0`, `errores=0`) y núcleo 25/25. No reejecutó los gates globales: esos resultados corresponden al padre.
- Contraste posterior del padre: hashes del bundle, ambos componentes remediados y suite UI coinciden con la revisión; núcleo 25/25 y `git diff --check` limpio. Esta sección documental se añadió después de la revisión, sin cambios de código.
- Aprendizajes incorporados a la skill versionada del repositorio; no se actualizó la instalación del plugin.

**Límites abiertos, no defectos de esta entrega:** versión y comisión efectiva del TSM instalado, compatibilidad económica entre fuentes, validación humana y despliegue. El resumen no predice ni modifica recomendaciones. No hay modelo entrenado ni persistencia derivada nueva.

## Cierre verificable

Los criterios de aceptación son las reglas y casos anteriores, no únicamente completar esta lista. El build debe corresponder al fuente; pruebas de integración deben usar el bundle real. Lua queda sin ejecutar por instrucción explícita. Validación con Cristóbal, profesión piloto, estimador y diario prospectivo están fuera de esta entrega; cualquier persistencia adicional requiere acuerdo separado.

## Integración sobre 2.1.1 y correcciones de revisión (Claude Code, 2026-11-24)

El registro de arriba describe la primera entrega tal como se hizo sobre `fa20b89`. Su sha del
bundle (`1d79dd…`) ya no correspondía al bundle del árbol de trabajo (`f688e4…`), que sí coincidía
con el fuente. Lo que siguió, en la rama `agent/claude-code/tsm-valoracion`:

- Importación sobre `da4c1e8` (2.1.1): siete conflictos triviales (versión 2.2.0; el README conserva
  la instalación por catálogo).
- Regresiones de Mis ventas, corregidas por Devin con encargo cerrado: los objetos sin ventas de
  subasta desaparecían de la lista, y la contabilidad mostraba cobre en bruto en vez de `<Dinero>`.
- Textos en lenguaje de jugador, corregidos por MiniMax Code: sin códigos internos fuera de «Método
  y límites». También corrigió la fecha de la línea de anuncios del detalle, que trataba el día de
  Auctionator (EPOCH 2020-01-01) como día Unix.
- Revisión adversarial del núcleo por OpenCode: 37 comprobaciones a mano y 24.000 casos aleatorios
  contra una referencia independiente, sin discrepancias. Dos observaciones de contrato quedaron
  aclaradas en `docs/TSM-VALORACION.md`: `excluded` cuenta solo filas de venta `Auction`, y
  `no-sales` excluye los demás motivos. El núcleo no cambió.
- Segunda revisión de OpenCode, sobre la interfaz integrada: seis textos falsos o contradictorios,
  corregidos por Devin. El más serio venía de antes de la 2.2.0: el «Análisis de oferta» del detalle
  mostraba `<Dinero cobre={deal.medianaLow} />` como texto literal. Los demás: «sin ventas» con filas
  descartadas, «última venta — · sin fecha» con un histórico fechado, un contador que decía «ventana
  de 28 días» para objetos fuera de ella, fechas futuras como «hace 0 días», y «la referencia de
  arriba» en filas sin valoración.
- Gates completos **con Lua**; los conteos y el resultado están en la descripción del PR.

Sigue pendiente lo mismo que antes: validación con el `TradeSkillMaster.lua` real y despliegue.
