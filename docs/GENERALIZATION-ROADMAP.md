# Hoja de ruta de generalización — plugin `wow-forever`

**Base de referencia:** commit `6009602` (avance en `--ff-only` desde `052ea24`). Los archivos
`data/*.json` **no cambiaron** en ese rango (`git diff --stat 052ea24..HEAD` no lista `data/`),
así que todas las cifras de esta hoja son válidas para la base instalada con navegación y
mejoras de farmeo. Verificado el 2026-11-22.

**Alcance:** esta es una hoja de ruta, no una declaración de soporte universal
ya implementado. Rendimiento, sincronización y CI se verifican por separado;
las brechas de cobertura siguientes conservan sus propios criterios de aceptación.

**Objetivo.** Que cualquier jugador —cualquier facción, raza, clase, nivel (1–60) y
profesión— reciba la misma respuesta fiable: con procedencia declarada, sin datos
inventados y con un motivo explícito cuando la guía no cubre su caso. Hoy el plugin ya
valida las 9 clases y 10 razas, pero la *profundidad* de los datos no es uniforme y la
única guía curada es la del Cazador de la Horda.

---

## 1. Cómo se midió (evidencia, no suposiciones)

| Herramienta | Uso | Salida que se cita |
|---|---|---|
| `skills/wow-forever/scripts/consultar.py` | `fuentes`, `huecos --tema …`, `perfil`, `entrenadores`, `profesion`, `zonas`, `dungeons` | lista de huecos declarados y motivos; nombres de fuentes |
| Conteo Python puro sobre `data/*.json` (sin red, sin archivos de juego) | `len()` de claves y listas, distribución de `f`, `faccion`, `como` | todas las cifras de las §2–3 |
| `data/MANIFEST.json` | hashes/builds | procedencia y reproducibilidad |
| `git diff --stat 052ea24..HEAD` | confirmar que los datos no cambiaron | base `6009602` |

**Etiquetas de procedencia** (tal como las emite `consultar.py fuentes` y `MODELO-DATOS.md`):

- `cliente-forever` — tablas del cliente 1.60.1.70888 (`wowf`, en y `esMX`). **Verificado en cliente**: razas, clases, combinaciones, profesiones, recetas, ítems, zonas, jefes de dungeon y nombres. No incluye spawns, entrenadores ni botín del servidor.
- `cmangos-1.12` — CMaNGOS classic-db `28ef6259…`. **Aproximación de Classic 1.12**: misiones, NPC, entrenadores, coordenadas, hechizos, botín y probabilidades. Forever puede diferir.
- `curado` — escrito a mano en `standalone/guide-*.js` → `skills/wow-forever/references/`. **Sin probar en el juego salvo que el texto lo diga.**

Toda respuesta del agente debe llevar una de estas etiquetas. Si el dato falta, se dice
«SIN DATOS» con el motivo del `hueco`; no se rellena con otra fuente.

---

## 2. Estado medido

### 2.1 Archivos

| Archivo | Registros | Observación |
|---|---:|---|
| `personaje.json` | 10 razas · 9 clases · **56 combinaciones** (16 marcadas `nueva`) | 8 razas de Classic + Skyborne 95 (Alianza) y 96 (Horda) |
| `clases.json` | 9 clases | entrenadores y misiones por facción; hechizos y competencias por clase |
| `profesiones.json` | 12 profesiones · **2146 recetas** | 1256 `cmangos-1.12` + 890 `cliente-forever` |
| `items.json` | 22 821 ítems | 5043 IDs de CMaNGOS; 78 sin nombre publicado |
| `misiones.json` | 4245 misiones | `a` 1530 · `h` 1311 · `ah` 1404; nivel −1…70 (1 misión con nivel < 0) |
| `zonas.json` | 51 zonas | 39 con rango de niveles; 6 ciudades; 6 huecos de niveles |
| `dungeons.json` | 26 clásicos + 9 Forever | 220/251 jefes clásicos con botín; 0/58 jefes Forever con botín |

### 2.2 Clase × facción (`clases.json`)

| Clase | Hechizos | Competencias | Entrenadores A/H | Misiones de clase A/H | Estado |
|---|---:|---:|---:|---:|---|
| Guerrero (1) | 99 | 22 | 16 / 16 | 75 / 69 | completo |
| Paladín (2) | 137 | 14 | 11 / **0** | 88 / 14 | **hueco** entrenadores Horda |
| Cazador (3) | 120 | 18 | 17 / 12 | 57 / 57 | completo + guía curada |
| Pícaro (4) | 106 | 14 | 16 / 12 | 61 / 61 | completo |
| Sacerdote (5) | 177 | 7 | 18 / 13 | 68 / 60 | completo |
| Chamán (7) | 158 | 14 | **0** / 11 | 13 / 73 | **hueco** entrenadores Alianza |
| Mago (8) | 159 | 7 | 15 / 17 | 64 / 65 | completo |
| Brujo (9) | 145 | 7 | 10 / 11 | 93 / 103 | completo |
| Druida (11) | 180 | 11 | 10 / 7 | 52 / 53 | completo |

Los hechizos y competencias son **por clase, no por facción**; las misiones de clase sí
están por facción y existen incluso en las dos combinaciones sin entrenadores. El motivo
declarado en `clases.json.huecos` es: «combinación válida del cliente sin entrenadores de
clase en CMaNGOS 1.12». **No se puede rellenar copiando la otra facción.**

### 2.3 Profesiones (`profesiones.json`)

12 oficios: 9 principales y 3 secundarias (`src/perfil.js` coincide). Recetas por oficio:
Herrería 440, Peletería 511, Sastrería 412, Ingeniería 231, Encantamiento 195, Alquimia
181, Cocina 125, Primeros auxilios 25, Minería 17, Herboristería 3, Pesca 3, Desuello 3.
Recolección: Herboristería, Minería, Pesca, Desuello. Por `como`: `receta` 1655,
`entrenador` 416, `automatica` 27, `desconocido` 48.

### 2.4 Huecos declarados

Visibles con `consultar.py huecos` (32 entradas): **2** `inicio` (razas 95/96), **2**
`entrenadores` (tabla 2.2), **6** `niveles` (zonas 1450, 2482, 2521, 2548, 2652, 2665),
**21** `botin` (12 mapas clásicos con encuentros sin criatura vinculada + 9 dungeons
Forever), y **1** entrada en `profesiones` (26 recetas Forever sin ítem-plan; no tiene
campo `tema`, por eso `huecos --tema recetas` devuelve 0).

**No visible con el script:** `items.json.huecos` tiene 1 entrada (78 ítems citados por
recetas sin nombre en las tablas del cliente), pero `cmd_huecos` solo recorre
`personaje, clases, profesiones, zonas, dungeons, misiones`. Es un defecto del propio
informe de huecos, no un dato sano.

---

## 3. Matriz de cobertura

| Dimensión | Valores | Cubierto | Parcial / límite | Cómo se consulta |
|---|---|---|---|---|
| Facción | 2 | 2 | Las capitales son fijas por facción | `perfil`, `zonas` |
| Raza | 10 | 8 con zona de inicio | 95/96 sin `inicio` (hueco, motivo CMaNGOS `playercreateinfo`) | `perfil --raza` |
| Clase | 9 | 9 válidas | Todas en ambas facciones; 2 sin entrenadores | `perfil --clase` |
| Combinación raza+clase | 56 (16 nuevas) | 56 validadas por `combinacionValida()` | Las `nueva` son las que pueden romper supuestos de 1.12 | `src/perfil.js`, `data/personaje.json` |
| Nivel | 1–60 | 1–60 en `perfil` y `zonas` | 1 misión con nivel −1; 6 zonas sin rango | `perfil`, `zonas`, `misiones` |
| Profesión | 12 | 12 con entrenadores en ambas facciones | 26 recetas sin plan; 48 `como: desconocido`; 290 excluidas (`meta`) | `profesion`, `maxeo`, `roi` |
| Entrenadores de clase | 18 pares clase×facción | 16 | 2 vacíos (Paladín/Horda, Chamán/Alianza) | `entrenadores` |
| Misiones de clase | 18 pares | 18 | ninguno vacío | `misiones-clase` |
| Zonas por nivel | 51 | 39 con niveles | 6 ciudades (N/A) + 6 huecos | `zonas` |
| Dungeon clásico | 26 · 251 jefes | 26 con rangos; 220 jefes con botín | 12 mapas con botín sin vincular | `dungeon` |
| Dungeon Forever | 9 · 58 jefes | 9 con nombres y orden de jefes | 0 botín, 0 rangos: dato del servidor | `dungeon` |
| Guía curada | 1 clase + contenido Legacy | Cazador/Horda; Legacy no es una clase | Sin guía equivalente para las otras clases; Guerrero y Chamán se retiraron por errores | `references/INDICE.md` |
| Pawn / equipo | depende de la cuenta | catálogo de 29 escalas | pesos **no** persistidos en SavedVariables; solo en runtime | `desktop/src/pawn.js` |

---

## 4. Supuestos específicos del Cazador que bloquean la generalización

La única guía curada es `skills/wow-forever/references/curado-cazador-horda.md`
(generada desde `standalone/guide-hunter.js`). No es neutra: codifica decisiones de una
configuración concreta. Cada supuesto debe convertirse en una opción declarada o en un
«sin dato», nunca en un valor global.

| # | Supuesto del Cazador Horda | Evidencia en el repo | Efecto en otro jugador | Destino |
|---|---|---|---|---|
| H1 | **Facción Horda**: ruta Durotar/Barrens/Org/Entrañas, zep UC→Org, quests «(Horda)» | §«Ruta de niveles», hitos y `Dungeons` de la guía | Alianza no tiene ruta curada | Paso 7 |
| H2 | **Raza Trol**: `/cast Berserking` en la macro de Rapid Fire y «Trol = Bow Specialization» | guía líneas 559, 685 | Otras razas tienen otro racial; la macro queda inválida | Paso 11 |
| H3 | **Spec**: BM por defecto; recompensa de la quest 50 cambia (Devilsaur Eye para MM/SV, Tooth para BM); macros con talentos BM/MM | guía líneas 219–221, 545–607, 669–677 | El premio y las macros no son universales | Pasos 12 y 14 |
| H4 | **Arma**: arco por defecto, gun alternativo, `pref: 'any'`; escasez de guns de Horda hasta 48 | guía 679–687; `perfilParaMotor` en `docs/prompts/devin-equipo-simc-pawn.md` | Otra clase/spec necesita otro mapa de armas | Pasos 10, 11 y 13 |
| H5 | **Nivel y armadura**: 1–60, dual wield al 20, entrenar malla al 40, quest de clase al 10 y 50 | guía hitos 10/20/40/50 | Cambia por clase | Pasos 7, 10 y 14 |
| H6 | **Profesiones**: Ingeniería para las armas de fuego marcadas (Deadly Blunderbuss, etc.); comida para el pet | tabla de armas y «Tips de hunter» | El perfil guarda profesiones, pero **no skill** | Pasos 8 y 9 |
| H7 | **Restricciones de ítem**: BoE en subasta, BOP («Nightstalker Bow ligado al recogerlo»), recompensa solo Horda, armas `Ingeniería` | tabla de armas, listas de dungeon | `items.json` **no codifica** clase/raza/facción/oficio que puede equipar: solo `nivel_req` y clase/subclase del *ítem* | Paso 10 |
| H8 | **Escala Pawn**: 29 escalas con `ClassID`/`SpecID`/`Role`/`Provider` pero sin `Values`; pesos solo en runtime (`PawnGetAllStatValues`); selección capturada → clase+spec → clase → `null` | `docs/prompts/devin-equipo-simc-pawn.md` §§5–6 | Sin captura no hay ranking; no se puede inventar peso ni DPS | Paso 12 |

La guía ya advierte en «Sobre el servidor "Forever"» que usa datos 1.12 y que conviene
verificar cada ítem en el juego. Esa advertencia debe generalizarse a **todas** las clases,
no solo al Cazador.

---

## 5. Hoja de ruta ordenada

Convención: `P0` bloquea a las demás, `P1` alta, `P2` media. Cada paso lleva prerrequisito,
referencia, criterio de terminación verificable, prueba de aceptación y límite que **no**
se va a sobrepasar. El orden importa: no se generaliza una respuesta antes de saber de dónde
sale el dato.

### Fase 0 — Contrato de generalización (P0)

1. **Fijar el contrato de procedencia y de «SIN DATOS».** Pre: base `6009602`. Ref:
   `docs/MODELO-DATOS.md` §«Fuentes», `cmd_fuentes` en `consultar.py`. Criterio: toda
   respuesta de la skill y de la vista incluye una etiqueta (`cliente-forever`,
   `cmangos-1.12`, `curado`) o el motivo literal del hueco; cero frases del tipo «debería
   dar…». Prueba: `tests/test_skill.py`, `tests/preguntar-davi.test.mjs`. Límite: la
   procedencia es del dato, no una verificación en el juego.

2. **Usar un único perfil canónico.** Pre: paso 1. Ref: `src/perfil.js`
   (`validarPerfil`, `combinacionValida`, `razasPara`, `NIVEL_MAX=60`,
   `PROFESIONES_PRINCIPALES`/`SECUNDARIAS`), `data/personaje.json`. Criterio: las 56
   combinaciones son aceptadas y las que no existen se rechazan con error `combinacion`;
   ninguna respuesta depende de un nombre de clase escrito a mano. Prueba:
   `tests/perfil.test.mjs`, `tests/guia-logica.test.mjs`. Límite: `migrarPerfil` solo
   conoce 3 clases antiguas (`hunter`, `warrior`, `shaman`); es migración, no generalización.

### Fase 1 — Cerrar huecos que sí se pueden medir (P0)

3. **Hacer visible el hueco de ítems en el informe.** Pre: paso 1. Ref: `cmd_huecos` en
   `consultar.py` (recorre 6 archivos, omite `items.json`). Criterio: `huecos` sin filtro
   lista 33 entradas (32 actuales + la de `items.json`); `--tema nombre` devuelve 1;
   `--tema recetas` devuelve 1 (el hueco de profesiones no tiene `tema`: hay que darle uno
   o listarlo sin filtrar). Prueba: `tests/test_skill.py`, `tests/referencias-skill.test.mjs`.
   Límite: solo cambia el informe; no inventa nombres.

4. **Completar lo que el cliente puede completar.** Pre: paso 3. Ref: `MANIFEST.json`
   (`wago-forever`, `wago-forever-esMX`), `tools/build-datos-juego.py`. Criterio: origin
   de razas 95/96 si las tablas del cliente lo traen; o confirmar el hueco con motivo.
   Para los 78 ítems sin nombre: solo completar desde una tabla pública con hash en el
   manifiesto. Prueba: `tests/test_datos.py`, `tests/test_reproducible.py` (regenerar en
   temporal y comparar `MANIFEST`). Límite: **no** rellenar desde knowledge general.

### Fase 2 — Entrenadores y hechizos por clase/facción (P0)

5. **Dar salida explícita a los 2 pares sin entrenadores.** Pre: pasos 1–2. Ref:
   `clases.json.huecos`, `cmd_entrenadores`, `cmd_hechizos`. Criterio: para los 18 pares
   clase×facción, `entrenadores` devuelve lista o «SIN DATOS: combinación válida del
   cliente sin entrenadores de clase en CMaNGOS 1.12»; Paladín/Horda y Chamán/Alianza
   mantienen sus misiones de clase (14 y 13) sin copiar entrenadores de la otra facción.
   Prueba: `tests/test_skill.py`, `tests/curado-datos.test.mjs`. Límite: el dato es de
   servidor/Forever; no se puede derivar de 1.12.

6. **Separar hechizos de clase de hechizos de facción.** Pre: paso 5. Ref: `clases.json`
   (`hechizos` por clase, `misiones` por facción). Criterio: la respuesta rotula
   «hechizos (clase, [Classic 1.12])» frente a «misiones de clase (facción)»; ningún índice
   de hechizo se filtra por facción sin declararlo. Prueba: `tests/test_skill.py`.
   Límite: los 99–180 hechizos por clase son una aproximación de 1.12.

### Fase 3 — Zonas y rutas por nivel (P1)

7. **Rutas por nivel y facción para 1–60.** Pre: fase 2. Ref: `zonas.json` (`zonas`,
   `ciudades`, `misiones_por_zona` con 46 entradas), `cmd_zonas`, `docs/PROFESIONES-INTELIGENTES.md`.
   Criterio: para cada (nivel, facción) la respuesta da zonas con `niveles` o declara el
   hueco; las 6 ciudades se marcan «N/A (capital)», no como dato faltante; los 6 huecos
   (1450, 2482, 2521, 2548, 2652, 2665) siguen explícitos. Prueba:
   `tests/ruta-logica.test.mjs`, `tests/test_skill.py`. Límite: los rangos son `curado` de
   Classic; no se calculan desde la misión con nivel −1.

### Fase 4 — Profesiones con skill real (P1)

8. **Skill de profesión en el perfil, no booleano.** Pre: pasos 1–2; habilita el paso 9.
   Ref: `src/perfil.js`
   (hoy guarda solo IDs), `desktop/src/simc.js` (donde llega el skill), `docs/MODELO-DATOS.md`
   §«Estado del personaje desde SimulationCraft». Criterio: `profesiones:[{id, skill}]`
   validado; ausencia de skill → «skill desconocido» en el plan. Prueba:
   `tests/perfil.test.mjs`, `tests/simc.test.mjs`. Límite: SimC manda en nivel/clase/spec;
   el perfil manda en facción; no se mezclan silenciosamente.

9. **Plan de subida para los 12 oficios y 2 facciones.** Pre: fase 2 y paso 8. No ofrecer
   un plan de fabricación para recolección como si fueran actividades idénticas:
   mostrar su estrategia o un hueco explícito. Ref: `src/crafteo.js` (`dificultad`,
   `dificultadReceta`, `probSubida`, `costoReceta`, `valorCreado`, `plan de subida`),
   `cmd_profesion`, `cmd_maxeo`, `cmd_roi`. Criterio: las 26 recetas Forever sin
   ítem-plan y las 48 `como: desconocido` devuelven `dificultad: desconocida` /
   «no se sabe si se puede aprender», nunca `naranja`; el plan marca tramos sin
   candidata con `spell: null`. Prueba: `tests/crafteo.test.mjs`, `tests/oficios.test.mjs`,
   `tests/recetas-propias.test.mjs`, `tests/test_maxeo.py`, `tests/test_roi.py`.
   Límite: la probabilidad de subida es la regla de Classic, aproximada para Forever;
   sin precios, `costo: null`.

### Fase 5 — Ítems y restricciones (P1)

10. **Modelo de restricción de equipamiento.** Pre: fase 4. Ref: `data/items.json` (tupla
    `[es, en, calidad, nivel_req, nivel_item, venta_cobre, clase, subclase, ligado,
    compra_cobre, vendedor, dps_x10]`), `docs/MODELO-DATOS.md` §`items.json`,
    `desktop/src/item-stats.js`. Criterio: la respuesta distingue `nivel_req` (sí está) de
    «clase/raza/facción/oficio que puede equiparlo» (**no está** en la tupla) y lo dice;
    las recomendaciones BoE/BOP y Ingeniería de la guía se rotulan `curado`, no regla
    general. Prueba: `tests/item-stats.test.mjs`, `tests/curado-datos.test.mjs`.
    Límite: no afirmar que un ítem es «solo para X» sin una tabla con hash en `MANIFEST`.

11. **Raciales y armas por raza/clase.** Pre: paso 10. Ref: guía H2/H4, `personaje.json`
    (`combinaciones`). Criterio: la macro con `Berserking` y la regla «Trol = Bow
    Specialization» solo se ofrecen si `raza == 8`; si no, se omite con nota. Prueba:
    `tests/curado-datos.test.mjs`, `tests/referencias-skill.test.mjs`. Límite: los
    raciales de Forever no están en `data/`; se marcan `curado`.

### Fase 6 — Pawn, spec y motor de farmeo (P1/P2)

12. **Escala Pawn con procedencia y sin inventar pesos.** Pre: fase 5. Ref:
    `desktop/src/pawn.js`, `desktop/src/subasta-pawn.js`, `docs/plans/2026-11-22-subasta-pawn.md`,
    `docs/prompts/devin-equipo-simc-pawn.md` §6. Criterio: los 29 escalones del catálogo
    se muestran con `temPesos:false` si no hay `Values`; `escalaDoJogador` sigue el orden
    capturada → `classID`+`specID` → `classID` → `null` + motivo; sin pesos la vista es
    `SIN DATOS` (`sin-escala-pawn`). Prueba: `tests/pawn.test.mjs`,
    `tests/subasta-pawn.test.mjs`, `desktop/test/vista-pawn.mjs`,
    `desktop/test/vista-subasta-pawn.mjs`. Límite: el *score* es `Σ stats×pesos`, no DPS
    ni recomendación; nunca se interpolan stats ausentes.

13. **Mapa de clase para el recomendador de farmeo.** Pre: paso 12. Ref:
    `perfilParaMotor` en `docs/prompts/devin-equipo-simc-pawn.md` (hoy 1=warrior,
    3=hunter, 7=shaman, resto `'otro'`), `standalone/market-farm.js`. Criterio: las 9 clases
    tienen entrada explícita o caen en `'otro'` con la nota «sin ajuste por equipo de
    clase» visible; `spec` y `pref` se declaran en la respuesta. Prueba:
    `tests/mercado-logica.test.mjs`, `standalone/tests/market-farm.cjs`.
    Límite: oro/h/ROI son estimaciones con drops de 1.12 y sin población.

### Fase 7 — Guías y skill (P2)

14. **Cobertura honesta de guías curadas.** Pre: fases 5–6. Ref:
    `tools/build-referencias-skill.mjs`, `tools/auditar-curado.mjs`,
    `skills/wow-forever/references/INDICE.md`. Criterio: el índice dice explícitamente que
    solo hay Cazador/Horda y contenido Legacy; para las otras clases se usa el dato generado y se
    dice «sin guía curada»; Guerrero y Chamán siguen retirados. Prueba:
    `tests/referencias-skill.test.mjs`, `tests/curado-datos.test.mjs`, `tests/test_skill.py`.
    Límite: no redactar guías nuevas a mano como si fueran verificadas.

15. **Contrato del agente para perfil parcial.** Pre: todo lo anterior. Ref:
    `skills/wow-forever/SKILL.md` §§1 y 4, `cmd_perfil`. Criterio: si faltan raza, clase o
    facción, la respuesta usa lo que alcanza y pregunta lo que falta cuando cambie el
    resultado; los NPC/misiones/hechizos de 1.12 se dejan en inglés. Prueba:
    `tests/test_skill.py`, `tests/preguntar-davi.test.mjs`. Límite: la instantánea del
    perfil no es lectura del juego en vivo.

### Fase 8 — Puerta de cobertura (P2, coordinación con CI)

16. **Chequeo de suelos de cobertura, no de deseos.** Pre: fases 0–7. Ref:
    `scripts/run-gates.mjs`,
    `docs/TESTING.md`. Criterio: una comprobación de solo lectura falla si bajan los
    suelos medidos — 9 clases, 10 razas, 12 profesiones, 56 combinaciones, 2146 recetas,
    39 zonas con niveles, 16/18 pares con entrenadores, 220 jefes clásicos con botín — o
    si aparece un hueco sin motivo. Prueba: la propia puerta existente más
    `tests/test_datos.py`, `tests/test_reproducible.py`. Límite: la puerta no puede exigir
    botín Forever aún no incorporado. Ampliar esa cobertura requiere primero una fuente
    verificable del servidor y pruebas de procedencia; no sustituirla por Classic.

    **Puerta de producto, además de conteos:** validar las 56 combinaciones con perfiles
    de nivel 1/10/20/40/60; cubrir las 12 profesiones con skill ausente, inicial y máximo;
    verificar escalas Pawn ausentes y de otra clase/spec; exigir que ningún resultado de
    Alianza incluya rutas Horda ni que un racial Trol aparezca para otra raza. Usar una
    matriz pairwise documentada para el resto de variables, con casos obligatorios de
    Paladín/Horda, Chamán/Alianza y razas 95/96. Hacer onboarding desde cero con testers
    de Windows/macOS/Linux (selector nativo, permisos, cuenta única/múltiple, `/reload`,
    archivo ausente, escritura parcial y revocación), sin intervención manual del autor.
    Registrar versión de cliente/addons/host y marcar cada combinación no probada: una
    CI verde de parsers no certifica la experiencia de un jugador independiente.

---

## 6. Límites que no deben cruzarse

- **Botín Forever:** 9 dungeons, 58 jefes, **0** con botín incorporado. Falta una fuente
  verificable integrada; se reporta SIN DATOS, nunca con botín de 1.12.
- **Entrenadores de Paladín/Horda y Chamán/Alianza:** combinaciones válidas del cliente
  ausentes en 1.12. No se copian de la otra facción.
- **Zona de inicio de Skyborne (razas 95/96):** sin `playercreateinfo` en CMaNGOS.
- **6 zonas sin rango** y 6 capitales sin rango (estas últimas son N/A, no hueco).
- **78 ítems sin nombre**, **26 recetas sin plan**, **48 recetas `desconocido`**, **290
  recetas excluidas**, **1 misión con nivel −1**.
- **`items.json` no tiene restricciones de jugador** (clase/raza/facción/profesión); solo
  `nivel_req` y clase/subclase del objeto. Recomendar equipo de la guía a otra clase es
  inventar cobertura.
- **Pawn:** 29 escalas sin `Values` persistidos; sin captura del addon no hay pesos y no
  hay ranking. El valor es una fórmula, no DPS simulado.
- **Datos de cuenta:** precios viven en la página, no en `data/`. El agente no lee `WTF`,
  `Config.wtf`, credenciales ni ejecuta Lua; la app lo hace dentro de permisos concedidos.
- Esta hoja no autoriza por sí misma recolectar datos privados ni modificar archivos de juego.

---

## 7. Definición de terminación de esta hoja

La hoja está terminada cuando: (a) los 16 pasos tienen prerrequisito, referencia, criterio
medible, prueba y límite; (b) cada cifra citada es reproducible con los comandos de la §1
sobre la base `6009602`; (c) las 8 suposiciones del Cazador están convertidas en pasos
concretos; (d) la matriz de la §3 distingue «verificado en cliente», «aproximación
Classic» y «curado»; y (e) cada brecha sigue identificada como trabajo pendiente, no como
soporte ya entregado. Cumplir esta definición cierra el documento, no los 16 pasos.
