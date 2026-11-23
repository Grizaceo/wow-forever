# Guías inteligentes de maxeo de profesión

Ruta de subida **optimizada por coste real** hasta 300, con el coste de **adquirir las
recetas** separado del de los reactivos. Dos mitades con paridad verificada: el motor JS
(`src/crafteo.js`, lo consume el desktop) y el CLI del agente
(`skills/wow-forever/scripts/consultar.py`). Nunca se inventa un dato: lo que no está en
`data/` se declara `SIN DATOS` y queda fuera de la ruta con precio.

## Fases

| Fase | Qué | Estado |
|---|---|---|
| 0 | Bundle desktop reconciliado (mercado v2 + DAVI + datos) | hecha (`d90637e`) |
| 1 | Extracción Forever-nativa del cliente: `receta_item`, `aprende` (naranja real desde `ItemSparse.RequiredSkillRank`), `como`, `vendedores`, `tiers`, `huecos` | hecha (generador `tools/build-datos-juego.py`) |
| 2 | **Motor de coste con adquisición + CLI `maxeo` + paridad JS↔Python** | **hecha (este documento)** |
| 3 | UI desktop «maxear a 300» (**hecha**), export de precios al CLI (**hecho**), ROI con histórico (**hecho**), coste de entrenamiento de tramos, cierre de huecos de adquisición | en curso |

## El motor (Fase 2)

### `costoAdquisicion(receta, precios, items, faccion)` / `costo_adquisicion(...)`

Coste de **conseguir la receta** (no los reactivos). Devuelve `{cobre, fuente, item}`:

- `como` `entrenador` o `automatica` → `{cobre: 0, fuente: 'gratis', item: null}`.
- `como` `receta` con `receta_item`:
  1. si lo vende un vendedor de la facción (`vendedores[faccion]` no vacío) y el ítem tiene
     precio de compra (`items[id][9] > 0`, flag vendedor `[10] == 1`) → compra del vendedor;
  2. si no, precio de subasta del objeto-plan (`precios[id]`) → `fuente: 'subasta'`;
  3. si no hay ninguno → `cobre: null` (**SIN DATOS**, la receta queda fuera de la ruta).
- `como` `desconocido` o `receta` sin `receta_item` → `cobre: null`.

`faccion` opcional: sin ella se acepta vendedor de cualquier facción. El **coste de entrenar
los tramos con el trainer no está en los datos**: se declara aparte, no se inventa ni se suma.

### `rutaMaxeo(recetas, desde, cap, precios, items, {faccion})` / `ruta_maxeo(...)`

Ruta golosa por **menor coste esperado por punto de habilidad**, punto a punto de `desde` a
`cap` (tope de seguridad `desde+1000`):

- En cada punto `s`, para cada receta con adquisición conocida y reactivos con precio:
  `eff = coste_reactivos / prob_subida(s) + adquisición_amortizada`, donde la adquisición se
  amortiza sobre los **puntos esperados restantes** de esa receta (`cum[fin] - cum[s]`, suma
  de `prob_subida`) y solo se cobra si aún no se ha pagado. Desempate: menos reactivos, luego
  menor `spell`.
- Elige la receta, avanza mientras siga siendo la mejor, acumula `crafteos = Σ 1/prob` y
  `coste = Σ coste_reactivos/prob`. La adquisición se paga **una sola vez** (lista
  `adquisiciones`, con `desde` = punto donde se compra).
- Incluye recetas **verdes** (no solo naranja/amarillo): lo que importa es el coste por punto.
- Tramos sin receta con precio → `huecos` con motivo. Recetas con adquisición conocida pero
  reactivo sin precio → `sinPrecio`. Adquisición sin dato → `adquisicionesSinDato`.
- Salida: `{desde, cap, pasos, totalMateriales, totalAdquisicion, total, cobertura, huecos,
  adquisiciones, adquisicionesSinDato, sinPrecio, avisoEntrenamiento}`.
- **`total`/`totalMateriales` = `null` si no hay ningún paso** (sin ruta = sin estimación, no 0).
  `cobertura` = puntos cubiertos / puntos del tramo. Determinista.

### `cargar_precios(path, reino)` (CLI)

Adaptador a `itemId(str) → cobre(int)`. Acepta cuatro formatos:

1. canónico/export: `{valores: {id: cobre}, reino, fecha, schemaVersion}`;
2. plano: `{id: cobre}`;
3. **bundle legacy del mercado** (el que escribe el desktop):
   `{values: {snapshot: {realms: [{name, items: [{itemId, unitPriceCopper}]}]}}}`;
4. extracción: `{precios_por_reino: {name: {id: cobre}}}`.

El CLI lee así el bundle real del plugin **sin acoplarse a su formato interno**. Solo precios
positivos; `reino` selecciona cuando hay varios.

## Estimado vs conocido vs SIN DATOS

- **Conocido**: estructura de recetas, `rango` (naranja/amarillo/verde/gris), reactivos,
  `receta_item`, `vendedores`, precio de compra del vendedor, tiers.
- **Estimado**: crafteos esperados (`1/prob_subida`, regla de subida de Classic 1.12), coste
  de materiales (precio × crafteos esperados), adquisición amortizada. Los precios de subasta
  son un **snapshot con fecha**, no liquidez ni precio en vivo.
- **SIN DATOS (no incluido en el total)**: coste de entrenar tramos con el trainer; adquisición
  de recetas sin objeto-plan conocido (drop/quest/vendedor sin ítem); reactivos sin precio.

## Piloto reproducible (precios reales PvP, 2026-11-16, Horda)

Fuente: bundle del desktop `~/.config/Hermes/plugin-files/data/wow-hunter-guide/market-a.json`
(reino `PvP`, 6732 ítems con precio, importado `2026-11-16T20:14:43Z`).

```sh
python3 skills/wow-forever/scripts/consultar.py maxeo \
  --precios ~/.config/Hermes/plugin-files/data/wow-hunter-guide/market-a.json \
  --reino PvP --faccion horda
```

| Profesión | Materiales | Adquisición | TOTAL | Cobertura |
|---|---|---|---|---|
| Herrería | 653o 30p | 26o 11p | **679o 41p** | 100% |
| Sastrería | 490o 71p | 9o 2p | 499o 72p | 100% |
| Peletería | 204o 72p | 16o 70p | 221o 42p | 100% |
| Encantamiento | 84o 96p | 1o 33p | 86o 29p | 100% |
| Ingeniería | 69o 34p | 1o 31p | 70o 65p | 100% |
| Alquimia | 31o 89p | 4o 90p | 36o 79p | 100% |
| Primeros auxilios | 10o 53p | 72p | 11o 25p | 100% |
| Cocina | 1o 53p | 1o 98p | 3o 51p | 100% |
| Minería | 24o 40p | 2o 47p | 26o 87p | 58% |
| Herboristería / Pesca / Desuello | — | — | — | 2% |

Herrería 1→300: 33 pasos, 17 planes comprados en subasta (26o 11p), 266 recetas con
adquisición SIN DATOS excluidas, 1 receta con reactivo sin precio excluida. La ruta arranca
con piedras de afilar/pulir férreas (lo barato de Classic) y sigue cobre→bronce→hierro→mitril.

**Las profesiones de recolección (herboristería, pesca, desuello, minería parcial) no suben
crafteando**: el modelo de ruta por receta no las representa (cobertura 2–58%). Su «maxeo» es
recolectar/pescar, no fabricar; queda declarado, no se fuerza una ruta falsa.

## Comandos CLI

```sh
# Resumen de coste de maxear a 300 (todas las profesiones o una)
consultar.py maxeo --precios FILE [--reino R] [--faccion horda|alianza] [--profesion P] [--detalle] [--skill N]

# Ruta con costes desde tu skill: --maxeo llega a 300, --hasta H fija otro tope,
# y sin ninguno va al siguiente tramo. --maxeo REQUIERE --precios (error claro si falta).
consultar.py profesion herreria --skill 120 --faccion horda --precios FILE --reino PvP --maxeo [--max 20]
consultar.py profesion herreria --skill 120 --precios FILE --hasta 225   # tope personalizado

# Sin --precios y sin --maxeo: plan de subida rápido (comportamiento anterior, intacto)
consultar.py profesion herreria --skill 120 --faccion horda
```

## Verificación

- `tests/ruta-maxeo.test.mjs` — 9 tests JS (fixtures sintéticos con valores calculados a mano:
  amortización 214 vs gratis 150, hueco 75, determinismo, inválidos → `total null`).
- `tests/test_maxeo.py` — 14 tests Python: mismos fixtures/valores, `cargar_precios` en los 4
  formatos, y **paridad real** `ruta_maxeo() == rutaMaxeo()` sobre las recetas reales de
  Herrería con precios sintéticos deterministas (node subprocess, como `test_skill.py`).
- Gate completo: `node --test tests/`, `python3 -m unittest discover -s tests`,
  `cd desktop && node build.mjs`, `python3 scripts/check_desktop_bundle.py desktop/plugin.js`,
  harness Chromium (`desktop/test/navegador.mjs` + `vista-profesiones.mjs`).

## UI desktop: modo «Maxear a 300» (Fase 3, hecha)

`desktop/src/vistas/profesiones/plan.jsx` — `PlanSubida` tiene ahora un toggle **Plan rápido /
Maxear a 300**. El plan rápido (`planDeSubida`, sin adquisición) queda intacto como default.

- **Maxear a 300** consume `rutaMaxeo(prof.recetas, skill, 300, precios, items, {faccion})` con los
  precios del mercado importado (`estado.market` + `perfil.reino`) y la facción del perfil.
- Muestra: pasos de la ruta (tramo, receta, crafts, coste de materiales), **adquisiciones pagadas**
  (receta, fuente vendedor/subasta, desde qué skill, coste), **cobertura %** del tramo, totales
  separados (materiales + adquisición = total), **huecos** con motivo, y notas honestas de
  **SIN DATOS** (adquisiciones sin coste conocido) y recetas sin precio de reactivo.
- El aviso de **entrenamiento de tramos SIN DATOS** se muestra siempre en este modo (no se inventa).
- Sin precios importados: invita a importar en Mercado (no calcula una ruta falsa).
- Solo lista adquisiciones **pagadas** (`cobre>0`); las gratis (entrenador/automática) entran en la
  ruta pero no se listan como coste. i18n es/en.

Verificación: harness Chromium `vista-profesiones.mjs` **27 ✓** (17 anteriores + 10 del modo maxear:
sin mercado, ruta completa con adquisiciones pagadas y cobertura 100% sobre un fixture data-driven de
Herrería, ruta parcial honesta, toggle de vuelta al plan rápido), `navegador.mjs` **34 ✓**, 0 red /
0 errores JS. Build + `check_desktop_bundle.py` OK. Bundle desplegado en
`~/.hermes/desktop-plugins/wow-forever` (sha verificado; harness contra el bundle instalado 27 ✓).

## Export de precios al CLI (Fase 3, hecho)

`desktop/src/vistas/mercado.jsx` — botón **«Exportar precios para el CLI»** en la tarjeta de scan
(junto a importar/borrar), habilitado solo con snapshot y reino seleccionado.

- Escribe `data/precios-cli.json` en la **carpeta de datos del plugin** (`ctx.files.writeText`, con
  confirmación de lectura) en el **formato canónico** `{schemaVersion:1, reino, fecha, valores:{id:cobre}}`
  — el primero que reconoce `cargar_precios`. Exporta el **reino seleccionado**; solo ítems con
  `itemId`/`unitPriceCopper` enteros seguros > 0 (sin ID válido no escribe nada: no inventa).
- El usuario no localiza las rutas privadas de los slots del bundle: el fichero queda en la carpeta
  de datos del plugin y la UI muestra el comando `consultar.py maxeo --precios …/precios-cli.json`
  con botón **Copiar comando** (`ctx.os.writeClipboard`).
- Fallo de escritura → error visible, no confirma éxito. i18n es/en.

Verificación: harness `vista-mercado.mjs` **55 ✓** (+7: botón deshabilitado sin snapshot, formato
canónico, precios exactos del reino, comando visible, copiar al portapapeles, fallo de escritura);
contra el bundle instalado **55 ✓**. **Round-trip e2e**: el canónico exportado del mercado real
(PvP, 6732 ítems, 2026-11-16) da stdout **idéntico** a `maxeo --precios market-a.json --reino PvP`
(Herrería 679o 40p 79c, 100% cobertura). Build + check OK; node 229, python 70; sha del bundle
idéntico en repo/install/agent-half (`d7fbf4f2…`).

## ROI con histórico (Fase 3, hecho)

Coste de maxear a 300 valorado con la **media móvil de los mínimos diarios** del histórico
de precios, más el **retorno** de los crafts producidos al subir y su **tendencia**. Motor
compartido con paridad exacta JS↔Python y subcomando `roi` del CLI.

### Datos: histórico activo v2; v1 retenido para rollback

El histórico **activo es v2**: el bundle `market-v2-*.json` trae `history:{v:2, scopes:{…}}`
(y existe `price-history-v2-*.json`). En disco (2026-11-19, reino PvP) hay **7300 ítems /
57 863 filas**, días 2504→2514. Los `price-history-*.json` **v1 legacy**
(`{revision, store:{v:1, realms:{<reino>:{items:{<id>:[[día, low, avail], …]}}}}}`, piloto
6732 ítems, días 2504→2511) se **retienen** para el rollback pre-v2; ya no son el histórico
activo. `cargar_historico` lee ambos: v1 (`store.realms`) y v2 (`history.scopes`).
`low` = mínimo diario en cobre; `avail` = **oferta disponible, NO ventas**. Los días son
relativos: se etiquetan «día N», no se inventan fechas.

### Semántica honesta del retorno

- **Inversión** = `totalMateriales + totalAdquisicion` de `rutaMaxeo`/`ruta_maxeo`, con los
  reactivos valorados a la media móvil histórica (no al snapshot puntual).
- **Retorno vendedor (suelo garantizado)** = `venta_cobre` (col.5) × **crafts exactos** × yield.
  Lo que el vendedor paga siempre; no depende de liquidez.
- **Retorno estimado (AH)** = por craft, el **mayor** de {precio medio AH × (1 − 0,05) × yield,
  vendedor}: la subasta se valora **neta de comisión del 5 %** (H1) y el vendedor no paga
  comisión. Es una **estimación**: la media es de mínimos diarios observados y `avail` es oferta,
  no volumen negociado → **la liquidez en subasta NO está garantizada**.
- **Convención del ratio** (H1): `roiVendedor`/`roiEstimado` = **retorno / inversión**, NO
  `(retorno − inversión) / inversión`. La rentabilidad neta se publica aparte como
  `rentabilidadVendedor`/`rentabilidadEstimada`; `neto*` = retorno − inversión. `null` si no
  hay ruta con precio (coste `null`).
- **Crafts fraccionales** (H5): el coste usa `Σ(1/p)` por punto y el retorno usa ese mismo
  número exacto; `pasos[].crafteos` es sólo el número entero de presentación. Redondear los
  crafts antes del retorno mezcla dos magnitudes (p. ej. 5/3 crafts → 50c, no 60c).
- **Probabilidad de subida** (H4): `probSubida` es una interpolación **lineal aproximada** de
  Classic 1.12, **no verificada** contra `SkillGainChance` del servidor. Los crafts son una
  esperanza suponiendo intentos independientes; no se estima varianza. Se expone como
  `avisoProbabilidad` en `rutaMaxeo`/`ruta_maxeo`.
- **Saturación** (H12): sin `saturacion` explícita, `retornoEstimado` es lineal y asume que
  **todos** los crafts se colocan al precio unitario; `retornoEstimadoAjustado` es `null`.
  Sólo si el llamador aporta un supuesto `0 < saturacion <= 1` se publica el ajustado
  (`retornoEstimado × saturacion`) y su ROI. No se inventa tasa de venta a partir de `avail`.
- Crafts sin valor (`crea:null`, p.ej. encantamientos; o ítem sin fila ni precio) se declaran
  **SIN DATOS** y quedan fuera del retorno (`pasosSinValor`).
- **Tendencia**: cambio % del último mínimo diario respecto al primero; `sube`/`baja`/`plana`
  (plana si |Δ|<2%). Resumen sobre los reactivos de la ruta. Serie <2 puntos → SIN DATOS.
- **Tendencia robusta** (H11, óptica nueva): `preciosHistoricos(..., null, {robusto:true})` /
  `precios_historicos(..., opts={'robusto':True})` sustituye la media por **mediana de mínimos
  diarios** y calcula `tendenciaRobusta` comparando la mediana de la primera mitad con la de la
  segunda (mínimo 4 puntos, banda de ruido de ±5 % documentada y **no calibrada**). Un día
  extremo no desplaza la mediana. El modo por defecto conserva la media/tendencia anterior.
- **Cobertura** (H13): fracción de puntos cubierta por recetas **con adquisición conocida**.
  `recetasConsideradas` y `adquisicionesSinDato` lo hacen explícitos: es cobertura de skill en
  ese subconjunto, **no es una cota inferior del coste total ni prueba de coste mínimo/global**.
- El **coste de entrenamiento de tramos sigue SIN DATOS** (no entra en el ROI).

### CLI

    python3 skills/wow-forever/scripts/consultar.py roi \
      --historico ~/.config/Hermes/plugin-files/data/wow-hunter-guide/market-v2-b.json \
      --reino PvP --faccion horda [--profesion herreria] [--detalle] [--ventana N] [--precios spot.json]
      [--robusto] [--saturacion F]

`--ventana N` limita la media a los últimos N días (por defecto todos). `--precios` añade
precios spot de respaldo para ítems sin histórico. `--robusto` cambia a mediana de mínimos y
tendencia por mitades (H11). `--saturacion F` (0<F≤1) aplica un supuesto **explícito del
llamador** de tasa de venta y añade la columna `ROI aj`; sin él no se asume nada (H12).
Sin `--historico` → exit 2. La tabla muestra coste, retorno vendedor, ROI vendedor, retorno
estimado, ROI estimado y cobertura; `--detalle` añade neto, rentabilidad neta, ajuste por
saturación, tendencia de reactivos, `recetasConsideradas`/`adquisicionesSinDato` (H13) y
pasos con/sin valor.

Piloto verificado sobre el **v2 activo** (PvP, horda, días 2504→2514, 7300 ítems): Herrería
1→300 coste **668o 96p 13c** (materiales 655o 18p 60c + adquisición 13o 77p 53c), retorno
vendedor **222o 64p 59c** (ROI 33%), estimado **430o 55p 78c** (ROI 64%); 11 reactivos suben,
17 bajan; 100% cobertura, 26 pasos con valor, 0 SIN DATOS. Encantamiento: retorno 0
(`crea:null` → SIN DATOS). Recolección: cobertura baja (no hay ruta de crafteo).

Las cifras de retorno son las del **snapshot publicado**, no una corrida nueva: tras H1 el
retorno estimado se valora neto de comisión AH, así que una regeneración con el mismo
histórico dará otro valor. **No se inventa aquí un retorno nuevo**: se conservan los importes
publicados y se corrigen sólo los netos, que estaban copiados de otra corrida.

### Control numérico del piloto

Invariante de publicación: todas las cifras de una fila deben venir del **mismo snapshot,
reino y rango de días**, expresadas en cobre entero:

    coste = materiales + adquisicion
    netoVendedor = retornoVendedor − coste
    netoEstimado = retornoEstimado − coste
    roiVendedor = retornoVendedor / coste
    roiEstimado = retornoEstimado / coste

| Skill | Materiales | Adquisición | Coste | Ret. vendedor | Neto vendedor | Ret. estimado | Neto estimado | ROI vendedor | ROI estimado |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Herrería | 6.551.860 | 137.753 | 6.689.613 | 2.226.459 | -4.463.154 | 4.305.578 | -2.384.035 | 0,33 | 0,64 |

Cifras previamente publicadas y **retiradas** por romper la identidad: neto vendedor
−4.476.846 (diferencia 13.692 cobre) y neto estimado −2.395.965 (diferencia 11.930 cobre):
sus costes implícitos, 6.703.305 y 6.701.543, no coinciden con el coste declarado. Con 26
pasos, un redondeo de medio cobre sería del orden de 13 cobre, no miles. `tests/test_cuantitativo.py`
parsea esta tabla y verifica las cinco identidades con tolerancia 0 (el formato redondea los
ROI a 2 decimales, no el cobre), además de guardar los dos contraejemplos como regresión.

### Paridad y tests

`serieHistorico`/`mediaMovil`/`mediana`/`medianaMovil`/`tendencia`/`tendenciaRobusta`/
`preciosHistoricos`/`roiRuta`/`rutaMaxeo` (JS) ↔ `serie_historico`/`media_movil`/`mediana`/
`mediana_movil`/`tendencia`/`tendencia_robusta`/`precios_historicos`/`roi_ruta`/`ruta_maxeo`
(Python), más `valor_creado`. `tests/roi.test.mjs` (13), `tests/ruta-maxeo.test.mjs` (9),
`tests/cuantitativo.test.mjs` (8) y `tests/test_roi.py` (17), `tests/test_maxeo.py` (14),
`tests/test_cuantitativo.py` (11: H1/H4/H5/H11/H12/H13, invariante del piloto y paridad
real sobre Herrería con histórico sintético, modo robusto y saturación: `roi`, `ruta`,
`precios` y `meta` idénticos). Foco: 30 tests Node + 42 Python, todos verdes. Suite completa:
367 Node (eran 359) y 97 Python (eran 86). `_round` half-up; desempate de ruta heredado de
`rutaMaxeo`. `scripts/run-gates.mjs` **no se tocó**: sus expectativas (359/86) quedan
desactualizadas por los +8/+11 tests nuevos hasta que su responsable las actualice.

Nota: `test_desktop.py::test_build_reproducible` falla en este árbol de trabajo porque
`desktop/src` difiere de `desktop/plugin.js`: además de los cambios de otros agentes
(farming/deals), este cambio añade dos avisos (H4/H5 y H13) en
`desktop/src/vistas/profesiones/plan.jsx`. `node build.mjs` compila correctamente; **no se
regeneró** `desktop/plugin.js` para no pisar el trabajo ajeno pendiente.

## Pendiente (Fase 3)

1. **Coste de entrenamiento de tramos**: hoy SIN DATOS. Fuente posible: trainers de CMaNGOS
   (`spell` de entrenamiento con precio) — requiere derivarlo del cliente/SQL, no inventarlo.
2. **Huecos de adquisición**: 266 recetas de herrería sin objeto-plan conocido (drop/quest).
   Cruzar con `huecos.adquisicion_forever` y fuentes curadas; declarar, no rellenar a ciegas.
3. **Recolección**: modelo propio (nodos/pescado por punto) si se quiere «maxeo» de gathering.
4. **ROI en la UI desktop**: hoy es motor+CLI; falta la vista (importaría `roiRuta`, que
   entonces sí entraría al bundle y exigiría rebuild+deploy).
