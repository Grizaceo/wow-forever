// Textos de la interfaz: español por defecto, inglés opcional (perfil.idioma). Los nombres
// del juego (razas, ítems, zonas…) vienen de data/ en ambos idiomas.
const ES = {
  app: 'WoW Forever',
  lema: 'Guía offline · sin red · tus datos se quedan en tu máquina',
  'tab.personaje': 'Personaje', 'tab.clase': 'Clase', 'tab.ruta': 'Ruta', 'tab.profesiones': 'Profesiones',
  'tab.dungeons': 'Dungeons', 'tab.mercado': 'Mercado', 'tab.guia': 'Guía curada', 'tab.legacy': 'Legacy',
  sinDatos: 'Sin datos:',
  cargando: 'Cargando tus datos guardados…',
  reintentar: 'Reabrir',
  'origen.cmangos': 'Classic 1.12', 'origen.cmangos.ayuda': 'Generado de CMaNGOS (WoW 1.12): aproximado, Forever puede diferir',
  'origen.cliente': 'Cliente Forever', 'origen.cliente.ayuda': 'Generado de las tablas del cliente de WoW Forever 1.60',
  'origen.curado': 'Curado', 'origen.curado.ayuda': 'Escrito a mano en la guía',
  'perfil.faccion': 'Facción', 'perfil.raza': 'Raza', 'perfil.clase': 'Clase', 'perfil.nivel': 'Nivel',
  'perfil.profesiones': 'Profesiones principales (hasta 2)', 'perfil.secundarias': 'Secundarias',
  'perfil.reino': 'Reino (para el mercado)', 'perfil.idioma': 'Idioma',
  'perfil.guardado': 'Guardado', 'perfil.guardando': 'Guardando…', 'perfil.incompleto': 'Elige facción, raza y clase para empezar.',
  'perfil.supuesta': 'La guía anterior no guardaba tu raza: revisa que sea la correcta.',
  'perfil.nueva': 'Combinación nueva de Forever',
  'perfil.vacio': 'Sin personaje',
  'clase.entrenadores': 'Entrenadores de clase', 'clase.hechizos': 'Hechizos de entrenador', 'clase.proximos': 'Próximos',
  'clase.misiones': 'Misiones de clase', 'clase.competencias': 'Armas y armaduras',
  'clase.sinEntrenador': 'En Classic 1.12 esta clase no existía en tu facción; los entrenadores de Forever aún no están en ninguna fuente publicable.',
  'clase.nivel': 'Nv', 'clase.hechizo': 'Hechizo', 'clase.costo': 'Costo', 'clase.zona': 'Zona', 'clase.todos': 'Ver todos', 'clase.menos': 'Ver menos',
  'clase.hastaNivel': 'hasta nivel', 'clase.ninguno': 'Nada nuevo que aprender en este rango.',
  'davi.boton': 'Preguntar a DAVI', 'davi.botonAyuda': 'Compone tu pregunta con el contexto seleccionado y la pasa al chat',
  'davi.titulo': 'Preguntar a DAVI — {seccion}', 'davi.pregunta': 'Tu pregunta',
  'davi.preguntaAyuda': 'Escribe qué quieres saber; el contexto de abajo se adjunta tal cual.',
  'davi.partes.perfil': 'Incluir el perfil', 'davi.partes.precios': 'Incluir precios y ofertas',
  'davi.partes.simc': 'Incluir estado SimC',
  'davi.confirmar': 'Insertar en el chat', 'davi.enviando': 'Insertando…', 'davi.cerrar': 'Cerrar',
  'davi.vistaPrevia': 'Vista previa',
  'davi.vistaPreviaAyuda': 'Vista previa: el contexto es una copia fija de lo seleccionado; edita la pregunta y los bloques sin miedo.',
  'davi.ayuda': 'Se inserta en el chat activo; no envía la pregunta por sí solo.',
  'davi.insertado': 'Insertado en el chat. Ya puedes enviarlo.',
  'davi.copiado': 'No se pudo insertar; el texto quedó en el portapapeles. Pégalo en el chat.',
  'davi.manual': 'No se pudo insertar ni copiar. Selecciona el texto de la vista previa y cópialo a mano.',
  'davi.personaje': '¿Qué me conviene hacer con mi personaje?',
  'davi.profesiones': '¿Cómo subo esta profesión y me conviene craftear?',
  'davi.mercado': '¿Vale la pena comprar o vender este ítem?',
  pendiente: 'Esta sección se está construyendo.',
}
const EN = {
  app: 'WoW Forever',
  lema: 'Offline guide · no network · your data stays on your machine',
  'tab.personaje': 'Character', 'tab.clase': 'Class', 'tab.ruta': 'Route', 'tab.profesiones': 'Professions',
  'tab.dungeons': 'Dungeons', 'tab.mercado': 'Market', 'tab.guia': 'Curated guide', 'tab.legacy': 'Legacy',
  sinDatos: 'No data:',
  cargando: 'Loading your saved data…',
  reintentar: 'Reopen',
  'origen.cmangos': 'Classic 1.12', 'origen.cmangos.ayuda': 'Generated from CMaNGOS (WoW 1.12): approximate, Forever may differ',
  'origen.cliente': 'Forever client', 'origen.cliente.ayuda': 'Generated from the WoW Forever 1.60 client tables',
  'origen.curado': 'Curated', 'origen.curado.ayuda': 'Written by hand in the guide',
  'perfil.faccion': 'Faction', 'perfil.raza': 'Race', 'perfil.clase': 'Class', 'perfil.nivel': 'Level',
  'perfil.profesiones': 'Primary professions (up to 2)', 'perfil.secundarias': 'Secondary',
  'perfil.reino': 'Realm (for the market)', 'perfil.idioma': 'Language',
  'perfil.guardado': 'Saved', 'perfil.guardando': 'Saving…', 'perfil.incompleto': 'Pick a faction, race and class to start.',
  'perfil.supuesta': 'The previous guide did not store your race: check that it is right.',
  'perfil.nueva': 'New Forever combination',
  'perfil.vacio': 'No character',
  'clase.entrenadores': 'Class trainers', 'clase.hechizos': 'Trainer spells', 'clase.proximos': 'Next',
  'clase.misiones': 'Class quests', 'clase.competencias': 'Weapons and armor',
  'clase.sinEntrenador': 'In Classic 1.12 this class did not exist in your faction; Forever’s trainers are not in any publishable source yet.',
  'clase.nivel': 'Lv', 'clase.hechizo': 'Spell', 'clase.costo': 'Cost', 'clase.zona': 'Zone', 'clase.todos': 'Show all', 'clase.menos': 'Show less',
  'clase.hastaNivel': 'up to level', 'clase.ninguno': 'Nothing new to learn in this range.',
  'davi.boton': 'Ask DAVI', 'davi.botonAyuda': 'Compose your question with the selected context and hand it to the chat',
  'davi.titulo': 'Ask DAVI — {seccion}', 'davi.pregunta': 'Your question',
  'davi.preguntaAyuda': 'Write what you want to know; the context below is attached as is.',
  'davi.partes.perfil': 'Include the profile', 'davi.partes.precios': 'Include prices and offers',
  'davi.partes.simc': 'Include SimC state',
  'davi.confirmar': 'Insert into chat', 'davi.enviando': 'Inserting…', 'davi.cerrar': 'Close',
  'davi.vistaPrevia': 'Preview',
  'davi.vistaPreviaAyuda': 'Preview: the context is a frozen copy of what you selected; edit the question and the blocks freely.',
  'davi.ayuda': 'It goes into the active chat; it does not send the question by itself.',
  'davi.insertado': 'Inserted into the chat. You can send it now.',
  'davi.copiado': 'Could not insert; the text is on your clipboard. Paste it into the chat.',
  'davi.manual': 'Could not insert or copy. Select the text in the preview and copy it by hand.',
  'davi.personaje': 'What should I do with my character?',
  'davi.profesiones': 'How do I level this profession and is it worth crafting?',
  'davi.mercado': 'Is this item worth buying or selling?',
  pendiente: 'This section is being built.',
}
const TEXTOS = { es: ES, en: EN }

// t(lang, clave, vars?) — {x} en el texto se sustituye por vars.x.
export function t(lang, clave, vars) {
  const s = (TEXTOS[lang] || ES)[clave] ?? ES[clave] ?? clave
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : s
}

// Para que cada sección agregue sus textos sin tocar este archivo.
export function agregarTextos(es, en) {
  Object.assign(ES, es)
  Object.assign(EN, en || {})
}
