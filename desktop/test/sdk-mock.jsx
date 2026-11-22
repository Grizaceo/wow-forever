// Doble del SDK de Hermes Desktop para las pruebas en navegador: los mismos nombres que
// usa el plugin, con elementos HTML simples. No es el SDK real (ese se prueba en la app).
import { Children, createContext, isValidElement, useContext } from 'react'

export const ROUTES_AREA = 'routes', SIDEBAR_NAV_AREA = 'nav', PALETTE_AREA = 'palette'
export const host = {
  navigate: (p) => { window.navegado = p },
  // El único camino admitido para adjuntar texto. A propósito NO hay submit ni setDraft: si
  // el plugin los llamara, el test fallaría en vez de pasar desapercibido.
  composer: {
    insertText: async (sessionId, text, opts) => {
      window.insertadas = window.insertadas || []
      window.insertadas.push({ sessionId, text, opts })
      if (window.insertarDemora) await new Promise((resolve) => { window.resolverInsercion = resolve })
      if (window.insertarLanza) throw new Error('insertText falló (simulado)')
      return window.insertarOk !== false
    },
  },
}

export function Button({ children, variant, size, ...p }) { return <button type="button" data-variant={variant} {...p}>{children}</button> }
export function Badge({ children, ...p }) { return <span {...p}>{children}</span> }
export function Input(p) { return <input {...p} /> }
export function Checkbox({ checked, onCheckedChange, ...p }) {
  return <input type="checkbox" checked={!!checked} onChange={() => onCheckedChange && onCheckedChange(!checked)} {...p} />
}
export function Switch({ checked, onCheckedChange, ...p }) {
  return <input type="checkbox" role="switch" checked={!!checked} onChange={() => onCheckedChange && onCheckedChange(!checked)} {...p} />
}
export function SegmentedControl({ options, value, onChange }) {
  return <div role="radiogroup">{options.map((o) => (
    <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>))}</div>
}
export function EmptyState({ title, description }) { return <div><b>{title}</b>{description ? <p>{description}</p> : null}</div> }
export function SearchField({ placeholder, value, onChange }) {
  return <input type="search" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
}

const TabsCtx = createContext(null)
export function Tabs({ value, onValueChange, children, ...props }) { return <TabsCtx.Provider value={{ value, onValueChange }}><div {...props}>{children}</div></TabsCtx.Provider> }
export function TabsList({ children, ...props }) { return <div role="tablist" {...props}>{children}</div> }
export function TabsTrigger({ value, children, ...props }) {
  const c = useContext(TabsCtx)
  return <button type="button" role="tab" data-tab={value} aria-selected={c.value === value} onClick={() => c.onValueChange(value)} {...props}>{children}</button>
}

// Select: se aplana a un <select> nativo con las opciones de sus SelectItem.
export function SelectItem() { return null }
export function SelectContent({ children }) { return children }
export function SelectTrigger() { return null }
export function SelectValue() { return null }
function recolectar(children, out) {
  Children.forEach(children, (ch) => {
    if (!isValidElement(ch)) return
    if (ch.type === SelectItem) out.items.push(ch.props)
    else if (ch.type === SelectTrigger) { out.trigger = ch.props; recolectar(ch.props.children, out) }
    else recolectar(ch.props.children, out)
  })
  return out
}
export function Select({ value, onValueChange, children }) {
  const { items, trigger } = recolectar(children, { items: [], trigger: {} })
  return (
    <select id={trigger.id} aria-label={trigger['aria-label']} value={value ?? ''} onChange={(e) => onValueChange(e.target.value)}>
      <option value="">—</option>
      {items.map((i) => <option key={i.value} value={i.value}>{typeof i.children === 'string' ? i.children : String(i.children)}</option>)}
    </select>
  )
}
