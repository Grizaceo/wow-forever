// Mercado: precios de Auctionator importados (carpeta concedida o archivo
// manual), historial acumulado, tabla con búsqueda/filtros/orden, detalle con
// gráfico SVG y recomendador de farmeo. Port de standalone/market-ui.js a
// React reutilizando los módulos puros de standalone/ sin copiarlos.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Checkbox, SearchField, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hermes/plugin-sdk'
import { classifyAcquisition, leerAuctionator, verifiedExporter } from '../auctionator.js'
import { createMarketSync } from '../mercado-auto.js'
import { D, GUIAS, guiaCurada, nombre } from '../datos.js'
import { construirContextoComparacionCapitalNeutral, construirContextoMercado, ofertaMaximaDe } from '../davi.js'
import { perfilParaAgente } from '../../../src/perfil.js'
import { C, S } from '../estilos.js'
import { agregarTextos, t } from '../i18n.js'
import { Aviso, Dinero, Origen, Tarjeta } from '../ui.jsx'
import {
  Farm, HunterChart, HunterDeals, HunterHistory, HunterIdentity, HunterMarket,
  PAGE_SIZE, ajustesFarm, catalogoMercado, compararPools, edadItem, fechaDe, filtrarMercado,
  fmtCobre, frescura, fuentesItem, hoy, hubZonesDe, infoHistorial, nombreItem, ordenarMercado,
  parsearFuenteAislada, perfilMotor, snapshotVisible, textosBusqueda,
} from '../mercado-logica.js'
import { DetalleItem } from './mercado/detalle.jsx'
import { Farmeo } from './mercado/farmeo.jsx'
import { PreguntarDavi } from './preguntar-davi.jsx'
import { MisVentas } from './mercado/mis-ventas.jsx'

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
  'mercado.errorBorrar': 'Se conservan los datos: no se pudo confirmar el borrado. Usá Reabrir para recuperar el estado guardado. {msg}',
  'mercado.errorBorrarParcial': 'No se confirmó el borrado del scan; el historial acumulado sí se vació. Usá Reabrir para comprobar el estado. {msg}',
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
  'mercado.errorBorrar': 'Data preserved: deletion was not confirmed. Reopen to recover the saved state. {msg}',
  'mercado.errorBorrarParcial': 'Scan deletion was not confirmed; the accumulated history was emptied. Reopen to check saved data. {msg}',
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
  GUIDE_HUNTER: GUIAS[3] })

const fmt = Farm.fmt || {}
const ORDENES = ['nombre', 'precio', 'ofertas', 'roi', 'gph']

/* ------------------------------------------------ procedencia / comparación */
// Textos nuevos, deliberadamente fuera del catálogo i18n grande: son avisos de
// límite, no nombres de datos del juego.
const cp = (lang, es, en) => (lang === 'en' ? en : es)

// Carpeta de datos del plugin para el export al CLI. El SDK (ctx.files 'data') no expone la ruta
// absoluta; se muestra la convención documentada de Hermes para este plugin (id interno
// 'wow-hunter-guide', ver plugin.src.jsx). El fichero se escribe solo en la carpeta de datos del
// plugin: el usuario no tiene que localizar las rutas privadas de los slots del bundle.
const DATA_CLI = '~/.config/Hermes/plugin-files/data/wow-hunter-guide'
const MOTIVOS = {
  'unknown-provenance': ['procedencia desconocida', 'unknown provenance'],
  'unknown-provenance-legacy': ['Auctionator real: procedencia desconocida, sin exportador verificado', 'real Auctionator: UNKNOWN provenance, no verified exporter'],
  'missing-two-scopes': ['faltan dos ámbitos aislados con identidad verificada', 'two isolated scopes with verified identity are required'],
  'same-scope': ['los dos lados son el mismo ámbito', 'both sides are the same scope'],
  'invalid-comparison-input': ['entrada de comparación inválida', 'invalid comparison input'],
  'invalid-identity': ['identidad inválida', 'invalid identity'],
  'different-game': ['juegos distintos', 'different games'],
  'different-region': ['regiones distintas', 'different regions'],
  'different-ruleset': ['reglas distintas', 'different rulesets'],
  'different-local-scope': ['ámbitos de observación distintos', 'different observation scopes'],
  'different-source': ['fuentes distintas', 'different sources'],
  'missing-today': ['sin día actual', 'missing current day'],
  'pool-count': ['número de ámbitos inválido', 'invalid scope count'],
  'invalid-pool': ['ámbito inválido', 'invalid scope'],
  'invalid-sourceKey': ['clave de origen inválida', 'invalid source key'],
  'invalid-price': ['precio inválido', 'invalid price'],
  'future-observation': ['observación en el futuro', 'future observation'],
  'invalid-itemId': ['ID de ítem inválido', 'invalid item ID'],
  'variant-promotion': ['variante promovida a ID base', 'variant promoted to base ID'],
  'excessive-skew': ['diferencia de precios excesiva entre las dos fuentes', 'excessive price skew between the two sources'],
  'shared-pool-use-single-series': ['misma piscina de subastas: no son dos fuentes; usar una sola serie con canal alternativo', 'same auction pool: not two sources; use a single series with an alternate channel'],
  'duplicate-sourceKey': ['clave de origen duplicada', 'duplicate source key'],
  'commission-unknown': ['comisión desconocida', 'unknown commission'],
  'commission-unverified': ['comisión no verificada', 'unverified commission'],
  'commission-overflow': ['comisión desborda el cálculo', 'commission overflow'],
  'delta-overflow': ['diferencia desborda el cálculo', 'delta overflow'],
}
const motivo = (code, lang) => {
  const par = MOTIVOS[code]
  return par ? cp(lang, par[0], par[1]) : String(code)
}

function identidadTexto(id, lang) {
  const p = id && id.provenance
  if (!p || p.confidence !== 'verified') {
    return cp(lang, 'DESCONOCIDA — sin identidad acreditada', 'UNKNOWN — no accredited identity')
  }
  const s = p.scope || {}
  const ventana = Number.isSafeInteger(s.fromDay) && Number.isSafeInteger(s.toDay)
    ? `${fechaDe(s.fromDay)} – ${fechaDe(s.toDay)}` : '—'
  return [
    `${cp(lang, 'Etiqueta', 'Label')}: ${s.sourceLabel || '—'}`,
    `${cp(lang, 'Región', 'Region')}: ${id.region}`,
    `${cp(lang, 'Reglas', 'Ruleset')}: ${id.ruleset}`,
    `${cp(lang, 'Pool económico', 'Economic pool')}: ${id.auctionPool}`,
    `${cp(lang, 'Canal', 'Channel')}: ${id.postingChannel == null ? '—' : id.postingChannel}`,
    `${cp(lang, 'Ventana', 'Window')}: ${ventana}`,
  ].join(' · ')
}

// Un ámbito es una identidad verificada, NUNCA un nombre de reino. La clave
// canónica evita colisiones entre reinos con el mismo nombre en fuentes distintas.
function scopesDeSnapshot(snap, origen) {
  if (!snap || snap.schemaVersion !== 2 || !Array.isArray(snap.realms)) return []
  const out = []
  for (const realm of snap.realms) {
    if (!realm || !realm.identity || realm.identity.provenance?.confidence !== 'verified') continue
    if (!HunterIdentity.validateIdentity(realm.identity).ok) continue
    let key
    try { key = HunterIdentity.identityKey(realm.identity) } catch { continue }
    out.push({
      key, origen, realm: realm.name, identity: realm.identity,
      rows: (realm.items || []).map((i) => ({
        sourceKey: i.sourceKey, itemId: i.itemId == null ? null : i.itemId,
        unitPriceCopper: i.unitPriceCopper, observedDay: i.observedDay,
        available: i.available == null ? null : i.available,
        confirmed: i.confirmed === true, coverage: i.coverage || null,
      })),
    })
  }
  return out
}

function etiquetaCorta(scope, lang) {
  const id = scope.identity
  const etiqueta = id.provenance?.scope?.sourceLabel || cp(lang, 'aislada', 'isolated')
  return `${etiqueta} · ${id.postingChannel || '—'} · ${scope.key.slice(1, 14)}…`
}

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

// Estado del puente de escaneos (addon WoWForeverBridge del repo): diario por
// día que captura cada escaneo aunque Auctionator sobrescriba su propio archivo.
function PuenteEstado({ puente, lang }) {
  const [st, setSt] = useState(puente.getState())
  useEffect(() => puente.subscribe(setSt), [puente])
  const cambiar = async () => {
    try { await puente.setEnabled(!st.enabled); if (!st.enabled) await puente.poll() } catch {}
  }
  return (
    <div data-testid="bridge-panel" style={{ marginTop: 6 }}>
      <label style={S.sub}>
        <Checkbox checked={st.enabled} onCheckedChange={cambiar} />
        {lang === 'en' ? ' Scan bridge (WoWForeverBridge addon) · keeps every scan in a daily journal' : ' Puente de escaneos (addon WoWForeverBridge) · guarda cada escaneo en un diario por día'}
      </label>
      <p data-testid="bridge-status" style={S.sub}>
        {lang === 'en' ? 'Bridge: ' : 'Puente: '}{st.status}
        {st.entries ? ` · ${st.entries} ${lang === 'en' ? 'day(s)' : 'día(s)'} · ${st.items} ${lang === 'en' ? 'observations' : 'observaciones'}` : ''}
        {st.lastDay != null ? ` · ${lang === 'en' ? 'last journal day' : 'último día del diario'} ${st.lastDay}` : ''}
        {st.message ? ` · ${st.message}` : ''}
        {st.error ? ` · ${st.error}` : ''}
      </p>
    </div>
  )
}

export function VistaMercado({ ctx, almacen, sincronizador, ventas, puente, estado, recargar, perfil, lang }) {
  const sync = useMemo(() => sincronizador || createMarketSync(ctx, almacen), [sincronizador, ctx, almacen])
  const [auto, setAuto] = useState(sync.getState())
  useEffect(() => sync.subscribe(setAuto), [sync])
  const cambiarAuto = async () => {
    try { await sync.setEnabled(!auto.enabled); if (!auto.enabled) await sync.poll() }
    catch (e) { setMensaje(String(e.message || e)) }
  }
  const mercado = estado?.market
  const historial = estado?.history
  const snapshot = useMemo(() => snapshotVisible(mercado, historial), [mercado, historial])

  const [mensaje, setMensaje] = useState('')
  const [importando, setImportando] = useState(false)
  const [confirmBorrar, setConfirmBorrar] = useState(false)
  const [realmName, setRealmName] = useState('')
  const [realmChoice, setRealmChoice] = useState('')
  const realmId = r => (snapshot?.realms.filter(x=>x.name===r.name).length>1 ? JSON.stringify([HunterIdentity.identityKey(r.identity),r.name]) : r.name)
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
  const revM = useRef(0)
  const revH = useRef(0)
  const [scopesMemoria, setScopesMemoria] = useState([])
  const [scopeA, setScopeA] = useState('')
  const [scopeB, setScopeB] = useState('')
  const [errorFuente, setErrorFuente] = useState('')
  const [bloqueoV2, setBloqueoV2] = useState('')
  const [ultimaFuente, setUltimaFuente] = useState('')
  const [guardandoV2, setGuardandoV2] = useState(false)
  const [confirmGuardarV2, setConfirmGuardarV2] = useState(false)
  const [confirmRollback, setConfirmRollback] = useState(false)
  const [exportandoCli, setExportandoCli] = useState(false)
  const [exportCli, setExportCli] = useState(null)
  const [comision, setComision] = useState({
    capital: { bps: '', verificada: false, etiqueta: '', dia: '' },
    neutral: { bps: '', verificada: false, etiqueta: '', dia: '' },
  })

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

  const realm = (snapshot?.realms || []).find(r=>realmId(r)===realmChoice) || snapshot?.realms?.find(r=>r.name===realmName) || null
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
  const mkey = JSON.stringify([motorProfile, settings, realm ? realmId(realm) : realmName, snapshot?.importedAt || ''])
  const mcache = useRef({ key: '', map: new Map() })
  const metricOf = useCallback((item) => {
    if (!item?.itemId) return null
    if (mcache.current.key !== mkey) mcache.current = { key: mkey, map: new Map() }
    if (!mcache.current.map.has(item.sourceKey)) {
      mcache.current.map.set(item.sourceKey, Farm.itemMetrics(item, motorProfile, settings))
    }
    return mcache.current.map.get(item.sourceKey)
  }, [mkey, motorProfile, settings])
  const dkey = `${snapshot?.importedAt || ''}|${realm ? realmId(realm) : realmName}`
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
  // «Preguntar a DAVI»: solo con un ítem de detalle seleccionado. El contexto lleva el
  // último precio y la oferta máxima diaria; el historial completo se queda fuera.
  const resumenPerfilMercado = useMemo(() => perfilParaAgente(perfil, D.personaje, {}, lang), [perfil, lang])
  const procedenciaMercado = useMemo(() => [
    'Auctionator.lua (importación del cliente)',
    'importado: ' + (snapshot?.importedAt ? String(snapshot.importedAt) : 'fecha desconocida'),
    'DB ' + (snapshot?.sourceVersion || '?'),
  ], [snapshot])
  const snapshotDavi = useMemo(() => (!detalle ? null : construirContextoMercado({
    item: detalle, realm: realmName, available: ofertaMaximaDe(detalle), itemsJson: D.items,
    catalogo: CATALOGO, importedAt: snapshot?.importedAt ? String(snapshot.importedAt) : null,
    lang, resumenPerfil: resumenPerfilMercado, procedencia: procedenciaMercado,
  })), [detalle, realmName, snapshot, lang, resumenPerfilMercado, procedenciaMercado])

  const fres = useMemo(() => frescura(realm ? {...snapshot,realms:[realm]} : snapshot, realmName), [snapshot, realmName, realm])
  const histInfo = useMemo(() => infoHistorial(historial?.store), [historial])

  // Un ámbito se elige por identidad canónica, nunca por nombre de reino: dos
  // fuentes pueden usar la misma clave de reino y ser economías distintas.
  const esLegacy = !!(estado?.legacyMarket || mercado?.snapshot?.schemaVersion === 1 || mercado?.snapshot?.realms?.some(r=>r.identity?.provenance?.confidence!=='verified'))
  const scopes = useMemo(() => {
    const mapa = new Map()
    for (const s of [...scopesDeSnapshot(mercado?.snapshot, 'guardado'), ...scopesMemoria]) mapa.set(s.key, s)
    return [...mapa.values()]
  }, [mercado?.snapshot, scopesMemoria])
  useEffect(() => {
    const claves = scopes.map((s) => s.key)
    setScopeA((prev) => (claves.includes(prev) ? prev : (claves[0] || '')))
    setScopeB((prev) => (claves.includes(prev) && prev !== claves[0] ? prev : (claves.find((k) => k !== claves[0]) || '')))
  }, [scopes])
  const scopeAObj = scopes.find((s) => s.key === scopeA) || null
  const scopeBObj = scopes.find((s) => s.key === scopeB) || null
  const comisiones = useMemo(() => {
    const out = {}
    for (const [lado, scope] of [['capital', scopeAObj], ['neutral', scopeBObj]]) {
      const ch = scope?.identity?.postingChannel
      const cfg = comision[lado]
      const bps = Number(cfg.bps), dia = Number(cfg.dia)
      if (ch && cfg.verificada && cfg.etiqueta.trim() && cfg.bps !== '' && cfg.dia !== '' &&
          Number.isSafeInteger(bps) && bps >= 0 && bps <= 10000 && Number.isSafeInteger(dia)) {
        out[ch] = { rateBps: bps, verified: true, sourceLabel: cfg.etiqueta.trim(), asOfDay: dia }
      }
    }
    return out
  }, [comision, scopeAObj, scopeBObj])
  const resultadoCmp = useMemo(() => {
    if (!scopeAObj || !scopeBObj) {
      return { status: 'blocked', reasons: [esLegacy ? 'unknown-provenance-legacy' : 'missing-two-scopes'], rows: [], coverage: {}, liquidityClaim: null }
    }
    if (scopeAObj.key === scopeBObj.key) {
      return { status: 'blocked', reasons: ['same-scope'], rows: [], coverage: {}, liquidityClaim: null }
    }
    try {
      const mismaPiscina = scopeAObj.identity.game === scopeBObj.identity.game &&
        scopeAObj.identity.region === scopeBObj.identity.region &&
        scopeAObj.identity.ruleset === scopeBObj.identity.ruleset &&
        scopeAObj.identity.localScope === scopeBObj.identity.localScope &&
        scopeAObj.identity.auctionPool === scopeBObj.identity.auctionPool
      const canalB = scopeBObj.identity.postingChannel
      const poolA = {
        id: 'capital', identity: scopeAObj.identity, rows: scopeAObj.rows,
        ...(mismaPiscina && canalB ? {
          alternateChannel: { channel: canalB, commission: comisiones[canalB] || {} },
        } : {}),
      }
      const pools = mismaPiscina ? [poolA] : [poolA, { id: 'neutral', identity: scopeBObj.identity, rows: scopeBObj.rows }]
      return compararPools(pools, { todayDay: hoy(), freshDays: 3, skewMax: 5, commission: comisiones })
    } catch {
      return { status: 'blocked', reasons: ['invalid-comparison-input'], rows: [], coverage: {}, liquidityClaim: null }
    }
  }, [scopeAObj, scopeBObj, comisiones, esLegacy])
  const ctxCmp = useMemo(() => construirContextoComparacionCapitalNeutral({ resultado: resultadoCmp, lang }), [resultadoCmp, lang])
  const esSerieUnica = resultadoCmp.status === 'single-pool'
  const rollbackDisponible = !!(estado?.market?.snapshot?.schemaVersion === 2 && typeof almacen?.rollbackToBackup === 'function')

  /* ---------------------------- procedencia / fuentes aisladas (comparar) */
  const cargarFuente = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setErrorFuente(''); setBloqueoV2('')
    try {
      const texto = await f.text()
      const snap = parsearFuenteAislada(texto)
      const nuevos = scopesDeSnapshot(snap, 'memoria')
      if (!nuevos.length) throw new Error('sin-ambitos-verificados')
      setScopesMemoria((prev) => {
        const mapa = new Map(prev.map((s) => [s.key, s]))
        for (const s of nuevos) mapa.set(s.key, s)
        return [...mapa.values()]
      })
      setUltimaFuente(texto)
      setMensaje(cp(lang,
        `Observación aislada cargada (${nuevos.length} ámbito(s)). Etiqueta declarada y validada por esquema; no acredita datos del juego.`,
        `Isolated observation loaded (${nuevos.length} scope(s)). Label declared and schema-validated; it does not accredit game data.`))
    } catch {
      setErrorFuente(cp(lang,
        'No se cargó: no hay un adaptador verificado para acreditar esta fuente. No se marcó como fuente acreditada.',
        'Not loaded: no verified adapter is available to accredit this source. It was not marked as an accredited source.'))
    }
  }

  const guardarV2 = async () => {
    if (!ultimaFuente || guardandoV2) return
    if (!confirmGuardarV2) { setConfirmGuardarV2(true); return }
    setConfirmGuardarV2(false); setGuardandoV2(true); setBloqueoV2('')
    try {
      const fn = sync.importSeparateSource || sync.importObservations
      if (typeof fn !== 'function') throw new Error('storage-v2-unavailable')
      const r = await fn.call(sync, ultimaFuente)
      const estadoSync = sync.getState?.() || {}
      if (estadoSync.status === 'blocked' || r?.status === 'blocked') {
        const reason = r?.reason || estadoSync.reason || 'unknown-provenance'
        setBloqueoV2(`${cp(lang, 'Importación bloqueada', 'Import blocked')}: ${motivo(reason, lang)}`)
      } else if (r?.status !== 'ok') {
        setBloqueoV2(`${cp(lang, 'No se guardó', 'Not saved')}: ${r?.error || 'save'}`)
      } else {
        setMensaje(cp(lang,
          'Observación aislada guardada como esquema v2 con respaldo. Sigue siendo un escenario, no una prueba del juego.',
          'Isolated observation saved as v2 schema with a backup. It is still a scenario, not game proof.'))
        recargar()
      }
    } catch (e) {
      setBloqueoV2(`${cp(lang, 'No se guardó', 'Not saved')}: ${e?.message || String(e)}`)
    } finally { setGuardandoV2(false) }
  }

  const rollback = async () => {
    if (!confirmRollback) { setConfirmRollback(true); return }
    setConfirmRollback(false)
    try {
      await sync.setEnabled(false)
      await sync.exclusive(async()=>{await almacen.rollbackToBackup();await almacen.reset()})
      setScopesMemoria([]); setUltimaFuente(''); setScopeA(''); setScopeB('')
      setMensaje(cp(lang,
        'Respaldo previo a v2 restaurado. Se recargaron los precios guardados antes de la migración.',
        'Pre-v2 backup restored. Prices saved before the migration were reloaded.'))
      recargar()
    } catch {
      setMensaje(cp(lang,
        'No se pudo restaurar el respaldo. Revisá los datos guardados antes de seguir.',
        'Could not restore the backup. Check saved data before continuing.'))
    }
  }

  /* ---------------------------------------------------------- importación */
  const commitBytes = async (bytes, nota) => {
    let r
    try { r = await sync.importBytes(bytes, realmName) }
    catch (e) { r = { status: 'error', error: 'save', message: e?.message || String(e) } }
    if (r.status !== 'ok') {
      const key = { parse: 'mercado.errorParse', invalid: 'mercado.errorValido', size: 'mercado.errorTamano' }[r.error] || 'mercado.errorGuardar'
      setMensaje(t(lang, key, { msg: r.message || '' })); setImportando(false); return
    }
    // La importación elige explícitamente el realm importado. realmChoice tiene
    // precedencia (línea del `realm`) y el efecto de realm-por-defecto no lo toca:
    // si solo se fijara realmName, ese efecto lo pisaría con perfil.reino durante
    // la ventana asíncrona de recargar() contra el snapshot todavía viejo.
    setRealmChoice(r.realm); setRealmName(r.realm); setPagina(0); setDetalleKey(null)
    const notaTxt = nota ? ` · ${nota}` : ''
    setMensaje(t(lang, r.histOk ? 'mercado.ok' : 'mercado.okSinHist', { nota: notaTxt }))
    setImportando(false); recargar()
  }

  const leerCarpeta = async (pick) => {
    if (importando) return
    setImportando(true)
    setMensaje(t(lang, pick ? 'mercado.leyendoCarpeta' : 'mercado.leyendoCarpeta'))
    let r
    try { r = await leerAuctionator(ctx, pick ? { pick: true } : {}) }
    catch (e) { r = { status: 'error', message: e?.message || String(e) } }
    if (r?.status === 'ok' && r.bytes instanceof Uint8Array && r.bytes.length) {
      const bytes = r.bytes
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
    let historialVaciado = false
    try {
      await sync.setEnabled(false)
      await sync.exclusive(async () => {
        const latest = await almacen.read()
        if(latest.market?.snapshot?.schemaVersion===2){
          const r=await almacen.market({values:{},revision:latest.revision})
          revM.current=r.revision;revH.current=r.hrevision;historialVaciado=true;return
        }
        // Historial primero: no quedan días huérfanos que puedan resucitar ítems.
        const hr = await almacen.history({ store: HunterHistory.emptyStore(), revision: latest.history?.revision || 0 })
        revH.current = hr.revision
        historialVaciado = true
        const r = await almacen.market({ values: {}, revision: latest.revision })
        revM.current = r.revision
      })
      setRealmName(''); setPagina(0); setDetalleKey(null)
      setMensaje(t(lang, 'mercado.borrado')); recargar()
    } catch (e) {
      setMensaje(t(lang, historialVaciado ? 'mercado.errorBorrarParcial' : 'mercado.errorBorrar', { msg: e?.message || String(e) })); recargar()
    } finally { setImportando(false) }
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

  // Exporta el snapshot del reino seleccionado en formato canónico {valores, reino, fecha}
  // (el primero que reconoce consultar.py cargar_precios) a data/precios-cli.json, con
  // confirmación de lectura. Sin precios con ID válido no escribe nada (no inventa).
  const exportarPreciosCli = async () => {
    if (!realm || !snapshot || exportandoCli) return
    setExportandoCli(true); setExportCli(null)
    try {
      const valores = {}
      for (const it of realm.items || []) {
        const id = it?.itemId, pr = it?.unitPriceCopper
        if (Number.isSafeInteger(id) && id > 0 && Number.isSafeInteger(pr) && pr > 0) valores[String(id)] = pr
      }
      const n = Object.keys(valores).length
      if (!n) {
        setExportCli({ ok: false, error: cp(lang,
          'el reino seleccionado no tiene precios con ID de ítem válido.',
          'the selected realm has no prices with a valid item ID.') })
        return
      }
      const body = JSON.stringify({ schemaVersion: 1, reino: realm.name, fecha: snapshot.importedAt || null, valores }, null, 2)
      const wrote = await ctx.files.writeText('data', 'precios-cli.json', body)
      if (!wrote?.ok) throw new Error(wrote?.message || wrote?.error || 'io-error')
      const read = await ctx.files.readText('data', 'precios-cli.json')
      if (!read?.ok || read.text !== body) throw new Error(cp(lang,
        'no se confirmó la escritura del archivo.', 'the file write was not confirmed.'))
      setExportCli({ ok: true, n, reino: realm.name, cmd: `consultar.py maxeo --precios ${DATA_CLI}/precios-cli.json` })
    } catch (e) {
      setExportCli({ ok: false, error: String(e?.message || e) })
    } finally {
      setExportandoCli(false)
    }
  }

  return (
    <div style={S.pagina}>
      <div style={S.cuerpo}>
        <MisVentas ventas={ventas} auctionSnapshot={snapshot} perfil={perfil} lang={lang} />
        <Tarjeta titulo={t(lang, 'mercado.scan.titulo')} extra={<span style={S.chip}>{t(lang, 'mercado.tusDatos')}</span>}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button onClick={() => leerCarpeta(false)} disabled={importando}>{t(lang, 'mercado.leer')}</Button>
            <Button variant="outline" onClick={() => leerCarpeta(true)} disabled={importando}>{t(lang, 'mercado.otra')}</Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importando}>{t(lang, 'mercado.archivo')}</Button>
            <input ref={fileRef} type="file" accept=".lua" onChange={onArchivo} style={{ display: 'none' }} />
            <Button variant="outline" onClick={borrar} disabled={importando || !snapshot}>
              {confirmBorrar ? t(lang, 'mercado.borrarSi') : t(lang, 'mercado.borrar')}
            </Button>
            <Button variant="outline" data-testid="export-cli" onClick={exportarPreciosCli}
              disabled={importando || exportandoCli || !snapshot || !realm}>
              {exportandoCli ? cp(lang, 'Exportando…', 'Exporting…') : cp(lang, 'Exportar precios para el CLI', 'Export prices for CLI')}
            </Button>
          </div>
          <label style={S.sub}>
            <Checkbox checked={auto.enabled} onCheckedChange={cambiarAuto} disabled={importando} />
            {lang === 'en' ? ' Automatic tracking · every 30 s while Hermes is open' : ' Seguimiento automático · cada 30 s con Hermes abierto'}
          </label>
          <p data-testid="auctionator-auto-status" style={S.sub}>
            {lang === 'en' ? 'Automatic status: ' : 'Estado automático: '}{auto.status}
            {auto.checkedAt ? ` · ${fmtFecha(auto.checkedAt)}` : ''}
            {auto.message ? ` · ${auto.message}` : ''}
            {auto.error && !auto.message ? ` · ${auto.error}` : ''}
            {auto.histOk === false ? (lang === 'en' ? ' · History pending; will retry.' : ' · Historial pendiente; se reintentará.') : ''}
          </p>
          {puente && <PuenteEstado puente={puente} lang={lang} />}
          <p style={S.sub}>{lang === 'en'
            ? 'Grant WTF/Account/<account>/SavedVariables once (a parent folder only if the bounded search can complete). Not Interface/AddOns. After an in-game scan, use /reload or log out to write prices to disk. Changing tabs does not stop tracking.'
            : 'Autoriza una vez WTF/Account/<cuenta>/SavedVariables (una carpeta superior solo si la búsqueda acotada puede completarse). No Interface/AddOns. Tras escanear en el juego, usa /reload o cierra sesión para guardar los precios en disco. Cambiar de pestaña no detiene el seguimiento.'}</p>
          <p role="status" aria-live="polite" style={{ ...S.sub, margin: 0 }}>{mensaje || (snapshot ? t(lang, 'mercado.restaurado') : t(lang, 'mercado.vacio.scan'))}</p>
          {snapshot && fres && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: C.texto2 }}>
              <span>{t(lang, 'mercado.frescura.importado')}: {fmtFecha(fres.importedAt)}</span>
              <span>{t(lang, 'mercado.frescura.max')}: {fres.fechaMax || '—'}{fres.diasDesde != null ? ` (${t(lang, 'mercado.frescura.hace', { dias: fres.diasDesde })})` : ''}</span>
              {histInfo.days > 0 && <span>{t(lang, 'mercado.frescura.hist', { dias: histInfo.days, entradas: histInfo.entries })}</span>}
            </div>
          )}
          {exportCli && (
            <div data-testid="export-cli-estado" role="status" aria-live="polite" style={{ ...S.sub, marginTop: 8 }}>
              {exportCli.ok ? (
                <>
                  <span style={{ color: C.verde }}>✓ {cp(lang,
                    `Exportado precios-cli.json · reino ${exportCli.reino} · ${exportCli.n} ítems con precio.`,
                    `Exported precios-cli.json · realm ${exportCli.reino} · ${exportCli.n} priced items.`)}</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                    <code style={{ fontSize: 11, color: C.texto2 }}>{exportCli.cmd}</code>
                    <Button variant="outline" data-testid="export-cli-copiar"
                      onClick={() => { Promise.resolve(ctx.os.writeClipboard(exportCli.cmd)).catch(() => {}) }}>
                      {cp(lang, 'Copiar comando', 'Copy command')}
                    </Button>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: C.texto3 }}>{cp(lang,
                    'Queda en la carpeta de datos del plugin (Ajustes → Plugins → revelar carpeta). Formato canónico {valores, reino, fecha} que lee consultar.py maxeo --precios.',
                    'Lands in the plugin data folder (Settings → Plugins → reveal folder). Canonical {valores, reino, fecha} format read by consultar.py maxeo --precios.')}</p>
                </>
              ) : (
                <span style={{ color: C.rojo }}>✗ {cp(lang, 'No se exportó: ', 'Export failed: ')}{exportCli.error}</span>
              )}
            </div>
          )}
          {fres?.aviso && <Aviso>{t(lang, 'mercado.frescura.aviso')}</Aviso>}
          {(snapshot?.warnings || []).map((w, i) => <p key={i} style={S.sub}>⚠ {w}</p>)}
          {(esLegacy || (snapshot && !scopes.length)) ? (
            <div role="status" data-testid="procedencia-desconocida" style={{ ...S.aviso, marginTop: 10 }}>
              <strong>{cp(lang, 'Procedencia DESCONOCIDA (UNKNOWN)', 'UNKNOWN provenance')}</strong>{' — '}
              {cp(lang,
                'Estos precios vienen de Auctionator sin exportador verificado: la región, las reglas, la casa y el canal son desconocidos. No se pueden comparar con otra casa ni usar para recomendar ventas.',
                'These prices come from Auctionator with no verified exporter: region, ruleset, house and posting channel are unknown. They cannot be compared with another house or used to recommend sales.')}
            </div>
          ) : null}
          <details style={{ fontSize: 12 }}>
            <summary style={{ cursor: 'pointer', color: C.texto3 }}>{t(lang, 'mercado.privacidad.titulo')}</summary>
            <p style={S.sub}>{t(lang, 'mercado.privacidad.texto')}</p>
          </details>
        </Tarjeta>

        <Tarjeta titulo={t(lang, 'mercado.aviso.titulo')}>
          <p style={{ ...S.sub, margin: 0 }}>{t(lang, 'mercado.aviso.texto')}</p>
        </Tarjeta>

        <Tarjeta titulo={cp(lang, 'Procedencia y ámbitos aislados', 'Provenance and isolated scopes')}>
          <p style={S.sub}>
            {cp(lang,
              'Sin exportador verificado: las etiquetas son declaradas por quien entregó el archivo y validadas por esquema. No prueban la economía del juego, pueden ser sintéticas y nunca se presentan como importación acreditada.',
              'No verified exporter: labels are declared by the file provider and schema-validated. They do not prove the game economy, may be synthetic and are never presented as an accredited import.')}
          </p>
          <p style={S.sub}>
            {cp(lang, 'Exportador', 'Exporter')}: {verifiedExporter() || cp(lang, 'sin exportador verificado', 'no verified exporter')}
            {' · '}{classifyAcquisition({ status: 'ok' }).warnings.map((w) => motivo(w, lang)).join(' · ')}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
            <label style={{ ...S.campo, minWidth: 240 }}>
              <span style={S.etiqueta}>{cp(lang, 'Observación aislada (archivo .json)', 'Isolated observation (.json file)')}</span>
              <input data-testid="fuente-aislada" type="file" accept=".json,.txt,application/json,text/plain"
                onChange={cargarFuente} style={{ fontSize: 12, maxWidth: 300 }} />
            </label>
            {ultimaFuente ? (
              <Button variant="outline" onClick={guardarV2} disabled={guardandoV2}>
                {confirmGuardarV2
                  ? cp(lang, 'Confirmar guardado v2', 'Confirm v2 save')
                  : cp(lang, 'Guardar como v2 (con respaldo)', 'Save as v2 (with backup)')}
              </Button>
            ) : null}
            {rollbackDisponible ? (
              <Button variant="outline" onClick={rollback}>
                {confirmRollback
                  ? cp(lang, 'Confirmar restauración del respaldo', 'Confirm backup restore')
                  : cp(lang, 'Restaurar respaldo previo a v2', 'Restore pre-v2 backup')}
              </Button>
            ) : null}
          </div>
          {errorFuente ? <p role="status" data-testid="error-fuente" style={{ ...S.aviso, marginTop: 8 }}>{errorFuente}</p> : null}
          {bloqueoV2 ? <p role="status" data-testid="fuente-bloqueada" style={{ ...S.aviso, marginTop: 8 }}>{bloqueoV2}</p> : null}
          {scopes.length ? (
            <ul data-testid="identidades-fuente" style={{ ...S.sub, marginTop: 8, paddingLeft: 18 }}>
              {scopes.map((s) => (
                <li key={s.key} style={{ marginBottom: 4 }}>
                  <Chip color={C.azul}>{etiquetaCorta(s, lang)}</Chip>
                  {' — '}{identidadTexto(s.identity, lang)}
                  {' — '}{cp(lang, 'clave de reino opaca', 'opaque realm key')}: {s.realm}
                </li>
              ))}
            </ul>
          ) : (
            <p data-testid="identidades-fuente" style={S.sub}>
              {cp(lang, 'Sin ámbitos verificados: la comparación permanece bloqueada.', 'No verified scopes: comparison stays blocked.')}
            </p>
          )}
        </Tarjeta>

        <div data-testid="comparacion-card">
          <Tarjeta titulo={cp(lang, 'Comparación capital / neutral (escenario)', 'Capital / neutral comparison (scenario)')}>
            <p style={S.sub}>
              {cp(lang,
                'Solo entre fuentes aisladas verificadas. El resultado no promete venta ni ganancia: es un escenario de precios observados.',
                'Only between verified isolated sources. The result promises no sale or profit: it is a scenario of observed prices.')}
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[['A', scopeA, setScopeA], ['B', scopeB, setScopeB]].map(([lado, valor, setValor]) => (
                <label key={lado} style={{ ...S.campo, flex: 1, minWidth: 220 }}>
                  <span style={S.etiqueta}>{cp(lang, `Ámbito ${lado} (origen aislado)`, `Scope ${lado} (isolated source)`)}</span>
                  <Select value={valor} onValueChange={setValor} disabled={scopes.length < 2}>
                    <SelectTrigger id={`ambito-${lado.toLowerCase()}`}
                      aria-label={cp(lang, `Ámbito ${lado} (origen aislado)`, `Scope ${lado} (isolated source)`)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {scopes.map((s) => <SelectItem key={s.key} value={s.key}>{etiquetaCorta(s, lang)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
              ))}
            </div>
            <p style={{ ...S.sub, marginTop: 10 }}>
              {cp(lang,
                'Comisión: solo si la tasa está verificada y fechada. En blanco, el neto se muestra como escenario; no se asume ningún porcentaje.',
                'Commission: only when the rate is verified and dated. If blank, net is shown as a scenario; no percentage is assumed.')}
            </p>
            {['capital', 'neutral'].map((lado) => (
              <div key={lado} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
                <span style={{ ...S.etiqueta, minWidth: 64 }}>{lado}</span>
                <input data-testid={`comision-${lado}-bps`} aria-label={`comision-${lado}-bps`} type="number" min="0" max="10000"
                  value={comision[lado].bps} placeholder="pbs" style={{ width: 90 }}
                  onChange={(e) => setComision((c) => ({ ...c, [lado]: { ...c[lado], bps: e.target.value } }))} />
                <Checkbox data-testid={`comision-${lado}-verificada`} aria-label={`comision-${lado}-verificada`}
                  checked={comision[lado].verificada}
                  onCheckedChange={(v) => setComision((c) => ({ ...c, [lado]: { ...c[lado], verificada: v === true } }))} />
                <span style={S.etiqueta}>{cp(lang, 'tasa verificada', 'verified rate')}</span>
                <input data-testid={`comision-${lado}-fuente`} aria-label={`comision-${lado}-fuente`}
                  value={comision[lado].etiqueta} placeholder={cp(lang, 'etiqueta de la fuente', 'source label')} style={{ width: 160 }}
                  onChange={(e) => setComision((c) => ({ ...c, [lado]: { ...c[lado], etiqueta: e.target.value } }))} />
                <input data-testid={`comision-${lado}-dia`} aria-label={`comision-${lado}-dia`} type="number"
                  value={comision[lado].dia} placeholder={cp(lang, 'día', 'day')} style={{ width: 90 }}
                  onChange={(e) => setComision((c) => ({ ...c, [lado]: { ...c[lado], dia: e.target.value } }))} />
              </div>
            ))}
            {(Number(comision.capital.dia) > hoy() || Number(comision.neutral.dia) > hoy()) ? (
              <p data-testid="comision-futura" style={{ ...S.aviso, marginTop: 6 }}>
                {cp(lang, 'Día futuro: la comisión se rechaza y el neto queda como escenario.',
                  'Future day: the commission is rejected and net stays a scenario.')}
              </p>
            ) : null}
            {esSerieUnica ? (
              <p data-testid="serie-unica" style={{ ...S.sub, marginTop: 6 }}>
                {cp(lang, 'Una sola serie de precios: los canales son la misma piscina, no dos fuentes. Sin delta entre ellos.',
                  'A single price series: the channels are the same pool, not two sources. No delta between them.')}
              </p>
            ) : null}
            {resultadoCmp.status === 'blocked' ? (
              <div role="status" data-testid="comparacion-bloqueada" style={{ ...S.aviso, marginTop: 10 }}>
                <strong>{cp(lang, 'Comparación bloqueada', 'Comparison blocked')}</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {(resultadoCmp.reasons || []).map((r, i) => <li key={i}>{motivo(r, lang)}</li>)}
                </ul>
                {esLegacy ? (
                  <p style={{ margin: '6px 0 0' }}>
                    {cp(lang,
                      'Los precios Auctionator reales importados tienen procedencia desconocida: no se usan como ninguno de los dos lados.',
                      'Imported real Auctionator prices have UNKNOWN provenance: they are not used as either side.')}
                  </p>
                ) : null}
                <p style={{ margin: '6px 0 0' }}>{cp(lang, 'No se recomienda dónde vender.', 'No sell recommendation.')}</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto', marginTop: 10 }}>
                <table style={S.tabla}>
                  <thead>
                    <tr>
                      {(esSerieUnica
                        ? [cp(lang, 'Ítem', 'Item'), cp(lang, 'Canales de una sola serie', 'Channels of one series'),
                          cp(lang, 'Δ', 'Δ')]
                        : [cp(lang, 'Ítem', 'Item'), cp(lang, 'Capital (bruto / neto)', 'Capital (gross / net)'),
                          cp(lang, 'Neutral (bruto / neto)', 'Neutral (gross / net)'), cp(lang, 'Δ neutral − capital', 'Δ neutral − capital')]
                      ).concat([cp(lang, 'Fecha / antigüedad', 'Date / age'), cp(lang, 'Cobertura', 'Coverage'),
                        cp(lang, 'Motivos', 'Reasons')]).map((h) => <th key={h} style={S.th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody data-testid="comparacion-filas">
                    {resultadoCmp.rows.slice(0, 50).map((f, i) => {
                      const d = f.deltaCopper
                      const delta = Number.isSafeInteger(d)
                        ? `Δ ${d > 0 ? '+' : d < 0 ? '−' : ''}${fmtCobre(Math.abs(d))}` : '—'
                      return (
                        <tr key={`${f.sourceKey}-${i}`}>
                          <td style={S.td}>
                            {nombreItem({ sourceKey: f.sourceKey, itemId: f.itemId }, D.items, CATALOGO, lang)}
                            <div style={{ fontSize: 10, color: C.texto3 }}>{f.itemId == null ? f.sourceKey : `id ${f.itemId}`}</div>
                          </td>
                          {esSerieUnica ? (f.channels || []).map((ch, j) => (
                            <td key={j} style={S.td} data-testid="cmp-canal">
                              <div>{cp(lang, 'Canal', 'Channel')}: {ch.channel}</div>
                              <div>{cp(lang, 'Bruto', 'Gross')}: <Dinero cobre={ch.grossCopper} /></div>
                              <div>{ch.netCopper == null
                                ? cp(lang, 'Neto: escenario', 'Net: scenario')
                                : <>{cp(lang, 'Neto', 'Net')}: <Dinero cobre={ch.netCopper} /></>}</div>
                            </td>
                          )) : (
                            <>
                              <td style={S.td} data-testid="cmp-capital">
                                {!f.a ? (
                                  <Chip color={C.rojo}>
                                    {cp(lang, 'Ausente en capital (falta de datos, no precio 0)', 'Missing in capital (no data, not price 0)')}
                                  </Chip>
                                ) : (
                                  <>
                                    <div>{cp(lang, 'Bruto', 'Gross')}: <Dinero cobre={f.a.grossCopper} /></div>
                                    <div>{f.netScenario
                                      ? cp(lang, 'Neto: escenario (comisión no verificada)', 'Net: scenario (unverified commission)')
                                      : <>{cp(lang, 'Neto', 'Net')}: <Dinero cobre={f.a.netCopper} /></>}</div>
                                  </>
                                )}
                              </td>
                              <td style={S.td} data-testid="cmp-neutral">
                                {f.b ? (
                                  <>
                                    <div>{cp(lang, 'Bruto', 'Gross')}: <Dinero cobre={f.b.grossCopper} /></div>
                                    <div>{f.netScenario
                                      ? cp(lang, 'Neto: escenario', 'Net: scenario')
                                      : <>{cp(lang, 'Neto', 'Net')}: <Dinero cobre={f.b.netCopper} /></>}</div>
                                  </>
                                ) : (
                                  <Chip color={C.rojo}>
                                    {cp(lang, 'Ausente en neutral (falta de datos, no precio 0)', 'Missing in neutral (no data, not price 0)')}
                                  </Chip>
                                )}
                              </td>
                            </>
                          )}
                          <td style={S.td} data-testid="cmp-delta">{esSerieUnica ? '—' : delta}</td>
                          <td style={S.td} data-testid="cmp-fecha">
                            <div>{fechaDe(f.a?.observedDay) || '—'}{f.b ? ` / ${fechaDe(f.b.observedDay) || '—'}` : ''}</div>
                            <div style={{ fontSize: 10, color: C.texto3 }}>
                              {f.a?.observedDay != null
                                ? `${cp(lang, 'hace', 'ago')} ${hoy() - f.a.observedDay} ${cp(lang, 'días', 'd')}` : '—'}
                              {(f.a?.stale || f.b?.stale)
                                ? <Chip color={C.naranja}>{cp(lang, ' antiguo', ' stale')}</Chip> : null}
                            </div>
                          </td>
                          <td style={S.td} data-testid="cmp-cobertura">
                            {cp(lang, 'filas', 'rows')}: {f.coverage?.a?.itemRows ?? '—'} / {f.coverage?.b?.itemRows ?? '—'}
                          </td>
                          <td style={S.td} data-testid="cmp-motivos">
                            {(f.reasons || []).length
                              ? (f.reasons || []).map((r, j) => <span key={j}>{motivo(r, lang)}{j < f.reasons.length - 1 ? ', ' : ''}</span>)
                              : '—'}
                            {f.recommendation === 'scenario'
                              ? <div style={{ fontSize: 10, color: C.naranja }}>{cp(lang, 'escenario, no recomendación', 'scenario, not a recommendation')}</div> : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {resultadoCmp.rows.length > 50 ? (
                  <p style={S.sub}>{cp(lang, `Mostradas 50 de ${resultadoCmp.rows.length}.`, `Showing 50 of ${resultadoCmp.rows.length}.`)}</p>
                ) : null}
              </div>
            )}
            <div data-testid="cmp-limites" style={{ ...S.sub, marginTop: 10 }}>
              {(ctxCmp.limites || []).map((x, i) => <p key={i} style={{ margin: '2px 0' }}>• {x}</p>)}
            </div>
            {ctxCmp.liquidityClaim == null ? (
              <p data-testid="sin-afirmacion-liquidez" style={S.sub}>
                {cp(lang, 'Sin afirmación de liquidez: que existan ofertas no garantiza que se venda.',
                  'No liquidity claim: existing offers do not guarantee a sale.')}
              </p>
            ) : null}
          </Tarjeta>
        </div>

        <Tarjeta titulo={t(lang, 'mercado.tabla.titulo')}
          extra={<Origen f={['cliente-forever', 'cmangos-1.12']} lang={lang} />}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={S.campo}>
              <span style={S.etiqueta}>{t(lang, 'mercado.realm')}</span>
              <Select value={realm ? realmId(realm) : realmName} onValueChange={(v) => { const r=snapshot.realms.find(r=>realmId(r)===v);setRealmChoice(v);setRealmName(r?.name||'');setPagina(0);setDetalleKey(null) }} disabled={!snapshot}>
                <SelectTrigger aria-label={t(lang, 'mercado.realm')}><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {(snapshot?.realms || []).map((r) => <SelectItem key={realmId(r)} value={realmId(r)}>{r.name}{snapshot.realms.filter(x=>x.name===r.name).length>1 ? ` · ${r.identity?.auctionPool || 'UNKNOWN'} · ${r.identity?.postingChannel || '—'}` : ''}</SelectItem>)}
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

        {detalle && snapshotDavi ? (
          <Tarjeta titulo={t(lang, 'davi.boton')}>
            <PreguntarDavi ctx={ctx} lang={lang} seccion={t(lang, 'tab.mercado')} snapshot={snapshotDavi}
              preguntaInicial={t(lang, 'davi.mercado')} />
          </Tarjeta>
        ) : null}

        <Farmeo items={items} perfil={perfil} settings={settings} onSettings={guardarFarm} lang={lang} />
      </div>
    </div>
  )
}
