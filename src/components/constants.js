export const TALLAS = ['2-4', '6-8', '10-12', '14-16', 'S', 'M', 'L', 'XL', '2XL', '3XL']
export const TIPO_LABEL = { puno: 'Puño', cuello: 'Cuello', pretina: 'Pretina' }
export const TIPO_ICON = { puno: '🧤', cuello: '🔵', pretina: '📏' }
export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export const NEGOCIO = {
  nombre: 'Tejidos y Confecciones Laura Lizeth',
  nit: '', // Edita aquí tu NIT/cédula
  direccion: '', // Edita aquí tu dirección
  telefono: '', // Edita aquí tu teléfono
}

export function hoy() {
  return new Date().toISOString().slice(0, 10)
}

export function fmtFecha(f) {
  if (!f) return '—'
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y}`
}

export function calcProgreso(pedido) {
  let total = 0, ok = 0, falta = 0
  const items = [...(pedido.items_camiseta || []), ...(pedido.items_chaqueta || [])]
  items.forEach((it) => {
    const tabla = it.tabla || {}
    const tipos = it.tipos || []
    const estados = it.estados || {}
    const isCam = pedido.items_camiseta?.includes(it)

    if (isCam) {
      Object.entries(tabla).forEach(([talla, tallaObj]) => {
        Object.entries(tallaObj).forEach(([color, colObj]) => {
          tipos.forEach((t) => {
            if (colObj[t] > 0) {
              total++
              const est = estados[`${talla}|${color}|${t}`]
              if (est === 'ok') ok++
              else if (est === 'falta') falta++
            }
          })
        })
      })
    } else {
      Object.entries(tabla).forEach(([color, rowObj]) => {
        tipos.forEach((t) => {
          if (rowObj[t] > 0) {
            total++
            const est = estados[`${color}|${t}`]
            if (est === 'ok') ok++
            else if (est === 'falta') falta++
          }
        })
      })
    }
  })
  return { total, ok, falta, pct: total ? Math.round((ok / total) * 100) : 0 }
}
