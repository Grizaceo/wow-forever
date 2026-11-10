# WoW Forever para Hermes

Guía offline de **World of Warcraft: Forever** (Classic 1.12) como plugin de
Hermes: sendas de clase y facción, ruta de niveles, armas, macros, loot de
dungeons, mercado Auctionator local y recomendador de farmeo — más una skill
para que tu agente de Hermes sepa asistirte mientras jugás.

100% offline: la guía no abre el juego, no usa red y no envía datos a ningún
lado. Los datos del mercado los aportás vos exportando `Auctionator.lua`.

## Qué instala

Un paquete unificado agente + escritorio:

- **Agente** (`~/.hermes/plugins/wow-forever/`): registra la skill
  `wow-forever` para que tu agente conozca el juego, la guía y cómo
  interpretar el mercado.
- **Escritorio** (`~/.hermes/desktop-plugins/wow-forever/`): la guía en la
  barra lateral de Hermes Desktop ("WoW Forever", ruta `/wow-hunter-guide`).

## Instalación

Con el CLI de Hermes:

```sh
hermes plugins install Grizaceo/wow-forever
```

O desde Hermes Desktop: **Plugins → instalar desde git** con
`Grizaceo/wow-forever` (o la URL del repo).

Manual (equivalente): cloná el repo dentro de `~/.hermes/plugins/`:

```sh
git clone https://github.com/Grizaceo/wow-forever ~/.hermes/plugins/wow-forever
```

La mitad de escritorio se materializa sola al próximo arranque de la app.

## Requisitos

- Hermes con app de escritorio (el plugin usa el SDK de desktop: sidebar,
  rutas y paleta). El agente funciona en cualquier superficie.
- Cliente de WoW Forever **opcional**: la guía funciona sin datos del juego.
  Para el mercado con precios reales hace falta exportar `Auctionator.lua`.

## Datos del mercado (Auctionator)

1. Dentro del juego, corré un **full scan** en Auctionator.
2. `/reload` o relogueá para que WoW escriba SavedVariables.
3. En la guía → pestaña **Mercado local** → seleccioná `Auctionator.lua`
   (está en `WTF/Account/<tu-cuenta>/SavedVariables/`). No hace falta
   copiar el WTF ni ningún archivo de configuración.
4. Elegí tu realm de subastas y buscá por ID, nombre, dungeon o boss.

El scan se guarda normalizado (precios, historial por día, realm) en el
almacenamiento local de Hermes de tu máquina: sobrevive reinicios, no se
comparte con nadie y podés borrarlo desde la app.

## Privacidad

- El build público **no incluye** precios ni datos de subastas embebidos:
  cada usuario importa los suyos.
- La app es offline por diseño (CSP `connect-src 'none'`): no hay telemetría
  ni llamadas externas desde la guía.
- El plugin nunca lee el juego, addons ni perfiles del navegador.

## Licencia

GPL-3.0-or-later — ver `LICENSE`. Atribución y origen de los datasets en
`LICENSE-DATA.md` (CMaNGOS classic-db GPL-3.0, tablas de cliente vía
wago.tools). Los nombres de World of Warcraft son marcas de Blizzard
Entertainment; uso no comercial, sin afiliación.

## Fuente

El código fuente completo de la guía (app standalone, generadores de datos,
tests) vive en el repositorio fuente; `desktop/plugin.js` de este paquete es
el build público generado desde ahí.
