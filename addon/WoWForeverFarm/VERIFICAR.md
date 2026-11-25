# WoW Forever Farm — verificación en el juego

El contador está probado con la API de WoW simulada (`addon/tests/test_farm.lua`),
**no en el cliente de Forever**. Forever usa la API Mainline 12.1.5 con las
restricciones de Midnight (valores secretos en combate), así que hay que confirmar
qué funciona. Nada de esto envía entradas al juego: lo juegas tú.

## Instalar

1. Copia la carpeta `addon/WoWForeverFarm` a
   `World of Warcraft/_forever_/Interface/AddOns/WoWForeverFarm`.
2. La primera vez **reinicia el cliente** (un addon nuevo no aparece con `/reload`).
3. En la lista de addons del personaje, marca **WoW Forever Farm**.

## Checklist (10 minutos)

| # | Haz esto | Debería pasar | Si no pasa, anota |
|---|---|---|---|
| 1 | `/wff` | Aparece la ventana «Farmeo · sin sesión» | ¿error de Lua? (copia el texto) |
| 2 | Pulsa **Iniciar** | Estado «en curso», el tiempo avanza | — |
| 3 | Mata un mob y saquéalo | Muertes sube a 1; «Monedas» y «botín» suben | ¿Muertes sigue en 0? |
| 4 | Pelea varias veces | «Combate %» sube durante la pelea | — |
| 5 | Desuella un cadáver (si tienes Desollar) | El botín sube; las muertes no se duplican | ¿cuenta dos muertes? |
| 6 | Mata un mob que no suelte nada | Muertes sube igual | Si no sube: el objetivo muerto no se detecta |
| 7 | `/wff status` | Dice «Registro de combate: sí/no» | Anota sí o no |
| 8 | **Pausar**, espera 1 min, **Seguir** | El tiempo activo no cuenta el minuto | — |
| 9 | Vende algo a un vendedor | No cambia «Monedas» (se guarda aparte) | — |
| 10 | **Terminar**, luego `/reload` | El chat resume la sesión y dice «Guardada» | — |

Después del `/reload`, en Hermes → WoW Forever → **Mercado → Farmeo → Mis sesiones**
la sesión aparece con sus métricas (el plugin lee `WoWForeverFarm.lua` desde la
misma carpeta SavedVariables que ya concediste).

## Qué mirar si algo falla

- **Las muertes quedan en 0 aunque saquees:** `GetLootSourceInfo` no entrega el GUID
  (o llega como valor secreto). La sesión guarda `methods.loot`.
- **Mobs sin botín no cuentan:** ni el objetivo muerto (`UnitIsDead`) ni el registro
  de combate funcionan; las tasas de drop salen algo altas. El plugin lo avisa.
- **Sin zona en la sesión:** `C_Map.GetBestMapForUnit` no está; las muertes se
  asignan igual por el id del mob.
