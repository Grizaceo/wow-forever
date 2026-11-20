# Tests del motor (`standalone/`)

Tests unitarios `node:test` de los módulos del motor compartido
(`market.js`, `market-history.js`, `market-deals.js`, `market-chart.js`).
Cubertura única de parser/historial/ofertas/gráficos que no duplica `tests/`.

```sh
node --test market.cjs market-history.cjs market-deals.cjs market-chart.cjs
```

Los cuatro «real fixture» son **stat-only** por defecto (reportan bytes del
`Auctionator.lua` vivo si existe, nunca su contenido). Para validar contenido
contra el archivo real, opt-in manual:

```sh
WOW_FOREVER_REAL_FIXTURE=1 node --test market.cjs
```

Estos tests corren dentro del runner canónico (`node scripts/run-gates.mjs`,
gate `node motor .cjs`). Las suites navegador de la app standalone legada
(`index.html`) fueron retiradas con la app (Fase 5); la cobertura de UI vive
en `desktop/test/`.
