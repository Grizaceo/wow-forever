// Mercado: precios de Auctionator importados (carpeta concedida o archivo
// manual), historial acumulado, tabla con búsqueda/filtros/orden, detalle con
// gráfico SVG y recomendador de farmeo. Port de standalone/market-ui.js a
// React reutilizando los módulos puros de standalone/ sin copiarlos.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Checkbox, SearchField, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hermes/plugin-sdk'
import { leerAuctionator } from '../auctionator.js'
import { D, GUIAS, guiaCurada, nombre } from '../datos.js'
import { C, S } from '../estilos.js'
import { agregarTextos, t } from '../i18n.js'
import { Aviso, Dinero, Origen, Tarjeta } from '../ui.jsx'
import {
  Farm, HunterChart, HunterDeals, HunterHistory, HunterMarket,
  PAGE_SIZE, ajustesFarm, catalogoMercado, edadItem, fechaDe, filtrarMercado,
  frescura, fuentesItem, hubZonesDe, infoHistorial, nombreItem, ordenarMercado,
  perfilMotor, planImportacion, snapshotValido, snapshotVisible, textosBusqueda,
} from '../mercado-logica.js'
import { DetalleItem } from './mercado/detalle.jsx'
import { Farmeo } from './mercado/farmeo.jsx'

agregarTextos({
  'mercado.scan.titulo': 'Escaneo de Auctionator',
  'mercado.leer': 'Leer Auctionator.lua',
  'mercado.otra': 'Elegir otra carpeta',
  'mercado.archivo': 'Importar archivo .lua',
  'mercado.borrar': 'Borrar precios locales',
  'mercado.borrarSi': '¿Confirmar borrado?',
  'mercado.leyendo': 'Leyendo y validando Auctionator.lua…',
  'mercado.leyendoCarpeta': 'Buscando Auctionator.lua en la carpeta concedida…',
  'mercado.ok': 'Importación guardada y verificada. {nota}',
  'mercado.okSinHist': 'Importación guardada; el historial acumulado no se pudo persistir y se reintentará en la próxima importación.{nota}',
  'mercado.errorParse': 'No se importó: no se pudo interpretar el archivo (¿es un Auctionator.lua válido?). Se conserva el scan anterior.',
  'mercado.errorValido': 'No se importó: datos inválidos, versión no compatible o archivo incompleto. Se conserva el scan anterior.',
  'mercado.errorTamano': 'No se importó: archivo vacío o demasiado grande (máximo 8 MiB). Se conserva el scan anterior.',
  'mercado.errorLeer': 'No se importó: no se pudo leer el archivo. Se conserva el scan anterior.',
  'mercado.errorGuardar': 'No se importó: no se pudo guardar ({msg}). Se conserva el scan anterior.',
  'mercado.errorCarpeta': 'No se pudo leer Auctionator.lua de la carpeta{msg}. También puedes importar el archivo a mano.',
  'mercado.cancelado': 'Elección de carpeta cancelada. El scan anterior se conserva.',
  'mercado.ocupado': 'Ya hay una importación en curso.',
  'mercado.sinArchivos': 'Las APIs de archivos no están disponibles en este contexto.',
  'mercado.borrando': 'Borrando solo el mercado local…',
  'mercado.borrado': 'Mercado local borrado. El juego y tu personaje no cambiaron.',
  'mercado.errorBorrar': 'No se pudo borrar. Se conservan los datos. {msg}',
  'mercado.errorBorrarParcial': 'No se pudo borrar el scan; el historial acumulado sí se vació. {msg}',
  'mercado.notaCarpeta': 'Auctionator.lua (carpeta concedida)',
  'mercado.frescura.importado': 'Importado',
  'mercado.frescura.max': 'Día observado más reciente',
  'mercado.frescura.hace': 'hace {dias} día(s)',
  'mercado.frescura.aviso': 'Los precios tienen más de 3 días: pueden no reflejar el mercado actual.',
  'mercado.frescura.hist': 'Historial acumulado: {dias} días · {entradas} registros',
  'mercado.avisos': 'avisos',
  'mercado.privacidad.titulo': 'Privacidad y formato del archivo',
  'mercado.privacidad.texto': 'Solo datos de precios por realm. Sin cuentas, personajes ni rutas del archivo. Lua se interpreta como datos; nunca se ejecuta. Máximo 8 MiB. El scan se guarda solo en este dispositivo.',
  'mercado.filtros.titulo': 'Cómo leer filtros y fuentes',
  'mercado.filtros.texto': 'Este filtro solo compara el nivel con el rango del grupo. No confirma solo, equipo suficiente ni que el ítem se pueda vender. Nombres y fuentes solo para IDs simples presentes en el catálogo local; las variantes se conservan sin mezclarlas.',
  'mercado.aviso.titulo': 'Oferta anunciada, no ventas',
  'mercado.aviso.texto': 'Los precios son mínimos unitarios en cobre; la cantidad es la máxima oferta diaria observada, no stock actual ni unidades vendidas. Un ítem caro no demuestra demanda. Antiguo = más de 3 días; cada ítem conserva su fecha, aunque lo importes hoy. La DB no demuestra que el scan haya sido completo.',
  'mercado.tabla.titulo': 'Precios por reino',
  'mercado.realm': 'Realm de subasta',
  'mercado.buscar': 'Buscar',
  'mercado.buscar.ph': 'ID, ítem, dungeon o boss',
  'mercado.f.recientes': 'Solo precios recientes (≤3 días)',
  'mercado.f.conFuente': 'Fuentes de dungeon en mi rango',
  'mercado.f.farmeable': 'Solo farmeables con tu ficha',
  'mercado.f.ofertas': 'Solo ofertas (bajo la mediana histórica)',
  'mercado.orden': 'Ordenar',
  'mercado.orden.nombre': 'Nombre',
  'mercado.orden.precio': 'Precio',
  'mercado.orden.ofertas': 'Mejores ofertas',
  'mercado.orden.roi': 'ROI estimado',
  'mercado.orden.gph': 'Oro/hora estimado',
  'mercado.col.item': 'Ítem / clave',
  'mercado.col.min': 'Último mínimo por unidad',
  'mercado.col.dia': 'Último día (UTC)',
  'mercado.col.oferta': 'Oferta máx. ese día',
  'mercado.col.fuente': 'Fuente parcial, no recomendación de venta',
  'mercado.col.farmeo': 'Farmeo (mejor fuente, approx)',
  'mercado.contador': '{visibles} de {total} claves · {ordenTxt} · página {pag} de {paginas}',
  'mercado.ordenTxt.precio': 'precio descendente',
  'mercado.ordenTxt.nombre': 'nombre',
  'mercado.ordenTxt.ofertas': 'mejores ofertas vs mediana histórica (approx)',
  'mercado.ordenTxt.roi': 'orden por ROI estimado (approx)',
  'mercado.ordenTxt.gph': 'orden por oro/hora estimado (approx)',
  'mercado.vacio.scan': 'Todavía no importaste precios. Elige tu Auctionator.lua para empezar.',
  'mercado.restaurado': 'Precios importados restaurados. Son ofertas anunciadas, no ventas.',
  'mercado.tusDatos': 'Tus datos',
  'mercado.vacio.filtros': 'No hay resultados para estos filtros. Prueba otro ID, nombre, jefe o reino.',
  'mercado.anterior': 'Anterior',
  'mercado.siguiente': 'Siguiente',
  'mercado.clave': 'Clave',
  'mercado.variante': '(variante sin ID simple: no se mezcla con la base)',
  'mercado.edad.reciente': 'reciente',
  'mercado.edad.antiguo': 'antiguo',
  'mercado.edad.futura': 'fecha futura',
  'mercado.edad.sin': 'sin fecha',
  'mercado.oferta.deal': 'oferta',
  'mercado.oferta.caro': 'caro',
  'mercado.deal.oferta': 'Oferta: el precio está bajo la mediana histórica.',
  'mercado.deal.sobreprecio': 'Sobreprecio: el precio está sobre la mediana histórica.',
  'mercado.deal.estable': 'Precio en línea con la mediana histórica.',
  'mercado.fuente.sin': 'Sin fuente comprobada en el catálogo local',
  'mercado.fuente.enRango': 'en tu rango',
  'mercado.fuente.noVenta': 'venta y solo sin comprobar',
  'mercado.farmeo.sinId': 'Sin ID',
  'mercado.farmeo.sinDato': 'Sin dato de drop',
  'mercado.farmeo.noFar': 'No farmeable con tu ficha',
  'mercado.farmeo.sinElegible': 'sin fuente elegible',
  'mercado.farmeo.farmeable': 'farmeable',
  'mercado.farmeo.dudoso': 'precio dudoso (≤2 ofertas, tope 50× vendedor)',
  'mercado.farmeo.dudosoPre': 'precio dudoso (≤2 ofertas, tope 50× vendedor) para estimar farmeo',
  'mercado.cerrar': 'Cerrar',
  'mercado.sinHistorial': 'Sin historial fechado para este ítem.',
  'mercado.grafico': 'Historial del precio mínimo diario (approx)',
  'mercado.tend.sube': 'al alza',
  'mercado.tend.baja': 'a la baja',
  'mercado.tend.estable': 'estable',
  'mercado.tend.pocos': 'pocos datos',
  'mercado.det.ultimo': 'Último mínimo anunciado',
  'mercado.det.aviso': 'No es mediana ni precio de venta. La fecha corresponde al último día de precio registrado, no a esta importación.',
  'mercado.det.dudoso': 'Precio dudoso (≤2 ofertas, tope 50× vendedor para estimar farmeo).',
  'mercado.det.variante': 'Variante sin ID simple: se muestra aparte, no se mezcla con la base.',
  'mercado.det.historial': 'Historial acumulado (approx, sobre el mínimo diario)',
  'mercado.det.minimo': 'mínimo',
  'mercado.det.mediana': 'mediana',
  'mercado.det.promedio': 'media',
  'mercado.det.analisis': 'Análisis de oferta (approx)',
  'mercado.det.ofertas': 'ofertas observadas',
  'mercado.det.grafico': 'Precio mínimo diario · approx',
  'mercado.det.graficoNota': 'Serie de mínimos diarios observados en subastas; no son ventas.',
  'mercado.det.diario': 'Historial diario',
  'mercado.det.dia': 'Día (UTC)',
  'mercado.det.minDiario': 'Mínimo diario',
  'mercado.det.maxMin': 'Máximo de mínimos',
  'mercado.det.maxOferta': 'Máxima oferta diaria',
  'mercado.det.sinDato': 'Sin datos',
  'mercado.det.sinHistorialFila': 'Sin historial fechado.',
  'mercado.det.fuentes': 'Fuentes documentadas para investigar',
  'mercado.det.rangoGrupo': 'rango de grupo {min}–{max}',
  'mercado.det.sinFuente': 'Sin fuente comprobada. El ID no permite inventar nombre, enemigo o drop.',
  'mercado.det.fuentesNota': 'Catálogo parcial: no prueba ligadura, probabilidad de drop, venta ni viabilidad en solitario. Rango de dungeon ≠ requisito de equipo.',
  'mercado.det.drops': 'Fuentes de drop (dataset)',
  'mercado.det.cadaMuerte': 'por baja',
  'mercado.det.sinDrops': 'Sin fuentes de drop en el dataset para este ID.',
  'mercado.det.farmeo': 'Fuentes de farmeo',
  'mercado.det.noElegible': 'no elegible',
  'mercado.det.cobertura': 'Fuente de nombres y relaciones:',
  'mercado.det.sinCatalogo': 'catálogo local no disponible',
  'mercado.farm.titulo': 'Farmeo recomendado',
  'mercado.farm.subtitulo': 'approx · Classic 1.12',
  'mercado.farm.sinScan': 'Importa tu Auctionator.lua para ver recomendaciones de farmeo.',
  'mercado.farm.compGlobal': 'Competencia',
  'mercado.farm.gphRef': 'Oro/h de ref.',
  'mercado.farm.ciclo': 'Ciclo de farmeo',
  'mercado.farm.zonasExtra': 'Zonas extra',
  'mercado.farm.grupo': 'Grupo',
  'mercado.farm.pvp': 'PvP',
  'mercado.farm.prof.skin': 'Desuello',
  'mercado.farm.prof.herb': 'Herboristería',
  'mercado.farm.prof.mine': 'Minería',
  'mercado.farm.sinEquipoClase': 'Tu clase no tiene ajuste por equipo de clase en el motor: puntúa igual que el resto.',
  'mercado.farm.sinZonas': 'Ninguna zona puntúa con tu scan y nivel — revisa nivel, facción o los datos.',
  'mercado.farm.compZona': 'Competencia de la zona',
  'mercado.farm.compAuto': 'Auto',
  'mercado.farm.compLow': 'Baja',
  'mercado.farm.compMed': 'Media',
  'mercado.farm.compHigh': 'Alta',
  'mercado.farm.copada': 'Zona copada',
  'mercado.farm.riesgo': 'riesgo',
  'mercado.farm.riesgo.baja': 'baja',
  'mercado.farm.riesgo.media': 'media',
  'mercado.farm.riesgo.alta': 'alta',
  'mercado.farm.comp': 'competencia',
  'mercado.farm.viaje': 'viaje ~{min} min',
  'mercado.farm.sinVuelo': 'sin vuelo',
  'mercado.farm.tuRuta': 'tu ruta',
  'mercado.farm.vendedor': 'vendedor',
  'mercado.farm.niveles': 'nv {min}–{max}',
  'mercado.farm.nivelVos': 'vos nv {nivel}',
  'mercado.farm.antesMultiplicadores': 'antes de multiplicadores',
  'mercado.farm.rarezas': 'rarezas',
  'mercado.farm.conScan': 'con tu scan',
  'mercado.farm.cofres': 'puntos de cofre',
  'mercado.farm.utiles': 'útiles',
  'mercado.farm.itemsScan': 'Ítems de tu scan',
  'mercado.farm.zona': 'zona',
  'mercado.farm.dudoso': 'precio dudoso',
  'mercado.farm.mediana': 'med',
  'mercado.farm.hoy': 'hoy',
  'mercado.farm.utilesVos': 'Útiles para vos',
  'mercado.farm.preferida': 'tu arma preferida',
  'mercado.farm.rareza': 'rareza',
  'mercado.farm.camps': 'Camps principales',
  'mercado.farm.recoleccion': 'recolección',
  'mercado.farm.approx': 'approx',
  'mercado.farm.porProfesion': 'Por tu profesión',
  'mercado.farm.enMateriales': 'en materiales',
  'mercado.farm.skinAlong': 'Skin-along · lo que otros cazan',
  'mercado.farm.bandas': 'quests nv {bands}',
  'mercado.farm.skinAlongNota': 'Skinneá todo lo que muera cerca tuyo: en zonas de misiones las bestias caen solas. Estimado al ~50% del farmeo propio — otros compiten por las mismas pieles.',
  'mercado.farm.porProfesionNota': 'Materiales valorados a AH neto si están en tu scan, si no a precio de vendedor. El oficio se suma al farmeo normal — no reemplaza el oro de monturas/ítems.',
  'mercado.farm.progresion': 'Progresión',
  'mercado.farm.progLinea': 'A nivel {nivel}',
  'mercado.farm.progSeguimos': 'seguí en {zona}',
  'mercado.farm.progMover': 'movete a {zona}',
  'mercado.farm.camp': 'camp',
  'mercado.farm.cobertura': 'Cobertura',
  'mercado.farm.coberturaLinea': 'Cobertura del scan: {matched}/{total} ítems ({pct}%).',
  'mercado.farm.estimaciones': 'Estimaciones aproximadas: drop rates de referencia Classic 1.12 (CMaNGOS), no observados en Forever. Sin datos de población: la competencia es tu selección + heurísticas. Ningún número es una venta ni un ingreso garantizado.',
}, {
  'mercado.scan.titulo': 'Auctionator scan',
  'mercado.leer': 'Read Auctionator.lua',
  'mercado.otra': 'Pick another folder',
  'mercado.archivo': 'Import .lua file',
  'mercado.borrar': 'Delete local prices',
  'mercado.borrarSi': 'Confirm deletion?',
  'mercado.leyendo': 'Reading and validating Auctionator.lua…',
  'mercado.leyendoCarpeta': 'Looking for Auctionator.lua in the granted folder…',
  'mercado.ok': 'Import saved and verified. {nota}',
  'mercado.okSinHist': 'Import saved; the accumulated history could not be persisted and will retry on the next import.{nota}',
  'mercado.errorParse': 'Not imported: could not parse the file (is it a valid Auctionator.lua?). The previous scan is kept.',
  'mercado.errorValido': 'Not imported: invalid data, incompatible version or incomplete file. The previous scan is kept.',
  'mercado.errorTamano': 'Not imported: empty file or too large (8 MiB max). The previous scan is kept.',
  'mercado.errorLeer': 'Not imported: could not read the file. The previous scan is kept.',
  'mercado.errorGuardar': 'Not imported: could not save ({msg}). The previous scan is kept.',
  'mercado.errorCarpeta': 'Could not read Auctionator.lua from the folder{msg}. You can also import the file manually.',
  'mercado.cancelado': 'Folder pick cancelled. The previous scan is kept.',
  'mercado.ocupado': 'An import is already in progress.',
  'mercado.sinArchivos': 'File APIs are not available in this context.',
  'mercado.borrando': 'Deleting only the local market…',
  'mercado.borrado': 'Local market deleted. The game and your character are untouched.',
  'mercado.errorBorrar': 'Could not delete. Data is kept. {msg}',
  'mercado.errorBorrarParcial': 'Could not delete the scan; the accumulated history was emptied. {msg}',
  'mercado.notaCarpeta': 'Auctionator.lua (granted folder)',
  'mercado.frescura.importado': 'Imported',
  'mercado.frescura.max': 'Most recent observed day',
  'mercado.frescura.hace': '{dias} day(s) ago',
  'mercado.frescura.aviso': 'Prices are older than 3 days: they may not reflect the current market.',
  'mercado.frescura.hist': 'Accumulated history: {dias} days · {entradas} records',
  'mercado.avisos': 'warnings',
  'mercado.privacidad.titulo': 'Privacy and file format',
  'mercado.privacidad.texto': 'Only per-realm price data. No accounts, characters or file paths. Lua is parsed as data; it is never executed. 8 MiB max. The scan is stored only on this device.',
  'mercado.filtros.titulo': 'How to read filters and sources',
  'mercado.filtros.texto': 'This filter only compares level with the group range. It does not confirm solo, enough gear, or that the item can be sold. Names and sources only for simple IDs in the local catalog; variants are kept unmerged.',
  'mercado.aviso.titulo': 'Announced offer, not sales',
  'mercado.aviso.texto': 'Prices are minimum unit prices in copper; the quantity is the max daily observed offer, not current stock or units sold. An expensive item does not prove demand. Old = more than 3 days; each item keeps its own date even if imported today. The DB does not prove the scan was complete.',
  'mercado.tabla.titulo': 'Prices by realm',
  'mercado.realm': 'Auction realm',
  'mercado.buscar': 'Search',
  'mercado.buscar.ph': 'ID, item, dungeon or boss',
  'mercado.f.recientes': 'Only recent prices (≤3 days)',
  'mercado.f.conFuente': 'Dungeon sources in my range',
  'mercado.f.farmeable': 'Only farmable with your profile',
  'mercado.f.ofertas': 'Only deals (below historical median)',
  'mercado.orden': 'Sort',
  'mercado.orden.nombre': 'Name',
  'mercado.orden.precio': 'Price',
  'mercado.orden.ofertas': 'Best deals',
  'mercado.orden.roi': 'Estimated ROI',
  'mercado.orden.gph': 'Estimated gold/hour',
  'mercado.col.item': 'Item / key',
  'mercado.col.min': 'Last unit minimum',
  'mercado.col.dia': 'Last day (UTC)',
  'mercado.col.oferta': 'Max offer that day',
  'mercado.col.fuente': 'Partial source, not a sale recommendation',
  'mercado.col.farmeo': 'Farming (best source, approx)',
  'mercado.contador': '{visibles} of {total} keys · {ordenTxt} · page {pag} of {paginas}',
  'mercado.ordenTxt.precio': 'price descending',
  'mercado.ordenTxt.nombre': 'name',
  'mercado.ordenTxt.ofertas': 'best deals vs historical median (approx)',
  'mercado.ordenTxt.roi': 'sorted by estimated ROI (approx)',
  'mercado.ordenTxt.gph': 'sorted by estimated gold/hour (approx)',
  'mercado.vacio.scan': 'No prices imported yet. Pick your Auctionator.lua to start.',
  'mercado.restaurado': 'Imported prices restored. They are listed offers, not sales.',
  'mercado.tusDatos': 'Your data',
  'mercado.vacio.filtros': 'No results for these filters. Try another ID, name, boss or realm.',
  'mercado.anterior': 'Previous',
  'mercado.siguiente': 'Next',
  'mercado.clave': 'Key',
  'mercado.variante': '(variant without simple ID: kept separate from the base)',
  'mercado.edad.reciente': 'recent',
  'mercado.edad.antiguo': 'old',
  'mercado.edad.futura': 'future date',
  'mercado.edad.sin': 'no date',
  'mercado.oferta.deal': 'deal',
  'mercado.oferta.caro': 'pricy',
  'mercado.deal.oferta': 'Deal: price is below the historical median.',
  'mercado.deal.sobreprecio': 'Above median: price is over the historical median.',
  'mercado.deal.estable': 'Price is in line with the historical median.',
  'mercado.fuente.sin': 'No verified source in the local catalog',
  'mercado.fuente.enRango': 'in your range',
  'mercado.fuente.noVenta': 'sale and solo unverified',
  'mercado.farmeo.sinId': 'No ID',
  'mercado.farmeo.sinDato': 'No drop data',
  'mercado.farmeo.noFar': 'Not farmable with your profile',
  'mercado.farmeo.sinElegible': 'no eligible source',
  'mercado.farmeo.farmeable': 'farmable',
  'mercado.farmeo.dudoso': 'doubtful price (≤2 offers, 50× vendor cap)',
  'mercado.farmeo.dudosoPre': 'doubtful price (≤2 offers, 50× vendor cap) for farming estimate',
  'mercado.cerrar': 'Close',
  'mercado.sinHistorial': 'No dated history for this item.',
  'mercado.grafico': 'Daily minimum price history (approx)',
  'mercado.tend.sube': 'rising',
  'mercado.tend.baja': 'falling',
  'mercado.tend.estable': 'stable',
  'mercado.tend.pocos': 'little data',
  'mercado.det.ultimo': 'Last announced minimum',
  'mercado.det.aviso': 'Not a median or sale price. The date is the last recorded price day, not this import.',
  'mercado.det.dudoso': 'Doubtful price (≤2 offers, 50× vendor cap for farming estimate).',
  'mercado.det.variante': 'Variant without simple ID: shown separately, not merged with the base.',
  'mercado.det.historial': 'Accumulated history (approx, on daily minimum)',
  'mercado.det.minimo': 'minimum',
  'mercado.det.mediana': 'median',
  'mercado.det.promedio': 'average',
  'mercado.det.analisis': 'Deal analysis (approx)',
  'mercado.det.ofertas': 'observed offers',
  'mercado.det.grafico': 'Daily minimum price · approx',
  'mercado.det.graficoNota': 'Series of daily minimums observed in auctions; not sales.',
  'mercado.det.diario': 'Daily history',
  'mercado.det.dia': 'Day (UTC)',
  'mercado.det.minDiario': 'Daily minimum',
  'mercado.det.maxMin': 'Max of minimums',
  'mercado.det.maxOferta': 'Daily max offer',
  'mercado.det.sinDato': 'No data',
  'mercado.det.sinHistorialFila': 'No dated history.',
  'mercado.det.fuentes': 'Documented sources to research',
  'mercado.det.rangoGrupo': 'group range {min}–{max}',
  'mercado.det.sinFuente': 'No verified source. The ID does not allow inventing a name, enemy or drop.',
  'mercado.det.fuentesNota': 'Partial catalog: does not prove binding, drop chance, sale or solo viability. Dungeon range ≠ gear requirement.',
  'mercado.det.drops': 'Drop sources (dataset)',
  'mercado.det.cadaMuerte': 'per kill',
  'mercado.det.sinDrops': 'No drop sources in the dataset for this ID.',
  'mercado.det.farmeo': 'Farming sources',
  'mercado.det.noElegible': 'not eligible',
  'mercado.det.cobertura': 'Source of names and relations:',
  'mercado.det.sinCatalogo': 'local catalog unavailable',
  'mercado.farm.titulo': 'Recommended farming',
  'mercado.farm.subtitulo': 'approx · Classic 1.12',
  'mercado.farm.sinScan': 'Import your Auctionator.lua to see farming recommendations.',
  'mercado.farm.compGlobal': 'Competition',
  'mercado.farm.gphRef': 'Ref. gold/h',
  'mercado.farm.ciclo': 'Farming cycle',
  'mercado.farm.zonasExtra': 'Extra zones',
  'mercado.farm.grupo': 'Group',
  'mercado.farm.pvp': 'PvP',
  'mercado.farm.prof.skin': 'Skinning',
  'mercado.farm.prof.herb': 'Herbalism',
  'mercado.farm.prof.mine': 'Mining',
  'mercado.farm.sinEquipoClase': 'Your class has no class-gear adjustment in the engine: it scores like any other.',
  'mercado.farm.sinZonas': 'No zone scores with your scan and level — check level, faction or the dataset.',
  'mercado.farm.compZona': 'Zone competition',
  'mercado.farm.compAuto': 'Auto',
  'mercado.farm.compLow': 'Low',
  'mercado.farm.compMed': 'Medium',
  'mercado.farm.compHigh': 'High',
  'mercado.farm.copada': 'Zone crowded',
  'mercado.farm.riesgo': 'risk',
  'mercado.farm.riesgo.baja': 'low',
  'mercado.farm.riesgo.media': 'medium',
  'mercado.farm.riesgo.alta': 'high',
  'mercado.farm.comp': 'competition',
  'mercado.farm.viaje': 'travel ~{min} min',
  'mercado.farm.sinVuelo': 'no flight',
  'mercado.farm.tuRuta': 'your route',
  'mercado.farm.vendedor': 'vendor',
  'mercado.farm.niveles': 'lv {min}–{max}',
  'mercado.farm.nivelVos': 'you lv {nivel}',
  'mercado.farm.antesMultiplicadores': 'before multipliers',
  'mercado.farm.rarezas': 'rares',
  'mercado.farm.conScan': 'in your scan',
  'mercado.farm.cofres': 'chest spots',
  'mercado.farm.utiles': 'useful',
  'mercado.farm.itemsScan': 'Items from your scan',
  'mercado.farm.zona': 'zone',
  'mercado.farm.dudoso': 'doubtful price',
  'mercado.farm.mediana': 'med',
  'mercado.farm.hoy': 'today',
  'mercado.farm.utilesVos': 'Useful for you',
  'mercado.farm.preferida': 'your preferred weapon',
  'mercado.farm.rareza': 'rare',
  'mercado.farm.camps': 'Main camps',
  'mercado.farm.recoleccion': 'gathering',
  'mercado.farm.approx': 'approx',
  'mercado.farm.porProfesion': 'For your profession',
  'mercado.farm.enMateriales': 'in materials',
  'mercado.farm.skinAlong': 'Skin-along · what others farm',
  'mercado.farm.bandas': 'quests lv {bands}',
  'mercado.farm.skinAlongNota': 'Skin everything that dies near your questing: beasts drop on their own in quest zones. Estimated at ~50% of your own farming — others compete for the same hides.',
  'mercado.farm.porProfesionNota': 'Materials valued at net AH if in your scan, else vendor price. The profession adds to normal farming — it does not replace mount/item gold.',
  'mercado.farm.progresion': 'Progression',
  'mercado.farm.progLinea': 'At level {nivel}',
  'mercado.farm.progSeguimos': 'stay in {zona}',
  'mercado.farm.progMover': 'move to {zona}',
  'mercado.farm.camp': 'camp',
  'mercado.farm.cobertura': 'Coverage',
  'mercado.farm.coberturaLinea': 'Scan coverage: {matched}/{total} items ({pct}%).',
  'mercado.farm.estimaciones': 'Approximate estimates: Classic 1.12 reference drop rates (CMaNGOS), not observed on Forever. No population data: competition is your selection + heuristics. No number is a sale or guaranteed income.',
})

// Catálogo de fuentes y configuración del motor de farmeo: una sola vez por
// carga del módulo (items.json + dungeons.json → misma forma que
// standalone/market-catalog.js; el motor reutiliza drop-data.js tal cual).
const CATALOGO = catalogoMercado(D.items, D.dungeons)
// Las guías curadas van por configure (el motor ya no lee globales): su ruta alimenta
// las zonas de tráfico del recomendador.
Farm.configure({ HunterDropData: D.dropData, HunterMarketCatalog: CATALOGO, HunterHistory, HunterChart,
  GUIDE_HUNTER: GUIAS[3], GUIDE_WARRIOR: GUIAS[1], GUIDE_SHAMAN: GUIAS[7] })

const fmt = Farm.fmt || {}
const ORDENES = ['nombre', 'precio', 'ofertas', 'roi', 'gph']

function InsigniaOferta({ deal, lang }) {
  if (!deal || (deal.kind !== 'oferta' && deal.kind !== 'sobreprecio')) return null
  const pct = Math.round(Math.abs(deal.discount) * 100)
  const esOferta = deal.kind === 'oferta'
  const color = esOferta ? C.verde : C.rojo
  const tip = `${t(lang, 'mercado.det.analisis')}: ${t(lang, esOferta ? 'mercado.oferta.deal' : 'mercado.oferta.caro')} ${esOferta ? '−' : '+'}${pct}%`
  return <span title={tip} style={{ ...S.chip, borderColor: color, color, marginLeft: 4 }}>{tip}</span>
}

function Chip({ children, color }) {
  return <span style={{ ...S.chip, borderColor: color || C.borde, color: color || C.texto2 }}>{children}</span>
}

function FilaVacia({ texto }) {
  return <tr><td style={S.td} colSpan={6}>{texto}</td></tr>
}

export function VistaMercado({ ctx, almacen, estado, recargar, perfil, lang }) {
  const mercado = estado?.market
  const historial = estado?.history
  const snapshot = useMemo(() => snapshotVisible(mercado, historial), [mercado, historial])

  const [mensaje, setMensaje] = useState('')
  const [importando, setImportando] = useState(false)
  const [confirmBorrar, setConfirmBorrar] = useState(false)
  const [realmName, setRealmName] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [soloRecientes, setSoloRecientes] = useState(false)
  const [conFuente, setConFuente] = useState(false)
  const [soloFarmable, setSoloFarmable] = useState(false)
  const [soloOfertas, setSoloOfertas] = useState(false)
  const [orden, setOrden] = useState('precio')
  const [pagina, setPagina] = useState(0)
  const [detalleKey, setDetalleKey] = useState(null)
  const [farmGuardado, setFarmGuardado] = useState(null)
  const fileRef = useRef(null)
  const estadoRef = useRef(estado)
  const revM = useRef(0)
  const revH = useRef(0)

  useEffect(() => { estadoRef.current = estado }, [estado])
  useEffect(() => {
    revM.current = estado?.revision ?? 0
    revH.current = estado?.history?.revision ?? 0
  }, [estado])
  useEffect(() => {
    let vivo = true
    Promise.resolve(ctx?.storage?.get?.('farm-settings'))
      .then((v) => { if (vivo) setFarmGuardado(v && typeof v === 'object' ? v : {}) })
      .catch(() => { if (vivo) setFarmGuardado({}) })
    return () => { vivo = false }
  }, [ctx])

  // Realm por defecto: el elegido sigue válido; si no, perfil.reino cuando
  // existe en el scan; si no, el último guardado; si no, el primero.
  useEffect(() => {
    if (!snapshot) { if (realmName) setRealmName(''); return }
    if (snapshot.realms.some((r) => r.name === realmName)) return
    const nombres = snapshot.realms.map((r) => r.name)
    const preferido = perfil?.reino && nombres.includes(perfil.reino) ? perfil.reino
      : mercado?.realm && nombres.includes(mercado.realm) ? mercado.realm
      : nombres[0] || ''
    setRealmName(preferido)
  }, [snapshot, perfil?.reino, mercado?.realm, realmName])

  const realm = useMemo(() => snapshot?.realms?.find((r) => r.name === realmName) || null, [snapshot, realmName])
  const items = useMemo(() => realm?.items || [], [realm])
  const nivel = perfil?.nivel || 12

  // Perfil y ajustes del motor de farmeo (los comparten tabla y sección farm).
  const guia = useMemo(() => guiaCurada(perfil), [perfil])
  const motorProfile = useMemo(() => {
    const hub = hubZonesDe(nivel, guia?.datos?.routes, D.zonas, perfil?.faccion)
    return perfilMotor(perfil, hub)
  }, [perfil, guia, nivel])
  const settings = useMemo(() => ajustesFarm(perfil, farmGuardado), [perfil, farmGuardado])
  const guardarFarm = async (nuevo) => {
    setFarmGuardado(nuevo)
    try { await ctx?.storage?.set?.('farm-settings', nuevo) } catch { /* queda en memoria */ }
  }

  // Cachés de métricas/deals por clave de ítem, invalidadas al cambiar de
  // perfil, ajustes, realm o importación (igual que market-ui.js).
  const mkey = JSON.stringify([motorProfile, settings, realmName, snapshot?.importedAt || ''])
  const mcache = useRef({ key: '', map: new Map() })
  const metricOf = useCallback((item) => {
    if (!item?.itemId) return null
    if (mcache.current.key !== mkey) mcache.current = { key: mkey, map: new Map() }
    if (!mcache.current.map.has(item.sourceKey)) {
      mcache.current.map.set(item.sourceKey, Farm.itemMetrics(item, motorProfile, settings))
    }
    return mcache.current.map.get(item.sourceKey)
  }, [mkey, motorProfile, settings])
  const dkey = `${snapshot?.importedAt || ''}|${realmName}`
  const dcache = useRef({ key: '', map: new Map() })
  const dealOf = useCallback((item) => {
    if (dcache.current.key !== dkey) dcache.current = { key: dkey, map: new Map() }
    if (!dcache.current.map.has(item.sourceKey)) {
      dcache.current.map.set(item.sourceKey, HunterDeals.dealInfo(item))
    }
    return dcache.current.map.get(item.sourceKey)
  }, [dkey])

  const textos = useMemo(() => textosBusqueda(items, CATALOGO, D.items, D.dungeons), [items])
  const visibles = useMemo(() => {
    const filtrados = filtrarMercado(items, {
      textos, q: busqueda, recientes: soloRecientes, conFuente, nivel,
      catalogo: CATALOGO,
      farmable: soloFarmable ? (i) => metricOf(i)?.farmable : null,
      oferta: soloOfertas ? (i) => dealOf(i)?.kind === 'oferta' : null,
    })
    return ordenarMercado(filtrados, orden, {
      lang, itemsJson: D.items, catalogo: CATALOGO, metrica: metricOf, oferta: dealOf,
    })
  }, [items, textos, busqueda, soloRecientes, conFuente, soloFarmable, soloOfertas, nivel, orden, lang, metricOf, dealOf])

  const paginas = Math.max(1, Math.ceil(visibles.length / PAGE_SIZE))
  const paginaSegura = Math.min(pagina, paginas - 1)
  const paginaItems = visibles.slice(paginaSegura * PAGE_SIZE, (paginaSegura + 1) * PAGE_SIZE)
  const detalle = useMemo(() => items.find((i) => i.sourceKey === detalleKey) || null, [items, detalleKey])
  const detalleMetrica = useMemo(() => (detalle ? metricOf(detalle) : null), [detalle, metricOf])
  const detalleDeal = useMemo(() => (detalle ? dealOf(detalle) : null), [detalle, dealOf])

  const fres = useMemo(() => frescura(snapshot, realmName), [snapshot, realmName])
  const histInfo = useMemo(() => infoHistorial(historial?.store), [historial])

  /* ---------------------------------------------------------- importación */
  const commitBytes = async (bytes, nota) => {
    // Parseo en el hilo principal dentro de setTimeout: la interfaz pinta el
    // estado "leyendo" antes de ceder el turno al parser síncrono.
    let raw
    try {
      raw = await new Promise((res, rej) => setTimeout(() => {
        try { res(HunterMarket.parseAuctionator(bytes)) } catch (e) { rej(e) }
      }, 30))
    } catch {
      setMensaje(t(lang, 'mercado.errorParse')); setImportando(false); return
    }
    if (!snapshotValido(raw)) {
      setMensaje(t(lang, 'mercado.errorValido')); setImportando(false); return
    }
    const est = estadoRef.current
    const { snapshot: shallow, store } = planImportacion(raw, {
      snapshotActual: snapshotVisible(est?.market, est?.history),
      historyStore: est?.history?.store || null,
    })
    const sel = raw.realms.some((r) => r.name === realmName) ? realmName : raw.realms[0]?.name
    try {
      const r = await almacen.market({ values: { snapshot: shallow, realm: sel }, revision: revM.current })
      revM.current = r.revision
    } catch (e) {
      setMensaje(t(lang, 'mercado.errorGuardar', { msg: e?.message || String(e) }))
      setImportando(false); return
    }
    // El scan ya quedó persistido; si el historial falla se conserva el anterior
    // y la próxima importación reintenta el merge (aditivo e idempotente).
    let histOk = true
    try {
      const hr = await almacen.history({ store, revision: revH.current })
      revH.current = hr.revision
    } catch { histOk = false }
    setRealmName(sel); setPagina(0); setDetalleKey(null)
    const notaTxt = nota ? ` · ${nota}` : ''
    setMensaje(histOk
      ? t(lang, 'mercado.ok', { nota: notaTxt })
      : t(lang, 'mercado.okSinHist', { nota: notaTxt }))
    setImportando(false)
    recargar()
  }

  const leerCarpeta = async (pick) => {
    if (importando) return
    setImportando(true)
    setMensaje(t(lang, pick ? 'mercado.leyendoCarpeta' : 'mercado.leyendoCarpeta'))
    let r
    try { r = await leerAuctionator(ctx, pick ? { pick: true } : {}) }
    catch (e) { r = { status: 'error', message: e?.message || String(e) } }
    if (r?.status === 'ok' && typeof r.text === 'string' && r.text.length) {
      const bytes = new TextEncoder().encode(r.text)
      if (bytes.length > HunterMarket.MAX_BYTES) {
        setMensaje(t(lang, 'mercado.errorTamano')); setImportando(false); return
      }
      await commitBytes(bytes, `${t(lang, 'mercado.notaCarpeta')}${r.path ? ' · ' + r.path : ''}`)
      return
    }
    setImportando(false)
    setMensaje(r?.status === 'cancelled' ? t(lang, 'mercado.cancelado')
      : r?.status === 'busy' ? t(lang, 'mercado.ocupado')
      : r?.status === 'unavailable' ? t(lang, 'mercado.sinArchivos')
      : t(lang, 'mercado.errorCarpeta', { msg: r?.message ? ` (${r.message})` : '' }))
  }

  const onArchivo = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || importando) return
    if (f.size === 0 || f.size > HunterMarket.MAX_BYTES) {
      setMensaje(t(lang, 'mercado.errorTamano')); return
    }
    setImportando(true); setMensaje(t(lang, 'mercado.leyendo'))
    try {
      const buf = await f.arrayBuffer()
      await commitBytes(buf, f.name)
    } catch {
      setMensaje(t(lang, 'mercado.errorLeer')); setImportando(false)
    }
  }

  const borrar = async () => {
    if (importando) return
    if (!confirmBorrar) { setConfirmBorrar(true); return }
    setConfirmBorrar(false); setImportando(true); setMensaje(t(lang, 'mercado.borrando'))
    try {
      // Historial primero: si el mercado fallara después no quedan días
      // huérfanos que puedan resucitar ítems en la próxima importación.
      const hr = await almacen.history({ store: HunterHistory.emptyStore(), revision: revH.current })
      revH.current = hr.revision
    } catch (e) {
      setMensaje(t(lang, 'mercado.errorBorrar', { msg: e?.message || String(e) }))
      setImportando(false); return
    }
    try {
      const r = await almacen.market({ values: {}, revision: revM.current })
      revM.current = r.revision
    } catch (e) {
      setMensaje(t(lang, 'mercado.errorBorrarParcial', { msg: e?.message || String(e) }))
      setImportando(false); recargar(); return
    }
    setRealmName(''); setPagina(0); setDetalleKey(null)
    setMensaje(t(lang, 'mercado.borrado'))
    setImportando(false); recargar()
  }

  /* ------------------------------------------------------------- render */
  const fuenteResumen = (item) => {
    const cat = Number.isSafeInteger(item?.itemId) && item.itemId > 0 ? CATALOGO.items[String(item.itemId)] : null
    const sources = cat?.sources || []
    if (!sources.length) return t(lang, 'mercado.fuente.sin')
    const relevantes = sources.filter((s) => s.levelMin != null && s.levelMin <= nivel && s.levelMax != null && nivel <= s.levelMax)
    const s = (fuentesItem({ sources: [relevantes[0] || sources[0]] }, D.dungeons)[0]) || relevantes[0] || sources[0]
    const boss = nombre(s.bossN || { es: s.boss, en: s.boss }, lang) || s.boss
    const dun = nombre(s.dungeonN || { es: s.dungeon, en: s.dungeon }, lang) || s.dungeon
    const rango = s.levelMin != null && s.levelMax != null ? ` · ${t(lang, 'mercado.det.rangoGrupo', { min: s.levelMin, max: s.levelMax })}` : ''
    return `${boss} · ${dun}${rango}${relevantes.length ? ` · ${t(lang, 'mercado.fuente.enRango')}` : ''}${sources.length > 1 ? ` · +${sources.length - 1}` : ''} · ${t(lang, 'mercado.fuente.noVenta')}`
  }

  const farmCell = (item) => {
    const m = metricOf(item)
    if (!m || item.itemId == null) return <span style={S.etiqueta}>{t(lang, 'mercado.farmeo.sinId')}</span>
    const doubt = m.doubtful ? ` · ${t(lang, 'mercado.farmeo.dudosoPre')}` : ''
    if (m.farmable && m.best) {
      const s = m.best
      const kind = s.kind === 'mob' ? '' : s.kind === 'skin' ? 'Piel: ' : s.kind === 'pick' ? 'Pillosidad: '
        : s.kind === 'object' ? `${s.objKind || 'objeto'}: ` : s.kind === 'rare-obs' ? 'Rareza observada: ' : s.kind === 'chest-obs' ? 'Cofre observado: ' : ''
      const lvl = s.lvlMin != null || s.lvlMax != null ? `nv ${s.lvlMin ?? '?'}–${s.lvlMax ?? '?'} ` : ''
      const rank = { normal: 'normal', elite: 'élite', rareelite: 'élite rara', rare: 'rara', boss: 'jefe' }[s.rank] || ''
      const roi = m.roi == null ? '' : ` · ROI ${m.roi >= 0 ? '+' : ''}${Math.round(m.roi * 100)}%`
      return <>{kind}{s.name} · {fmt.zoneName(s.zoneKey)} · {lvl}{rank ? rank + ' · ' : ''}{fmt.pct(s.chance)} · ~{fmt.gph(m.gph)}/h{roi}{doubt} <Chip color={C.verde}>{t(lang, 'mercado.farmeo.farmeable')}</Chip></>
    }
    if (m.sources.length) {
      const inel = m.sources.filter((s) => !s.eligible).sort((a, b) => (b.gph || 0) - (a.gph || 0))[0] || m.sources[0]
      return <>{t(lang, 'mercado.farmeo.noFar')} ({inel.reason || t(lang, 'mercado.farmeo.sinElegible')}){doubt}</>
    }
    return t(lang, 'mercado.farmeo.sinDato')
  }

  const ordenTxt = t(lang, `mercado.ordenTxt.${orden}`)
  const edadTexto = (item) => {
    const e = edadItem(item)
    return e === 'reciente' ? t(lang, 'mercado.edad.reciente') : e === 'antiguo' ? t(lang, 'mercado.edad.antiguo')
      : e === 'fecha-futura' ? t(lang, 'mercado.edad.futura') : t(lang, 'mercado.edad.sin')
  }

  const fmtFecha = (iso) => {
    const d = iso ? new Date(iso) : null
    return d && Number.isFinite(d.getTime()) ? d.toLocaleString(lang === 'en' ? 'en' : 'es') : '—'
  }

  return (
    <div style={S.pagina}>
      <div style={S.cuerpo}>
        <Tarjeta titulo={t(lang, 'mercado.scan.titulo')} extra={<span style={S.chip}>{t(lang, 'mercado.tusDatos')}</span>}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button onClick={() => leerCarpeta(false)} disabled={importando}>{t(lang, 'mercado.leer')}</Button>
            <Button variant="outline" onClick={() => leerCarpeta(true)} disabled={importando}>{t(lang, 'mercado.otra')}</Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importando}>{t(lang, 'mercado.archivo')}</Button>
            <input ref={fileRef} type="file" accept=".lua" onChange={onArchivo} style={{ display: 'none' }} />
            <Button variant="outline" onClick={borrar} disabled={importando || !snapshot}>
              {confirmBorrar ? t(lang, 'mercado.borrarSi') : t(lang, 'mercado.borrar')}
            </Button>
          </div>
          <p role="status" aria-live="polite" style={{ ...S.sub, margin: 0 }}>{mensaje || (snapshot ? t(lang, 'mercado.restaurado') : t(lang, 'mercado.vacio.scan'))}</p>
          {snapshot && fres && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: C.texto2 }}>
              <span>{t(lang, 'mercado.frescura.importado')}: {fmtFecha(fres.importedAt)}</span>
              <span>{t(lang, 'mercado.frescura.max')}: {fres.fechaMax || '—'}{fres.diasDesde != null ? ` (${t(lang, 'mercado.frescura.hace', { dias: fres.diasDesde })})` : ''}</span>
              {histInfo.days > 0 && <span>{t(lang, 'mercado.frescura.hist', { dias: histInfo.days, entradas: histInfo.entries })}</span>}
            </div>
          )}
          {fres?.aviso && <Aviso>{t(lang, 'mercado.frescura.aviso')}</Aviso>}
          {(snapshot?.warnings || []).map((w, i) => <p key={i} style={S.sub}>⚠ {w}</p>)}
          <details style={{ fontSize: 12 }}>
            <summary style={{ cursor: 'pointer', color: C.texto3 }}>{t(lang, 'mercado.privacidad.titulo')}</summary>
            <p style={S.sub}>{t(lang, 'mercado.privacidad.texto')}</p>
          </details>
        </Tarjeta>

        <Tarjeta titulo={t(lang, 'mercado.aviso.titulo')}>
          <p style={{ ...S.sub, margin: 0 }}>{t(lang, 'mercado.aviso.texto')}</p>
        </Tarjeta>

        <Tarjeta titulo={t(lang, 'mercado.tabla.titulo')}
          extra={<Origen f={['cliente-forever', 'cmangos-1.12']} lang={lang} />}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={S.campo}>
              <span style={S.etiqueta}>{t(lang, 'mercado.realm')}</span>
              <Select value={realmName} onValueChange={(v) => { setRealmName(v); setPagina(0); setDetalleKey(null) }} disabled={!snapshot}>
                <SelectTrigger aria-label={t(lang, 'mercado.realm')}><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {(snapshot?.realms || []).map((r) => <SelectItem key={r.name} value={r.name}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label style={{ ...S.campo, flex: 1, minWidth: 220 }}>
              <span style={S.etiqueta}>{t(lang, 'mercado.buscar')}</span>
              <SearchField value={busqueda} onChange={(v) => { setBusqueda(v); setPagina(0) }} placeholder={t(lang, 'mercado.buscar.ph')} />
            </label>
            <label style={S.campo}>
              <span style={S.etiqueta}>{t(lang, 'mercado.orden')}</span>
              <Select value={orden} onValueChange={(v) => { setOrden(v); setPagina(0) }}>
                <SelectTrigger aria-label={t(lang, 'mercado.orden')}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORDENES.map((o) => <SelectItem key={o} value={o}>{t(lang, `mercado.orden.${o}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <Checkbox checked={soloRecientes} onCheckedChange={(v) => { setSoloRecientes(!!v); setPagina(0) }} />
            <span style={{ fontSize: 12 }}>{t(lang, 'mercado.f.recientes')}</span>
            <Checkbox checked={conFuente} onCheckedChange={(v) => { setConFuente(!!v); setPagina(0) }} />
            <span style={{ fontSize: 12 }}>{t(lang, 'mercado.f.conFuente')} ({nivel})</span>
            <Checkbox checked={soloFarmable} onCheckedChange={(v) => { setSoloFarmable(!!v); setPagina(0) }} />
            <span style={{ fontSize: 12 }}>{t(lang, 'mercado.f.farmeable')}</span>
            <Checkbox checked={soloOfertas} onCheckedChange={(v) => { setSoloOfertas(!!v); setPagina(0) }} />
            <span style={{ fontSize: 12 }}>{t(lang, 'mercado.f.ofertas')}</span>
          </div>
          <details style={{ fontSize: 12 }}>
            <summary style={{ cursor: 'pointer', color: C.texto3 }}>{t(lang, 'mercado.filtros.titulo')}</summary>
            <p style={S.sub}>{t(lang, 'mercado.filtros.texto')}</p>
          </details>
          {snapshot && fres && (
            <p style={S.sub}>
              {t(lang, 'mercado.frescura.importado')}: {fmtFecha(fres.importedAt)} · DB {snapshot.sourceVersion}
              {(snapshot.warnings || []).length ? ` · ${snapshot.warnings.length} ${t(lang, 'mercado.avisos')}` : ''}
            </p>
          )}
          <p role="status" style={S.etiqueta}>
            {snapshot
              ? t(lang, 'mercado.contador', { visibles: visibles.length, total: items.length, ordenTxt, pag: paginaSegura + 1, paginas })
              : t(lang, 'mercado.vacio.scan')}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={S.tabla}>
              <thead>
                <tr>
                  <th style={S.th}>{t(lang, 'mercado.col.item')}</th>
                  <th style={S.th}>{t(lang, 'mercado.col.min')}</th>
                  <th style={S.th}>{t(lang, 'mercado.col.dia')}</th>
                  <th style={S.th}>{t(lang, 'mercado.col.oferta')}</th>
                  <th style={S.th}>{t(lang, 'mercado.col.fuente')}</th>
                  <th style={S.th}>{t(lang, 'mercado.col.farmeo')}</th>
                </tr>
              </thead>
              <tbody>
                {!snapshot ? <FilaVacia texto={t(lang, 'mercado.vacio.scan')} />
                  : !paginaItems.length ? <FilaVacia texto={t(lang, 'mercado.vacio.filtros')} />
                  : paginaItems.map((i) => {
                  const daily = i.history.find((h) => h.day === i.observedDay)
                  const nombreVisible = nombreItem(i, D.items, CATALOGO, lang) || i.sourceKey
                  return (
                    <tr key={i.sourceKey}>
                      <td style={S.td}>
                        <button type="button" onClick={() => setDetalleKey(i.sourceKey)}
                          style={{ background: 'none', border: 'none', padding: 0, color: C.acento, cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
                          {nombreVisible}
                        </button>
                        {i.itemId == null && <div style={S.etiqueta}>{t(lang, 'mercado.variante')}</div>}
                        <InsigniaOferta deal={dealOf(i)} lang={lang} />
                        <div style={S.etiqueta}>{t(lang, 'mercado.clave')} {i.sourceKey}</div>
                      </td>
                      <td style={S.td}><Dinero cobre={i.unitPriceCopper} /></td>
                      <td style={S.td}>
                        {fechaDe(i.observedDay) || '—'}
                        <div style={S.etiqueta}>{edadTexto(i)}</div>
                      </td>
                      <td style={S.td}>{daily?.available == null ? t(lang, 'mercado.det.sinDato') : daily.available}</td>
                      <td style={S.td}>{fuenteResumen(i)}</td>
                      <td style={S.td}>{farmCell(i)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {snapshot && paginas > 1 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button variant="outline" size="xs" disabled={paginaSegura === 0} onClick={() => setPagina(paginaSegura - 1)}>{t(lang, 'mercado.anterior')}</Button>
              <Button variant="outline" size="xs" disabled={paginaSegura + 1 >= paginas} onClick={() => setPagina(paginaSegura + 1)}>{t(lang, 'mercado.siguiente')}</Button>
            </div>
          )}
          <p style={S.sub}>
            {t(lang, 'mercado.det.cobertura', { addon: CATALOGO?.source?.addon || t(lang, 'mercado.det.sinCatalogo') })}{' '}
            {CATALOGO?.source?.coverage || ''}
          </p>
        </Tarjeta>

        {detalle && (
          <DetalleItem item={detalle} lang={lang} catalogo={CATALOGO} metrica={detalleMetrica} deal={detalleDeal}
            onCerrar={() => setDetalleKey(null)} />
        )}

        <Farmeo items={items} perfil={perfil} settings={settings} onSettings={guardarFarm} lang={lang} />
      </div>
    </div>
  )
}
