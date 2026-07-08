export const TALLAS = ['2-4', '6-8', '10-12', '14-16', 'S', 'M', 'L', 'XL', '2XL', '3XL']
export const TIPO_LABEL = { puno: 'Puño', cuello: 'Cuello', pretina: 'Pretina' }
export const TIPO_ICON = { puno: '🧤', cuello: '🔵', pretina: '📏' }
export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export const ESTADOS = ['Pendiente', 'En proceso', 'Listo', 'Entregado']
export const ESTADO_ICON = { 'Pendiente': '⏳', 'En proceso': '🔄', 'Listo': '📦', 'Entregado': '✅' }
export const ESTADO_DOT = { 'Pendiente': 'dot-p', 'En proceso': 'dot-e', 'Listo': 'dot-l', 'Entregado': 'dot-d' }

export const ESTADOS_PAGO = ['Pendiente', 'Parcial', 'Pagado']
export const PAGO_ICON = { 'Pendiente': '💳', 'Parcial': '💰', 'Pagado': '✅' }
export const PAGO_COLOR = { 'Pendiente': '#e67e22', 'Parcial': '#f0a500', 'Pagado': '#4b8523' }

export const NEGOCIO = {
  nombre: 'Tejidos y Confecciones Laura Lizeth',
  nit: '80.262.959-2',
  direccion: 'Carrera 73H No. 58A-06 Sur',
  telefono: '313 282 1596',
}

export function hoy() {
  return new Date().toISOString().slice(0, 10)
}

export function fmtFecha(f) {
  if (!f) return '—'
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y}`
}

// Formatea números como pesos colombianos: 1700 -> "$1.700"
// Los pesos colombianos no usan decimales en el uso cotidiano.
export function fmtCOP(valor) {
  const n = Math.round(valor || 0)
  return '$' + n.toLocaleString('es-CO')
}

// ============================================
// MUESTRAS VISUALES DE COLOR
// ============================================
// Mapa de palabras de color (en español, sin tildes) a su código hexadecimal.
// Se usa para pintar una pequeña muestra junto al nombre del color
// (ej: "Uva-Blanco" se ve como morado + blanco), sin depender de que
// el nombre sea exacto — es de ayuda visual, no una fuente de verdad.
const MAPA_COLORES = {
  negro: '#1a1a1a', blanco: '#ffffff', gris: '#9e9e9e', plomo: '#8c8c8c',
  rojo: '#c0392b', vino: '#6d1b2f', rosado: '#e91e8c', rosa: '#e91e8c', fucsia: '#d6006d',
  naranja: '#e67e22', mandarina: '#e67e22', amarillo: '#f1c40f', mostaza: '#c9a227',
  verde: '#2e7d32', oliva: '#6b7f3a', militar: '#556b2f', pino: '#1f4d3a', agua: '#3fae8a', menta: '#7fd8be',
  turquesa: '#17a2b8', azul: '#1a3c63', rey: '#1e3a8a', cielo: '#7ec8e3', jean: '#4a6a8a', denim: '#4a6a8a',
  morado: '#6a3fa0', uva: '#6a3fa0', lila: '#b57edc', purpura: '#6a3fa0',
  cafe: '#6f4518', marron: '#6f4518', chocolate: '#4a2c14', camel: '#c19a6b',
  beige: '#e8dcc8', marfil: '#f3ecd8', crema: '#f5eedc', avena: '#d8c9a3', hueso: '#f2ecd9',
  dorado: '#c9a227', plateado: '#c0c0c0', coral: '#ff7f6b', salmon: '#fa8072',
}

function normalizarTexto(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

// Busca el color más parecido para una palabra o frase (ej "Verde Oliva").
export function hexDeColor(palabra) {
  const n = normalizarTexto(palabra)
  if (!n) return null
  if (MAPA_COLORES[n]) return MAPA_COLORES[n]
  const partes = n.split(/\s+/)
  for (let i = partes.length - 1; i >= 0; i--) {
    if (MAPA_COLORES[partes[i]]) return MAPA_COLORES[partes[i]]
  }
  return null
}

// Divide un nombre combinado ("Uva-Blanco", "Cafe-Negro-Rojo") en sus
// segmentos, cada uno con su color aproximado para pintar la muestra.
export function segmentosColor(nombreCombinado) {
  return String(nombreCombinado || '')
    .split('-')
    .map((seg) => ({ texto: seg.trim(), hex: hexDeColor(seg.trim()) }))
    .filter((s) => s.texto)
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
              // El progreso cuenta la etapa final (revisado y empacado).
              // Si el pedido es de antes de que existieran las dos etapas,
              // usamos la marca vieja como respaldo para no perder el avance ya registrado.
              const claveVieja = `${talla}|${color}|${t}`
              const est = estados[`${claveVieja}|revisado`] ?? estados[claveVieja]
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
