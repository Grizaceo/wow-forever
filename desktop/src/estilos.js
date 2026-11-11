// Estilos con las variables del tema de Hermes (var(--ui-*)): nunca colores fijos, así
// la página sigue al tema claro u oscuro. Objetos de estilo en línea: no dependen de
// que la app haya compilado una clase de Tailwind concreta.
export const C = {
  texto: 'var(--ui-text-primary)',
  texto2: 'var(--ui-text-secondary)',
  texto3: 'var(--ui-text-tertiary)',
  texto4: 'var(--ui-text-quaternary)',
  borde: 'var(--ui-stroke-secondary)',
  borde2: 'var(--ui-stroke-tertiary)',
  fondo2: 'var(--ui-bg-secondary)',
  fondo3: 'var(--ui-bg-tertiary)',
  acento: 'var(--ui-accent)',
  verde: 'var(--ui-green)',
  amarillo: 'var(--ui-yellow)',
  naranja: 'var(--ui-orange)',
  rojo: 'var(--ui-red)',
  azul: 'var(--ui-blue)',
  morado: 'var(--ui-purple)',
}

// Calidad de ítem de WoW (0 pobre … 5 legendario) con colores del tema.
export const CALIDAD = [C.texto4, C.texto, C.verde, C.azul, C.morado, C.naranja, C.amarillo, C.azul]

// Dificultad de una receta para un skill dado: naranja, amarillo, verde, gris.
export const DIFICULTAD = { naranja: C.naranja, amarillo: C.amarillo, verde: C.verde, gris: C.texto4 }

export const S = {
  pagina: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, color: C.texto, fontSize: 13 },
  cabecera: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '8px 16px',
    borderBottom: `1px solid ${C.borde}` },
  cuerpo: { flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  titulo: { fontSize: 15, fontWeight: 600, margin: 0 },
  sub: { fontSize: 12, color: C.texto3 },
  tarjeta: { display: 'flex', flexDirection: 'column', gap: 8, border: `1px solid ${C.borde}`, borderRadius: 6,
    background: C.fondo2, padding: 12 },
  tarjetaTitulo: { fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', color: C.texto3,
    display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  fila: { display: 'flex', gap: 8, alignItems: 'baseline', padding: '4px 0', borderBottom: `1px solid ${C.borde2}` },
  rejilla: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 },
  chip: { display: 'inline-flex', alignItems: 'center', borderRadius: 3, padding: '1px 6px', fontSize: 11,
    border: `1px solid ${C.borde}`, color: C.texto2, whiteSpace: 'nowrap' },
  tabla: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: { textAlign: 'left', fontWeight: 600, color: C.texto3, padding: '4px 6px', borderBottom: `1px solid ${C.borde}` },
  td: { padding: '4px 6px', borderBottom: `1px solid ${C.borde2}`, verticalAlign: 'top' },
  aviso: { borderLeft: `3px solid ${C.amarillo}`, padding: '6px 10px', background: C.fondo3, borderRadius: 3, fontSize: 12 },
  hueco: { borderLeft: `3px solid ${C.texto4}`, padding: '6px 10px', background: C.fondo3, borderRadius: 3,
    fontSize: 12, color: C.texto2 },
  etiqueta: { fontSize: 11, color: C.texto3 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 },
}

// Clases de las guías curadas (card warn/danger/key, muted, tip) → estilos.
export const CLASES_RICAS = {
  card: S.tarjeta,
  warn: { borderLeft: `3px solid ${C.amarillo}` },
  danger: { borderLeft: `3px solid ${C.rojo}` },
  key: { borderLeft: `3px solid ${C.acento}` },
  gold: { borderLeft: `3px solid ${C.amarillo}` },
  muted: { color: C.texto3, fontSize: 12 },
  tip: { color: C.texto2, fontSize: 12 },
  sub: { color: C.texto3, fontWeight: 400, fontSize: 12 },
  // Filas de hitos: <div class="mst"><span class="tdot"></span><span class="txt">…</span></div>
  mst: { display: 'flex', gap: 8, alignItems: 'baseline', padding: '2px 0' },
  tdot: { display: 'inline-block', width: 6, height: 6, borderRadius: 3, background: C.acento, flexShrink: 0 },
  txt: { flex: 1 },
  // Calidad de ítem en el texto curado.
  'q-poor': { color: CALIDAD[0] }, 'q-common': { color: CALIDAD[1] }, 'q-uncommon': { color: CALIDAD[2] },
  'q-rare': { color: CALIDAD[3] }, 'q-epic': { color: CALIDAD[4] }, 'q-legendary': { color: CALIDAD[5] },
  // Marcas de continente.
  badge: S.chip,
  locK: { borderColor: C.verde, color: C.verde },
  locE: { borderColor: C.azul, color: C.azul },
}
