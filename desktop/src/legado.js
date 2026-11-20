// Limpieza de claves de almacenamiento que quedaron huérfanas de versiones
// anteriores del plugin.
//
// Contexto: la 1.0.0 (id interno `wow-hunter-guide`) guardaba en el
// localStorage del navegador, con el prefijo crudo del plugin y SIN el
// namespace que usa hoy el SDK (`hermes.plugin.<id>.`), la ruta del
// Auctionator.lua que el usuario elegía a mano. Desde la 2.0.0 el acceso es por
// carpeta concedida (`ctx.files` + `ctx.storage`), así que esa clave quedó
// huérfana: 0 referencias en el código y en todo el historial del repo.
//
// VÍA SEGURA: se borra con la API estándar del navegador (`window.localStorage`),
// la misma que usa el propio host de Hermes para su almacenamiento. El plugin
// corre en el realm del renderer, así que la clave desaparece sin tocar el
// LevelDB a mano, sin herramientas de leveldb y sin cerrar Hermes. Es un
// borrado idempotente: si la clave no está, no hace nada (ni escribe).
//
// NO tocar el namespace `wow-hunter-guide`: aquí solo se borran claves muertas
// que ninguna versión viva lee. El id del plugin, la carpeta de datos y los
// contratos de storage v2 quedan intactos.

export const CLAVES_HEREDADAS = ['wow-hunter-guide.auction-path']

// Devuelve el almacenamiento local disponible, o null si el contexto no lo
// permite (navegación privada, storage deshabilitado, entorno sin DOM).
function almacenamientoLocal() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    // Acceso a `localStorage` puede lanzar SecurityError: se trata como ausente.
    return null
  }
}

/**
 * Borra las claves heredadas del localStorage del navegador.
 *
 * @param {Storage|null} storage  almacenamiento a usar; por defecto el del realm.
 * @returns {{borradas: string[], error: string|null}}
 */
export function limpiarClavesHeredadas(storage = almacenamientoLocal()) {
  if (!storage) return { borradas: [], error: 'sin almacenamiento local' }
  const borradas = []
  for (const clave of CLAVES_HEREDADAS) {
    try {
      if (storage.getItem(clave) === null) continue
      storage.removeItem(clave)
      borradas.push(clave)
    } catch (e) {
      // Un fallo por clave no debe impedir borrar las demás ni romper la carga.
      return { borradas, error: 'no se pudo limpiar el almacenamiento heredado: ' + (e?.message ?? String(e)) }
    }
  }
  return { borradas, error: null }
}
