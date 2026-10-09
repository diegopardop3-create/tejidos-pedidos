import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { supabase } from '../supabaseClient'

// ============================================
// FOTOS DE LOS DISEÑOS (galería)
// ============================================
// Las fotos viven dentro de cada ítem del pedido, a tamaño completo (hasta
// 1200 px), y entre todas pesan decenas de MB. Para que la galería abra
// rápido y no gaste datos de más:
//  1. Primero se pregunta solo QUÉ ítems tienen fotos (unos pocos KB).
//  2. Las fotos se piden únicamente de los diseños que están en pantalla o
//     a punto de aparecer, de a pocos por consulta.
//  3. Cada foto se guarda en este dispositivo junto con una copia pequeña
//     para la cuadrícula: la próxima vez abren al instante y sin internet.
// Las fotos de un ítem nunca cambian (al editar un pedido sus ítems se
// borran y se crean de nuevo con otro id), así que lo guardado nunca queda
// viejo. Lo de ítems que ya no existen se borra solo, y al cerrar sesión se
// borra todo.

const MINI = 440 // lado corto de la copia pequeña, en px
const LOTE = 3 // ítems por consulta
const EN_VUELO_MAX = 2 // consultas al mismo tiempo
const IDS_KEY = 'tejidos_disenos_ids'

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

export function idsConFotosConocidos() {
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

export async function consultarIdsConFotos() {
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

// ---------- Fotos de cada diseño ----------
// Una entrada por ítem. estado: 'nada' (sin pedir), 'buscando' (mirando lo
// guardado), 'cola' (esperando turno), 'red' (descargando), 'listo', 'error'.
const entradas = new Map()

function entradaDe(id, tabla) {
  const k = String(id)
  let e = entradas.get(k)
  if (!e) {
    e = { id: k, tabla, estado: 'nada', interes: 0, prioridad: 0, n: 0, minis: [], fotos: null, version: 0, escuchas: new Set() }
    entradas.set(k, e)
  }
  return e
}

function avisar(e) {
  e.version++
  for (const fn of [...e.escuchas]) fn()
}

const aUrl = (x) => (x instanceof Blob ? URL.createObjectURL(x) : x)
function soltarUrls(lista) {
  for (const u of lista || []) if (typeof u === 'string' && u.startsWith('blob:')) URL.revokeObjectURL(u)
}

function interesar(e, delta, prioridad) {
  e.interes += delta
  if (prioridad) e.prioridad += delta
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
    e.n = g.minis.length
    e.minis = g.minis.map(aUrl)
    e.estado = 'listo'
    avisar(e)
    return
  }
  e.estado = 'cola'
  cola.add(e)
  programar()
}

// Vuelve a intentar un diseño que no cargó.
export function reintentar(id) {
  const e = entradas.get(String(id))
  if (!e || e.estado !== 'error') return
  if (e.interes > 0) arrancar(e)
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
    // Solo lo que alguien está mirando (o está por mirar).
    const quieren = [...cola].filter((e) => e.interes > 0)
    if (!quieren.length) return
    quieren.sort((a, b) => b.prioridad - a.prioridad)
    const tabla = quieren[0].tabla
    const lote = quieren.filter((e) => e.tabla === tabla).slice(0, LOTE)
    // Lo que se abrió en grande va solo, para que llegue cuanto antes.
    if (lote[0].prioridad > 0) lote.length = 1
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
  let lista = imagenes
  if (typeof lista === 'string') { try { lista = JSON.parse(lista) } catch { lista = [] } }
  lista = (Array.isArray(lista) ? lista : []).filter((s) => typeof s === 'string' && s)
  const fotos = lista.map(aBlob)
  const minis = []
  for (const f of fotos) minis.push(f instanceof Blob ? await enFila(() => hacerMini(f)) : f)
  if (gen !== generacion) return
  const ok = await guardar(e.id, { minis, fotos })
  e.n = fotos.length
  e.minis = minis.map(aUrl)
  // Si quedó guardado, las grandes se leen del dispositivo al abrirlas (no
  // ocupan memoria mientras tanto); si no, se quedan aquí.
  e.fotos = ok ? null : fotos
  e.estado = 'listo'
  avisar(e)
}

// "data:image/jpeg;base64,..." -> archivo (Blob). Una dirección normal se
// deja tal cual.
function aBlob(s) {
  if (!s.startsWith('data:')) return s
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

// Las copias pequeñas se hacen de una en una para no trabar la pantalla.
let filaMinis = Promise.resolve()
function enFila(fn) {
  const p = filaMinis.then(fn, fn)
  filaMinis = p.catch(() => {})
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

// ---------- Para las pantallas ----------

// Estado de las fotos de un diseño. Con activo=true se piden (si no están).
// prioridad=true: pasa adelante en la fila (el diseño abierto en grande).
export function useDiseno(id, tabla, activo, prioridad = false) {
  const e = entradaDe(id, tabla)
  const suscribir = useMemo(() => (fn) => { e.escuchas.add(fn); return () => e.escuchas.delete(fn) }, [e])
  useSyncExternalStore(suscribir, () => e.version)
  useEffect(() => {
    if (!activo) return undefined
    interesar(e, +1, prioridad)
    return () => interesar(e, -1, prioridad)
  }, [e, activo, prioridad])
  return { estado: e.estado, n: e.n, minis: e.minis }
}

// Las fotos en tamaño completo de un diseño ya cargado (para el visor).
export function useFotosGrandes(id, listo) {
  const [urls, setUrls] = useState(null)
  useEffect(() => {
    setUrls(null)
    if (!listo) return undefined
    let vivo = true
    const creadas = []
    ;(async () => {
      const e = entradas.get(String(id))
      let fotos = e?.fotos
      if (!fotos) fotos = (await leerGuardado(String(id)))?.fotos
      if (!vivo || !fotos) return
      setUrls(fotos.map((f) => {
        if (!(f instanceof Blob)) return f
        const u = URL.createObjectURL(f)
        creadas.push(u)
        return u
      }))
    })()
    // Se sueltan un momento después, por si alguna aún se está pintando.
    return () => { vivo = false; window.setTimeout(() => soltarUrls(creadas), 2000) }
  }, [id, listo])
  return urls
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
