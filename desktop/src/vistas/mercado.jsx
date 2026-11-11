// Marcador: esta sección se implementa en su propio encargo (ver .workshop/brief-devin-*.md).
import { t } from '../i18n.js'
import { Tarjeta } from '../ui.jsx'

export function VistaMercado({ lang }) {
  return <Tarjeta titulo={t(lang, 'tab.mercado')}><p>{t(lang, 'pendiente')}</p></Tarjeta>
}
