# Revisión adversarial de estabilidad

Comparación: `6009602` → rama `perf/stability-ci`.

## Resoluciones

1. **Archivos nuevos no versionados durante la revisión:** ambos tests nuevos de rutas y rendimiento están incluidos en el commit publicado; comprobar con `git ls-files`. La revisión capturó un estado intermedio anterior al commit, no el estado de la rama remota.
2. **Documentación CI desfasada:** actualizados inclusión de tab-performance, número de suites y conteos. La matriz corre lógica/contratos en tres SO; Chromium y Lua solamente en Linux. No equivale a validación de tres clientes de WoW.
3. **Descubrimiento fail-closed:** se conserva intencionadamente. Si una rama del árbol no pudo enumerarse, no sabemos si contiene otra cuenta; continuar podría importar silenciosamente del personaje equivocado. Solución soportada: conceder directamente el SavedVariables de la cuenta elegida, no ignorar la ambigüedad. Un ':' legal en Linux/macOS sigue fuera de la política de rutas portable: conceder una carpeta más profunda evita incluir ese ancestro. Esta limitación debe explicitarse, no presentarse como una exigencia universal del host.
4. **CSS durante render y sprite antiguo:** la escritura pasa a `useInsertionEffect`, sin mutación durante render. La primera inserción del módulo refresca la hoja existente; el resto usa la referencia cacheada. Añadida regresión que reemplaza la hoja por CSS antiguo, vuelve a montar los iconos y exige un solo sprite válido.
5. **Catálogo de profesiones cacheado:** se conserva porque sus entradas son los datos estáticos importados, no precios de sincronización. Si en el futuro se modifica `D.items`/`D.dungeons` dinámicamente, se deberá invalidar o parametrizar la caché. No se declara soporte actual para esa mutación.
6. **Node 22 vs entorno de desarrollo:** GitHub detectó que `node --test tests/` no descubre el directorio como Node 26. `scripts/test-node.mjs` enumera archivos explícitos sin shell/globs, falla si la lista está vacía y propaga el código de salida. Repetido con Node 22 real: 381/381 aprobadas.
7. **Guardas de rendimiento:** la espera de contenido ahora rechaza en timeout en vez de resolver; las repeticiones deben ser un entero positivo. No se acepta una vista ausente como una medición válida.

8. **Codificación Windows:** tres pruebas de paridad Node/Python decodificaban stdout con la página de códigos local. Con ACP CP1252, cadenas UTF-8 con acentos dejaban de ser iguales, aunque los números lo fueran. Control rojo: 3 fallos al simular CP1252; corrección verde: 3 aprobadas con `encoding='utf-8'`, sin relajar las comparaciones. CI nativa Windows aprobada después.

## Alcance de la evidencia

Los fixtures son sintéticos y las pruebas no acceden a cuentas ni SavedVariables personales. Los resultados de CI nativo y de los gates se conservan en GitHub Actions. Las observaciones headless no certifican el selector real, el cliente de juego, Wine, ni comportamiento del filesystem con permisos/revocación durante una sesión real.
