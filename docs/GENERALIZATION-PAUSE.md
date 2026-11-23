# Generalización pausada: primero revisar simplificación de ventanas

## Decisión vigente de Cristóbal

Tras la entrega P0, Cristóbal observó ventanas del plugin que podrían reducirse o eliminarse. Quiere examinarlas en una nueva sesión **antes de continuar generalizando**.

**No reanudar automáticamente los pasos pendientes del roadmap.** La siguiente sesión debe centrarse en revisar con Cristóbal las ventanas/vistas que tiene en mente, detectar redundancias y decidir cuáles conservar, fusionar, reducir o retirar. Aún no hay una lista de ventanas identificadas ni autorización para eliminarlas: preguntarle cuáles observó o recorrerlas con él, sin inventar candidatas ni borrar por iniciativa propia. Una hipótesis de simplificación no autoriza una eliminación.

## Punto de pausa verificado

- Rama: `feat/p0-integrated`.
- Commit de implementación: `f4ac7262f0901891166170c07eb2486eb6745887`.
- Árbol limpio al verificar antes de añadir esta nota.
- Entrega detallada: `P0-DELIVERY.md`.
- Plan: `GENERALIZATION-ROADMAP.md`.
- Gates locales ejecutados: **23/23**, Node 388, Python 122, standalone 123, Lua 180, navegador 443; build y bundle-check OK. No se reejecutaron para esta nota documental.
- P0 1/2/3/5/6 verificados localmente. P0 4 parcial/bloqueado: 78 ítems sin nombre y huecos de inicio de razas 95/96 conservados, sin fuente adicional recuperada y verificada con hash.
- Pasos 7–16 no implementados por esta entrega y **en pausa**, no son la siguiente tarea automática.
- Commits locales, sin push, PR modificada, merge a main ni despliegue. El plugin que Cristóbal está viendo puede no corresponder a esta rama: contrastar versión instalada y candidato antes de atribuir una ventana o conducta a estos cambios.

## Próxima sesión: alcance y condición de término

1. Leer esta nota y `P0-DELIVERY.md`; verificar Git antes de tocar código.
2. Identificar con Cristóbal las ventanas/vistas que observó y la versión que está usando.
3. Revisar utilidad, duplicación y dependencias de esas vistas; distinguir simplificación visual de retirada de capacidad o datos.
4. Acordar una propuesta concreta de conservar/fusionar/reducir/retirar, con impacto en navegación, funciones del agente y tests. No ejecutar eliminaciones sin acuerdo.
5. Solo después de esa revisión, decidir si implementar simplificaciones y cuándo retomar el roadmap. El cierre de esta revisión es un acuerdo explícito sobre las vistas, no completar la generalización por inercia.

## Límites que continúan

Preservar el WIP ajeno de main y otros worktrees. No tocar juego, SavedVariables o cuentas privadas. No inventar cobertura ni datos. Mantener procedencia y SIN DATOS, perfil v1, contrato de sync incluyendo `contracts/`, y límites del SDK. Push, PR, merge y despliegue requieren autorización explícita; esta nota no los autoriza.
