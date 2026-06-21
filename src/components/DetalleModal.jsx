import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { TIPO_LABEL, TIPO_ICON, fmtFecha, fmtCOP, calcProgreso, ESTADOS, ESTADO_ICON } from './constants'
import { generarFacturaPDF } from './factura'

export default function DetalleModal({ pedido, onClose, onUpdated, onEditar, onCompartir, showToast }) {
  const [lightbox, setLightbox] = useState(null)
  if (!pedido) return null

  const pr = calcProgreso(pedido)
  const pedidoCompleto = pedido.estado === 'Entregado' ||
    (pr.total > 0 && pr.ok === pr.total) ||
    (pr.total === 0 && (pedido.items_chaqueta || []).every((it) => it.kilos_reales != null))

  async function cambiarEstado(nuevoEstado) {
    const { error } = await supabase.from('pedidos').update({ estado: nuevoEstado, actualizado_en: new Date().toISOString() }).eq('id', pedido.id)
    if (error) { showToast('⚠️', 'Error al cambiar estado'); return }
    showToast(ESTADO_ICON[nuevoEstado], `Estado actualizado a ${nuevoEstado}`)
    onUpdated()
  }

  async function toggleCelda(itemTabla, itemId, ek, nuevoEstado) {
    const estados = { ...(itemTabla.estados || {}) }
    estados[ek] = estados[ek] === nuevoEstado ? null : nuevoEstado
    const tabla = itemTabla === itemTabla // referencia
    const tableName = (pedido.items_camiseta || []).find((it) => it.id === itemId) ? 'items_camiseta' : 'items_chaqueta'
    const { error } = await supabase.from(tableName).update({ estados }).eq('id', itemId)
    if (error) { showToast('⚠️', 'Error al guardar'); return }
    onUpdated()
  }

  async function guardarPesaje(item, kilos) {
    const kg = parseFloat(kilos)
    if (!kg) { showToast('⚠️', 'Ingresa los kilos'); return }
    const p0 = item.precios[item.tipos[0]] || 0
    const totalFinal = kg * p0
    const { error } = await supabase.from('items_chaqueta').update({ kilos_reales: kg, total_final: totalFinal }).eq('id', item.id)
    if (error) { showToast('⚠️', 'Error al guardar el peso'); return }

    // Recalcular total del pedido
    const itemsChaq = (pedido.items_chaqueta || []).map((it) => it.id === item.id ? { ...it, kilos_reales: kg, total_final: totalFinal } : it)
    const allPesado = itemsChaq.every((it) => it.kilos_reales != null)
    const totalChaq = itemsChaq.reduce((s, it) => s + (it.total_final || 0), 0)
    await supabase.from('pedidos').update({
      total_final: allPesado ? (pedido.total_camiseta || 0) + totalChaq : null,
      hay_chaqueta: !allPesado,
    }).eq('id', pedido.id)

    showToast('✅', `${kg} kg guardados`)
    onUpdated()
    onClose()
  }

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="mtitle">Pedido {pedido.numero} — {pedido.cliente}</div>

        <div className="msec">
          <h4>Información General</h4>
          <div className="dgrid">
            <div className="dp"><span className="dk">N° Pedido</span><span className="dv" style={{ fontFamily: "'DM Mono', monospace", fontSize: 17, fontWeight: 800, color: 'var(--thread)' }}>{pedido.numero}</span></div>
            <div className="dp"><span className="dk">Fecha</span><span className="dv">{fmtFecha(pedido.fecha)}</span></div>
            <div className="dp"><span className="dk">Cliente</span><span className="dv">{pedido.cliente}</span></div>
            <div className="dp"><span className="dk">Estado</span><span className="dv">
              <select className="estado-select" value={pedido.estado} onChange={(e) => cambiarEstado(e.target.value)}>
                {ESTADOS.map((es) => <option key={es} value={es}>{ESTADO_ICON[es]} {es}</option>)}
              </select>
            </span></div>
            {pedido.observaciones && <div className="dp" style={{ gridColumn: '1/-1' }}><span className="dk">Observaciones</span><span className="dv">{pedido.observaciones}</span></div>}
          </div>
        </div>

        {pr.total > 0 && (
          <>
            <div style={{ background: 'var(--ink)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: 'var(--yarn)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>Progreso de producción</div>
                <div className="prog-wrap" style={{ height: 8 }}><div className="prog-bar" style={{ width: `${pr.pct}%` }} /></div>
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", color: '#fff', fontSize: 13, whiteSpace: 'nowrap' }}>✅ {pr.ok}/{pr.total} {pr.falta > 0 && `· ❓ ${pr.falta}`}</div>
            </div>
            <div className="prod-legend">
              <span>Toca para marcar cada cantidad:</span><span>✅ Completa</span><span>❓ Falta</span>
              <span style={{ color: 'var(--muted)', fontSize: 10 }}>(toca de nuevo para quitar)</span>
            </div>
          </>
        )}

        {(pedido.items_camiseta || []).length > 0 && (
          <div className="msec">
            <h4>👔 Camiseta — {pedido.items_camiseta.length} ítem(s)</h4>
            {pedido.items_camiseta.map((it) => (
              <ItemCamView key={it.id} it={it} onToggle={toggleCelda} onImgClick={setLightbox} />
            ))}
          </div>
        )}

        {(pedido.items_chaqueta || []).length > 0 && (
          <div className="msec">
            <h4>🧥 Chaqueta — {pedido.items_chaqueta.length} ítem(s)</h4>
            {pedido.items_chaqueta.map((it) => (
              <ItemChaqView key={it.id} it={it} estadoPedido={pedido.estado} onToggle={toggleCelda} onPesaje={guardarPesaje} onImgClick={setLightbox} />
            ))}
          </div>
        )}

        <div className="brow right">
          <button className="btn btn-s" onClick={onClose}>Cerrar</button>
          <button className="btn btn-s" onClick={() => onCompartir(pedido)}>🔗 Compartir con cliente</button>
          {pedidoCompleto && (
            <button className="btn btn-s" onClick={() => generarFacturaPDF(pedido)} style={{ background: 'var(--weave)', color: 'var(--thread)', fontWeight: 700 }}>
              🧾 Descargar Factura
            </button>
          )}
          <button className="btn btn-p" onClick={onEditar}>✏️ Editar</button>
        </div>
      </div>

      {lightbox && (
        <div className="lb" onClick={() => setLightbox(null)}>
          <span className="lb-close">✕</span>
          <img src={lightbox} alt="" />
        </div>
      )}
    </div>
  )
}

function ItemCamView({ it, onToggle, onImgClick }) {
  const tLabel = it.tipos.map((t) => `${TIPO_ICON[t]} ${TIPO_LABEL[t]}`).join(' + ')
  const coloresPresentes = []
  Object.values(it.tabla || {}).forEach((tallaObj) => {
    Object.keys(tallaObj).forEach((c) => { if (!coloresPresentes.includes(c)) coloresPresentes.push(c) })
  })

  return (
    <div style={{ background: 'var(--loom)', border: '1px solid var(--cbd)', borderRadius: 9, padding: 12, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="badge cam">{tLabel}</span>
          {it.diseno && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{it.diseno}</span>}
        </div>
        <span className="itot">{fmtCOP(it.total_precio)}</span>
      </div>

      <div className="tscroll cam-scroll">
        <table className="tg">
          <thead>
            <tr>
              <th className="th-l" rowSpan={2}>Talla</th>
              {coloresPresentes.map((c) => <th key={c} colSpan={it.tipos.length} style={{ borderLeft: '2px solid rgba(255,255,255,.2)' }}>{c}</th>)}
              <th rowSpan={2}>Total</th>
            </tr>
            <tr>
              {coloresPresentes.map((c) => it.tipos.map((t) => (
                <th key={`${c}_${t}`} className="th-item-cam" style={{ borderLeft: '1px solid rgba(255,255,255,.15)' }}>{TIPO_ICON[t]} {TIPO_LABEL[t]}</th>
              )))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(it.tabla || {}).map(([talla, tallaObj]) => {
              let totFila = 0
              return (
                <tr key={talla}>
                  <td className="td-key cam">{talla}</td>
                  {coloresPresentes.map((c) => it.tipos.map((t) => {
                    const n = (tallaObj[c] || {})[t] || 0
                    if (!n) return <td key={`${c}_${t}`} style={{ borderLeft: t === it.tipos[0] ? '2px solid #c8e6c9' : '1px solid var(--border)', textAlign: 'center', color: '#ccc' }}>—</td>
                    totFila += n
                    const ek = `${talla}|${c}|${t}`
                    const est = (it.estados || {})[ek]
                    return (
                      <td key={`${c}_${t}`} className={est === 'ok' ? 'st-ok' : est === 'falta' ? 'st-falta' : ''} style={{ borderLeft: t === it.tipos[0] ? '2px solid #c8e6c9' : '1px solid var(--border)' }}>
                        <div className="cell-estado">
                          <span className="cell-cant">{n}</span>
                          <button className="cell-btn" title="Completo" onClick={() => onToggle(it, it.id, ek, 'ok')}>✅</button>
                          <button className="cell-btn" title="Falta" onClick={() => onToggle(it, it.id, ek, 'falta')}>❓</button>
                        </div>
                      </td>
                    )
                  }))}
                  <td className="td-tot-end cam">{totFila}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {it.imagenes?.length > 0 && (
        <div className="item-imgs">{it.imagenes.map((s, i) => <img key={i} className="item-img" src={s} alt="" onClick={() => onImgClick(s)} />)}</div>
      )}

      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, fontFamily: "'DM Mono', monospace" }}>
        {it.tipos.map((t) => `${TIPO_LABEL[t]}: ${fmtCOP(it.precios[t] || 0)}/u`).join(' · ')}
      </div>
    </div>
  )
}

function ItemChaqView({ it, estadoPedido, onToggle, onPesaje, onImgClick }) {
  const [kg, setKg] = useState(it.kilos_reales || '')
  const tLabel = it.tipos.map((t) => `${TIPO_ICON[t]} ${TIPO_LABEL[t]}`).join(' + ')
  const p0 = it.precios[it.tipos[0]] || 0

  return (
    <div style={{ background: 'var(--loom)', border: '1px solid var(--jbd)', borderRadius: 9, padding: 12, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="badge chaq">{tLabel}</span>
          {it.diseno && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{it.diseno}</span>}
        </div>
        <span className={`itot ${it.kilos_reales ? '' : 'pend'}`}>{it.kilos_reales ? `✅ ${fmtCOP(it.total_final)}` : '⚖️ Pendiente de pesaje'}</span>
      </div>

      <div className="tscroll chaq-scroll">
        <table className="tg">
          <thead><tr><th className="th-l">Color / Referencia</th>{it.tipos.map((t) => <th key={t} className="th-item-chaq">{TIPO_ICON[t]} {TIPO_LABEL[t]}</th>)}<th>Total</th></tr></thead>
          <tbody>
            {Object.entries(it.tabla || {}).map(([color, rowObj]) => {
              let totF = 0
              return (
                <tr key={color}>
                  <td className="td-key chaq">{color}</td>
                  {it.tipos.map((t) => {
                    const n = rowObj[t] || 0
                    if (!n) return <td key={t} style={{ textAlign: 'center', color: '#ccc' }}>—</td>
                    totF += n
                    const ek = `${color}|${t}`
                    const est = (it.estados || {})[ek]
                    return (
                      <td key={t} className={est === 'ok' ? 'st-ok' : est === 'falta' ? 'st-falta' : ''}>
                        <div className="cell-estado">
                          <span className="cell-cant">{n}</span>
                          <button className="cell-btn" title="Completo" onClick={() => onToggle(it, it.id, ek, 'ok')}>✅</button>
                          <button className="cell-btn" title="Falta" onClick={() => onToggle(it, it.id, ek, 'falta')}>❓</button>
                        </div>
                      </td>
                    )
                  })}
                  <td className="td-tot-end chaq">{totF}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {it.imagenes?.length > 0 && (
        <div className="item-imgs">{it.imagenes.map((s, i) => <img key={i} className="item-img" src={s} alt="" onClick={() => onImgClick(s)} />)}</div>
      )}

      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, fontFamily: "'DM Mono', monospace" }}>
        {it.tipos.map((t) => `${TIPO_LABEL[t]}: ${fmtCOP(it.precios[t] || 0)}/kg`).join(' · ')} · {it.total_unidades} piezas
      </div>

      {estadoPedido !== 'Entregado' ? (
        <div className="pesaje-frm">
          <h5>⚖️ Registrar peso al entregar</h5>
          <div className="prow">
            <label>Kilos reales:</label>
            <input type="number" step="0.01" min="0" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="0.00" />
            <span className="ptot">{kg ? fmtCOP(parseFloat(kg) * p0) : ''}</span>
            <button className="btn btn-p btn-sm" onClick={() => onPesaje(it, kg)}>Guardar</button>
          </div>
        </div>
      ) : it.kilos_reales ? (
        <div style={{ fontSize: 12, color: 'var(--thread)', marginTop: 6, fontWeight: 600 }}>✅ {it.kilos_reales} kg · {fmtCOP(it.total_final)}</div>
      ) : null}
    </div>
  )
}
