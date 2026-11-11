// Marcador: esta sección se implementa en su propio encargo (ver .workshop/brief-devin-*.md).
import { t } from '../i18n.js'
import { Tarjeta } from '../ui.jsx'

export function VistaGuia({ lang }) {
  return <Tarjeta titulo={t(lang, 'tab.guia')}><p>{t(lang, 'pendiente')}</p></Tarjeta>
}
