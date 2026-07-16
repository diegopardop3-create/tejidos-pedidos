import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { TALLAS, TALLA_SIN_DIVIDIR, TIPO_LABEL, TIPO_ICON, hoy, ESTADOS, ESTADO_ICON, fmtCOP, totalesPorTipoCam, ordenarTipos } from './constants'
import ColorSwatch from './ColorSwatch'
import FormulaColorBoton from './FormulaColorBoton'

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

export default function NuevoPedido({ pedidos, editPedido, onSaved, onCancelEdit, showToast, userId }) {
  const [cliente, setCliente] = useState('')
  const [fecha, setFecha] = useState(hoy())
  const [estado, setEstado] = useState('Pendiente')
  const [obs, setObs] = useState('')
  const [numPedido, setNumPedido] = useState('')

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
  const [camTallasSel, setCamTallasSel] = useState(new Set()) // tallas que aplican a este ítem
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

  function resetItemForms() {
    setCamSelTipos(new Set()); setCamCols([{ principal: '', rayas: [] }]); setCamCants({}); setCamDiseno(''); setCamPrecios({}); setCamImgs([]); setCamEsJuego(false); setCamEditIdx(null); setCamTallasSel(new Set()); setCamPunoSinDividir(false)
    setChaqSelTipos(new Set()); setChaqRows([{ principal: '', rayas: [] }]); setChaqCants({}); setChaqDiseno(''); setChaqPrecios({}); setChaqImgs([]); setChaqEditIdx(null)
  }

  function toggleTalla(t) {
    setCamTallasSel((prev) => {
      const n = new Set(prev)
      if (n.has(t)) n.delete(t); else n.add(t)
      return n
    })
  }

  function limpiarTodo() {
    setCliente(''); setFecha(hoy()); setEstado('Pendiente'); setObs('')
    setTempCam([]); setTempChaq([])
    resetItemForms()
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
      TALLAS.forEach((_, ri) => {
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
    files.forEach((f) => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        if (sec === 'cam') setCamImgs((p) => [...p, ev.target.result])
        else setChaqImgs((p) => [...p, ev.target.result])
      }
      reader.readAsDataURL(f)
    })
  }

  function guardarItemCam() {
    const tipos = ordenarTipos([...camSelTipos])
    if (!tipos.length) { showToast('⚠️', 'Selecciona Puño y/o Cuello'); return }
    if (!camTallasSel.size) { showToast('⚠️', 'Selecciona al menos una talla'); return }
    const cols = camCols.map((c, ci) => ({ nombre: nombreColor(c, ci), ci }))
    const tabla = {}
    let totalU = 0
    TALLAS.forEach((talla, ri) => {
      if (!camTallasSel.has(talla)) return
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
    TALLAS.forEach((talla, ri) => {
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
    setCamTallasSel(new Set(TALLAS.filter((t) => it.tabla && it.tabla[t])))
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

  return (
    <div className="card">
      <div className="ctitle">{editPedido ? `Editando Pedido ${editPedido.numero}` : 'Registrar Nuevo Pedido'}</div>

      <div className="g5" style={{ marginBottom: 20 }}>
        <div className="fld"><label>N° Pedido</label><input className="rinp" readOnly value={numPedido} /></div>
        <div className="fld"><label>Cliente *</label><input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nombre del cliente" /></div>
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
                <span>{TIPO_ICON[t]}</span> {TIPO_LABEL[t]}
              </div>
            ))}
          </div>

          {camSelTipos.size > 0 && (
            <FormularioCam
              tipos={ordenarTipos([...camSelTipos])}
              cols={camCols} cants={camCants} diseno={camDiseno} precios={camPrecios} imgs={camImgs}
              setDiseno={setCamDiseno} setPrecios={setCamPrecios}
              setV={camSetV} addCol={camAddCol} delCol={camDelCol}
              setCols={setCamCols}
              esJuego={camEsJuego} setEsJuego={setCamEsJuego}
              tallasSel={camTallasSel} onToggleTalla={toggleTalla}
              onSelectAllTallas={() => setCamTallasSel(new Set(TALLAS))}
              onClearTallas={() => setCamTallasSel(new Set())}
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
                <span>{TIPO_ICON[t]}</span> {TIPO_LABEL[t]}
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
  const tLabel = it.tipos.map((t) => `${TIPO_ICON[t]} ${TIPO_LABEL[t]}`).join(' + ')
  // Usamos el orden guardado explícitamente (it.colores). Si el ítem es viejo
  // y no lo tiene, lo reconstruimos como respaldo (puede no coincidir con el
  // orden original porque Postgres no preserva el orden de un objeto jsonb).
  const colsPresentes = (it.colores && it.colores.length) ? it.colores : derivarColoresCam(it.tabla)
  const tallasPresentes = TALLAS.filter((t) => it.tabla && it.tabla[t])
  if (it.tabla && it.tabla[TALLA_SIN_DIVIDIR]) tallasPresentes.push(TALLA_SIN_DIVIDIR)
  return (
    <div className="iblk cam">
      <div className="iblk-hdr">
        <div className="iblk-label">
          <span className="badge cam">{tLabel} — Camiseta</span>
          {(it.es_juego || it.precios?.juego) && <span className="badge cam" style={{ background: '#4b8523', color: '#fff' }}>🎽 Juego {fmtCOP(it.precios.juego || 0)} c/u</span>}
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
                <span>🎽 Total de juegos (cuellos): <strong style={{ color: 'var(--ink)' }}>{cuello}</strong>{puno > 0 && ` · +${puno} puños incluidos`}</span>
              ) : (
                <>
                  {cuello > 0 && <span>🔵 Total cuellos: <strong style={{ color: 'var(--ink)' }}>{cuello}</strong></span>}
                  {puno > 0 && <span>🧤 Total puños: <strong style={{ color: 'var(--ink)' }}>{puno}</strong></span>}
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
  const tLabel = it.tipos.map((t) => `${TIPO_ICON[t]} ${TIPO_LABEL[t]}`).join(' + ')
  const coloresPresentes = ((it.colores && it.colores.length) ? it.colores : Object.keys(it.tabla || {})).filter((c) => it.tabla && it.tabla[c])
  return (
    <div className="iblk chaq">
      <div className="iblk-hdr">
        <div className="iblk-label">
          <span className="badge chaq">{tLabel} — Chaqueta</span>
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

function FormularioCam({ tipos, cols, cants, diseno, precios, imgs, setDiseno, setPrecios, setV, addCol, delCol, setCols, onImgs, onDelImg, onCancel, onSave, esJuego, setEsJuego, tallasSel, onToggleTalla, onSelectAllTallas, onClearTallas, showToast, punoSinDividir, setPunoSinDividir }) {
  const puedeSerJuego = tipos.length === 2 && tipos.includes('puno') && tipos.includes('cuello')
  return (
    <div className="add-form">
      <div className="af-title">Nuevo ítem — {tipos.map((t) => `${TIPO_ICON[t]} ${TIPO_LABEL[t]}`).join(' + ')}</div>

      {puedeSerJuego && (
        <div style={{ background: '#eef3e6', border: '1px solid #a8c98a', borderRadius: 9, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => setEsJuego(v => !v)}>
          <span style={{ width: 20, height: 20, borderRadius: 5, border: '2px solid #4b8523', background: esJuego ? '#4b8523' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, flexShrink: 0 }}>{esJuego ? '✓' : ''}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#3d6b1c' }}>Cobrar como juego (precio único)</div>
            <div style={{ fontSize: 11, color: '#6a7d5a' }}>Se cobra una vez por cada cuello — los puños de ese mismo juego van incluidos en ese precio, no se cobran aparte.</div>
          </div>
        </div>
      )}

      <div className="g3" style={{ marginBottom: 14 }}>
        {esJuego && puedeSerJuego ? (
          <div className="fld">
            <label>🎽 Precio del juego (pesos, sin puntos)</label>
            <input type="number" step="1" min="0" placeholder="Ej: 2600" value={precios.juego || ''} onChange={(e) => setPrecios((p) => ({ ...p, juego: e.target.value }))} />
            {precios.juego > 0 && <span style={{ fontSize: 11, color: 'var(--thread)', fontFamily: "'DM Mono', monospace", marginTop: 2 }}>= {fmtCOP(precios.juego)} c/pieza</span>}
          </div>
        ) : (
          tipos.map((t) => (
            <div className="fld" key={t}>
              <label>{TIPO_ICON[t]} Precio {TIPO_LABEL[t]} (pesos, sin puntos)</label>
              <input type="number" step="1" min="0" placeholder="Ej: 1700" value={precios[t] || ''} onChange={(e) => setPrecios((p) => ({ ...p, [t]: e.target.value }))} />
              {precios[t] > 0 && <span style={{ fontSize: 11, color: 'var(--thread)', fontFamily: "'DM Mono', monospace", marginTop: 2 }}>= {fmtCOP(precios[t])}</span>}
            </div>
          ))
        )}
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

      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ctx)', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
        Tabla de tallas × colores
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
        En cada columna: el color principal arriba, y abajo puedes añadir tantas rayas como necesites, en el orden en que van (Raya 1, Raya 2, Raya 3...).
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 6 }}>
          <button type="button" onClick={onSelectAllTallas} style={{ fontSize: 11, color: 'var(--thread)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Todas</button>
          <button type="button" onClick={onClearTallas} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Ninguna</button>
        </div>

        {[
          { titulo: 'Niño — individual o unida (usa la que necesites por pedido)', tallas: ['2', '4', '2-4', '6', '8', '6-8', '10', '12', '10-12', '14', '16', '14-16'] },
          { titulo: 'Adulto', tallas: ['S', 'M', 'L', 'XL', '2XL', '3XL'] },
        ].map((grupo) => (
          <div key={grupo.titulo} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{grupo.titulo}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {grupo.tallas.map((t) => {
                const esCombinada = t.includes('-')
                const sel = tallasSel.has(t)
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onToggleTalla(t)}
                    title={esCombinada ? 'Talla combinada' : 'Talla individual'}
                    style={{
                      padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      border: sel ? '1.5px solid #4b8523' : esCombinada ? '1.5px dashed var(--border)' : '1.5px solid var(--border)',
                      background: sel ? '#4b8523' : 'var(--white)',
                      color: sel ? '#fff' : 'var(--muted)',
                    }}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {tipos.includes('puno') && (
        <div
          onClick={() => setPunoSinDividir((v) => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 10, padding: '8px 12px', background: punoSinDividir ? '#eef3e6' : 'var(--loom)', border: '1px solid var(--border)', borderRadius: 8 }}
        >
          <span style={{ width: 18, height: 18, borderRadius: 5, border: '2px solid #4b8523', background: punoSinDividir ? '#4b8523' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, flexShrink: 0 }}>{punoSinDividir ? '✓' : ''}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#3d6b1c' }}>🧤 Puño sin dividir por talla</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Actívalo si vas a cortar puños en una sola cantidad para varias tallas juntas, en vez de repartirlos talla por talla.</div>
          </div>
        </div>
      )}

      {!tallasSel.size ? (
        <div style={{ padding: '18px', textAlign: 'center', color: 'var(--muted)', fontSize: 13, border: '1.5px dashed var(--border)', borderRadius: 9 }}>
          Selecciona arriba las tallas que necesitas para este ítem.
        </div>
      ) : (
      <div className="tscroll cam-scroll">
        <table className="tg">
          <thead>
            <tr>
              <th className="th-l" rowSpan={2}>Talla</th>
              {cols.map((c, ci) => (
                <th key={ci} colSpan={tipos.length} style={{ borderLeft: '2px solid rgba(255,255,255,.2)', verticalAlign: 'top' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '3px 0' }}>
                    <ColorSwatch nombre={nombreColor(c, ci)} size={11} />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                      <input
                        className="colinp" value={c.principal} placeholder={`Color ${ci + 1}`}
                        onChange={(e) => setCols((prev) => prev.map((x, i) => (i === ci ? { ...x, principal: e.target.value } : x)))}
                      />
                      <FormulaColorBoton nombreColor={nombreColor(c, ci)} showToast={showToast} />
                      {cols.length > 1 && <button className="coldel" onClick={() => delCol(ci)}>✕</button>}
                    </div>
                    {(c.rayas || []).map((raya, ridx) => (
                      <div key={ridx} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <span style={{ fontSize: 8, color: 'var(--yarn)', opacity: .75, flexShrink: 0 }}>R{ridx + 1}</span>
                        <input
                          className="colinp" value={raya} placeholder={`raya ${ridx + 1}`}
                          style={{ width: 58, fontSize: 9 }}
                          onChange={(e) => setCols((prev) => prev.map((x, i) => {
                            if (i !== ci) return x
                            const nr = [...(x.rayas || [])]; nr[ridx] = e.target.value
                            return { ...x, rayas: nr }
                          }))}
                        />
                        <button
                          className="coldel" style={{ fontSize: 10 }}
                          onClick={() => setCols((prev) => prev.map((x, i) => {
                            if (i !== ci) return x
                            return { ...x, rayas: (x.rayas || []).filter((_, k) => k !== ridx) }
                          }))}
                        >✕</button>
                      </div>
                    ))}
                    <button
                      type="button"
                      style={{ fontSize: 9, color: 'var(--yarn)', background: 'none', border: '1px dashed rgba(183,228,199,.6)', borderRadius: 4, padding: '1px 7px', cursor: 'pointer' }}
                      onClick={() => setCols((prev) => prev.map((x, i) => (i === ci ? { ...x, rayas: [...(x.rayas || []), ''] } : x)))}
                    >＋ raya</button>
                  </div>
                </th>
              ))}
              <th className="th-add" rowSpan={2} onClick={addCol}><div className="add-col-ico">＋</div></th>
              <th rowSpan={2}>Total</th>
            </tr>
            <tr>
              {cols.map((_, ci) => tipos.map((t) => (
                <th key={`${ci}_${t}`} className="th-item-cam" style={{ borderLeft: '1px solid rgba(255,255,255,.15)' }}>{TIPO_LABEL[t]}</th>
              )))}
            </tr>
          </thead>
          <tbody>
            {TALLAS.filter((t) => tallasSel.has(t)).map((talla) => {
              const ri = TALLAS.indexOf(talla)
              const totFila = cols.reduce((s, _, ci) => s + tipos.reduce((s2, t) => s2 + (+(cants[ri] || {})[`${ci}_${t}`] || 0), 0), 0)
              return (
                <tr key={talla}>
                  <td className="td-key cam">{talla}</td>
                  {cols.map((_, ci) => tipos.map((t) => {
                    const key = `${ci}_${t}`
                    const v = (cants[ri] || {})[key] || ''
                    return (
                      <td key={key} className="td-n" style={{ borderLeft: t === tipos[0] ? '2px solid #c8e6c9' : '1px solid var(--border)' }}>
                        <input type="number" min="0" value={v} placeholder="—" className={v ? 'has-v' : ''} onChange={(e) => setV(ri, key, e.target.value)} />
                      </td>
                    )
                  }))}
                  <td className="td-tot-end cam">{totFila || ''}</td>
                </tr>
              )
            })}
            {punoSinDividir && tipos.includes('puno') && (
              <tr style={{ background: '#fdf8ee' }}>
                <td className="td-key cam" style={{ fontSize: 11 }}>🧤 Todas (sin dividir)</td>
                {cols.map((_, ci) => tipos.map((t) => {
                  if (t !== 'puno') return <td key={`${ci}_${t}`} style={{ textAlign: 'center', color: '#ccc' }}>—</td>
                  const key = `${ci}_puno`
                  const v = (cants['SD'] || {})[key] || ''
                  return (
                    <td key={key} className="td-n" style={{ borderLeft: '2px solid #c8e6c9' }}>
                      <input type="number" min="0" value={v} placeholder="—" className={v ? 'has-v' : ''} onChange={(e) => setV('SD', key, e.target.value)} />
                    </td>
                  )
                }))}
                <td className="td-tot-end cam">
                  {cols.reduce((s, _, ci) => s + (+(cants['SD'] || {})[`${ci}_puno`] || 0), 0) || ''}
                </td>
              </tr>
            )}
            <tr className="tr-tot cam">
              <td className="td-l">Total</td>
              {cols.map((_, ci) => tipos.map((t) => {
                let tot = TALLAS.filter((tl) => tallasSel.has(tl)).reduce((s, tl) => s + (+(cants[TALLAS.indexOf(tl)] || {})[`${ci}_${t}`] || 0), 0)
                if (punoSinDividir && t === 'puno') tot += (+(cants['SD'] || {})[`${ci}_puno`] || 0)
                return <td key={`${ci}_${t}`}>{tot || ''}</td>
              }))}
              <td className="td-tot-end cam">
                {(() => {
                  let gran = TALLAS.filter((tl) => tallasSel.has(tl)).reduce((s, tl) => s + cols.reduce((s2, _, ci) => s2 + tipos.reduce((s3, t) => s3 + (+(cants[TALLAS.indexOf(tl)] || {})[`${ci}_${t}`] || 0), 0), 0), 0)
                  if (punoSinDividir) gran += cols.reduce((s, _, ci) => s + (+(cants['SD'] || {})[`${ci}_puno`] || 0), 0)
                  return gran || ''
                })()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      )}

      {tallasSel.size > 0 && (() => {
        let totalCuelloLive = 0, totalPunoLive = 0
        TALLAS.filter((t) => tallasSel.has(t)).forEach((talla) => {
          const ri = TALLAS.indexOf(talla)
          cols.forEach((_, ci) => {
            totalCuelloLive += +(cants[ri] || {})[`${ci}_cuello`] || 0
            totalPunoLive += +(cants[ri] || {})[`${ci}_puno`] || 0
          })
        })
        if (punoSinDividir) {
          cols.forEach((_, ci) => { totalPunoLive += +(cants['SD'] || {})[`${ci}_puno`] || 0 })
        }
        if (!totalCuelloLive && !totalPunoLive) return null
        return (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', background: 'var(--ink)', borderRadius: 9, padding: '10px 16px', marginTop: 10 }}>
            {esJuego ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--yarn)', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: '.06em' }}>🎽 Total de juegos (cuellos)</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{totalCuelloLive}</span>
                {totalPunoLive > 0 && <span style={{ fontSize: 11, color: 'var(--yarn)' }}>+ {totalPunoLive} puños incluidos, sin cobro aparte</span>}
              </div>
            ) : (
              <>
                {tipos.includes('cuello') && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--yarn)', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: '.06em' }}>🔵 Total cuellos</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{totalCuelloLive}</span>
                  </div>
                )}
                {tipos.includes('puno') && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--yarn)', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: '.06em' }}>🧤 Total puños</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{totalPunoLive}</span>
                  </div>
                )}
              </>
            )}
          </div>
        )
      })()}

      <div className="brow" style={{ marginTop: 12 }}>
        <button className="btn btn-s btn-sm" onClick={onCancel}>Cancelar</button>
        <button className="btn btn-p btn-sm" onClick={onSave}>＋ Añadir al pedido</button>
      </div>
    </div>
  )
}

function FormularioChaq({ tipos, rows, cants, diseno, precios, imgs, setDiseno, setPrecios, setV, addRow, delRow, setRows, onImgs, onDelImg, onCancel, onSave, showToast }) {
  return (
    <div className="add-form">
      <div className="af-title">Nuevo ítem — {tipos.map((t) => `${TIPO_ICON[t]} ${TIPO_LABEL[t]}`).join(' + ')}</div>
      <div className="g3" style={{ marginBottom: 14 }}>
        {tipos.map((t) => (
          <div className="fld" key={t}>
            <label>{TIPO_ICON[t]} Precio {TIPO_LABEL[t]} por kilo (pesos, sin puntos)</label>
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
                            <div key={ridx} style={{ display: 'flex', alignItems: 'center', gap: 2, background: '#fff8e8', borderRadius: 5, padding: '1px 4px' }}>
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
