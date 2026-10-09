import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { supabase } from '../supabaseClient'
import { TIPO_LABEL } from './constants'
import { normalizar } from './hilos'

// ============================================
// FOTOS DE LOS DISEÑOS (galería)
// ============================================
// Las fotos viven dentro de cada ítem del pedido, a tamaño completo (hasta
// 1200 px). Para la galería:
//  1. Primero se pregunta solo QUÉ ítems tienen fotos (unos pocos KB).
//  2. Las fotos se piden de a pocas, primero las que se ven en pantalla.
//  3. Cada foto se guarda en este dispositivo con una copia pequeña para la
//     cuadrícula y su "huella": la próxima vez abre al instante y sin
//     internet.
//  4. Con las huellas se juntan las fotos repetidas (la misma foto subida en
//     varios pedidos): en la galería queda una sola, con los pedidos donde se
//     usó. En los pedidos no se borra nada: cada uno sigue con su foto.
// Las fotos de un ítem nunca cambian (al editar un pedido sus ítems se
// borran y se crean de nuevo con otro id), así que lo guardado nunca queda
// viejo. Lo de ítems que ya no existen se borra solo, y al cerrar sesión se
// borra todo.

const MINI = 440 // lado corto de la copia pequeña, en px
const LOTE = 3 // ítems por consulta
const EN_VUELO_MAX = 2 // consultas al mismo tiempo
const IDS_KEY = 'tejidos_disenos_ids'

// Turno en la fila de descargas: lo abierto en grande primero, luego sus
// vecinos, luego lo que está en pantalla y al final el resto.
export const PESO_VISOR = 10
export const PESO_VECINO = 5
export const PESO_PANTALLA = 1

// ---------- Guardado en el dispositivo (IndexedDB) ----------
// Todo es "mejor esfuerzo": si el navegador no deja guardar (modo privado,
// sin espacio), la galería funciona igual, solo que vuelve a pedir las fotos.
const DB_NOMBRE = 'tejidos_disenos'
const ALMACEN = 'items'
let dbPromesa = null

function abrirDB() {
  if (!dbPromesa) {
    dbPromesa = new Promise((resolve) => {
      try {
        const r = indexedDB.open(DB_NOMBRE, 1)
        r.onupgradeneeded = () => r.result.createObjectStore(ALMACEN)
        r.onsuccess = () => {
          const db = r.result
          // Si otra pestaña borra la base (al cerrar sesión), se suelta.
          db.onversionchange = () => { db.close(); dbPromesa = null }
          resolve(db)
        }
        r.onerror = () => resolve(null)
        r.onblocked = () => resolve(null)
      } catch { resolve(null) }
    })
  }
  return dbPromesa
}

// Corre una operación y devuelve su resultado, o undefined si algo falla.
async function op(modo, fn) {
  const db = await abrirDB()
  if (!db) return undefined
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(ALMACEN, modo)
      const req = fn(tx.objectStore(ALMACEN))
      tx.oncomplete = () => resolve(req ? req.result : true)
      tx.onerror = () => resolve(undefined)
      tx.onabort = () => resolve(undefined)
    } catch { resolve(undefined) }
  })
}
const leerGuardado = (id) => op('readonly', (st) => st.get(id))
const guardar = (id, valor) => op('readwrite', (st) => st.put(valor, id))
// Agrega datos a lo que ya estaba guardado de un ítem.
const completarGuardado = (id, cambios) => op('readwrite', (st) => {
  const r = st.get(id)
  r.onsuccess = () => { if (r.result) st.put({ ...r.result, ...cambios }, id) }
  return null
})

// Borra lo guardado de ítems que ya no tienen fotos o ya no existen.
export function podarGuardados(idsVivos) {
  const vivos = new Set([...idsVivos].map(String))
  return op('readwrite', (st) => {
    const r = st.openKeyCursor ? st.openKeyCursor() : st.openCursor()
    r.onsuccess = () => {
      const c = r.result
      if (!c) return
      if (!vivos.has(String(c.key))) st.delete(c.key)
      c.continue()
    }
    return null
  })
}

// Al cerrar sesión: nada de las fotos queda en el dispositivo. Lo que venía
// en camino se descarta (si no, al llegar volvería a crear lo guardado).
let generacion = 0
export async function olvidarFotos() {
  generacion++
  for (const e of entradas.values()) soltarUrls(e.minis)
  entradas.clear()
  cola.clear()
  veredictos.clear()
  idsEnMemoria = null
  try { localStorage.removeItem(IDS_KEY) } catch { /* sin almacenamiento */ }
  const db = await dbPromesa
  dbPromesa = null
  try { db?.close() } catch { /* ya estaba cerrada */ }
  try { indexedDB.deleteDatabase(DB_NOMBRE) } catch { /* sin IndexedDB */ }
}

// ---------- Qué ítems tienen fotos ----------
// Solo trae los id (pocos KB), nunca las fotos. La columna puede ser jsonb
// (lista vacía = "[]") o un arreglo de Postgres (vacío = "{}"): se prueba
// primero lo uno y luego lo otro. Si nada funciona devuelve null y la
// galería revisa ítem por ítem.
let idsEnMemoria = null

function idsConFotosConocidos() {
  if (idsEnMemoria) return idsEnMemoria
  try {
    const g = JSON.parse(localStorage.getItem(IDS_KEY) || 'null')
    if (Array.isArray(g)) idsEnMemoria = new Set(g.map(String))
  } catch { /* sin almacenamiento o dato dañado */ }
  return idsEnMemoria
}

async function idsDeTabla(tabla) {
  const filtros = [
    (q) => q.not('imagenes', 'is', null).neq('imagenes', '[]'),
    (q) => q.not('imagenes', 'is', null).neq('imagenes', '{}'),
  ]
  for (const filtrar of filtros) {
    const ids = []
    let ok = true
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await filtrar(supabase.from(tabla).select('id')).range(desde, desde + 999)
      if (error) { ok = false; break }
      for (const r of data || []) ids.push(String(r.id))
      if (!data || data.length < 1000) break
    }
    if (ok) return ids
  }
  return null
}

async function consultarIdsConFotos() {
  try {
    const [cam, chq] = await Promise.all([idsDeTabla('items_camiseta'), idsDeTabla('items_chaqueta')])
    if (!cam || !chq) return null
    idsEnMemoria = new Set([...cam, ...chq])
    try { localStorage.setItem(IDS_KEY, JSON.stringify([...idsEnMemoria])) } catch { /* sin espacio: no pasa nada */ }
    return idsEnMemoria
  } catch {
    return null
  }
}

// ---------- Archivos ----------
const aUrl = (x) => (x instanceof Blob ? URL.createObjectURL(x) : x)
function soltarUrls(lista) {
  for (const u of lista || []) if (typeof u === 'string' && u.startsWith('blob:')) URL.revokeObjectURL(u)
}

function listaDe(imagenes) {
  let l = imagenes
  if (typeof l === 'string') { try { l = JSON.parse(l) } catch { l = [] } }
  return (Array.isArray(l) ? l : []).filter((s) => typeof s === 'string' && s)
}

// "data:image/jpeg;base64,..." -> archivo (Blob). Una dirección normal se
// deja tal cual.
function aBlob(s) {
  if (typeof s !== 'string' || !s.startsWith('data:')) return s
  try {
    const coma = s.indexOf(',')
    const meta = s.slice(5, coma)
    const tipo = meta.split(';')[0] || 'image/jpeg'
    const datos = s.slice(coma + 1)
    if (!/;base64/i.test(meta)) return new Blob([decodeURIComponent(datos)], { type: tipo })
    const bin = atob(datos)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new Blob([bytes], { type: tipo })
  } catch {
    return s
  }
}

// Archivo -> "data:image/jpeg;base64,..." (los mismos bytes: al volver a
// usar un diseño en otro pedido, la foto queda idéntica a la original).
const blobADato = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(r.result)
  r.onerror = () => reject(r.error)
  r.readAsDataURL(blob)
})

// Las copias pequeñas y las huellas se hacen de una en una para no trabar
// la pantalla.
let fila = Promise.resolve()
function enFila(fn) {
  const p = fila.then(fn, fn)
  fila = p.catch(() => {})
  return p
}

async function hacerMini(blob) {
  try {
    if (typeof createImageBitmap !== 'function') return blob
    const bmp = await createImageBitmap(blob)
    const esc = Math.min(1, MINI / Math.min(bmp.width, bmp.height))
    if (esc >= 1 && blob.size < 90000) { bmp.close?.(); return blob }
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(bmp.width * esc))
    c.height = Math.max(1, Math.round(bmp.height * esc))
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bmp, 0, 0, c.width, c.height)
    bmp.close?.()
    const mini = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.8))
    return mini || blob
  } catch {
    return blob
  }
}

// ---------- Huellas: cuándo dos fotos son la misma ----------
// sha: la foto byte por byte (iguales = idénticas). gris y col: cómo se ve en
// muy pequeño, para encontrar la misma foto subida otra vez (otra compresión,
// un pixel de diferencia). Las que se parecen se comparan en detalle antes de
// juntarlas: calibrado con fotos reales, la misma foto subida dos veces
// difiere 11 o menos, y una sola raya de otro color ya difiere 30 o más.
const VERSION_HUELLA = 2
const CANDIDATO_GRIS = 10 // diferencia media (0-255) en 16×16
const CANDIDATO_COLOR = 24
const FINO_ANCHO = 160
const FINO_P995 = 18
const FINO_MAX = 28
const FINO_MEDIA = 12

async function shaDe(blob) {
  const buf = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(buf).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// La huella exacta de una foto que viene como texto (para saber si un ítem
// ya tiene un diseño).
export async function shaDeDato(s) {
  const b = aBlob(s)
  return b instanceof Blob ? shaDe(b) : null
}

async function pixeles(fuente, w, h) {
  const bmp = await createImageBitmap(fuente, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' })
  const c = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h })
  const g = c.getContext('2d', { willReadFrequently: true })
  g.drawImage(bmp, 0, 0)
  bmp.close?.()
  return g.getImageData(0, 0, w, h).data
}

async function rasgosDe(mini) {
  const d = await pixeles(mini, 16, 16)
  const gris = []
  for (let i = 0; i < 256; i++) gris.push(Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]))
  const c = await pixeles(mini, 4, 4)
  const col = []
  for (let i = 0; i < 16; i++) col.push(c[i * 4], c[i * 4 + 1], c[i * 4 + 2])
  return { gris, col }
}

async function huellaDe(foto, mini) {
  const h = { v: VERSION_HUELLA }
  try { if (foto instanceof Blob) h.sha = await shaDe(foto) } catch { /* sin huella exacta */ }
  try { if (mini instanceof Blob && typeof createImageBitmap === 'function') Object.assign(h, await rasgosDe(mini)) } catch { /* sin huella visual */ }
  return h
}

function distancia(a, b) {
  if (!a || !b) return Infinity
  let s = 0
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i])
  return s / a.length
}

async function mismaFoto(ma, mb) {
  const A = await createImageBitmap(ma)
  const B = await createImageBitmap(mb)
  const ra = A.width / A.height
  const rb = B.width / B.height
  A.close?.()
  B.close?.()
  if (Math.abs(ra - rb) / ra > 0.03) return false
  const w = FINO_ANCHO
  const h = Math.max(8, Math.round(w / ra))
  const [pa, pb] = await Promise.all([pixeles(ma, w, h), pixeles(mb, w, h)])
  const n = w * h
  const difs = new Uint8Array(n)
  let suma = 0
  for (let i = 0; i < n; i++) {
    const j = i * 4
    const d = Math.max(Math.abs(pa[j] - pb[j]), Math.abs(pa[j + 1] - pb[j + 1]), Math.abs(pa[j + 2] - pb[j + 2]))
    difs[i] = d
    suma += d
  }
  difs.sort()
  return suma / n <= FINO_MEDIA && difs[Math.floor(n * 0.995)] <= FINO_P995 && difs[n - 1] <= FINO_MAX
}

// Resultado de comparar en detalle dos fotos que se parecen (se hace una vez).
const veredictos = new Map()
function veredicto(a, b) {
  const k = [a.h.sha || a.key, b.h.sha || b.key].sort().join('|')
  if (veredictos.has(k)) {
    const v = veredictos.get(k)
    return v === 'esperando' ? undefined : v
  }
  const ma = a.e.minisBlob[a.idx]
  const mb = b.e.minisBlob[b.idx]
  if (!(ma instanceof Blob) || !(mb instanceof Blob)) { veredictos.set(k, false); return false }
  veredictos.set(k, 'esperando')
  const gen = generacion
  enFila(() => mismaFoto(ma, mb)).then(
    (v) => { if (gen === generacion) { veredictos.set(k, !!v); avisarGlobal() } },
    () => { if (gen === generacion) veredictos.set(k, false) },
  )
  return undefined
}

// ---------- Fotos de cada ítem ----------
// Una entrada por ítem. estado: 'nada' (sin pedir), 'buscando' (mirando lo
// guardado), 'cola' (esperando turno), 'red' (descargando), 'listo', 'error'.
const entradas = new Map()

function entradaDe(id, tabla) {
  const k = String(id)
  let e = entradas.get(k)
  if (!e) {
    e = { id: k, tabla, estado: 'nada', interes: 0, prioridad: 0, n: 0, minis: [], minisBlob: [], huellas: [], fotos: null, version: 0, escuchas: new Set() }
    entradas.set(k, e)
  }
  return e
}

// Avisos: a quien mira un ítem, y a la galería completa (juntos, cada 50 ms).
let versionGlobal = 0
const escuchasGlobales = new Set()
let avisoProgramado = false
function avisarGlobal() {
  versionGlobal++
  if (avisoProgramado) return
  avisoProgramado = true
  setTimeout(() => {
    avisoProgramado = false
    for (const fn of [...escuchasGlobales]) fn()
  }, 50)
}
const suscribirGlobal = (fn) => { escuchasGlobales.add(fn); return () => escuchasGlobales.delete(fn) }

function avisar(e) {
  e.version++
  for (const fn of [...e.escuchas]) fn()
  avisarGlobal()
}

function quedarListo(e, { minis, huellas, fotos }) {
  soltarUrls(e.minis)
  e.n = minis.length
  e.minisBlob = minis
  e.minis = minis.map(aUrl)
  e.huellas = huellas
  // Si quedó guardado en el dispositivo, las grandes se leen de ahí al
  // abrirlas (no ocupan memoria mientras tanto); si no, se quedan aquí.
  e.fotos = fotos
  e.estado = 'listo'
  avisar(e)
}

function interesar(e, delta, peso) {
  e.interes += delta
  e.prioridad += delta * peso
  if (delta > 0) arrancar(e)
}

async function arrancar(e) {
  if (e.estado === 'cola') { programar(); return }
  if (e.estado !== 'nada' && e.estado !== 'error') return
  const habiaError = e.estado === 'error'
  e.estado = 'buscando'
  if (habiaError) avisar(e)
  const gen = generacion
  const g = await leerGuardado(e.id)
  if (gen !== generacion) return
  if (g && Array.isArray(g.minis)) {
    let huellas = g.huellas
    if (!Array.isArray(huellas) || huellas.length !== g.minis.length || huellas.some((h) => h?.v !== VERSION_HUELLA)) {
      // Guardado por la versión anterior de la galería: se le saca la
      // huella una sola vez.
      huellas = []
      for (let i = 0; i < g.minis.length; i++) huellas.push(await enFila(() => huellaDe(g.fotos?.[i], g.minis[i])))
      if (gen !== generacion) return
      completarGuardado(e.id, { huellas })
    }
    quedarListo(e, { minis: g.minis, huellas, fotos: null })
    return
  }
  e.estado = 'cola'
  cola.add(e)
  programar()
}

// Vuelve a intentar lo que no cargó (y que alguien todavía quiere ver).
export function reintentarErrores() {
  for (const e of entradas.values()) if (e.estado === 'error' && e.interes > 0) arrancar(e)
}

// ---------- Descargas, de a pocas ----------
const cola = new Set()
let enVuelo = 0
let programado = false

function programar() {
  if (programado) return
  programado = true
  setTimeout(despachar, 20)
}

function despachar() {
  programado = false
  while (enVuelo < EN_VUELO_MAX) {
    const quieren = [...cola].filter((e) => e.interes > 0)
    if (!quieren.length) return
    quieren.sort((a, b) => b.prioridad - a.prioridad)
    const tabla = quieren[0].tabla
    const lote = quieren.filter((e) => e.tabla === tabla).slice(0, LOTE)
    // Lo que se abrió en grande va solo, para que llegue cuanto antes.
    if (lote[0].prioridad >= PESO_VISOR) lote.length = 1
    for (const e of lote) { cola.delete(e); e.estado = 'red' }
    enVuelo++
    traer(tabla, lote).finally(() => { enVuelo--; programar() })
  }
}

async function traer(tabla, lote) {
  const gen = generacion
  let filas
  try {
    const { data, error } = await supabase.from(tabla).select('id, imagenes').in('id', lote.map((e) => e.id))
    if (error) throw error
    filas = data || []
  } catch {
    for (const e of lote) { e.estado = 'error'; avisar(e) }
    return
  }
  if (gen !== generacion) return
  const porId = new Map(filas.map((f) => [String(f.id), f.imagenes]))
  for (const e of lote) await procesar(e, porId.get(e.id), gen)
}

async function procesar(e, imagenes, gen) {
  const fotos = listaDe(imagenes).map(aBlob)
  const minis = []
  const huellas = []
  for (const f of fotos) {
    const m = f instanceof Blob ? await enFila(() => hacerMini(f)) : f
    minis.push(m)
    huellas.push(await enFila(() => huellaDe(f, m)))
  }
  if (gen !== generacion) return
  const ok = await guardar(e.id, { minis, fotos, huellas })
  quedarListo(e, { minis, huellas, fotos: ok ? null : fotos })
}

// La foto completa de un ítem como texto "data:...", lista para ponerla en
// otro pedido. Sale de este dispositivo si está; si no, se pide.
export async function datoDeFoto(id, tabla, idx) {
  const e = entradas.get(String(id))
  let f = e?.fotos?.[idx]
  if (!f) f = (await leerGuardado(String(id)))?.fotos?.[idx]
  if (f instanceof Blob) return blobADato(f)
  if (typeof f === 'string' && f) return f
  const { data, error } = await supabase.from(tabla).select('imagenes').eq('id', id).maybeSingle()
  if (error) throw error
  const s = listaDe(data?.imagenes)[idx]
  if (!s) throw new Error('No se encontró la foto')
  return s
}

// ---------- Para las pantallas ----------

// Estado de las fotos de un ítem. Con activo=true se piden (si faltan); peso
// decide qué tan adelante va en la fila (ver PESO_*).
export function useDiseno(id, tabla, activo, peso = 0) {
  const e = entradaDe(id, tabla)
  const suscribir = useMemo(() => (fn) => { e.escuchas.add(fn); return () => e.escuchas.delete(fn) }, [e])
  useSyncExternalStore(suscribir, () => e.version)
  useEffect(() => {
    if (!activo) return undefined
    interesar(e, +1, peso)
    return () => interesar(e, -1, peso)
  }, [e, activo, peso])
  return { estado: e.estado, n: e.n, minis: e.minis }
}

// Las fotos en tamaño completo de un ítem ya cargado (para el visor):
// { urls, blobs }.
export function useFotosGrandes(id, listo) {
  const [v, setV] = useState(null)
  useEffect(() => {
    setV(null)
    if (!listo) return undefined
    let vivo = true
    const creadas = []
    ;(async () => {
      const e = entradas.get(String(id))
      let fotos = e?.fotos
      if (!fotos) fotos = (await leerGuardado(String(id)))?.fotos
      if (!vivo || !fotos) return
      const urls = fotos.map((f) => {
        if (!(f instanceof Blob)) return f
        const u = URL.createObjectURL(f)
        creadas.push(u)
        return u
      })
      setV({ urls, blobs: fotos.map((f) => (f instanceof Blob ? f : null)) })
    })()
    // Se sueltan un momento después, por si alguna aún se está pintando.
    return () => { vivo = false; window.setTimeout(() => soltarUrls(creadas), 2000) }
  }, [id, listo])
  return v
}

// ¿Está el elemento en pantalla o a punto de aparecer? Un solo vigilante
// para todas las tarjetas.
const vigilados = new Map()
let vigilante = null
function vigilar(el, fn) {
  if (typeof IntersectionObserver === 'undefined') { fn(true); return () => {} }
  if (!vigilante) {
    vigilante = new IntersectionObserver((cambios) => {
      for (const c of cambios) vigilados.get(c.target)?.(c.isIntersecting)
    }, { rootMargin: '450px 0px' })
  }
  vigilados.set(el, fn)
  vigilante.observe(el)
  return () => { vigilados.delete(el); vigilante.unobserve(el) }
}

export function useEnPantalla(ref) {
  const [visto, setVisto] = useState(false)
  useEffect(() => (ref.current ? vigilar(ref.current, setVisto) : undefined), [ref])
  return visto
}

// ---------- La carpeta: cada diseño una sola vez ----------
const fechaDe = (p) => String(p?.fecha || '')
const ordenUso = (a, b) => fechaDe(b.pedido).localeCompare(fechaDe(a.pedido))
  || String(b.pedido.numero || '').localeCompare(String(a.pedido.numero || ''), 'es', { numeric: true })
const ordenSubida = (a, b) => fechaDe(a.x.pedido).localeCompare(fechaDe(b.x.pedido))
  || String(a.x.it.creado_en || '').localeCompare(String(b.x.it.creado_en || '')) || a.idx - b.idx
const tiposDe = (it) => (it?.tipos || []).map((t) => TIPO_LABEL[t] || t).join(' · ')

// Un diseño: la foto original (la primera que se subió) y todos los pedidos
// donde aparece esa misma foto, del más reciente al más antiguo.
function armarDiseno(fotos) {
  const orden = [...fotos].sort(ordenSubida)
  const rep = orden[0]
  const porPedido = new Map()
  for (const f of orden) {
    const k = String(f.x.pedido.id)
    if (!porPedido.has(k)) porPedido.set(k, { pedido: f.x.pedido, it: f.x.it, prenda: f.x.prenda })
  }
  const usos = [...porPedido.values()].sort(ordenUso)
  const ultimo = usos[0]
  const conRef = usos.find((u) => String(u.it?.diseno || '').trim())
  return {
    key: rep.key,
    claves: fotos.map((f) => f.key), // todas sus fotos (por si se junta con otro)
    rep: { id: rep.x.id, tabla: rep.x.tabla, idx: rep.idx },
    shas: [...new Set(fotos.map((f) => f.h.sha).filter(Boolean))],
    usos,
    ultimo,
    clientes: [...new Set(usos.map((u) => u.pedido.cliente).filter(Boolean))],
    ref: conRef ? String(conRef.it.diseno).trim() : '',
    tipos: tiposDe(ultimo.it),
    prendas: new Set(usos.map((u) => u.prenda)),
    busca: normalizar(usos.flatMap((u) => [u.pedido.cliente, u.pedido.numero, u.it?.diseno, tiposDe(u.it), u.prenda === 'cam' ? 'camiseta' : 'chaqueta', ...(u.it?.colores || [])]).join(' ')),
  }
}

function construirCarpeta(items) {
  const fotos = []
  let listos = 0
  let errores = 0
  for (const x of items) {
    const e = entradas.get(x.id)
    if (e?.estado === 'error') errores++
    if (e?.estado !== 'listo') continue
    listos++
    for (let i = 0; i < e.n; i++) fotos.push({ key: `${x.id}:${i}`, x, idx: i, e, h: e.huellas[i] || {} })
  }
  // Se juntan las fotos iguales (las de la misma huella exacta, y las que se
  // parecen y pasan la comparación en detalle).
  const padre = fotos.map((_, i) => i)
  const raiz = (i) => { while (padre[i] !== i) { padre[i] = padre[padre[i]]; i = padre[i] } return i }
  const unir = (a, b) => { const ra = raiz(a); const rb = raiz(b); if (ra !== rb) padre[Math.max(ra, rb)] = Math.min(ra, rb) }
  const porSha = new Map()
  fotos.forEach((f, i) => {
    if (!f.h.sha) return
    if (porSha.has(f.h.sha)) unir(porSha.get(f.h.sha), i)
    else porSha.set(f.h.sha, i)
  })
  for (let i = 0; i < fotos.length; i++) {
    const a = fotos[i]
    if (!a.h.gris) continue
    for (let j = i + 1; j < fotos.length; j++) {
      const b = fotos[j]
      if (!b.h.gris || raiz(i) === raiz(j)) continue
      if (distancia(a.h.col, b.h.col) > CANDIDATO_COLOR || distancia(a.h.gris, b.h.gris) > CANDIDATO_GRIS) continue
      if (veredicto(a, b) === true) unir(i, j)
    }
  }
  const grupos = new Map()
  fotos.forEach((f, i) => {
    const r = raiz(i)
    if (!grupos.has(r)) grupos.set(r, [])
    grupos.get(r).push(f)
  })
  const disenos = [...grupos.values()].map(armarDiseno).sort((a, b) => ordenUso(a.ultimo, b.ultimo))
  return { disenos, fotos: fotos.length, total: items.length, listos, errores }
}

// La carpeta para las pantallas. Para saber cuáles fotos se repiten hacen
// falta todas, así que se piden todas, de a pocas y sin apuro (lo que está
// en pantalla pasa primero). Devuelve:
//   disenos: cada diseño una vez, del más usado recientemente al más viejo
//   total / listos / errores: ítems con fotos, ya revisados, con falla
//   cargando: todavía no se sabe qué ítems tienen fotos
//   revisar: no se pudo saber (se revisa ítem por ítem)
export function useCarpeta(pedidos) {
  const [conFotos, setConFotos] = useState(() => idsConFotosConocidos() || undefined)

  useEffect(() => {
    let vivo = true
    let t = 0
    consultarIdsConFotos().then((ids) => {
      if (!vivo) return
      if (ids) {
        setConFotos(ids)
        // Limpia lo guardado de diseños que ya no existen, sin apuro.
        t = window.setTimeout(() => podarGuardados(ids), 4000)
      } else {
        setConFotos((v) => (v === undefined ? null : v))
      }
    })
    return () => { vivo = false; window.clearTimeout(t) }
  }, [])

  const items = useMemo(() => {
    if (conFotos === undefined) return []
    const out = []
    for (const p of pedidos || []) {
      const poner = (lista, tabla, prenda) => {
        for (const it of lista || []) if (!conFotos || conFotos.has(String(it.id))) out.push({ id: String(it.id), tabla, prenda, pedido: p, it })
      }
      poner(p.items_camiseta, 'items_camiseta', 'cam')
      poner(p.items_chaqueta, 'items_chaqueta', 'chaq')
    }
    // Lo más reciente primero: es lo que se ve arriba.
    return out.sort((a, b) => fechaDe(b.pedido).localeCompare(fechaDe(a.pedido)))
  }, [pedidos, conFotos])

  useEffect(() => {
    const es = items.map((x) => entradaDe(x.id, x.tabla))
    for (const e of es) interesar(e, +1, 0)
    return () => { for (const e of es) interesar(e, -1, 0) }
  }, [items])

  const version = useSyncExternalStore(suscribirGlobal, () => versionGlobal)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const carpeta = useMemo(() => construirCarpeta(items), [items, version])
  return { ...carpeta, cargando: conFotos === undefined, revisar: conFotos === null }
}

// ---------- Mandar una foto ----------
// Abre el menú de compartir del celular (ahí sale WhatsApp). Si el navegador
// no puede, la descarga para adjuntarla a mano. Se llama directo desde el
// toque del botón (sin esperas antes), porque así lo exige el navegador.
export async function compartirFoto(blob, nombre) {
  const archivo = new File([blob], nombre, { type: blob.type || 'image/jpeg' })
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo] })
      return 'compartida'
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelada'
      // Algunos navegadores dicen que sí pero fallan: se descarga.
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
  return 'descargada'
}
