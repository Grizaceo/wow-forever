// sync-path.js — validador de rutas relativas compartido por los tres
// descubridores de archivos del juego (Auctionator, TSM, puente).
//
// Contrato real del SDK de Hermes desktop (apps/desktop/src/contrib/plugin-files.ts
// y electron/plugin-files-guards.ts), idéntico en Windows, macOS y Linux:
//   - `files.list()` devuelve rutas relativas separadas por '/' (toRel hace join('/'));
//   - REL_PATH_MAX = 1024, SEGMENT_MAX = 255;
//   - se rechazan '..', unidades, UNC, NUL, '..namedfork' (macOS) y, en Windows,
//     ':' y dispositivos reservados.
// El plugin no puede delegar toda la validación al host: una ruta fijada en
// storage debe ser rechazada ANTES de escribirla, o un poll posterior queda
// atascado en "permiso revocado" aunque el archivo siga ahí. Centralizar esto
// evita que cada descubridor tenga un tope distinto (2048 en uno, 1024 en otro).
//
// Falla cerrado: una ruta con '\' no es una ruta que `list` pueda haber
// devuelto; se rechaza en vez de interpretarla distinto en cada sistema.
// Política portable: ':' se rechaza también en Linux/macOS para no persistir
// rutas incompatibles con Windows. Si un ancestro contiene ':', conceder
// directamente la carpeta SavedVariables evita ese segmento.
export const SYNC_REL_PATH_MAX = 1024
export const SYNC_SEGMENT_MAX = 255

export function safeSyncPath(p) {
  if (typeof p !== 'string' || p.length === 0 || p.length > SYNC_REL_PATH_MAX) return false
  if (/[\x00-\x1f\x7f]/.test(p) || p.includes('\\')) return false
  return p.split('/').every(s =>
    s.length > 0 && s.length <= SYNC_SEGMENT_MAX &&
    s !== '.' && s !== '..' && s.toLowerCase() !== '..namedfork' &&
    !s.includes(':')
  )
}

// Un listado sólo es de confianza si la enumeración se completó. `truncated`
// ausente significa host antiguo: se acepta el listado, pero el tope de
// entradas y el de directorios del llamador siguen aplicando.
export function listingCompleta(result, maxEntries = 4000) {
  return !!(result?.ok === true && !result.truncated && Array.isArray(result.entries) && result.entries.length <= maxEntries)
}
