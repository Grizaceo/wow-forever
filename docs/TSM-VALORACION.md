# Valoración personal TSM — primera entrega descriptiva

## Alcance y estado

La primera entrega describe ventas propias registradas de subasta. No predice la próxima venta y no modifica recomendaciones, profesiones ni farmeo. El método es local, determinista y versionado: `tsm-descriptiva-v1`. No usa modelos ni red y no persiste estado derivado nuevo.

**No validado con una cuenta real ni con Cristóbal durante el juego; no desplegado.** Las pruebas usan fixtures sintéticas, el bundle real y un SDK simulado. La instalación del addon, su versión y la topología económica del servidor no se deducen de esas fixtures.

## Qué constituye una observación

- Una fila de `csvSales` con `kind = sale` y `source = Auction`, dentro del reino exacto y del `itemString` literal seleccionado. No se incluyen `Trade`, `COD`, `Vendor`, compras, expiraciones ni cancelaciones.
- La fila es un **registro contable**. TSM puede acumular cantidades en una fila mutable; no se promete un número de operaciones originales ni de ventas independientes.
- `quantity` ya contiene unidades totales. No se multiplica por `stackSize`.
- El precio es el importe **unitario registrado en cobre**. No se imputa precio a una fila sin precio utilizable.
- Los registros se agrupan por día UTC. Un día con muchas filas no recibe más peso entre días que uno con una sola. Días distintos tampoco demuestran independencia estadística.
- Primera y última venta delimitan el **período de ventas registradas**, no un período de seguimiento continuo. Pueden faltar días, haberse recortado la fuente o haber empezado el registro tarde.

## Contrato del cálculo

Módulo puro `desktop/src/tsm-valoracion.js`:

```js
valorarTsm(snapshot, realmName, itemString, { nowMs,
  windowDays: 28, minDays: 5, staleDays: 7, dispersionLimit: 0.5 })
listarValoracionesTsm(snapshot, realmName, { nowMs })
```

`nowMs` es una fecha de evaluación explícita en milisegundos; el núcleo no consulta el reloj. Los registros TSM usan segundos epoch; `firstSale`/`lastSale` conservan segundos y `evaluatedAt`/`windowStart` usan milisegundos. Los días son enteros UTC desde epoch.

La salida incluye `methodVersion`, `config`, identidad literal de reino/objeto, `evaluatedAt`, `windowStart`, `window`, `history`, `excluded`, `reasons` y `sufficient`. Cada resumen contiene unidades, registros, días, primera/última venta, mínimo/máximo registrados, mediana y cuartiles entre días y los valores diarios. Sin muestra, precios y fechas son `null`, no cero inventado.

### Resumen robusto

1. En cada día, ordenar precios y calcular la **mediana ponderada por unidades** por inversa de la distribución acumulada: primer precio cuyo peso acumulado alcanza al menos la mitad del total. En un empate exacto, se toma el precio inferior; no se interpolan unidades ni se expanden en memoria.
2. Entre esas medianas diarias, tomar la mediana convencional con **igual peso por día**; con número par de días, promediar los dos valores centrales. Puede resultar una fracción de cobre: es un estadístico, no una nueva operación registrada.
3. Q1 y Q3 usan interpolación lineal tipo 7: posición `(n - 1) * p`, con `p = 0.25` o `0.75` sobre los valores diarios ordenados.
4. No se eliminan extremos. Mínimo/máximo son precios unitarios de filas, no los cuartiles de días. El rango intercuartílico describe dispersión observada; **no es intervalo de predicción**.

El resultado se denomina **precio típico de los días con ventas registradas**. No es la media del ingreso por unidad de todas las ventas, ni el precio de mercado, ni una estimación de la próxima venta.

### Ventana y motivos de abstención

Ventana móvil inclusiva `[nowMs - 28 * 86400000, nowMs]`; el histórico disponible puede consultarse aparte y no rellena días faltantes en la ventana.

| Regla operativa v1 | Motivo | Interpretación |
|---|---|---|
| Sin ventas positivas válidas en ventana | `no-sales` | No hay precio reciente resumible. |
| Menos de 5 días distintos en ventana | `insufficient-days` | Piso de diversidad temporal; no es prueba de independencia. |
| Última venta hace más de 7 días | `stale` | Política explícita de cautela por antigüedad. |
| `(Q3 - Q1) / mediana > 0.5` | `wide-dispersion` | Dispersión amplia entre días. |

Los motivos se acumulan cuando corresponden, salvo `no-sales`, que excluye los demás: sin ventas en la ventana no hay días, antigüedad ni dispersión que evaluar dentro de ella (la última venta anterior sigue visible en el histórico). Con cualquiera de ellos se muestra **sin evidencia suficiente**, conservando los descriptivos existentes. No hay confianza alta/media/baja. Aunque no haya motivos, la suficiencia es **descriptiva**, nunca permiso para predecir.

Las reglas se aprobaron como punto de partida explicable: cuatro semanas, cinco días, una semana de antigüedad y dispersión relativa de la mitad. **No están calibradas ni validadas empíricamente.** No cambiarlas para aparentar mejor cobertura o convertirlas en afirmaciones económicas.

### Exclusiones

`excluded` cuenta **filas** de venta `Auction` de la variante consultada, no unidades ni transacciones. Las compras, expiradas, cancelaciones y ventas por otros canales quedan fuera del alcance por definición: no son exclusiones y se ven en la contabilidad de Mis ventas.

- `future`: fecha posterior a la evaluación. No se corrige al presente.
- `zero`: precio cero o cantidad cero; no aporta al resumen de precios ni a las unidades positivas resumidas. El parser normalizado ya exige cantidad positiva.
- `invalid`: datos fuera del contrato o límites seguros. No se reparan silenciosamente.
- `outsideWindow`: válidos pasados fuera de ventana, disponibles en `history`.

El snapshot normalizado no se modifica para excluirlos. Muchos registros de un mismo día siguen contando como un día; reimportar no crea observaciones.

## Identidad y comparación con Auctionator

TSM v1 guarda reino y variante, pero **no acredita identidad económica**. El mismo nombre de reino o ID base no demuestra región, pool, reglas, ámbito de subasta ni equivalencia de variantes entre formatos.

Por ello se retiró el cruce implícito por nombre/ID en Mis ventas. La UI lo dice en llano («TSM y Auctionator se muestran por separado»), sin delta económico ni asociación de variantes. Las fuentes siguen consultables separadas. No se introduce una pantalla de acreditación ni una equivalencia ad hoc como atajo en esta entrega.

Auctionator aporta anuncios, **no ventas**:

- `m`: último mínimo unitario anunciado.
- Fecha/antigüedad: la observación efectiva, no la fecha de importación.
- `a[día]`: máxima cantidad anunciada observada ese día; no se llama stock actual ni cantidad disponible ahora.
- Sin señal temporal suficiente, se declara fecha no disponible; no se rejuvenece al importar.

El código y la documentación preexistentes atribuyen a `Ledger/Mail.lua` la fórmula `floor((bid - ahcut) / quantity + 0.5)`, que ya descuenta comisión en ventas de correo. **No se verificó la versión instalada ni se confirmó aquí esa fórmula contra código público versionado.** Los intentos de recuperación de código público no aportaron una fuente verificable suficiente. Por eso la presentación conserva «importe registrado», explicita la limitación y no reconstruye bruto ni descuenta comisión otra vez. Anuncio bruto e importe posiblemente neto no producen un margen comparable sin acreditar la base. Costos de fabricación y depósitos tampoco se inventan.

## Sincronización, memoria y borrado

Se reutiliza sin modificar el ciclo de `tsm-sync.js`: snapshot completo válido sustituye al anterior; correcciones de cantidades/precios, recortes y eliminaciones sustituyen todas sus contribuciones. Un hash de archivo solo evita reimportaciones idénticas: **no identifica ventas nuevas**.

No existe ledger adicional, modelo entrenado ni diario prospectivo. Los derivados se reconstruyen desde el snapshot vigente y la fecha de evaluación; no se guardan en storage ni disco. Borrar TSM invalida el snapshot y sus derivados, y pausa el sondeo existente. La consulta separada del detalle vincula la selección manual al snapshot concreto: un reemplazo o borrado la vacía; reimportar requiere elegir reino y variante nuevamente. El borrado conserva el alcance lógico documentado de los slots: no se promete borrado seguro físico.

El reloj React se refresca sin necesidad de importar otro snapshot y se limpia al desmontar. Los métodos y detalles de sincronización quedan en desplegables. Se respetan revocación, permisos, errores, cola y cierre del plugin existentes. El núcleo no recibe rutas ni nombres de cuenta/personaje.

## Verificación y entregas posteriores

Las pruebas focalizadas son:

```sh
node --test tests/tsm-valoracion.test.mjs tests/tsm.test.mjs
CHROMIUM_PATH=/ruta/al/chromium node desktop/test/tsm-valoracion.mjs
CHROMIUM_PATH=/ruta/al/chromium node desktop/test/tsm.mjs
```

Ver conteos y ejecuciones en `docs/TESTING.md`. No confundir fixtures con validación humana o despliegue. Lua permanece fuera de la ejecución autorizada para esta entrega.

El estimador posterior necesita un contrato y una evaluación separados: referencia sencilla, candidato, separación temporal anterior a elegir/promover, y datos posteriores no usados para ajustar. Actualizar el snapshot no demuestra mejora del algoritmo. Cualquier diario adicional se acordará antes de persistirlo. La profesión piloto y la validación durante el juego siguen pendientes con Cristóbal.
