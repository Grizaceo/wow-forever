# Entrega local P0 — `feat/p0-integrated`

Validada por el coordinador mediante `node scripts/run-gates.mjs`: **23/23 gates verdes**, exit 0. Entorno local Linux, Node v26.12.0. No se atribuyen estos resultados a CI remota ni a Windows/macOS.

Checkout: `/home/gris96/wt/wow-p0-integrated`. Base: `cd0d0dcd0bdfa6a3f073640bef1027cc9c080e9e`. No se modificaron datos generados, archivos del juego, SavedVariables, instalación del plugin ni WIP de main. Sin push, PR, merge a main ni despliegue.

## Contribuciones verificadas

Atribución por encargos e informes de herramientas; el autor Git común no identifica al trabajador.

| Trabajador | Commit integrado | Contribución |
|---|---|---|
| mcode | `a5ff773` | Procedencia visible y separación de alcances en UI; 23 checks nuevos de navegador. |
| Devin | `208937e` | Contrato perfil-v1 y helper Python, constantes JS, fixtures y tests. |
| Subagente Hermes | `83b7b19` | Corrección adversarial Unicode, trim y números extremos; comparación ejecutada JS/Python. |
| Subagente Hermes, reemplazo de OpenCode | `2bcf6bd` | CLI: huecos completos, alcance explícito y consumo del helper canónico. |
| Subagentes Hermes de integración | Commit de cierre posterior a estos commits | Runner, instalación sintética del agent-half, bundle reproducible, pruebas y documentación. |
| Coordinador DAVI | Integración y aceptación | Worktrees, revisión de diffs, commits locales y ejecución del runner completo; devolución del fallo de locator para reparación. |

OpenCode superó smoke, pero su ejecución de implementación quedó bloqueada por aprobación: no se le atribuye código.

## Estado de los seis pasos

| Paso | Estado de esta tranche | Evidencia |
|---|---|---|
| 1. Procedencia / SIN DATOS | Verificado en CLI y UI local | Fuentes cliente/CMaNGOS/curado distinguibles, fallback visible para desconocidas; tests sintéticos. No implica verificación en cliente real. |
| 2. Perfil canónico | Implementado y verificado | `contracts/perfil-v1.json`, consumidores JS/Python, paridad ejecutada incluyendo 56 combinaciones a cinco niveles y casos inválidos/Unicode; v1 conserva IDs de profesiones. |
| 3. Informe de huecos | Implementado y verificado | Siete archivos, 36 registros; `--tema nombre`: 1; `--tema recetas`: 3 según campo declarado `recetas`. No altera datos. |
| 4. Completar datos recuperables | Parcial / bloqueado para contenido restante | Se conservan motivos de razas 95/96 y 78 ítems sin nombre. No se obtuvo una fuente adicional verificable con hash; no se inventa contenido. |
| 5. Pares sin entrenadores | Existente y verificado | 18 pares: 16 con entrenadores; Paladín/Horda y Chamán/Alianza explicitan SIN DATOS y conservan 14/13 misiones. |
| 6. Hechizos vs misiones | Implementado y verificado | Hechizos de clase como aproximación Classic 1.12, misma lista entre facciones; misiones y entrenadores por facción. CLI rechaza filtro de facción en hechizos. |

## Ejecución final del coordinador

```text
$ node scripts/run-gates.mjs
node tests/           388 / 388
python tests/         122 / 122
node motor .cjs       123 / 123
lua bridge           180 / 180
build desktop        OK
bundle-check         OK
browser TOTAL        443 / 443
GATES: 23/23 verdes
TODO VERDE
exit 0
```

Incluye 16 suites de navegador. `vista-clase` emite dos resúmenes (14 + 9): el runner suma ambos y exige 23. No se usaron overrides de conteos.

El primer runner encontró el locator obsoleto `Hechizos de entrenador`; se reparó usando tarjetas estables y aserciones de alcance, sin reducir los 51 checks de la suite general. La ejecución final anterior es posterior a esa reparación.

La instalación sintética prueba helper+contrato y CLI real en payload aislado (`data/`, `skills/`, `contracts/`), fuera del checkout y sin PYTHONPATH del repositorio. El despliegue real futuro debe incluir `contracts/`; no hay script de sincronización versionado, se documenta el payload manual en `SYNC-TROUBLESHOOTING.md` §9.

## Límites y próxima tranche

No hay validación real en cliente WoW/Hermes ni nueva CI remota. El paso 4 no se declara cerrado. No se añadieron habilidades de profesión, restricciones de equipo ni pesos Pawn inventados. Los pasos 7–16 no están implementados por esta entrega.

Antes de desplegar: autorización explícita, ejecutar la CI remota en plataformas soportadas, transportar el payload completo y validar el cliente real. Para enriquecer datos: fuente pública recuperable y hash fijado; de lo contrario conservar SIN DATOS.
