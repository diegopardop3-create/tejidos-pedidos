import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { TALLAS, TIPO_LABEL, TIPO_ICON, hoy, ESTADOS, ESTADO_ICON, fmtCOP } from './constants'

const TIPOS_CAM = ['puno', 'cuello']
const TIPOS_CHAQ = ['pretina', 'cuello', 'puno']

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

  const [camCols, setCamCols] = useState([''])
  const [camCants, setCamCants] = useState({})
  const [camDiseno, setCamDiseno] = useState('')
  const [camPrecios, setCamPrecios] = useState({})
  const [camImgs, setCamImgs] = useState([])
  const [camEsJuego, setCamEsJuego] = useState(false)

  const [chaqRows, setChaqRows] = useState([''])
  const [chaqCants, setChaqCants] = useState({})
  const [chaqDiseno, setChaqDiseno] = useState('')
  const [chaqPrecios, setChaqPrecios] = useState({})
  const [chaqImgs, setChaqImgs] = useState([])

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
    setCamSelTipos(new Set()); setCamCols(['']); setCamCants({}); setCamDiseno(''); setCamPrecios({}); setCamImgs([]); setCamEsJuego(false)
    setChaqSelTipos(new Set()); setChaqRows(['']); setChaqCants({}); setChaqDiseno(''); setChaqPrecios({}); setChaqImgs([])
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
  function camAddCol() { setCamCols((c) => [...c, '']) }
  function camDelCol(ci) {
    if (camCols.length <= 1) { showToast('⚠️', 'Debe haber al menos un color'); return }
    const tipos = [...camSelTipos]
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
  function chaqAddRow() { setChaqRows((r) => [...r, '']) }
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
    const tipos = [...camSelTipos]
    if (!tipos.length) { showToast('⚠️', 'Selecciona Puño y/o Cuello'); return }
    const cols = camCols.map((c, ci) => ({ nombre: c || `Color ${ci + 1}`, ci }))
    const tabla = {}
    let totalU = 0
    TALLAS.forEach((talla, ri) => {
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
    const totalPrecio = tipos.reduce((s, t) => {
      const uT = Object.values(tabla).reduce((s2, tallaObj) => s2 + Object.values(tallaObj).reduce((s3, colObj) => s3 + (colObj[t] || 0), 0), 0)
      return s + uT * precios[t]
    }, 0)
    setTempCam((prev) => [...prev, { tipos, precios, es_juego: esJuego, diseno: camDiseno, imagenes: camImgs, tabla, total_unidades: totalU, total_precio: totalPrecio, estados: {} }])
    resetItemForms()
    showToast('✅', 'Ítem añadido al pedido')
  }

  function guardarItemChaq() {
    const tipos = [...chaqSelTipos]
    if (!tipos.length) { showToast('⚠️', 'Selecciona Pretina, Cuello y/o Puño'); return }
    const rows = chaqRows.map((c, ri) => ({ nombre: c || `Color ${ri + 1}`, ri }))
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
    setTempChaq((prev) => [...prev, { tipos, precios, diseno: chaqDiseno, imagenes: chaqImgs, tabla, total_unidades: totalU, kilos_reales: null, total_final: null, estados: {} }])
    resetItemForms()
    showToast('✅', 'Ítem añadido al pedido')
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
          imagenes: it.imagenes, tabla: it.tabla, total_unidades: it.total_unidades,
          total_precio: it.total_precio, estados: it.estados || {},
        }))
        const { error } = await supabase.from('items_camiseta').insert(rows)
        if (error) throw error
      }
      if (tempChaq.length) {
        const rows = tempChaq.map((it) => ({
          pedido_id: pedidoId, tipos: it.tipos, precios: it.precios, diseno: it.diseno,
          imagenes: it.imagenes, tabla: it.tabla, total_unidades: it.total_unidades,
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
            <ItemCardCam key={i} it={it} onDelete={() => setTempCam((p) => p.filter((_, idx) => idx !== i))} />
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
              tipos={[...camSelTipos]}
              cols={camCols} cants={camCants} diseno={camDiseno} precios={camPrecios} imgs={camImgs}
              setDiseno={setCamDiseno} setPrecios={setCamPrecios}
              setV={camSetV} addCol={camAddCol} delCol={camDelCol}
              setCols={setCamCols}
              esJuego={camEsJuego} setEsJuego={setCamEsJuego}
              onImgs={(e) => handleImgs(e, 'cam')}
              onDelImg={(i) => setCamImgs((p) => p.filter((_, idx) => idx !== i))}
              onCancel={resetItemForms}
              onSave={guardarItemCam}
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
            <ItemCardChaq key={i} it={it} onDelete={() => setTempChaq((p) => p.filter((_, idx) => idx !== i))} />
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
              tipos={[...chaqSelTipos]}
              rows={chaqRows} cants={chaqCants} diseno={chaqDiseno} precios={chaqPrecios} imgs={chaqImgs}
              setDiseno={setChaqDiseno} setPrecios={setChaqPrecios}
              setV={chaqSetV} addRow={chaqAddRow} delRow={chaqDelRow}
              setRows={setChaqRows}
              onImgs={(e) => handleImgs(e, 'chaq')}
              onDelImg={(i) => setChaqImgs((p) => p.filter((_, idx) => idx !== i))}
              onCancel={resetItemForms}
              onSave={guardarItemChaq}
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

function ItemCardCam({ it, onDelete }) {
  const tLabel = it.tipos.map((t) => `${TIPO_ICON[t]} ${TIPO_LABEL[t]}`).join(' + ')
  const colsPresentes = []
  Object.values(it.tabla || {}).forEach((tallaObj) => {
    Object.keys(tallaObj).forEach((c) => { if (!colsPresentes.includes(c)) colsPresentes.push(c) })
  })
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
          <button className="btn btn-d btn-sm" onClick={onDelete}>✕</button>
        </div>
      </div>
      <div className="iblk-body">
        <div className="tscroll cam-scroll">
          <table className="tg">
            <thead><tr><th className="th-l">Talla</th>{colsPresentes.map((c) => <th key={c}>{c}</th>)}<th>Total</th></tr></thead>
            <tbody>
              {Object.entries(it.tabla || {}).map(([talla, tallaObj]) => {
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
      </div>
    </div>
  )
}

function ItemCardChaq({ it, onDelete }) {
  const tLabel = it.tipos.map((t) => `${TIPO_ICON[t]} ${TIPO_LABEL[t]}`).join(' + ')
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
          <span className="itot pend">⚖️ Pendiente</span>
          <button className="btn btn-d btn-sm" onClick={onDelete}>✕</button>
        </div>
      </div>
      <div className="iblk-body">
        <div className="tscroll chaq-scroll">
          <table className="tg">
            <thead><tr><th className="th-l">Color</th>{it.tipos.map((t) => <th key={t}>{TIPO_ICON[t]} {TIPO_LABEL[t]}</th>)}<th>Total</th></tr></thead>
            <tbody>
              {Object.entries(it.tabla || {}).map(([color, rowObj]) => {
                const tot = it.tipos.reduce((s, t) => s + (rowObj[t] || 0), 0)
                return (
                  <tr key={color}>
                    <td className="td-key chaq">{color}</td>
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

function FormularioCam({ tipos, cols, cants, diseno, precios, imgs, setDiseno, setPrecios, setV, addCol, delCol, setCols, onImgs, onDelImg, onCancel, onSave, esJuego, setEsJuego }) {
  const puedeSerJuego = tipos.length === 2 && tipos.includes('puno') && tipos.includes('cuello')
  return (
    <div className="add-form">
      <div className="af-title">Nuevo ítem — {tipos.map((t) => `${TIPO_ICON[t]} ${TIPO_LABEL[t]}`).join(' + ')}</div>

      {puedeSerJuego && (
        <div style={{ background: '#eef3e6', border: '1px solid #a8c98a', borderRadius: 9, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => setEsJuego(v => !v)}>
          <span style={{ width: 20, height: 20, borderRadius: 5, border: '2px solid #4b8523', background: esJuego ? '#4b8523' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, flexShrink: 0 }}>{esJuego ? '✓' : ''}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#3d6b1c' }}>Cobrar como juego (precio único)</div>
            <div style={{ fontSize: 11, color: '#6a7d5a' }}>Un solo precio que aplica igual a cada cuello y cada puño, según su cantidad.</div>
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

      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ctx)', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
        Tabla de tallas × colores
      </div>

      <div className="tscroll cam-scroll">
        <table className="tg">
          <thead>
            <tr>
              <th className="th-l" rowSpan={2}>Talla</th>
              {cols.map((c, ci) => (
                <th key={ci} colSpan={tipos.length} style={{ borderLeft: '2px solid rgba(255,255,255,.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                    <input className="colinp" value={c} placeholder={`Color ${ci + 1}`} onChange={(e) => setCols((prev) => prev.map((x, i) => (i === ci ? e.target.value : x)))} />
                    {cols.length > 1 && <button className="coldel" onClick={() => delCol(ci)}>✕</button>}
                  </div>
                </th>
              ))}
              <th className="th-add" rowSpan={2} onClick={addCol}><div className="add-col-ico">＋</div></th>
              <th rowSpan={2}>Total</th>
            </tr>
            <tr>
              {cols.map((_, ci) => tipos.map((t) => (
                <th key={`${ci}_${t}`} className="th-item-cam" style={{ borderLeft: '1px solid rgba(255,255,255,.15)' }}>{TIPO_ICON[t]} {TIPO_LABEL[t]}</th>
              )))}
            </tr>
          </thead>
          <tbody>
            {TALLAS.map((talla, ri) => {
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
            <tr className="tr-tot cam">
              <td className="td-l">Total</td>
              {cols.map((_, ci) => tipos.map((t) => {
                const tot = TALLAS.reduce((s, _, ri) => s + (+(cants[ri] || {})[`${ci}_${t}`] || 0), 0)
                return <td key={`${ci}_${t}`}>{tot || ''}</td>
              }))}
              <td className="td-tot-end cam">
                {TALLAS.reduce((s, _, ri) => s + cols.reduce((s2, _, ci) => s2 + tipos.reduce((s3, t) => s3 + (+(cants[ri] || {})[`${ci}_${t}`] || 0), 0), 0), 0) || ''}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="brow" style={{ marginTop: 12 }}>
        <button className="btn btn-s btn-sm" onClick={onCancel}>Cancelar</button>
        <button className="btn btn-p btn-sm" onClick={onSave}>＋ Añadir al pedido</button>
      </div>
    </div>
  )
}

function FormularioChaq({ tipos, rows, cants, diseno, precios, imgs, setDiseno, setPrecios, setV, addRow, delRow, setRows, onImgs, onDelImg, onCancel, onSave }) {
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
          <thead><tr><th className="th-l">Color / Referencia</th>{tipos.map((t) => <th key={t} className="th-item-chaq">{TIPO_ICON[t]} {TIPO_LABEL[t]}</th>)}<th>Total</th></tr></thead>
          <tbody>
            {rows.map((col, ri) => {
              const totF = tipos.reduce((s, t) => s + (+(cants[ri] || {})[t] || 0), 0)
              return (
                <tr key={ri}>
                  <td className="td-key chaq" style={{ minWidth: 140 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input className="rowinp chaq" value={col} placeholder={`Color ${ri + 1}`} style={{ flex: 1 }} onChange={(e) => setRows((prev) => prev.map((x, i) => (i === ri ? e.target.value : x)))} />
                      {rows.length > 1 && <button className="rowdel" onClick={() => delRow(ri)}>✕</button>}
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
