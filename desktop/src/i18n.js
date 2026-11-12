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
