import { hexDeColor } from './constants'

// ============================================
// HILOS Y FÓRMULAS: funciones compartidas
// ============================================
// Un HILO es un cono del estante (tabla `conos`): marca (mH, Alfa…),
// número del color (725), nombre del color (Gris claro), material (Hilo,
// Poliéster…), proveedor y estado. Los de poliéster sin marca llevan además
// un código de la carta (V-001) para la etiqueta.
//
// Una FÓRMULA (tabla `formulas_color`) dice cómo se saca un color de pedido.
// Sus líneas van en `ingredientes`, cada una así:
//   { parte: 'Liso' | 'Transferencia' | '', paso: 'derecho' | 'evanizado' | '',
//     cono_id: 12, cabos: 2 }
// `parte` vacía = la fórmula no se divide en partes. `paso` vacío = no se
// indicó si pasa derecho o evanizado (ej. la licra). `descripcion` guarda el
// mismo contenido como texto (y en las fórmulas viejas, el texto original).

export const normalizar = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
export const claveNombre = (s) => String(s || '').split('-').map(normalizar).filter(Boolean).join('-')
export const gamaDe = (nombre) => normalizar(String(nombre || '').split(/[\s-]+/)[0])
export const tituloGama = (g) => (g ? g.charAt(0).toUpperCase() + g.slice(1) : 'Otros')
// "VERDE MENTA" / "verde menta" -> "Verde menta" (solo para mostrar)
export const capitalizar = (s) => {
  const t = String(s || '').trim().toLowerCase()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''
}

export const ESTADOS = {
  rotacion: { label: 'En rotación', corto: 'Rotación', desc: 'Se puede reponer.', clase: 'ok' },
  sin_rotacion: { label: 'Sin rotación', corto: 'Sin rotación', desc: 'Cuídalo: cuando se acabe no vuelve.', clase: 'aviso' },
  agotado: { label: 'Agotado', corto: 'Agotado', desc: 'Ya no se consigue. Se conserva el registro.', clase: 'debe' },
}

export const PASOS = [
  ['derecho', 'Derecho'],
  ['evanizado', 'Evanizado'],
  ['', 'Sin indicar'],
]
export const pasoLabel = (p) => (p === 'derecho' ? 'Derecho' : p === 'evanizado' ? 'Evanizado' : '')

export const MATERIALES = ['Hilo', 'Poliéster', 'Poli-nailon', 'Lana', 'Licra']
export const PARTES_SUGERIDAS = ['Liso', 'Transferencia']

// ---- Hilos ----
const limpio = (s) => String(s || '').trim()
export const esLicra = (h) => normalizar(h?.material) === 'licra'
export const hiloSinColor = (h) => !!h && !limpio(h.nombre) && !esLicra(h)

// Cómo se reconoce el hilo de un vistazo: "mH 725", "V-001", "Venus negro",
// "Lana #29", "Licra".
export function hiloTitulo(h) {
  if (!h) return 'Hilo borrado'
  const marca = limpio(h.hilo_marca), num = limpio(h.hilo_col), nombre = limpio(h.nombre)
  const material = limpio(h.material)
  if (marca && num) return `${marca} ${num}`
  if (h.codigo) return h.codigo
  if (marca) return nombre ? `${marca} ${nombre.toLowerCase()}` : marca
  if (num) return `${material || 'Hilo'} #${num}`
  return [material, nombre.toLowerCase()].filter(Boolean).join(' ') || 'Hilo sin nombre'
}

// Lo que el título no dice ya: color, material y proveedor. Nada repetido.
export function hiloDetalle(h) {
  if (!h) return ''
  const marca = limpio(h.hilo_marca), num = limpio(h.hilo_col), nombre = limpio(h.nombre)
  const titulo = hiloTitulo(h).toLowerCase()
  const partes = []
  if (nombre && !titulo.includes(nombre.toLowerCase())) partes.push(nombre)
  const mat = limpio(h.material)
  if (mat && !titulo.includes(mat.toLowerCase())) partes.push(mat)
  if (limpio(h.proveedor)) partes.push(limpio(h.proveedor))
  // Un poliéster con código que además tiene marca o número
  if (h.codigo && (marca || num)) partes.push([marca, num].filter(Boolean).join(' '))
  return partes.join(' · ')
}

export const hexHilo = (h) => (h ? hexDeColor(h.nombre) : null)

// El código de la carta (V-001) es para los conos que no traen nada impreso
// que los identifique: el poliéster o poli-nailon sin marca.
export const necesitaCodigo = ({ marca, material }) => !limpio(marca) && /^poli/.test(normalizar(material))

// Código nuevo: primera letra del color + número siguiente de esa letra
// (A-001, A-002…). Se congela al crear el cono.
export function siguienteCodigo(hilos, nombre) {
  const m = normalizar(nombre).match(/[a-z]/)
  const letra = m ? m[0].toUpperCase() : 'X'
  let max = 0
  for (const c of hilos) {
    const r = String(c.codigo || '').match(/^([A-Z])-(\d+)$/i)
    if (r && r[1].toUpperCase() === letra) max = Math.max(max, parseInt(r[2], 10))
  }
  return `${letra}-${String(max + 1).padStart(3, '0')}`
}

// Texto para buscar un hilo por cualquier cosa que se escriba de él.
export const textoBusquedaHilo = (h) => normalizar([
  hiloTitulo(h), h.nombre, h.hilo_marca, h.hilo_col, h.codigo, h.material, h.proveedor,
  h.hilo_col ? `#${h.hilo_col}` : '',
].filter(Boolean).join(' '))

// ---- Fórmulas ----
// Devuelve las líneas de una fórmula ya pasada a hilos, o null si la fórmula
// todavía es solo texto.
export function lineasDe(f) {
  const ing = f?.ingredientes
  if (!Array.isArray(ing) || !ing.length || !ing.every((l) => l && l.cono_id != null)) return null
  return ing.map((l) => ({
    parte: limpio(l.parte),
    paso: l.paso === 'derecho' || l.paso === 'evanizado' ? l.paso : '',
    cono_id: Number(l.cono_id),
    cabos: l.cabos == null || l.cabos === '' ? null : Number(l.cabos),
  }))
}

// Agrupa las líneas por parte, en el orden en que aparecen.
export function partesDe(lineas) {
  const grupos = []
  for (const l of lineas || []) {
    let g = grupos.find((x) => x.nombre === l.parte)
    if (!g) { g = { nombre: l.parte, lineas: [] }; grupos.push(g) }
    g.lineas.push(l)
  }
  return grupos
}

const cabosTxt = (n) => (n == null ? '' : `cabos ${n}`)
export function lineaTexto(l, hilosPorId) {
  return [pasoLabel(l.paso), hiloTitulo(hilosPorId.get(l.cono_id)), cabosTxt(l.cabos)].filter(Boolean).join(' ')
}

// La fórmula escrita como la escribe Diego, una línea por hilo:
//   Liso:
//   Derecho V-001 cabos 3
//   Evanizado A-001 cabos 1
export function textoFormula(lineas, hilosPorId) {
  const out = []
  for (const g of partesDe(lineas)) {
    if (g.nombre) out.push(`${g.nombre}:`)
    for (const l of g.lineas) out.push(lineaTexto(l, hilosPorId))
  }
  return out.join('\n')
}

// Resumen corto para listas: los hilos distintos, en orden ("mH 725 + Alfa 195").
export function resumenFormula(lineas, hilosPorId) {
  const vistos = []
  for (const l of lineas || []) {
    const h = hilosPorId.get(l.cono_id)
    if (h && esLicra(h)) continue
    const t = hiloTitulo(h)
    if (!vistos.includes(t)) vistos.push(t)
  }
  return vistos.join(' + ')
}

// El peor estado entre los hilos de la fórmula: 'agotado', 'sin_rotacion',
// 'borrado' (un hilo que ya no existe) o null si todo está bien.
export function alertaFormula(lineas, hilosPorId) {
  let peor = null
  for (const l of lineas || []) {
    const h = hilosPorId.get(l.cono_id)
    if (!h) return 'borrado'
    if (h.estado === 'agotado') peor = 'agotado'
    else if (h.estado === 'sin_rotacion' && peor !== 'agotado') peor = 'sin_rotacion'
  }
  return peor
}

// Franjas de color para la muestra de la fórmula: cada hilo pesa según sus
// cabos. La licra no da color, así que no se pinta.
export function segmentosMezcla(lineas, hilosPorId) {
  const por = new Map()
  for (const l of lineas || []) {
    const h = hilosPorId.get(l.cono_id)
    if (!h || esLicra(h)) continue
    const prev = por.get(l.cono_id)
    const peso = l.cabos || 1
    if (prev) prev.peso = Math.max(prev.peso, peso)
    else por.set(l.cono_id, { hex: hexHilo(h), peso })
  }
  return Array.from(por.values())
}
