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
| 3 | UI desktop «maxear a 300», export de precios del mercado al CLI, coste de entrenamiento de tramos, ROI con histórico, cierre de huecos de adquisición | pendiente |

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

## Pendiente (Fase 3)

1. **UI desktop**: modo «maxear a 300» en `PlanSubida` que consuma `rutaMaxeo` (adquisiciones +
   total + cobertura), y botón en Mercado para **exportar el snapshot de precios** en formato
   canónico y alimentar el CLI sin rutas privadas.
2. **Coste de entrenamiento de tramos**: hoy SIN DATOS. Fuente posible: trainers de CMaNGOS
   (`spell` de entrenamiento con precio) — requiere derivarlo del cliente/SQL, no inventarlo.
3. **ROI con histórico**: `price-history-*.json` (v2, `scopes`) para coste medio móvil y
   tendencia, no solo el snapshot puntual.
4. **Huecos de adquisición**: 266 recetas de herrería sin objeto-plan conocido (drop/quest).
   Cruzar con `huecos.adquisicion_forever` y fuentes curadas; declarar, no rellenar a ciegas.
5. **Recolección**: modelo propio (nodos/pescado por punto) si se quiere «maxeo» de gathering.
