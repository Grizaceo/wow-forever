# WoW Forever Farm — verificación en el juego

El contador está probado con la API de WoW simulada (`addon/tests/test_farm.lua`),
**no en el cliente de Forever**. Forever usa la API Mainline 12.1.5 con las
restricciones de Midnight: cierra el registro de combate (`COMBAT_LOG_EVENT_*`) a los
addons y entrega algunos valores como «secretos». Por eso el contador cuenta igual que
el registro de mazmorras de DungeonJournal, que ya funciona en Forever: `PARTY_KILL`,
`UNIT_DIED`, las líneas de XP y de «Has matado», y los cadáveres vistos o saqueados.
Hay que confirmar qué de eso llega **en el mundo abierto**. Nada de esto envía
entradas al juego: lo juegas tú.

## Instalar

1. Copia la carpeta `addon/WoWForeverFarm` a
   `World of Warcraft/_forever_/Interface/AddOns/WoWForeverFarm`.
2. La primera vez **reinicia el cliente** (un addon nuevo no aparece con `/reload`).
3. En la lista de addons del personaje, marca **WoW Forever Farm**.

## Cómo mide

- **Reloj:** `/wff start` (o **Iniciar**) arma la sesión; el reloj arranca al comienzo
  de tu **primera pelea con muerte** (o tu primer saqueo o recolección). El camino
  hasta ahí se anota aparte como «viaje». **Empezar ya** (`/wff ya`) arranca el
  reloj en el acto.
- **Botín:** la lista de la ventana sale de las líneas «Recibes botín: …» (lo que de
  verdad entró a tus bolsas); las monedas, del cambio de tu dinero mientras saqueas.
- **Pesca (0.3.0):** cada ventana de botín de pesca (`IsFishingLoot`) es una captura;
  la primera arranca el reloj. El corcho no cuenta como recolección.
- **Muertes:** cada aviso de una misma muerte se junta en una sola. Si el juego oculta
  de qué mob era, la muerte cuenta igual (sin mob) y el saqueo le pone nombre después.
  Un cadáver que solo miras (objetivo, mouseover) cuenta únicamente si ese mob peleó
  contigo en la sesión: los que mataron guardias u otros, o los de antes de Iniciar, no.
- **Desuello:** es la ventana que se abre en un cadáver ya vaciado. Si cierras un
  saqueo dejando algo (bolsas llenas) y lo reabres, no cuenta como desuello.
- **Robo (Rogue):** la ventana de botín de un mob vivo es un robo: lo robado cuenta
  como botín, pero no como cadáver ni muerte.

## Checklist (10 minutos)

| # | Haz esto | Debería pasar | Si no pasa, anota |
|---|---|---|---|
| 1 | `/wff` | Aparece la ventana «Farmeo · sin sesión» | ¿error de Lua? (copia el texto) |
| 2 | Pulsa **Iniciar** y camina hacia los mobs | «esperando el primer mob»; el reloj sigue en 0:00 y a la derecha sube «viaje» | — |
| 3 | Mata un mob | El reloj arranca (desde el comienzo de esa pelea); Muertes = 1 | ¿sigue «esperando»? |
| 4 | Saquéalo | Aparece en «Botín» con su icono, cantidad y valor; «Monedas» sube | ¿lista vacía? |
| 5 | Pon un mob de objetivo y escribe `/wff test` | Dice si el GUID y el nombre del objetivo son visibles o «SECRETO» | Copia las 4 líneas |
| 6 | Mata 5 mobs más y escribe `/wff status` | «Avisos de muerte: party N, xp N…» | Copia la línea: dice qué avisos llegan |
| 7 | Desuella un cadáver (si tienes Desollar). Luego, en otro, cierra el saqueo dejando un ítem y reábrelo | El cuero sale en «Botín»; las muertes no se duplican; reabrir no suma un desuello (`/wff status`) | ¿cuenta dos muertes o un desuello de más? |
| 8 | Mata un mob que no suelte nada | Muertes sube igual | Si no sube: anota el `/wff status` |
| 9 | **Pausar**, espera 1 min, **Seguir** | El reloj no cuenta el minuto | — |
| 10 | Vende algo a un vendedor | No cambia «Monedas» (se guarda aparte) | — |
| 11 | **Terminar**, luego `/reload` | El chat resume la sesión y dice «Guardada» | — |
| 12 | (0.3.0, si pescas) **Iniciar**, lanza la caña y saca 3 capturas | El reloj arranca con la primera captura; la ventana dice «Pesca N capturas · N/h» y lo pescado sale en «Botín» | ¿sigue «esperando»? Entonces Forever no expone `IsFishingLoot`: `/wff ya` arranca el reloj y lo pescado cuenta igual, pero como recolección |

Después del `/reload`, en Hermes → WoW Forever → **Mercado → Farmeo → Mis sesiones**
la sesión aparece con sus métricas (el plugin lee `WoWForeverFarm.lua` desde la
misma carpeta SavedVariables que ya concediste).

## Qué mirar si algo falla

- **`/wff status` dice «party_oculto»:** el juego oculta de qué mob era cada muerte
  (pasa dentro de mazmorras). Las muertes cuentan; las que no saquees quedan sin mob
  y el plugin no usa esa sesión para ajustar drops por mob.
- **Ningún aviso de muerte (ni party, ni xp, ni target):** solo quedan los cadáveres
  saqueados; los mobs sin botín no cuentan y el plugin lo marca con *.
- **La lista de botín dice «(ventanas)»:** las líneas «Recibes botín» no llegaron; la
  lista sale de lo que mostraban las ventanas de botín (si tus bolsas se llenan, puede
  incluir cosas que no tomaste).
- **Sin zona en la sesión:** `C_Map.GetBestMapForUnit` no está; las muertes se
  asignan igual por el id del mob.
