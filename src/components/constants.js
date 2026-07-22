// Incluye las tallas individuales (2, 4, 6...) y también las combinadas
// (2-4, 6-8...) como opciones aparte — en cada pedido eliges cuáles usar,
// según si el cliente pide tallas separadas o unidas.
// Fila especial para cuando el puño no se divide por talla, sino que es
// una sola cantidad que cubre varias tallas a la vez (útil cuando se cortan
// puños genéricos de un lote sin separarlos por talla específica).
export const TALLA_SIN_DIVIDIR = 'Todas (sin dividir)'

export const TALLAS = ['2', '4', '2-4', '6', '8', '6-8', '10', '12', '10-12', '14', '16', '14-16', 'S', 'M', 'L', 'XL', '2XL', '3XL']
export const TIPO_LABEL = { puno: 'Puño', cuello: 'Cuello', pretina: 'Pretina' }
export const TIPO_ICON = { puno: '🧤', cuello: '🔵', pretina: '📏' }

// Orden fijo en que deben salir SIEMPRE los tipos, sin importar en qué
// orden se hayan marcado los checkbox al crear el pedido. Antes el orden
// dependía del clic, así que un pedido salía "Cuello | Puño" y otro
// "Puño | Cuello" — se ordena al guardar para que las columnas de la tabla,
// la factura y la vista del cliente queden siempre iguales.
export const ORDEN_TIPOS = ['pretina', 'cuello', 'puno']
export function ordenarTipos(tipos) {
  return [...(tipos || [])].sort(
    (a, b) => ORDEN_TIPOS.indexOf(a) - ORDEN_TIPOS.indexOf(b)
  )
}
// La GAMA de un color sale de su primera palabra (ej. "Azul oscuro" -> "azul").
// Se usa para agrupar tonos relacionados: la Carta de colores y las fórmulas
// de color la usan para que "azul oscuro", "azul petroleo" y "azul" a secas
// aparezcan juntos como variantes de la misma gama.
export function gamaDe(nombre) {
  const prim = String(nombre || '').trim().split(/\s+/)[0] || ''
  return prim.toLowerCase()
}
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

// Suma cuánto hay de cada tipo (cuello, puño) dentro de una tabla de
// camiseta, sin importar en qué talla o fila esté (incluye la fila especial
// de puño sin dividir). Se usa para mostrar el total de juegos/cuellos.
export function totalesPorTipoCam(tabla) {
  let cuello = 0, puno = 0
  Object.values(tabla || {}).forEach((tallaObj) => {
    Object.values(tallaObj).forEach((colObj) => {
      cuello += colObj.cuello || 0
      puno += colObj.puno || 0
    })
  })
  return { cuello, puno }
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
  rojo: '#c0392b', vino: '#6d1b2f', vinotinto: '#6d1b2f', rosado: '#e91e8c', rosa: '#e91e8c', fucsia: '#d6006d',
  naranja: '#e67e22', mandarina: '#e67e22', amarillo: '#f1c40f', mostaza: '#c9a227',
  verde: '#2e7d32', oliva: '#6b7f3a', militar: '#556b2f', pino: '#1f4d3a', agua: '#3fae8a', menta: '#7fd8be',
  jade: '#00a86b', botella: '#1b4d3e', esmeralda: '#0e9e6d',
  turquesa: '#17a2b8', aguamarina: '#43c6ac', azul: '#1a3c63', rey: '#1e3a8a', cielo: '#7ec8e3', celeste: '#7ec8e3', jean: '#4a6a8a', denim: '#4a6a8a',
  morado: '#6a3fa0', uva: '#6a3fa0', lila: '#b57edc', purpura: '#6a3fa0', lavanda: '#c9b6e4',
  cafe: '#6f4518', marron: '#6f4518', chocolate: '#4a2c14', camel: '#c19a6b', ladrillo: '#9e4b32', ocre: '#cc8a2c', guayaba: '#e8836b',
  beige: '#e8dcc8', marfil: '#f3ecd8', crema: '#f5eedc', avena: '#d8c9a3', hueso: '#f2ecd9',
  dorado: '#c9a227', plateado: '#c0c0c0', coral: '#ff7f6b', salmon: '#fa8072',
}

// Palabras que MODIFICAN un color base en vez de reemplazarlo — por eso
// "Azul bebé" ya no se ve igual que "Azul": se aclara/oscurece el hex del
// color base según el modificador. El número es qué tanto se mezcla hacia
// blanco (positivo) o hacia negro (negativo); 0.5 = a medio camino.
const MODIFICADORES = {
  bebe: 0.55, pastel: 0.5, palido: 0.5, clarito: 0.35, claro: 0.3,
  perla: 0.4, oscuro: -0.35, oxford: -0.45, quemado: -0.3,
}

function normalizarTexto(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

// Mezcla un color hex hacia blanco (factor > 0) o hacia negro (factor < 0).
function mezclarHex(hex, factor) {
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16), g = parseInt(c.substring(2, 4), 16), b = parseInt(c.substring(4, 6), 16)
  const destino = factor >= 0 ? 255 : 0
  const f = Math.abs(factor)
  const mezclar = (canal) => Math.round(canal + (destino - canal) * f)
  const aHex = (n) => n.toString(16).padStart(2, '0')
  return `#${aHex(mezclar(r))}${aHex(mezclar(g))}${aHex(mezclar(b))}`
}

// Busca el color más parecido para una palabra o frase (ej "Verde Oliva",
// "Azul bebé", "Rosado pastel"). Si la última palabra es un modificador
// conocido (bebé, pastel, claro, oscuro...) y el resto de la frase es un
// color base reconocido, se aclara/oscurece ese color en vez de ignorar
// el modificador — así cada combinación se ve distinta, aunque no esté
// escrita a mano en el diccionario.
export function hexDeColor(palabra) {
  const n = normalizarTexto(palabra)
  if (!n) return null
  if (MAPA_COLORES[n]) return MAPA_COLORES[n]
  const partes = n.split(/\s+/)
  if (partes.length > 1) {
    const ultima = partes[partes.length - 1]
    if (MODIFICADORES[ultima] !== undefined) {
      const base = partes.slice(0, -1).join(' ')
      const hexBase = MAPA_COLORES[base] || hexDeColor(base)
      if (hexBase) return mezclarHex(hexBase, MODIFICADORES[ultima])
    }
  }
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

// ============================================
// PROGRESO POR CANTIDADES PARCIALES
// ============================================
// Antes cada celda era todo-o-nada ('ok' | 'falta'). Ahora se guarda cuántas
// unidades de esa celda ya están hechas (un número). Estas dos funciones
// interpretan ese valor, y también entienden el formato viejo ('ok'/'falta')
// para que los pedidos ya marcados no pierdan su avance.
//   - claseCelda: 'ok' (completo), 'parcial' (algunas hechas, faltan otras),
//     o null (todavía sin tocar).
//   - cantidadHecha: cuántas unidades de esa celda están confirmadas.
export function claseCelda(valor, n) {
  if (valor == null) return null
  if (valor === 'ok') return 'ok'
  if (valor === 'falta') return 'parcial' // formato viejo: se trata como incompleto
  const num = Number(valor) || 0
  if (num <= 0) return null
  if (num >= n) return 'ok'
  return 'parcial'
}

export function cantidadHecha(valor, n) {
  if (valor === 'ok') return n
  if (valor === 'falta' || valor == null) return 0
  return Math.min(Math.max(Number(valor) || 0, 0), n)
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
              const valor = estados[`${claveVieja}|revisado`] ?? estados[claveVieja]
              const clase = claseCelda(valor, colObj[t])
              if (clase === 'ok') ok++
              else if (clase === 'parcial') falta++
            }
          })
        })
      })
    } else {
      Object.entries(tabla).forEach(([color, rowObj]) => {
        tipos.forEach((t) => {
          if (rowObj[t] > 0) {
            total++
            const valor = estados[`${color}|${t}`]
            const clase = claseCelda(valor, rowObj[t])
            if (clase === 'ok') ok++
            else if (clase === 'parcial') falta++
          }
        })
      })
    }
  })
  return { total, ok, falta, pct: total ? Math.round((ok / total) * 100) : 0 }
}
