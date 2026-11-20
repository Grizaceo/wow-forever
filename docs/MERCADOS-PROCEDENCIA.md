# Mercado, procedencia y comparación de venta

## Qué sabemos y qué no

Una clave de Auctionator como `PvE` o `PvP` no demuestra la región ni si un precio vino de una casa capital o neutral. Tampoco lo demuestra la ubicación del personaje al exportar. Una base histórica completa puede contener observaciones de varias visitas.

La topología efectiva de las casas neutrales de Forever **no está confirmada por este plugin**. No se crean mercados Horda/Alianza/Neutral por analogía con Classic. Las cifras 5%/15% publicadas en guías son evidencia secundaria, no tasas universales configuradas por defecto.

La inspección del paquete público [Auctionator 340](https://curseforge.com/wow/addons/auctionator/files/9037876) describe separación regional por ruleset, no una clave explícita neutral/capital. No demuestra la versión instalada del usuario.

## Regla de confianza

- Conservar la clave original de origen y las variantes exactas.
- No identificar una economía a partir de nombres, ciudad o facción.
- Datos históricos sin prueba de origen permanecen **sin identificar**.
- Una observación nueva identificada no convierte retroactivamente todo el histórico en identificado.
- Los datos de regiones y rulesets distintos no son alternativas para la venta del mismo personaje.

Si capital y neutral comparten ofertas, hay una sola serie económica; las comisiones pueden describir canales de publicación distintos. Si tienen ofertas separadas, hacen falta capturas realmente separadas. Ninguna migración puede reconstruir información que el exportador no conservó.

## Cómo interpretar la comparación

El último mínimo anunciado no es un precio de venta garantizado. La fecha efectiva pertenece a cada observación, no al momento de importar el archivo. Una ausencia significa falta de datos, no precio cero.

El neto por una venta, cuando la comisión está acreditada, resta solo esa comisión del precio bruto. Viaje, fabricación y pérdidas por expiración son costes aparte. Un depósito reembolsado al vender no es un gasto definitivo. Los ingresos personales de TSM se mantienen separados: no se les vuelve a descontar una comisión de forma automática.

Cuando faltan procedencia, tasas o fechas compatibles, la interfaz debe explicar el bloqueo en lugar de recomendar dónde vender. Un escenario hipotético debe rotularse como tal y no autoriza recomendaciones.

## Seguimiento local

La actualización automática sondea **cada 30 s** tres fuentes locales dentro de la carpeta concedida a la app: `Auctionator.lua` (precios anunciados), `TradeSkillMaster.lua` (contabilidad personal, como datos CSV) y el diario `WoWForeverBridge.lua` (una entrada por día que sobrevive la poda de ~21 días de Auctionator). No consulta todos los mercados en vivo. Después de escanear en el juego, `/reload` o cerrar sesión permite que el addon escriba sus SavedVariables. Importar hoy un histórico antiguo no vuelve recientes sus observaciones. El puente es **transporte, no exportador verificado**: sus precios, como los de un Auctionator real sin exportador, se etiquetan **UNKNOWN** por diseño.

El agente no necesita abrir archivos privados de cuenta para probar estas reglas. Las pruebas automatizadas usan fixtures sintéticas y un SDK simulado; no certifican el comportamiento del servidor.

## Comprobación pendiente dentro del juego

Para cerrar la duda neutral/capital, obtener búsquedas de varias ofertas identificables en ambas ubicaciones, misma región y ruleset, próximas en el tiempo. Un precio mínimo idéntico o distinto por sí solo no basta: las ofertas cambian continuamente. Contrastar también lo que el exportador conserva por cada observación.

No es necesario publicar, cancelar, comprar ni transferir oro para esta comprobación. Si no hay evidencia reproducible, la conclusión sigue siendo **no determinado**.

## Interfaz de comparación (pestaña Mercado)

La vista Mercado muestra un aviso **UNKNOWN** cuando los precios provienen de un Auctionator real sin exportador verificado, aunque el guardado esté en esquema antiguo. En ese estado la comparación capital/neutral aparece bloqueada con el motivo, sin sugerir dónde vender.

Las observaciones aisladas se eligen por su **identidad verificada** (región, ruleset, piscina, canal y ventana declarada), nunca por el nombre del reino: dos fuentes distintas pueden usar el mismo nombre. Las etiquetas son declaradas y validadas por esquema; un JSON autodeclarado «verified» no se acredita sin un adaptador de confianza configurado.

La tabla de comparación distingue bruto, neto y su fecha de observación. El neto sólo se calcula con una comisión verificada, etiquetada, fechada y no futura; si falta, se rotula **escenario**. Las filas ausentes en un lado se explican como falta de datos, nunca como precio cero, y cada fila muestra sus motivos. No se muestran porcentajes inventados (5 %/15 %) ni afirmaciones de liquidez o beneficio garantizado.

Dos ámbitos de la **misma piscina** no se cuentan como dos fuentes: se muestran como una sola serie con canales alternativos y sin delta. Sólo se comparan entre sí piscinas distintas dentro de la misma región, ruleset y ámbito de observación. El botón de restauración del respaldo previo a v2 exige una confirmación explícita en dos pasos. Ese respaldo (`pre-v2-backup.json`) se guarda **troceado en partes ≤3 MiB + manifiesto** cuando supera el tope de 4 MiB por archivo del host (`electron/plugin-files-ops.ts`); `readBackupDoc` reensambla el documento lógico al leer. Si el rollback falla, el respaldo nunca se sobrescribe: es la única copia del estado v1.
