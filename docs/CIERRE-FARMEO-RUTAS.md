# Cierre: recomendaciones por ruta completa

## Fuente y alcance

Rama local `fix/farm-routing-release`, basada en `3c48460`:
el SHA256 del renderer instalado coincidía exactamente con ese commit.
No partir del viejo worktree `wow-farm-routing` (`ef9c552`) ni del main autor
(`052ea24`): ambos omiten mejoras ya instaladas, en particular navegación
agrupada y persistencia multiparte de capturas grandes de Auctionator.

Se integró por merge de tres vías el WIP cuantitativo preexistente del autor
(márgenes, valoración de campamentos, transparencia del modelo, crafteo y
sus tests) más el ajuste de ruta recuperado. Ese WIP no fue escrito entero
en esta sesión. Sus documentos de prompts permanecen en el checkout autor;
no son dependencias del paquete y no se incluyeron en esta entrega.

El checkout autor conserva sus cambios locales; la fuente reproducible de
esta entrega es **esta rama**, no su árbol sucio ni el clon antiguo del agente.
Respaldo previo a integrar en el autor:
`~/.hermes/cache/scratch/wow-farm-routing-before/manifest.json`.

## Correcciones cerradas

- Coste de tiempo: oro/h objetivo convertido a cobre mediante 10000, dividido
  por drops/h efectivos. Se descuenta una vez viaje, riesgo y competencia.
- El orden por ítem usa rendimiento efectivo, no el bruto de un campamento.
- Campamentos alternativos de una zona son contexto y último desempate;
  no se suman drops simultáneos ni se eleva la cota física de spawns/respawn.
- Resumen y lista usan el mismo comparador; en empate se prioriza bruto del
  campamento antes de disponibilidad de alternativas.
- Tabla y detalle comparten explicación de bruto, efectivo, viaje, riesgo,
  competencia y alternativas, con aviso explícito de supuestos sin calibrar.
- Desolace reconoce vuelo de ambas facciones en el modelo Classic. Es una
  corrección de etiqueta, no una reducción de los 22/25 minutos aproximados.
  No verifica el desbloqueo del personaje ni vuelos custom de Forever.
- La UI distingue margen frente al objetivo, oferta anunciada y ventas.

## Verificación ejecutada sobre la integración

`node scripts/run-gates.mjs --keep-going` → **21/21 gates verdes**:

| Stack | Resultado |
|---|---:|
| Node `tests/` | 372 pass, 0 fail |
| Python | 98 OK |
| Motores CJS | 123 pass, 0 fail |
| Addon Lua | 180 checks, 0 fallos |
| Chromium, 14 suites | 406 checks; red 0, errores JS 0 |
| Build + contrato del bundle | OK |

Regresión nueva: nueve tests de motor, incluidos competencia baja/media/alta,
override por zona, unidades, objetivo de tiempo, cota de spawns y ganador
consistente. Once checks de UI claro/oscuro y panel estrecho, con SDK y
precios **sintéticos**, sin SavedVariables reales.

Dos revisiones independientes examinaron motor y procedencia del instalado.
Los hallazgos de competencia y ordenación se corrigieron y se añadieron tests.
Se rechazó una sugerencia de test que invertía la relación del coste con el
objetivo oro/h: duplicar el objetivo **duplica** el coste, no lo reduce.

## Despliegue y límites

Entrega renderer-only: `desktop/plugin.js` + `desktop/BUNDLE.json` desde
HEAD, con respaldo local de los artefactos instalados. Alinear esos mismos
artefactos en el clon agente conserva la fuente que usa el reconciliador,
sin sobrescribir su código, configuración, skills ni estado local.
Verificar hashes y ejecutar suites contra `DESKTOP_PLUGIN` instalado.
No instalar addons en el juego ni tocar cuentas, mercado guardado o grants.

### Resultado del despliegue verificado

- Commit del bundle: `bbb8958ab01e993912c72df65515633a6f5c1b21`.
- Renderer y artefactos del clon agente alineados con HEAD; SHA256 común:
  `5f2ef49f33a6cdf5f67feb613818e1198ba5b83f973e17ed5f42d589da39599f`.
- Respaldo de ambos destinos antes de copiar:
  `~/.hermes/cache/scratch/wow-farm-deploy.qkc5a9we/before/`.
- `hermes plugins show wow-forever`: **enabled**.
- `hermes plugins doctor wow-forever`: manifest, import y registro **OK**.
- Las **14 suites Chromium contra el archivo instalado**, usando
  `DESKTOP_PLUGIN=~/.hermes/desktop-plugins/wow-forever/plugin.js` y
  `HERMES_SDK_TABS=1`, dieron **407 checks**, **red 0**, **errores JS 0**.
  Incluyen navegación con teclado del SDK real, persistencia de importaciones
  grandes, Subasta × Pawn y explicación de ruta. Se verificó otra vez el hash
  instalado después de todas las suites, sin cambio.
- El worktree de entrega queda comprometido y limpio; sin push.

La validación no mide drops, ventas, competencia, trayectos o ingresos reales.
La densidad es una cota de spawns/respawn del dataset, no distancia física.
El caso Air/Dust es un escenario de regresión, no una preferencia universal.
No se hizo push. El hot reload de Desktop y la prueba del bundle instalado
no equivalen a observación de la ventana activa del usuario.
