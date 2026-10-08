import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { TALLA_SIN_DIVIDIR, TALLAS_NINO, TALLAS_ADULTO, etqTalla, partesTalla, ordenTalla, tallasDeTabla, TIPO_LABEL, hoy, ESTADOS, ESTADO_ICON, fmtCOP, totalesPorTipoCam, ordenarTipos } from './constants'
import ColorSwatch from './ColorSwatch'
import FormulaColorBoton from './FormulaColorBoton'
import { InsigniaTipos, InsigniaJuego, IconoPrenda } from './Insignias'

// Reduce una foto (archivo) a máx. 1200 px y la devuelve como texto base64
// JPEG. Si algo falla (formato raro), devuelve la foto original sin tocar.
const FOTO_MAX = 1200
function comprimirFoto(archivo) {
  const original = () => new Promise((res) => {
    const r = new FileReader()
    r.onload = (ev) => res(ev.target.result)
    r.readAsDataURL(archivo)
  })
  return new Promise((resolve) => {
    const url = URL.createObjectURL(archivo)
    const img = new Image()
    img.onload = () => {
      try {
        const esc = Math.min(1, FOTO_MAX / Math.max(img.width, img.height))
        const c = document.createElement('canvas')
        c.width = Math.round(img.width * esc)
        c.height = Math.round(img.height * esc)
        const ctx = c.getContext('2d')
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, c.width, c.height)
        ctx.drawImage(img, 0, 0, c.width, c.height)
        URL.revokeObjectURL(url)
        resolve(c.toDataURL('image/jpeg', 0.75))
      } catch { URL.revokeObjectURL(url); original().then(resolve) }
    }
    img.onerror = () => { URL.revokeObjectURL(url); original().then(resolve) }
    img.src = url
  })
}

const TIPOS_CAM = ['puno', 'cuello']
const TIPOS_CHAQ = ['pretina', 'cuello', 'puno']

// Un color puede tener un color principal y varias "rayas" en orden
// (ej: Marfil con raya Negra, raya Roja, raya Azul). Esto arma el nombre
// combinado tal como ya lo escribías a mano: "Marfil-Negro-Rojo-Azul".
function nombreColor(c, ci) {
  const p = (c?.principal || '').trim()
  const rayas = (c?.rayas || []).map((r) => (r || '').trim()).filter(Boolean)
  if (!p && !rayas.length) return `Color ${ci + 1}`
  return [p || `Color ${ci + 1}`, ...rayas].join('-')
}

// Reconstruye {principal, rayas} a partir de un nombre combinado guardado
// (para poder reabrir un ítem y editar cada raya por separado).
function splitColorNombre(nombre) {
  const partes = String(nombre || '').split('-').map((p) => p.trim()).filter(Boolean)
  if (!partes.length) return { principal: '', rayas: [] }
  return { principal: partes[0], rayas: partes.slice(1) }
}

// Guarda un borrador del pedido que se está armando: los datos en
// localStorage y las fotos aparte, en IndexedDB (pesan demasiado para
// localStorage). Así, si el navegador se cierra o se cuelga antes de darle
// "Guardar Pedido", al volver a abrir la app se puede ofrecer recuperarlo.
const BORRADOR_KEY = 'tejidos_borrador_pedido'
function borrarBorrador() {
  try { localStorage.removeItem(BORRADOR_KEY) } catch { /* sin acceso al almacenamiento: nada que borrar */ }
  borrarFotosBorrador()
}

function sinImagenes(items) {
  return (items || []).map((it) => ({ ...it, imagenes: [] }))
}

// Las fotos del borrador van aparte, en IndexedDB: ahí caben decenas de MB,
// mientras que localStorage se llena con unas pocas fotos. Todo es "mejor
// esfuerzo": si el navegador no lo permite, el borrador sigue funcionando
// sin fotos, como antes.
const FOTOS_DB = 'tejidos_borrador_fotos'
function abrirFotosDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(FOTOS_DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore('fotos')
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}
async function fotosBorradorOp(modo, fn) {
  const db = await abrirFotosDB()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('fotos', modo)
      const out = fn(tx.objectStore('fotos'))
      tx.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally { db.close() }
}
const guardarFotosBorrador = (cam, chaq) =>
  fotosBorradorOp('readwrite', (st) => st.put({ cam, chaq }, 'actual')).catch(() => {})
const borrarFotosBorrador = () =>
  fotosBorradorOp('readwrite', (st) => st.delete('actual')).catch(() => {})
const leerFotosBorrador = () =>
  fotosBorradorOp('readonly', (st) => st.get('actual')).catch(() => undefined)
const fotosDeItems = (items) => (items || []).map((it) => it.imagenes || [])
const hayFotos = (f) => !!f && [...(f.cam || []), ...(f.chaq || [])].some((a) => a && a.length)

export default function NuevoPedido({ pedidos, editPedido, onSaved, onCancelEdit, showToast, userId }) {
  const [cliente, setCliente] = useState('')
  const [fecha, setFecha] = useState(hoy())
  const [estado, setEstado] = useState('Pendiente')
  const [obs, setObs] = useState('')
  const [numPedido, setNumPedido] = useState('')
  const [borradorDetectado, setBorradorDetectado] = useState(null)
  const fotosBorradorRef = useRef(null) // promesa con las fotos del borrador previo
  const borradorPendienteRef = useRef(false) // hay un borrador previo sin decidir
  const [sugerenciasAbiertas, setSugerenciasAbiertas] = useState(false)
  const cajaClienteRef = useRef(null)

  const [openCam, setOpenCam] = useState(true)
  const [openChaq, setOpenChaq] = useState(true)

  const [tempCam, setTempCam] = useState([])
  const [tempChaq, setTempChaq] = useState([])

  const [camSelTipos, setCamSelTipos] = useState(new Set())
  const [chaqSelTipos, setChaqSelTipos] = useState(new Set())

  const [camCols, setCamCols] = useState([{ principal: '', rayas: [] }])
  const [camCants, setCamCants] = useState({})
  const [camDiseno, setCamDiseno] = useState('')
  const [camPrecios, setCamPrecios] = useState({})
  const [camImgs, setCamImgs] = useState([])
  const [camEsJuego, setCamEsJuego] = useState(false)
  const [camEditIdx, setCamEditIdx] = useState(null) // idx en tempCam que se está editando, o null si es nuevo
  // Filas de tallas del ítem: cada fila es un grupo de tallas seguidas,
  // ej. [['S'], ['M', 'L'], ['XL']] = S, M-L (unida) y XL.
  const [camFilas, setCamFilas] = useState([])
  const [camPunoSinDividir, setCamPunoSinDividir] = useState(false) // si el puño va en una sola cantidad, sin dividir por talla

  const [chaqRows, setChaqRows] = useState([{ principal: '', rayas: [] }])
  const [chaqCants, setChaqCants] = useState({})
  const [chaqDiseno, setChaqDiseno] = useState('')
  const [chaqPrecios, setChaqPrecios] = useState({})
  const [chaqImgs, setChaqImgs] = useState([])
  const [chaqEditIdx, setChaqEditIdx] = useState(null)

  const [saving, setSaving] = useState(false)

  // Calcular siguiente número de pedido
  useEffect(() => {
    if (editPedido) {
      setNumPedido(editPedido.numero)
      setCliente(editPedido.cliente)
      setFecha(editPedido.fecha)
      setEstado(editPedido.estado)
      setObs(editPedido.observaciones || '')
      setTempCam(editPedido.items_camiseta || [])
      setTempChaq(editPedido.items_chaqueta || [])
    } else {
      const nums = pedidos.map((p) => parseInt((p.numero || '').replace(/\D/g, '')) || 0)
      const next = (nums.length ? Math.max(...nums) : 0) + 1
      setNumPedido('P-' + String(next).padStart(4, '0'))
    }
  }, [editPedido, pedidos])

  // Al entrar a la pantalla (y solo si no se está editando un pedido ya
  // existente), revisa si quedó un borrador de una sesión anterior sin
  // terminar. Se revisa una sola vez, no cada vez que cambian los pedidos.
  useEffect(() => {
    if (editPedido) return
    try {
      const guardado = localStorage.getItem(BORRADOR_KEY)
      if (!guardado) return
      const b = JSON.parse(guardado)
      const hayAlgo = (b.cliente || '').trim() || (b.obs || '').trim() || (b.tempCam || []).length || (b.tempChaq || []).length
      if (hayAlgo) {
        setBorradorDetectado(b)
        borradorPendienteRef.current = true
        fotosBorradorRef.current = leerFotosBorrador()
      }
    } catch { /* borrador corrupto o ilegible: se ignora, no rompe la pantalla */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Guarda un borrador cada vez que cambia algo del pedido que se está
  // armando (mientras NO se esté editando uno ya existente — ese ya vive
  // en la base de datos y no necesita borrador aparte). Las fotos se dejan
  // fuera a propósito: pesan demasiado para el espacio del navegador.
  useEffect(() => {
    if (editPedido) return
    const hayAlgo = cliente.trim() || obs.trim() || tempCam.length || tempChaq.length
    // Mientras haya un borrador anterior esperando decisión, no se borra
    // nada: así no se pierde lo que el usuario aún puede recuperar.
    if (!hayAlgo) { if (!borradorPendienteRef.current) borrarBorrador(); return }
    try {
      localStorage.setItem(BORRADOR_KEY, JSON.stringify({
        cliente, fecha, estado, obs,
        tempCam: sinImagenes(tempCam), tempChaq: sinImagenes(tempChaq),
      }))
    } catch { /* si el espacio del navegador está lleno, seguimos sin borrador esta vez */ }
  }, [editPedido, cliente, fecha, estado, obs, tempCam, tempChaq])

  // Fotos del borrador: se guardan un instante después del último cambio
  // para no reescribirlas con cada letra que se teclea.
  useEffect(() => {
    if (editPedido) return
    if (!tempCam.length && !tempChaq.length) return
    const t = window.setTimeout(() => guardarFotosBorrador(fotosDeItems(tempCam), fotosDeItems(tempChaq)), 400)
    return () => window.clearTimeout(t)
  }, [editPedido, tempCam, tempChaq])

  // Si cierras o recargas la página con un pedido a medias, el navegador
  // pregunta antes de salir.
  const hayPedidoSinGuardar = !editPedido && !!(cliente.trim() || obs.trim() || tempCam.length || tempChaq.length)
  useEffect(() => {
    if (!hayPedidoSinGuardar) return
    const aviso = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [hayPedidoSinGuardar])

  async function recuperarBorrador() {
    if (!borradorDetectado) return
    const fotos = await Promise.resolve(fotosBorradorRef.current).catch(() => undefined)
    const conFotos = (items, arr) => (items || []).map((it, i) => ({ ...it, imagenes: (arr && arr[i]) || [] }))
    setCliente(borradorDetectado.cliente || '')
    if (borradorDetectado.fecha) setFecha(borradorDetectado.fecha)
    if (borradorDetectado.estado) setEstado(borradorDetectado.estado)
    setObs(borradorDetectado.obs || '')
    setTempCam(conFotos(borradorDetectado.tempCam, fotos?.cam))
    setTempChaq(conFotos(borradorDetectado.tempChaq, fotos?.chaq))
    borradorPendienteRef.current = false
    fotosBorradorRef.current = null
    setBorradorDetectado(null)
    showToast('📋', hayFotos(fotos) ? 'Borrador recuperado con sus fotos' : 'Borrador recuperado — esta vez no quedaron fotos guardadas, revisa si hace falta volver a agregarlas')
  }

  function descartarBorrador() {
    borradorPendienteRef.current = false
    fotosBorradorRef.current = null
    borrarBorrador()
    setBorradorDetectado(null)
  }

  useEffect(() => {
    function alTocarFuera(e) {
      if (cajaClienteRef.current && !cajaClienteRef.current.contains(e.target)) setSugerenciasAbiertas(false)
    }
    document.addEventListener('mousedown', alTocarFuera)
    return () => document.removeEventListener('mousedown', alTocarFuera)
  }, [])

  function resetItemForms() {
    setCamSelTipos(new Set()); setCamCols([{ principal: '', rayas: [] }]); setCamCants({}); setCamDiseno(''); setCamPrecios({}); setCamImgs([]); setCamEsJuego(false); setCamEditIdx(null); setCamFilas([]); setCamPunoSinDividir(false)
    setChaqSelTipos(new Set()); setChaqRows([{ principal: '', rayas: [] }]); setChaqCants({}); setChaqDiseno(''); setChaqPrecios({}); setChaqImgs([]); setChaqEditIdx(null)
  }

  function limpiarTodo() {
    setCliente(''); setFecha(hoy()); setEstado('Pendiente'); setObs('')
    setTempCam([]); setTempChaq([])
    resetItemForms()
    borradorPendienteRef.current = false
    borrarBorrador()
    if (editPedido) onCancelEdit()
  }

  function toggleTipo(sec, tipo) {
    const setSel = sec === 'cam' ? setCamSelTipos : setChaqSelTipos
    setSel((prev) => {
      const n = new Set(prev)
      if (n.has(tipo)) n.delete(tipo); else n.add(tipo)
      return n
    })
  }

  // ====== CAMISETA: tabla tallas × (color × tipo) ======
  function camSetV(ri, key, v) {
    setCamCants((prev) => {
      const n = { ...prev, [ri]: { ...(prev[ri] || {}) } }
      const val = +v || 0
      if (val > 0) n[ri][key] = val; else delete n[ri][key]
      return n
    })
  }
  function camAddCol() { setCamCols((c) => [...c, { principal: '', rayas: [] }]) }
  function camDelCol(ci) {
    if (camCols.length <= 1) { showToast('⚠️', 'Debe haber al menos un color'); return }
    const tipos = ordenarTipos([...camSelTipos])
    setCamCols((cols) => cols.filter((_, i) => i !== ci))
    setCamCants((prev) => {
      const n = {}
      Object.keys(prev).forEach((ri) => {
        n[ri] = {}
        camCols.forEach((_, ni) => {
          if (ni === ci) return
          const newCi = ni > ci ? ni - 1 : ni
          tipos.forEach((t) => {
            const ok = `${ni}_${t}`, nk = `${newCi}_${t}`
            if ((prev[ri] || {})[ok] != null) n[ri][nk] = prev[ri][ok]
          })
        })
      })
      return n
    })
  }

  // ====== CHAQUETA: tabla colores × tipo ======
  function chaqSetV(ri, t, v) {
    setChaqCants((prev) => {
      const n = { ...prev, [ri]: { ...(prev[ri] || {}) } }
      const val = +v || 0
      if (val > 0) n[ri][t] = val; else delete n[ri][t]
      return n
    })
  }
  function chaqAddRow() { setChaqRows((r) => [...r, { principal: '', rayas: [] }]) }
  function chaqDelRow(ri) {
    if (chaqRows.length <= 1) { showToast('⚠️', 'Debe haber al menos un color'); return }
    setChaqRows((rows) => rows.filter((_, i) => i !== ri))
    setChaqCants((prev) => {
      const n = {}
      Object.entries(prev).forEach(([k, v]) => {
        const idx = +k
        if (idx === ri) return
        const newIdx = idx > ri ? idx - 1 : idx
        n[newIdx] = v
      })
      return n
    })
  }

  function handleImgs(e, sec) {
    const files = Array.from(e.target.files)
    files.forEach(async (f) => {
      // Se reduce la foto antes de guardarla (máx. 1200 px, JPEG calidad 0.75):
      // pasa de varios MB a ~100-200 KB sin que se note.
      const data = await comprimirFoto(f)
      if (sec === 'cam') setCamImgs((p) => [...p, data])
      else setChaqImgs((p) => [...p, data])
    })
  }

  function guardarItemCam() {
    const tipos = ordenarTipos([...camSelTipos])
    if (!tipos.length) { showToast('⚠️', 'Selecciona Puño y/o Cuello'); return }
    if (!camFilas.length && !camPunoSinDividir) { showToast('⚠️', 'Selecciona al menos una talla'); return }
    const cols = camCols.map((c, ci) => ({ nombre: nombreColor(c, ci), ci }))
    const tabla = {}
    let totalU = 0
    camFilas.map(etqTalla).forEach((talla) => {
      const ri = talla
      const tallaObj = {}
      cols.forEach(({ nombre, ci }) => {
        const colObj = {}
        tipos.forEach((t) => {
          const n = +(camCants[ri] || {})[`${ci}_${t}`] || 0
          if (n > 0) { colObj[t] = n; totalU += n }
        })
        if (Object.keys(colObj).length) tallaObj[nombre] = colObj
      })
      if (Object.keys(tallaObj).length) tabla[talla] = tallaObj
    })
    // Fila especial: puño sin dividir por talla (una sola cantidad para
    // varias tallas a la vez). Solo aplica al tipo "puno".
    if (camPunoSinDividir && tipos.includes('puno')) {
      const filaSD = {}
      cols.forEach(({ nombre, ci }) => {
        const n = +(camCants['SD'] || {})[`${ci}_puno`] || 0
        if (n > 0) { filaSD[nombre] = { puno: n }; totalU += n }
      })
      if (Object.keys(filaSD).length) tabla[TALLA_SIN_DIVIDIR] = filaSD
    }
    if (!totalU) { showToast('⚠️', 'Ingresa al menos una cantidad'); return }
    const esJuego = camEsJuego && tipos.length === 2 && tipos.includes('puno') && tipos.includes('cuello')
    const precios = {}
    if (esJuego) {
      const pj = parseFloat(camPrecios.juego) || 0
      // El mismo precio aplica a cada tipo
      tipos.forEach((t) => { precios[t] = pj })
      precios.juego = pj
    } else {
      tipos.forEach((t) => { precios[t] = parseFloat(camPrecios[t]) || 0 })
    }
    const totalPrecio = esJuego
      // El precio de juego se cobra UNA sola vez por cada cuello — los puños
      // de ese mismo juego ya están incluidos en ese precio, no se cobran aparte.
      ? Object.values(tabla).reduce((s, tallaObj) => s + Object.values(tallaObj).reduce((s2, colObj) => s2 + (colObj['cuello'] || 0), 0), 0) * precios.juego
      : tipos.reduce((s, t) => {
          const uT = Object.values(tabla).reduce((s2, tallaObj) => s2 + Object.values(tallaObj).reduce((s3, colObj) => s3 + (colObj[t] || 0), 0), 0)
          return s + uT * precios[t]
        }, 0)
    // Para un juego, "unidades" son los juegos (= cantidad de cuellos), no la
    // suma de cuellos + puños — eso triplicaría el conteo si cada juego trae
    // más de un puño.
    const totalUnidadesFinal = esJuego
      ? Object.values(tabla).reduce((s, tallaObj) => s + Object.values(tallaObj).reduce((s2, colObj) => s2 + (colObj['cuello'] || 0), 0), 0)
      : totalU
    // Guardamos el orden exacto de los colores tal como los escribiste.
    // Postgres (jsonb) no garantiza el orden de las llaves de un objeto,
    // así que sin esta lista el orden de columnas puede cambiar al recargar.
    const colores = cols.map((c) => c.nombre)
    const estadosPrevios = camEditIdx !== null ? (tempCam[camEditIdx]?.estados || {}) : {}
    const nuevoItem = { tipos, precios, es_juego: esJuego, diseno: camDiseno, imagenes: camImgs, tabla, colores, total_unidades: totalUnidadesFinal, total_precio: totalPrecio, estados: estadosPrevios }

    if (camEditIdx !== null) {
      setTempCam((prev) => prev.map((x, i) => (i === camEditIdx ? nuevoItem : x)))
      showToast('✅', 'Ítem actualizado')
    } else {
      setTempCam((prev) => [...prev, nuevoItem])
      showToast('✅', 'Ítem añadido al pedido')
    }
    resetItemForms()
  }

  // Reabre un ítem ya guardado (aún no persistido) en el formulario para corregirlo.
  function editarItemCam(idx) {
    const it = tempCam[idx]
    const tipos = it.tipos || []
    const colores = (it.colores && it.colores.length) ? it.colores : derivarColoresCam(it.tabla)
    const cants = {}
    tallasDeTabla(it.tabla).forEach((talla) => {
      const ri = talla
      const tallaObj = (it.tabla || {})[talla]
      if (!tallaObj) return
      colores.forEach((colorName, ci) => {
        const colObj = tallaObj[colorName]
        if (!colObj) return
        tipos.forEach((t) => {
          const n = colObj[t]
          if (n > 0) {
            if (!cants[ri]) cants[ri] = {}
            cants[ri][`${ci}_${t}`] = n
          }
        })
      })
    })
    // Reconstruir la fila especial de puño sin dividir, si el ítem la tiene.
    const filaSD = (it.tabla || {})[TALLA_SIN_DIVIDIR]
    if (filaSD) {
      colores.forEach((colorName, ci) => {
        const n = filaSD[colorName]?.puno
        if (n > 0) { if (!cants['SD']) cants['SD'] = {}; cants['SD'][`${ci}_puno`] = n }
      })
    }
    setCamSelTipos(new Set(tipos))
    setCamCols(colores.length ? colores.map(splitColorNombre) : [{ principal: '', rayas: [] }])
    setCamCants(cants)
    setCamDiseno(it.diseno || '')
    setCamPrecios(it.precios || {})
    setCamImgs(it.imagenes || [])
    setCamEsJuego(!!(it.precios && it.precios.juego))
    setCamPunoSinDividir(!!filaSD)
    setCamFilas(tallasDeTabla(it.tabla).map(partesTalla))
    setCamEditIdx(idx)
    setOpenCam(true)
  }

  function guardarItemChaq() {
    const tipos = ordenarTipos([...chaqSelTipos])
    if (!tipos.length) { showToast('⚠️', 'Selecciona Pretina, Cuello y/o Puño'); return }
    const rows = chaqRows.map((c, ri) => ({ nombre: nombreColor(c, ri), ri }))
    const tabla = {}
    let totalU = 0
    rows.forEach(({ nombre, ri }) => {
      const rowObj = {}
      tipos.forEach((t) => {
        const n = +(chaqCants[ri] || {})[t] || 0
        if (n > 0) { rowObj[t] = n; totalU += n }
      })
      if (Object.keys(rowObj).length) tabla[nombre] = rowObj
    })
    if (!totalU) { showToast('⚠️', 'Ingresa al menos una cantidad'); return }
    const precios = {}
    tipos.forEach((t) => { precios[t] = parseFloat(chaqPrecios[t]) || 0 })
    const colores = rows.map((r) => r.nombre)

    // Si el ítem que se edita ya tenía un peso registrado, lo conservamos y
    // recalculamos el total con el precio actual (por si también lo cambiaste).
    let kilosReales = null, totalFinal = null, estadosPrevios = {}
    if (chaqEditIdx !== null) {
      const anterior = tempChaq[chaqEditIdx]
      estadosPrevios = anterior?.estados || {}
      if (anterior?.kilos_reales != null) {
        kilosReales = anterior.kilos_reales
        totalFinal = kilosReales * (precios[tipos[0]] || 0)
      }
    }

    const nuevoItem = { tipos, precios, diseno: chaqDiseno, imagenes: chaqImgs, tabla, colores, total_unidades: totalU, kilos_reales: kilosReales, total_final: totalFinal, estados: estadosPrevios }

    if (chaqEditIdx !== null) {
      setTempChaq((prev) => prev.map((x, i) => (i === chaqEditIdx ? nuevoItem : x)))
      showToast('✅', 'Ítem actualizado')
    } else {
      setTempChaq((prev) => [...prev, nuevoItem])
      showToast('✅', 'Ítem añadido al pedido')
    }
    resetItemForms()
  }

  function editarItemChaq(idx) {
    const it = tempChaq[idx]
    const tipos = it.tipos || []
    const colores = (it.colores && it.colores.length) ? it.colores : Object.keys(it.tabla || {})
    const cants = {}
    colores.forEach((colorName, ri) => {
      const rowObj = (it.tabla || {})[colorName]
      if (!rowObj) return
      tipos.forEach((t) => {
        const n = rowObj[t]
        if (n > 0) { if (!cants[ri]) cants[ri] = {}; cants[ri][t] = n }
      })
    })
    setChaqSelTipos(new Set(tipos))
    setChaqRows(colores.length ? colores.map(splitColorNombre) : [{ principal: '', rayas: [] }])
    setChaqCants(cants)
    setChaqDiseno(it.diseno || '')
    setChaqPrecios(it.precios || {})
    setChaqImgs(it.imagenes || [])
    setChaqEditIdx(idx)
    setOpenChaq(true)
  }

  async function guardarPedido() {
    if (!cliente.trim()) { showToast('⚠️', 'Ingresa el nombre del cliente'); return }
    if (!fecha) { showToast('⚠️', 'Selecciona la fecha'); return }
    if (!tempCam.length && !tempChaq.length) { showToast('⚠️', 'Añade al menos un ítem'); return }

    setSaving(true)
    const totCam = tempCam.reduce((s, it) => s + it.total_precio, 0)
    const hayChaq = tempChaq.length > 0

    try {
      let pedidoId
      if (editPedido) {
        pedidoId = editPedido.id
        const { error } = await supabase.from('pedidos').update({
          cliente: cliente.trim(), fecha, estado, observaciones: obs.trim(),
          total_camiseta: totCam, hay_chaqueta: hayChaq,
          total_final: hayChaq ? null : totCam,
          actualizado_en: new Date().toISOString(),
        }).eq('id', pedidoId)
        if (error) throw error
        // Borrar items anteriores y reinsertar
        await supabase.from('items_camiseta').delete().eq('pedido_id', pedidoId)
        await supabase.from('items_chaqueta').delete().eq('pedido_id', pedidoId)
      } else {
        const { data, error } = await supabase.from('pedidos').insert({
          numero: numPedido, cliente: cliente.trim(), fecha, estado, observaciones: obs.trim(),
          total_camiseta: totCam, hay_chaqueta: hayChaq,
          total_final: hayChaq ? null : totCam,
          creado_por: userId,
        }).select().single()
        if (error) throw error
        pedidoId = data.id
      }

      if (tempCam.length) {
        const rows = tempCam.map((it) => ({
          pedido_id: pedidoId, tipos: it.tipos, precios: it.precios, diseno: it.diseno,
          imagenes: it.imagenes, tabla: it.tabla, colores: it.colores || [], total_unidades: it.total_unidades,
          total_precio: it.total_precio, estados: it.estados || {},
        }))
        const { error } = await supabase.from('items_camiseta').insert(rows)
        if (error) throw error
      }
      if (tempChaq.length) {
        const rows = tempChaq.map((it) => ({
          pedido_id: pedidoId, tipos: it.tipos, precios: it.precios, diseno: it.diseno,
          imagenes: it.imagenes, tabla: it.tabla, colores: it.colores || [], total_unidades: it.total_unidades,
          kilos_reales: it.kilos_reales, total_final: it.total_final, estados: it.estados || {},
        }))
        const { error } = await supabase.from('items_chaqueta').insert(rows)
        if (error) throw error
      }

      limpiarTodo()
      onSaved()
    } catch (err) {
      showToast('⚠️', 'Error al guardar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const totalCam = tempCam.reduce((s, it) => s + it.total_precio, 0)
  const hayItemsTemp = tempCam.length > 0 || tempChaq.length > 0
  // Nombres de clientes que ya han pedido antes, para sugerirlos al escribir
  // en el campo Cliente — así no hay que recordar cómo se escribió cada vez.
  const clientesExistentes = [...new Set((pedidos || []).map((p) => p.cliente).filter(Boolean))].sort()
  const sugerenciasCliente = cliente.trim()
    ? clientesExistentes.filter((c) => c.toLowerCase().includes(cliente.trim().toLowerCase()) && c !== cliente).slice(0, 8)
    : clientesExistentes.slice(0, 8)

  return (
    <div className="card">
      <div className="ctitle">{editPedido ? `Editando Pedido ${editPedido.numero}` : 'Registrar Nuevo Pedido'}</div>

      {borradorDetectado && (
        <div style={{ background: 'var(--jbg)', border: '1px solid var(--jbd)', borderRadius: 9, padding: '12px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13 }}>
            <strong>📋 Tienes un borrador sin terminar</strong>
            <div style={{ fontSize: 12, color: 'var(--jtx)', marginTop: 3 }}>
              {borradorDetectado.cliente ? `Cliente: ${borradorDetectado.cliente} · ` : ''}
              {(borradorDetectado.tempCam?.length || 0) + (borradorDetectado.tempChaq?.length || 0)} ítem(s) añadido(s).
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="btn btn-s btn-sm" onClick={descartarBorrador}>Descartar</button>
            <button className="btn btn-p btn-sm" onClick={recuperarBorrador}>Recuperar</button>
          </div>
        </div>
      )}

      <div className="g5" style={{ marginBottom: 20 }}>
        <div className="fld"><label>N° Pedido</label><input className="rinp" readOnly value={numPedido} /></div>
        <div className="fld" ref={cajaClienteRef} style={{ position: 'relative' }}>
          <label>Cliente *</label>
          <input
            value={cliente}
            onChange={(e) => { setCliente(e.target.value); setSugerenciasAbiertas(true) }}
            onFocus={() => setSugerenciasAbiertas(true)}
            placeholder="Nombre del cliente"
            autoComplete="off"
          />
          {sugerenciasAbiertas && sugerenciasCliente.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, maxHeight: 200, overflowY: 'auto', boxShadow: '0 6px 20px rgba(0,0,0,.15)' }}>
              {sugerenciasCliente.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setCliente(c); setSugerenciasAbiertas(false) }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13 }}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="fld"><label>Fecha *</label><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
        <div className="fld">
          <label>Estado</label>
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            {ESTADOS.map((es) => <option key={es} value={es}>{ESTADO_ICON[es]} {es}</option>)}
          </select>
        </div>
        <div className="fld"><label>Observaciones</label><input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Notas generales..." /></div>
      </div>

      {/* CAMISETA */}
      <div className="sec sec-cam">
        <div className="sec-hdr" onClick={() => setOpenCam((o) => !o)}>
          <div className="sec-title">👔 Camiseta <span className="sbadge sb-cam">Puño · Cuello · por unidad</span></div>
          <span className={`sarrow ${openCam ? 'open' : ''}`}>▾</span>
        </div>
        <div className={`sec-body ${openCam ? 'open' : ''}`}>
          {tempCam.map((it, i) => (
            <ItemCardCam key={i} it={it} onDelete={() => setTempCam((p) => p.filter((_, idx) => idx !== i))} onEdit={() => editarItemCam(i)} showToast={showToast} />
          ))}

          <div style={{ marginBottom: 6, fontSize: 11, color: 'var(--muted)', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Selecciona qué añadir:
          </div>
          <div className="tipo-toggles">
            {TIPOS_CAM.map((t) => (
              <div key={t} className={`ttog ${camSelTipos.has(t) ? 'sel-cam' : ''}`} onClick={() => toggleTipo('cam', t)}>
                <span className="chk">{camSelTipos.has(t) ? '✓' : ''}</span>
                <IconoPrenda tipo={t} prenda="cam" /> {TIPO_LABEL[t]}
              </div>
            ))}
          </div>

          {camSelTipos.size > 0 && (
            <FormularioCam
              tipos={ordenarTipos([...camSelTipos])}
              cols={camCols} cants={camCants} diseno={camDiseno} precios={camPrecios} imgs={camImgs}
              setDiseno={setCamDiseno} setPrecios={setCamPrecios}
              setV={camSetV} setCants={setCamCants} addCol={camAddCol} delCol={camDelCol}
              setCols={setCamCols}
              esJuego={camEsJuego} setEsJuego={setCamEsJuego}
              filas={camFilas} setFilas={setCamFilas}
              editando={camEditIdx !== null}
              punoSinDividir={camPunoSinDividir} setPunoSinDividir={setCamPunoSinDividir}
              onImgs={(e) => handleImgs(e, 'cam')}
              onDelImg={(i) => setCamImgs((p) => p.filter((_, idx) => idx !== i))}
              onCancel={resetItemForms}
              onSave={guardarItemCam}
              showToast={showToast}
            />
          )}
        </div>
      </div>

      {/* CHAQUETA */}
      <div className="sec sec-chaq">
        <div className="sec-hdr" onClick={() => setOpenChaq((o) => !o)}>
          <div className="sec-title">🧥 Chaqueta <span className="sbadge sb-chaq">Pretina · Cuello · Puño · por kilo</span></div>
          <span className={`sarrow ${openChaq ? 'open' : ''}`}>▾</span>
        </div>
        <div className={`sec-body ${openChaq ? 'open' : ''}`}>
          <div className="alerta">
            <span style={{ fontSize: 15, flexShrink: 0 }}>⚖️</span>
            <span>Total al entregar cuando se pesa. Se registran cantidades por color y precio por kilo.</span>
          </div>

          {tempChaq.map((it, i) => (
            <ItemCardChaq key={i} it={it} onDelete={() => setTempChaq((p) => p.filter((_, idx) => idx !== i))} onEdit={() => editarItemChaq(i)} showToast={showToast} />
          ))}

          <div style={{ marginBottom: 6, fontSize: 11, color: 'var(--muted)', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Selecciona qué añadir:
          </div>
          <div className="tipo-toggles">
            {TIPOS_CHAQ.map((t) => (
              <div key={t} className={`ttog ${chaqSelTipos.has(t) ? 'sel-chaq' : ''}`} onClick={() => toggleTipo('chaq', t)}>
                <span className="chk">{chaqSelTipos.has(t) ? '✓' : ''}</span>
                <IconoPrenda tipo={t} prenda="chaq" /> {TIPO_LABEL[t]}
              </div>
            ))}
          </div>

          {chaqSelTipos.size > 0 && (
            <FormularioChaq
              tipos={ordenarTipos([...chaqSelTipos])}
              rows={chaqRows} cants={chaqCants} diseno={chaqDiseno} precios={chaqPrecios} imgs={chaqImgs}
              setDiseno={setChaqDiseno} setPrecios={setChaqPrecios}
              setV={chaqSetV} addRow={chaqAddRow} delRow={chaqDelRow}
              setRows={setChaqRows}
              onImgs={(e) => handleImgs(e, 'chaq')}
              onDelImg={(i) => setChaqImgs((p) => p.filter((_, idx) => idx !== i))}
              onCancel={resetItemForms}
              onSave={guardarItemChaq}
              showToast={showToast}
            />
          )}
        </div>
      </div>

      {hayItemsTemp && (
        <div className="total-bar">
          <span className="tb-lbl">Total del Pedido</span>
          <span className="tb-val">
            {fmtCOP(totalCam)}
            {tempChaq.length > 0 && <span className="tb-sub">+ chaqueta (pendiente de pesaje)</span>}
          </span>
        </div>
      )}

      <div className="brow right">
        <button className="btn btn-s" onClick={limpiarTodo}>Limpiar todo</button>
        <button className="btn btn-p" onClick={guardarPedido} disabled={saving}>
          {saving ? 'Guardando…' : '💾 Guardar Pedido'}
        </button>
      </div>
    </div>
  )
}

// ====== Subcomponentes ======

function ItemCardCam({ it, onDelete, onEdit, showToast }) {
  // Usamos el orden guardado explícitamente (it.colores). Si el ítem es viejo
  // y no lo tiene, lo reconstruimos como respaldo (puede no coincidir con el
  // orden original porque Postgres no preserva el orden de un objeto jsonb).
  const colsPresentes = (it.colores && it.colores.length) ? it.colores : derivarColoresCam(it.tabla)
  const tallasPresentes = tallasDeTabla(it.tabla)
  if (it.tabla && it.tabla[TALLA_SIN_DIVIDIR]) tallasPresentes.push(TALLA_SIN_DIVIDIR)
  return (
    <div className="iblk cam">
      <div className="iblk-hdr">
        <div className="iblk-label">
          <InsigniaTipos tipos={it.tipos} prenda="cam" extra="— Camiseta" />
          {(it.es_juego || it.precios?.juego) && <InsigniaJuego precio={fmtCOP(it.precios.juego || 0)} />}
          {it.diseno && <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{it.diseno}</span>}
        </div>
        <div className="iblk-meta">
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: "'DM Mono', monospace" }}>{it.total_unidades}u · {fmtCOP(it.total_precio)}</span>
          <span className="itot">{fmtCOP(it.total_precio)}</span>
          <button className="btn btn-s btn-sm" title="Editar ítem" onClick={onEdit}>✏️</button>
          <button className="btn btn-d btn-sm" onClick={onDelete}>✕</button>
        </div>
      </div>
      <div className="iblk-body">
        <div className="tscroll cam-scroll">
          <table className="tg">
            <thead><tr><th className="th-l">Talla</th>{colsPresentes.map((c) => <th key={c}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><ColorSwatch nombre={c} /><span>{c}</span><FormulaColorBoton nombreColor={c} showToast={showToast} /></div></th>)}<th>Total</th></tr></thead>
            <tbody>
              {tallasPresentes.map((talla) => {
                const tallaObj = it.tabla[talla]
                const tot = colsPresentes.reduce((s, c) => s + ((tallaObj[c] && Object.values(tallaObj[c]).reduce((a, b) => a + b, 0)) || 0), 0)
                return (
                  <tr key={talla}>
                    <td className="td-key cam">{talla}</td>
                    {colsPresentes.map((c) => {
                      const colObj = tallaObj[c]
                      const sum = colObj ? Object.values(colObj).reduce((a, b) => a + b, 0) : 0
                      return <td key={c} style={{ textAlign: 'center', fontFamily: "'DM Mono', monospace" }}>{sum || ''}</td>
                    })}
                    <td className="td-tot-end cam">{tot}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {it.imagenes?.length > 0 && (
          <div className="item-imgs">{it.imagenes.map((s, i) => <img key={i} className="item-img" src={s} alt="" />)}</div>
        )}
        {(() => {
          const { cuello, puno } = totalesPorTipoCam(it.tabla)
          const esJuego = it.es_juego || it.precios?.juego
          return (
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: 11, color: 'var(--muted)', fontFamily: "'DM Mono', monospace" }}>
              {esJuego ? (
                <span className="np-tot-ico"><IconoPrenda tipo="cuello" prenda="cam" /><IconoPrenda tipo="puno" prenda="cam" />Total de juegos (cuellos): <strong style={{ color: 'var(--ink)' }}>{cuello}</strong>{puno > 0 && ` · +${puno} puños incluidos`}</span>
              ) : (
                <>
                  {cuello > 0 && <span className="np-tot-ico"><IconoPrenda tipo="cuello" prenda="cam" />Total cuellos: <strong style={{ color: 'var(--ink)' }}>{cuello}</strong></span>}
                  {puno > 0 && <span className="np-tot-ico"><IconoPrenda tipo="puno" prenda="cam" />Total puños: <strong style={{ color: 'var(--ink)' }}>{puno}</strong></span>}
                </>
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )
}

function derivarColoresCam(tabla) {
  const list = []
  Object.values(tabla || {}).forEach((tallaObj) => {
    Object.keys(tallaObj).forEach((c) => { if (!list.includes(c)) list.push(c) })
  })
  return list
}

function ItemCardChaq({ it, onDelete, onEdit, showToast }) {
  const coloresPresentes = ((it.colores && it.colores.length) ? it.colores : Object.keys(it.tabla || {})).filter((c) => it.tabla && it.tabla[c])
  return (
    <div className="iblk chaq">
      <div className="iblk-hdr">
        <div className="iblk-label">
          <InsigniaTipos tipos={it.tipos} prenda="chaq" extra="— Chaqueta" />
          {it.diseno && <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{it.diseno}</span>}
        </div>
        <div className="iblk-meta">
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: "'DM Mono', monospace" }}>
            {it.tipos.map((t) => `${TIPO_LABEL[t]}: ${fmtCOP(it.precios[t])}/kg`).join(' · ')}
          </span>
          <span className={`itot ${it.kilos_reales ? '' : 'pend'}`}>{it.kilos_reales ? `✅ ${fmtCOP(it.total_final)}` : '⚖️ Pendiente'}</span>
          <button className="btn btn-s btn-sm" title="Editar ítem" onClick={onEdit}>✏️</button>
          <button className="btn btn-d btn-sm" onClick={onDelete}>✕</button>
        </div>
      </div>
      <div className="iblk-body">
        <div className="tscroll chaq-scroll">
          <table className="tg">
            <thead><tr><th className="th-l">Color</th>{it.tipos.map((t) => <th key={t}>{TIPO_LABEL[t]}</th>)}<th>Total</th></tr></thead>
            <tbody>
              {coloresPresentes.map((color) => {
                const rowObj = it.tabla[color]
                const tot = it.tipos.reduce((s, t) => s + (rowObj[t] || 0), 0)
                return (
                  <tr key={color}>
                    <td className="td-key chaq"><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><ColorSwatch nombre={color} /><span>{color}</span><FormulaColorBoton nombreColor={color} showToast={showToast} /></div></td>
                    {it.tipos.map((t) => <td key={t} style={{ textAlign: 'center', fontFamily: "'DM Mono', monospace" }}>{rowObj[t] || ''}</td>)}
                    <td className="td-tot-end chaq">{tot}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {it.imagenes?.length > 0 && (
          <div className="item-imgs">{it.imagenes.map((s, i) => <img key={i} className="item-img" src={s} alt="" />)}</div>
        )}
      </div>
    </div>
  )
}

// Formulario de un ítem de camiseta: precios, diseño, fotos y la tabla de
// tallas × colores. Las tallas se eligen tocando botones; para unir dos o más
// tallas seguidas (ej. M y L) se marcan en la tabla y se toca "Unir". Las
// cantidades de las tallas unidas se suman en la nueva fila.
function FormularioCam({ tipos, cols, cants, diseno, precios, imgs, setDiseno, setPrecios, setV, setCants, addCol, delCol, setCols, onImgs, onDelImg, onCancel, onSave, esJuego, setEsJuego, filas, setFilas, editando, showToast, punoSinDividir, setPunoSinDividir }) {
  const puedeSerJuego = tipos.length === 2 && tipos.includes('puno') && tipos.includes('cuello')
  const juego = esJuego && puedeSerJuego
  const psd = punoSinDividir && tipos.includes('puno')
  const [marcadas, setMarcadas] = useState(() => new Set())
  const [curvaAbierta, setCurvaAbierta] = useState(false)
  const [curvaTotal, setCurvaTotal] = useState('')
  const [curvaProp, setCurvaProp] = useState({})
  const etiquetas = filas.map(etqTalla)
  const val = (k, key) => +((cants[k] || {})[key]) || 0
  const ordenar = (lista) => [...lista].sort((a, b) => ordenTalla(etqTalla(a)) - ordenTalla(etqTalla(b)))

  function tocarTalla(t) {
    const f = filas.find((x) => x.includes(t))
    if (f && f.length > 1) { showToast('ℹ️', `La ${t} está unida en ${etqTalla(f)}. Sepárala primero.`); return }
    if (f) {
      setFilas(filas.filter((x) => x !== f))
      setCants((prev) => { const n = { ...prev }; delete n[t]; return n })
    } else {
      setFilas(ordenar([...filas, [t]]))
    }
    setMarcadas(new Set())
  }
  function ninoEnPares() {
    const pares = [['2', '4'], ['6', '8'], ['10', '12'], ['14', '16']]
    setFilas(ordenar([...filas.filter((f) => !f.some((t) => TALLAS_NINO.includes(t))), ...pares]))
    setMarcadas(new Set())
  }
  function adultoSaXL() {
    const usadas = new Set(filas.flat())
    setFilas(ordenar([...filas, ...['S', 'M', 'L', 'XL'].filter((t) => !usadas.has(t)).map((t) => [t])]))
  }

  // Unir: solo tallas que van seguidas en la tabla
  const selUnir = filas.filter((f) => marcadas.has(etqTalla(f)))
  const idxUnir = selUnir.map((f) => filas.indexOf(f))
  const seguidas = idxUnir.every((v, i) => !i || v === idxUnir[i - 1] + 1)
  function unir() {
    if (selUnir.length < 2 || !seguidas) return
    const nueva = selUnir.flat()
    const kNueva = etqTalla(nueva)
    setCants((prev) => {
      const n = { ...prev }
      const suma = {}
      selUnir.forEach((f) => {
        const k = etqTalla(f)
        Object.entries(prev[k] || {}).forEach(([key, v]) => { suma[key] = (suma[key] || 0) + (+v || 0) })
        delete n[k]
      })
      n[kNueva] = suma
      return n
    })
    const i = filas.indexOf(selUnir[0])
    const resto = filas.filter((f) => !selUnir.includes(f))
    resto.splice(i, 0, nueva)
    setFilas(resto)
    setMarcadas(new Set())
  }
  function separar(f) {
    const k = etqTalla(f)
    setCants((prev) => { const n = { ...prev }; n[f[0]] = prev[k] || {}; delete n[k]; return n })
    const i = filas.indexOf(f)
    const nuevas = [...filas]
    nuevas.splice(i, 1, ...f.map((t) => [t]))
    setFilas(nuevas)
    setMarcadas(new Set())
  }
  function marcar(k, on) {
    setMarcadas((prev) => { const n = new Set(prev); if (on) n.add(k); else n.delete(k); return n })
  }

  function copiarPrimerColor() {
    if (cols.length < 2) { showToast('ℹ️', 'Agrega otro color para copiarle las cantidades'); return }
    setCants((prev) => {
      const n = { ...prev }
      Object.keys(n).forEach((k) => {
        const fila = { ...n[k] }
        for (let ci = 1; ci < cols.length; ci++) tipos.forEach((t) => {
          const v = fila[`0_${t}`]
          if (v) fila[`${ci}_${t}`] = v; else delete fila[`${ci}_${t}`]
        })
        n[k] = fila
      })
      return n
    })
    showToast('📋', 'Cantidades copiadas a todos los colores')
  }

  // Curva: reparte una cantidad por color entre las tallas según una proporción (ej. 1-2-2-1)
  const tipoCurva = tipos.includes('cuello') ? 'cuello' : tipos[0]
  function propDe(f) { const k = etqTalla(f); return curvaProp[k] != null ? curvaProp[k] : String(f.length) }
  function repartir() {
    const total = parseInt(curvaTotal, 10) || 0
    if (!total || !filas.length) { showToast('⚠️', 'Escribe la cantidad y elige tallas'); return }
    const pr = filas.map((f) => parseFloat(propDe(f)) || 0)
    const suma = pr.reduce((a, b) => a + b, 0)
    if (!suma) { showToast('⚠️', 'La proporción no puede ser cero'); return }
    const rep = pr.map((p) => Math.floor((total * p) / suma))
    rep[pr.indexOf(Math.max(...pr))] += total - rep.reduce((a, b) => a + b, 0)
    setCants((prev) => {
      const n = { ...prev }
      filas.forEach((f, i) => {
        const k = etqTalla(f)
        const fila = { ...(n[k] || {}) }
        cols.forEach((_, ci) => { if (rep[i] > 0) fila[`${ci}_${tipoCurva}`] = rep[i]; else delete fila[`${ci}_${tipoCurva}`] })
        n[k] = fila
      })
      return n
    })
    showToast('✅', `Repartido: ${filas.map((f, i) => `${etqTalla(f)} ${rep[i]}`).join(' · ')} por color`)
  }

  // Enter baja a la siguiente talla del mismo color y tipo
  function alTeclear(e) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const col = e.target.dataset.col
    const todos = [...document.querySelectorAll(`.tt input[data-col="${col}"]`)]
    const sig = todos[todos.indexOf(e.target) + 1] || todos[0]
    sig?.focus(); sig?.select?.()
  }

  // Totales
  const filasSuma = [...etiquetas, ...(psd ? ['SD'] : [])]
  const totCol = (ci, t) => filasSuma.reduce((s, k) => s + (k === 'SD' && t !== 'puno' ? 0 : val(k, `${ci}_${t}`)), 0)
  const totFila = (k) => cols.reduce((s, _, ci) => s + tipos.reduce((s2, t) => s2 + val(k, `${ci}_${t}`), 0), 0)
  const totTipo = (t) => cols.reduce((s, _, ci) => s + totCol(ci, t), 0)
  const gran = tipos.reduce((s, t) => s + totTipo(t), 0)
  const precioN = (t) => parseFloat(juego ? precios.juego : precios[t]) || 0
  const valor = juego ? totTipo('cuello') * precioN('cuello') : tipos.reduce((s, t) => s + totTipo(t) * precioN(t), 0)

  const celda = (k, ci, t) => {
    if (psd && t === 'puno' && k !== 'SD') return <td key={`${ci}_${t}`} className="na">—</td>
    if (k === 'SD' && t !== 'puno') return <td key={`${ci}_${t}`} className="na">—</td>
    const key = `${ci}_${t}`
    const v = (cants[k] || {})[key] || ''
    return (
      <td key={key}>
        <input type="number" min="0" inputMode="numeric" value={v} placeholder="—" className={v ? 'con' : ''}
          data-col={key} onKeyDown={alTeclear} onChange={(e) => setV(k, key, e.target.value)}
          aria-label={`${k === 'SD' ? 'Puño sin dividir' : 'Talla ' + k}, ${nombreColor(cols[ci], ci)}, ${TIPO_LABEL[t]}`} />
      </td>
    )
  }

  const chipTalla = (t) => {
    const f = filas.find((x) => x.includes(t))
    const cls = !f ? '' : f.length > 1 ? 'parte' : 'on'
    return <button key={t} type="button" className={`tchip ${cls}`} onClick={() => tocarTalla(t)} title={f && f.length > 1 ? `Unida en ${etqTalla(f)}` : ''}>{t}</button>
  }

  return (
    <div className="ed">
      <div className="ed-cab">
        <div className="ed-tit">
          <span className="ed-num">{editando ? 'Editando ítem' : 'Nuevo ítem'}</span>
          <InsigniaTipos tipos={tipos} prenda="cam" extra="camiseta" />
        </div>
        {puedeSerJuego && (
          <label className="ed-juego" title="Se cobra una vez por cada cuello; los puños de ese juego van incluidos">
            <input type="checkbox" checked={esJuego} onChange={(e) => setEsJuego(e.target.checked)} /> Cobrar como juego
          </label>
        )}
      </div>

      <div className="ed-precios">
        {juego ? (
          <label className="ed-precio">
            <span><IconoPrenda tipo="cuello" prenda="cam" /><IconoPrenda tipo="puno" prenda="cam" />Precio del juego</span>
            <span className="pre"><b>$</b><input type="number" step="1" min="0" placeholder="2600" value={precios.juego || ''} onChange={(e) => setPrecios((p) => ({ ...p, juego: e.target.value }))} /><small>por juego</small></span>
          </label>
        ) : tipos.map((t) => (
          <label className="ed-precio" key={t}>
            <span><IconoPrenda tipo={t} prenda="cam" />Precio {TIPO_LABEL[t].toLowerCase()}</span>
            <span className="pre"><b>$</b><input type="number" step="1" min="0" placeholder={t === 'cuello' ? '1500' : '700'} value={precios[t] || ''} onChange={(e) => setPrecios((p) => ({ ...p, [t]: e.target.value }))} /><small>c/u</small></span>
          </label>
        ))}
        {juego && <span className="ed-nota">Se cobra una vez por cada cuello; los puños de ese juego van incluidos.</span>}
      </div>

      <div className="ed-fila">
        <div className="fld ed-dis">
          <label>Diseño o referencia</label>
          <textarea value={diseno} onChange={(e) => setDiseno(e.target.value)} placeholder="Referencia del cliente, tipo de tejido, medidas…" rows={2} />
        </div>
        <div className="ed-fotos">
          {imgs.map((src, i) => (
            <div className="img-thumb" key={i}>
              <img src={src} alt="" />
              <button className="img-thumb-del" onClick={() => onDelImg(i)} aria-label="Quitar foto">✕</button>
            </div>
          ))}
          <label className="ed-foto-add" title="Agregar fotos (se comprimen solas)">
            <input type="file" accept="image/*" multiple onChange={onImgs} />
            <span>+ Foto</span>
          </label>
        </div>
      </div>

      <div className="ed-sec">
        <div className="ed-sec-h">
          <h3>Tallas</h3>
          <span>Toca las tallas que lleva. Para unir dos o más, márcalas en la tabla y toca <b>Unir</b>.</span>
        </div>
        <div className="tallas-sel">
          <div className="tgrupo"><span className="tg-l">Niño</span><div className="tchips">{TALLAS_NINO.map(chipTalla)}</div></div>
          <div className="tgrupo"><span className="tg-l">Adulto</span><div className="tchips">{TALLAS_ADULTO.map(chipTalla)}</div></div>
          <div className="tg-atajos">
            <button type="button" className="lp-btn" onClick={ninoEnPares}>Niño en pares (2-4, 6-8…)</button>
            <button type="button" className="lp-btn" onClick={adultoSaXL}>Adulto S a XL</button>
          </div>
        </div>
      </div>

      {selUnir.length >= 2 && (
        <div className="unir-barra">
          <span>{seguidas ? `Unir ${selUnir.map(etqTalla).join(' + ')} en una sola talla: ${etqTalla(selUnir.flat())}` : 'Solo se pueden unir tallas que van seguidas.'}</span>
          <button type="button" className="btn btn-p btn-sm" disabled={!seguidas} onClick={unir}>Unir</button>
          <button type="button" className="unir-cancelar" onClick={() => setMarcadas(new Set())}>Cancelar</button>
        </div>
      )}

      {!filas.length && !psd ? (
        <div className="ed-vacio">Toca arriba las tallas que lleva este ítem.</div>
      ) : (
        <div className="tt-scroll">
          <table className="tt">
            <thead>
              <tr>
                <th rowSpan={2} className="tt-talla">Talla</th>
                {cols.map((c, ci) => (
                  <th key={ci} colSpan={tipos.length} className="tt-color">
                    <div className="tt-colh">
                      <ColorSwatch nombre={nombreColor(c, ci)} size={13} />
                      <input className="tt-colinp" value={c.principal} placeholder={`Color ${ci + 1}`}
                        onChange={(e) => setCols((prev) => prev.map((x, i) => (i === ci ? { ...x, principal: e.target.value } : x)))} />
                      <FormulaColorBoton nombreColor={nombreColor(c, ci)} showToast={showToast} />
                      {cols.length > 1 && <button type="button" className="tt-x" onClick={() => delCol(ci)} aria-label="Quitar color">×</button>}
                    </div>
                    {(c.rayas || []).map((raya, ridx) => (
                      <div key={ridx} className="tt-raya">
                        <span>raya {ridx + 1}</span>
                        <input className="tt-colinp" value={raya} placeholder="color"
                          onChange={(e) => setCols((prev) => prev.map((x, i) => {
                            if (i !== ci) return x
                            const nr = [...(x.rayas || [])]; nr[ridx] = e.target.value
                            return { ...x, rayas: nr }
                          }))} />
                        <button type="button" className="tt-x" aria-label="Quitar raya" onClick={() => setCols((prev) => prev.map((x, i) => (i !== ci ? x : { ...x, rayas: (x.rayas || []).filter((_, k) => k !== ridx) })))}>×</button>
                      </div>
                    ))}
                    <button type="button" className="tt-addraya" onClick={() => setCols((prev) => prev.map((x, i) => (i === ci ? { ...x, rayas: [...(x.rayas || []), ''] } : x)))}>+ raya</button>
                  </th>
                ))}
                <th rowSpan={2} className="tt-add"><button type="button" onClick={addCol}>+ Color</button></th>
                <th rowSpan={2} className="tt-tot">Total</th>
              </tr>
              <tr>
                {cols.map((_, ci) => tipos.map((t) => (
                  <th key={`${ci}_${t}`} className={`tt-sub ${t === tipos[0] ? 'ini' : ''}`}><IconoPrenda tipo={t} prenda="cam" />{TIPO_LABEL[t]}</th>
                )))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const k = etqTalla(f)
                const unida = f.length > 1
                return (
                  <tr key={k}>
                    <td className="tt-talla">
                      <span className="tsel">
                        <input type="checkbox" checked={marcadas.has(k)} onChange={(e) => marcar(k, e.target.checked)} aria-label={`Marcar ${k} para unir`} />
                        <span className="tl">{k}</span>
                        {unida && <><span className="unida">unida</span><button type="button" className="separar" onClick={() => separar(f)}>Separar</button></>}
                      </span>
                    </td>
                    {cols.map((_, ci) => tipos.map((t) => celda(k, ci, t)))}
                    <td></td>
                    <td className="tt-tot">{totFila(k) || ''}</td>
                  </tr>
                )
              })}
              {psd && (
                <tr className="tt-psd">
                  <td className="tt-talla"><span className="tsel"><span className="tl">Puño, una sola cantidad</span></span></td>
                  {cols.map((_, ci) => tipos.map((t) => celda('SD', ci, t)))}
                  <td></td>
                  <td className="tt-tot">{totFila('SD') || ''}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td className="tt-talla">Total</td>
                {cols.map((_, ci) => tipos.map((t) => <td key={`${ci}_${t}`}>{totCol(ci, t) || ''}</td>))}
                <td></td>
                <td className="tt-tot">{gran || ''}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="ed-herr">
        {tipos.includes('puno') && (
          <label className="ed-juego"><input type="checkbox" checked={punoSinDividir} onChange={(e) => setPunoSinDividir(e.target.checked)} /> Puño en una sola cantidad (sin dividir por talla)</label>
        )}
        <span className="ed-sep" />
        <button type="button" className="lp-btn" onClick={copiarPrimerColor}>Copiar el primer color a los demás</button>
        <button type="button" className="lp-btn" onClick={() => setCurvaAbierta((v) => !v)}>Repartir por curva</button>
      </div>
      {curvaAbierta && (
        <div className="ed-curva">
          <div className="ed-curva-t"><b>Repartir por curva.</b> Escribe cuántos {TIPO_LABEL[tipoCurva].toLowerCase()}s lleva cada color y en qué proporción se reparten entre tallas. Ejemplo: 1-2-2-1 pone el doble en M y L.</div>
          {filas.length ? (
            <div className="ed-curva-f">
              <div className="fld"><label>{TIPO_LABEL[tipoCurva]}s por color</label><input type="number" min="0" value={curvaTotal} onChange={(e) => setCurvaTotal(e.target.value)} placeholder="60" style={{ width: 110 }} /></div>
              <div className="ed-curva-prop">
                {filas.map((f) => {
                  const k = etqTalla(f)
                  return <label key={k}><span>{k}</span><input type="number" min="0" value={propDe(f)} onChange={(e) => setCurvaProp((p) => ({ ...p, [k]: e.target.value }))} /></label>
                })}
              </div>
              <button type="button" className="btn btn-p btn-sm" onClick={repartir}>Repartir</button>
            </div>
          ) : <div className="ed-curva-t">Primero elige las tallas.</div>}
        </div>
      )}

      {gran > 0 && (
        <div className="ed-resumen">
          {juego ? (
            <span><IconoPrenda tipo="cuello" prenda="cam" /><IconoPrenda tipo="puno" prenda="cam" /><b>{totTipo('cuello')}</b> juegos{totTipo('puno') > 0 && <em> · {totTipo('puno')} puños incluidos</em>}</span>
          ) : tipos.map((t) => <span key={t}><IconoPrenda tipo={t} prenda="cam" /><b>{totTipo(t)}</b> {TIPO_LABEL[t].toLowerCase()}s</span>)}
          {valor > 0 && <span className="ed-valor">{fmtCOP(valor)}</span>}
        </div>
      )}

      <div className="ed-acc">
        <button className="lp-btn" onClick={onCancel}>Cancelar</button>
        <button className="btn btn-p" onClick={onSave}>{editando ? 'Guardar cambios del ítem' : '+ Añadir al pedido'}</button>
      </div>
    </div>
  )
}

function FormularioChaq({ tipos, rows, cants, diseno, precios, imgs, setDiseno, setPrecios, setV, addRow, delRow, setRows, onImgs, onDelImg, onCancel, onSave, showToast }) {
  return (
    <div className="add-form">
      <div className="af-title">Nuevo ítem — <InsigniaTipos tipos={tipos} prenda="chaq" extra="chaqueta" /></div>
      <div className="g3" style={{ marginBottom: 14 }}>
        {tipos.map((t) => (
          <div className="fld" key={t}>
            <label className="np-tot-ico"><IconoPrenda tipo={t} prenda="chaq" /> Precio {TIPO_LABEL[t]} por kilo (pesos, sin puntos)</label>
            <input type="number" step="1" min="0" placeholder="Ej: 12000" value={precios[t] || ''} onChange={(e) => setPrecios((p) => ({ ...p, [t]: e.target.value }))} />
            {precios[t] > 0 && <span style={{ fontSize: 11, color: 'var(--jtx)', fontFamily: "'DM Mono', monospace", marginTop: 2 }}>= {fmtCOP(precios[t])}/kg</span>}
          </div>
        ))}
        <div className="fld full">
          <label>Descripción / Diseño</label>
          <textarea value={diseno} onChange={(e) => setDiseno(e.target.value)} placeholder="Referencia del cliente, tipo de tejido, características..." />
        </div>
        <div className="fld full">
          <label>Imágenes del diseño</label>
          <div className="img-upload-area">
            <input type="file" accept="image/*" multiple onChange={onImgs} />
            <div className="img-upload-label">📷 <strong>Toca para subir fotos</strong><br /><span style={{ fontSize: 11 }}>Puedes añadir varias imágenes</span></div>
          </div>
          <div className="img-previews">
            {imgs.map((src, i) => (
              <div className="img-thumb" key={i}>
                <img src={src} alt="" />
                <button className="img-thumb-del" onClick={() => onDelImg(i)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--jtx)', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
        Tabla de colores × cantidades
      </div>

      <div className="tscroll chaq-scroll">
        <table className="tg">
          <thead><tr><th className="th-l">Color / Referencia</th>{tipos.map((t) => <th key={t} className="th-item-chaq">{TIPO_LABEL[t]}</th>)}<th>Total</th></tr></thead>
          <tbody>
            {rows.map((col, ri) => {
              const totF = tipos.reduce((s, t) => s + (+(cants[ri] || {})[t] || 0), 0)
              return (
                <tr key={ri}>
                  <td className="td-key chaq" style={{ minWidth: 190 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <ColorSwatch nombre={nombreColor(col, ri)} size={13} />
                        <input
                          className="rowinp chaq" value={col.principal} placeholder={`Color ${ri + 1}`} style={{ flex: 1 }}
                          onChange={(e) => setRows((prev) => prev.map((x, i) => (i === ri ? { ...x, principal: e.target.value } : x)))}
                        />
                        <FormulaColorBoton nombreColor={nombreColor(col, ri)} showToast={showToast} />
                        {rows.length > 1 && <button className="rowdel" onClick={() => delRow(ri)}>✕</button>}
                      </div>
                      {(col.rayas || []).length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {col.rayas.map((raya, ridx) => (
                            <div key={ridx} style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--jbg)', borderRadius: 5, padding: '1px 4px' }}>
                              <span style={{ fontSize: 8, color: 'var(--jtx)', flexShrink: 0 }}>R{ridx + 1}</span>
                              <input
                                value={raya} placeholder="color" style={{ width: 54, fontSize: 10, border: 'none', background: 'none', outline: 'none' }}
                                onChange={(e) => setRows((prev) => prev.map((x, i) => {
                                  if (i !== ri) return x
                                  const nr = [...(x.rayas || [])]; nr[ridx] = e.target.value
                                  return { ...x, rayas: nr }
                                }))}
                              />
                              <button
                                style={{ background: 'none', border: 'none', color: '#c8a84a', cursor: 'pointer', fontSize: 10 }}
                                onClick={() => setRows((prev) => prev.map((x, i) => {
                                  if (i !== ri) return x
                                  return { ...x, rayas: (x.rayas || []).filter((_, k) => k !== ridx) }
                                }))}
                              >✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        style={{ fontSize: 10, color: 'var(--jtx)', background: 'none', border: '1px dashed #e0bd72', borderRadius: 4, padding: '1px 7px', cursor: 'pointer', alignSelf: 'flex-start' }}
                        onClick={() => setRows((prev) => prev.map((x, i) => (i === ri ? { ...x, rayas: [...(x.rayas || []), ''] } : x)))}
                      >＋ raya</button>
                    </div>
                  </td>
                  {tipos.map((t) => {
                    const v = (cants[ri] || {})[t] || ''
                    return (
                      <td key={t} className="td-n">
                        <input type="number" min="0" value={v} placeholder="—" className={v ? 'has-v chq' : ''} onChange={(e) => setV(ri, t, e.target.value)} />
                      </td>
                    )
                  })}
                  <td className="td-tot-end chaq">{totF || ''}</td>
                </tr>
              )
            })}
            <tr className="tr-tot chaq">
              <td className="td-l">Total</td>
              {tipos.map((t) => {
                const tot = rows.reduce((s, _, ri) => s + (+(cants[ri] || {})[t] || 0), 0)
                return <td key={t}>{tot || ''}</td>
              })}
              <td className="td-tot-end chaq">
                {rows.reduce((s, _, ri) => s + tipos.reduce((s2, t) => s2 + (+(cants[ri] || {})[t] || 0), 0), 0) || ''}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <button className="add-row-btn chaq" onClick={addRow}>＋ Añadir color</button>

      <div className="brow" style={{ marginTop: 12 }}>
        <button className="btn btn-s btn-sm" onClick={onCancel}>Cancelar</button>
        <button className="btn btn-p btn-sm" onClick={onSave}>＋ Añadir al pedido</button>
      </div>
    </div>
  )
}
