import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { TIPO_LABEL, TIPO_ICON, fmtFecha, fmtCOP, calcProgreso, claseCelda, cantidadHecha, ESTADOS, ESTADO_ICON, TALLAS, TALLA_SIN_DIVIDIR, totalesPorTipoCam } from './constants'
import { generarFacturaPDF, generarFacturaMini, imprimirEtiqueta } from './factura'
import PanelPagos from './PanelPagos'
import ColorSwatch from './ColorSwatch'
import FormulaColorBoton from './FormulaColorBoton'

export default function DetalleModal({ pedido, onClose, onUpdated, onEditar, onCompartir, showToast }) {
  const [lightbox, setLightbox] = useState(null)
  if (!pedido) return null

  const pr = calcProgreso(pedido)
  const esSoloCamiseta = (pedido.items_camiseta || []).length > 0 && (pedido.items_chaqueta || []).length === 0
  const pedidoCompleto = pedido.estado === 'Entregado' ||
    (pr.total > 0 && pr.ok === pr.total) ||
    (pr.total === 0 && (pedido.items_chaqueta || []).every((it) => it.kilos_reales != null)) ||
    // Pedidos solo de camiseta: el precio ya se conoce sin pesar nada, así que
    // el botón de factura puede aparecer desde que se marca "Listo", sin
    // esperar a que se completen los ✅ de producción uno por uno. Los pedidos
    // con chaqueta NO entran aquí porque su precio depende del peso, que
    // normalmente se registra al entregar.
    (esSoloCamiseta && pedido.estado === 'Listo')

  async function cambiarEstado(nuevoEstado) {
    const cambios = { estado: nuevoEstado, actualizado_en: new Date().toISOString() }
    if (nuevoEstado === 'Entregado') cambios.fecha_entregado = new Date().toISOString().slice(0, 10)
    const { error } = await supabase.from('pedidos').update(cambios).eq('id', pedido.id)
    if (error) { showToast('⚠️', 'Error al cambiar estado'); return }
    showToast(ESTADO_ICON[nuevoEstado], `Estado actualizado a ${nuevoEstado}`)
    onUpdated()
  }

  // Guarda cuántas unidades de una celda están hechas (0..n). Reemplaza al
  // viejo "todo o nada": ahora se puede marcar un avance parcial, ej. de 19
  // van 15. Si la cantidad es 0, se borra la marca (celda "sin tocar"),
  // para no dejar el JSON lleno de ceros.
  async function guardarCantidad(itemTabla, itemId, ek, cantidad) {
    const estados = { ...(itemTabla.estados || {}) }
    if (cantidad > 0) estados[ek] = cantidad
    else delete estados[ek]
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
              <div style={{ fontFamily: "'DM Mono', monospace", color: '#fff', fontSize: 13, whiteSpace: 'nowrap' }}>✅ {pr.ok}/{pr.total} {pr.falta > 0 && `· 🟡 ${pr.falta}`}</div>
            </div>
            <div className="prod-legend">
              <span>Toca una etapa para marcar cuánto va:</span>
              <span style={{ color: 'var(--muted)', fontSize: 10 }}>· En camiseta: 🧵 tejido y 📦 empacado son etapas independientes</span>
            </div>
          </>
        )}

        {(pedido.items_camiseta || []).length > 0 && (
          <div className="msec">
            <h4>👔 Camiseta — {pedido.items_camiseta.length} ítem(s)</h4>
            {pedido.items_camiseta.map((it) => (
              <ItemCamView key={it.id} it={it} onToggle={guardarCantidad} onImgClick={setLightbox} showToast={showToast} pedidoId={pedido.id} />
            ))}
          </div>
        )}

        {(pedido.items_chaqueta || []).length > 0 && (
          <div className="msec">
            <h4>🧥 Chaqueta — {pedido.items_chaqueta.length} ítem(s)</h4>
            {pedido.items_chaqueta.map((it) => (
              <ItemChaqView key={it.id} it={it} estadoPedido={pedido.estado} onToggle={guardarCantidad} onPesaje={guardarPesaje} onImgClick={setLightbox} showToast={showToast} pedidoId={pedido.id} />
            ))}
          </div>
        )}

        <div className="brow right">
          <button className="btn btn-s" onClick={onClose}>Cerrar</button>
          <button className="btn btn-s" onClick={() => imprimirEtiqueta(pedido)}>🏷️ Etiqueta</button>
          <button className="btn btn-s" onClick={() => onCompartir(pedido)}>🔗 Compartir con cliente</button>
          {pedidoCompleto && (
            <button className="btn btn-s" onClick={() => generarFacturaPDF(pedido)} style={{ background: 'var(--weave)', color: 'var(--thread)', fontWeight: 700 }}>
              🧾 Descargar Factura
            </button>
          )}
          {pedidoCompleto && (
            <button className="btn btn-s" onClick={() => generarFacturaMini(pedido)} style={{ background: 'var(--weave)', color: 'var(--thread)', fontWeight: 700 }} title="Recibo condensado 10.5x15cm para impresora térmica Jadens">
              🧾 Factura mini (Jadens)
            </button>
          )}
          <button className="btn btn-p" onClick={onEditar}>✏️ Editar</button>
        </div>

        {/* Panel de pagos */}
        <div className="msec" style={{ marginTop: 8 }}>
          <h4>💳 Pagos y Abonos</h4>
          <PanelPagos
            pedido={pedido}
            onUpdated={onUpdated}
            showToast={showToast}
            compact={false}
          />
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

function ItemCamView({ it, onToggle, onImgClick, showToast, pedidoId }) {
  const [editando, setEditando] = useState(null) // { ek, n, etiqueta, valorActual }
  const tLabel = it.tipos.map((t) => `${TIPO_ICON[t]} ${TIPO_LABEL[t]}`).join(' + ')
  // Orden explícito guardado; si el ítem es viejo y no lo tiene, lo derivamos
  // como respaldo (Postgres no garantiza el orden de un objeto jsonb).
  const coloresPresentes = (it.colores && it.colores.length) ? it.colores : (() => {
    const list = []
    Object.values(it.tabla || {}).forEach((tallaObj) => {
      Object.keys(tallaObj).forEach((c) => { if (!list.includes(c)) list.push(c) })
    })
    return list
  })()
  const tallasPresentes = TALLAS.filter((t) => it.tabla && it.tabla[t])
  if (it.tabla && it.tabla[TALLA_SIN_DIVIDIR]) tallasPresentes.push(TALLA_SIN_DIVIDIR)

  function confirmarEditor(cantidad) {
    onToggle(it, it.id, editando.ek, cantidad)
    setEditando(null)
  }

  return (
    <div style={{ background: 'var(--loom)', border: '1px solid var(--cbd)', borderRadius: 9, padding: 12, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="badge cam">{tLabel}</span>
          {it.precios?.juego && <span className="badge cam" style={{ background: '#4b8523', color: '#fff' }}>🎽 Juego {fmtCOP(it.precios.juego)} c/u</span>}
          {it.diseno && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{it.diseno}</span>}
        </div>
        <span className="itot">{fmtCOP(it.total_precio)}</span>
      </div>

      <div className="tscroll cam-scroll">
        <table className="tg">
          <thead>
            <tr>
              <th className="th-l" rowSpan={2}>Talla</th>
              {coloresPresentes.map((c) => (
                <th key={c} colSpan={it.tipos.length} style={{ borderLeft: '2px solid rgba(255,255,255,.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    <ColorSwatch nombre={c} />
                    <span>{c}</span>
                   <FormulaColorBoton nombreColor={c} showToast={showToast} pedidoId={pedidoId} itemTipo="camiseta" itemId={it.id} />
                  </div>
                </th>
              ))}
              <th rowSpan={2}>Total</th>
            </tr>
            <tr>
              {coloresPresentes.map((c) => it.tipos.map((t) => (
                <th key={`${c}_${t}`} className="th-item-cam" style={{ borderLeft: '1px solid rgba(255,255,255,.15)' }}>{TIPO_LABEL[t]}</th>
              )))}
            </tr>
          </thead>
          <tbody>
            {tallasPresentes.map((talla) => {
              const tallaObj = it.tabla[talla]
              let totFila = 0
              return (
                <tr key={talla}>
                  <td className="td-key cam">{talla}</td>
                  {coloresPresentes.map((c) => it.tipos.map((t) => {
                    const n = (tallaObj[c] || {})[t] || 0
                    if (!n) return <td key={`${c}_${t}`} style={{ borderLeft: t === it.tipos[0] ? '2px solid #c8e6c9' : '1px solid var(--border)', textAlign: 'center', color: '#ccc' }}>—</td>
                    totFila += n
                    const base = `${talla}|${c}|${t}`
                    const ekTejido = `${base}|tejido`
                    const ekEmpacado = `${base}|revisado`
                    const valTejido = (it.estados || {})[ekTejido]
                    const valEmpacado = (it.estados || {})[ekEmpacado]
                    const claseTejido = claseCelda(valTejido, n)
                    const claseEmpacado = claseCelda(valEmpacado, n)
                    const hechoTejido = cantidadHecha(valTejido, n)
                    const hechoEmpacado = cantidadHecha(valEmpacado, n)
                    return (
                      <td key={`${c}_${t}`} className={claseEmpacado === 'ok' ? 'st-ok' : claseEmpacado === 'parcial' ? 'st-parcial' : ''} style={{ borderLeft: t === it.tipos[0] ? '2px solid #c8e6c9' : '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                          <span className="cell-cant">{n}</span>
                          <button
                            type="button"
                            className={`celda-etapa ${claseTejido === 'ok' ? 'st-ok' : claseTejido === 'parcial' ? 'st-parcial' : ''}`}
                            title="Tejido — toca para marcar cuánto va"
                            onClick={() => setEditando({ ek: ekTejido, n, etiqueta: `🧵 Tejido — ${talla} · ${c} · ${TIPO_LABEL[t]}`, valorActual: hechoTejido })}
                          >
                            🧵{claseTejido === 'parcial' ? ` faltan ${n - hechoTejido}` : ''}
                          </button>
                          <button
                            type="button"
                            className={`celda-etapa ${claseEmpacado === 'ok' ? 'st-ok' : claseEmpacado === 'parcial' ? 'st-parcial' : ''}`}
                            title="Revisado y empacado — toca para marcar cuánto va"
                            onClick={() => setEditando({ ek: ekEmpacado, n, etiqueta: `📦 Empacado — ${talla} · ${c} · ${TIPO_LABEL[t]}`, valorActual: hechoEmpacado })}
                          >
                            {claseEmpacado === 'ok' ? '✅' : '📦'}{claseEmpacado === 'parcial' ? ` faltan ${n - hechoEmpacado}` : ''}
                          </button>
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
        {it.precios?.juego
          ? `Juego (cuello + puño incluido): ${fmtCOP(it.precios.juego)} por cuello`
          : it.tipos.map((t) => `${TIPO_LABEL[t]}: ${fmtCOP(it.precios[t] || 0)}/u`).join(' · ')}
      </div>

      {(() => {
        const { cuello, puno } = totalesPorTipoCam(it.tabla)
        const esJuego = it.precios?.juego
        return (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, padding: '8px 12px', background: 'var(--ink)', borderRadius: 7 }}>
            {esJuego ? (
              <span style={{ fontSize: 12, color: 'var(--yarn)' }}>🎽 Total de juegos (cuellos): <strong style={{ color: '#fff' }}>{cuello}</strong>{puno > 0 && ` · +${puno} puños incluidos`}</span>
            ) : (
              <>
                {cuello > 0 && <span style={{ fontSize: 12, color: 'var(--yarn)' }}>🔵 Total cuellos: <strong style={{ color: '#fff' }}>{cuello}</strong></span>}
                {puno > 0 && <span style={{ fontSize: 12, color: 'var(--yarn)' }}>🧤 Total puños: <strong style={{ color: '#fff' }}>{puno}</strong></span>}
              </>
            )}
          </div>
        )
      })()}

      <EditorCantidad info={editando} onCerrar={() => setEditando(null)} onConfirmar={confirmarEditor} />
    </div>
  )
}

function ItemChaqView({ it, estadoPedido, onToggle, onPesaje, onImgClick, showToast, pedidoId }) {
  const [kg, setKg] = useState(it.kilos_reales || '')
  const [editando, setEditando] = useState(null)
  const tLabel = it.tipos.map((t) => `${TIPO_ICON[t]} ${TIPO_LABEL[t]}`).join(' + ')
  const p0 = it.precios[it.tipos[0]] || 0
  const coloresPresentes = ((it.colores && it.colores.length) ? it.colores : Object.keys(it.tabla || {})).filter((c) => it.tabla && it.tabla[c])

  function confirmarEditor(cantidad) {
    onToggle(it, it.id, editando.ek, cantidad)
    setEditando(null)
  }

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
          <thead><tr><th className="th-l">Color / Referencia</th>{it.tipos.map((t) => <th key={t} className="th-item-chaq">{TIPO_LABEL[t]}</th>)}<th>Total</th></tr></thead>
          <tbody>
            {coloresPresentes.map((color) => {
              const rowObj = it.tabla[color]
              let totF = 0
              return (
                <tr key={color}>
                 <td className="td-key chaq"><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><ColorSwatch nombre={color} /><span>{color}</span><FormulaColorBoton nombreColor={color} showToast={showToast} pedidoId={pedidoId} itemTipo="chaqueta" itemId={it.id} /></div></td>
                  {it.tipos.map((t) => {
                    const n = rowObj[t] || 0
                    if (!n) return <td key={t} style={{ textAlign: 'center', color: '#ccc' }}>—</td>
                    totF += n
                    const ek = `${color}|${t}`
                    const valor = (it.estados || {})[ek]
                    const clase = claseCelda(valor, n)
                    const hecho = cantidadHecha(valor, n)
                    return (
                      <td key={t} className={clase === 'ok' ? 'st-ok' : clase === 'parcial' ? 'st-parcial' : ''}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                          <span className="cell-cant">{n}</span>
                          <button
                            type="button"
                            className={`celda-etapa ${clase === 'ok' ? 'st-ok' : clase === 'parcial' ? 'st-parcial' : ''}`}
                            title="Toca para marcar cuánto va"
                            onClick={() => setEditando({ ek, n, etiqueta: `${TIPO_LABEL[t]} — ${color}`, valorActual: hecho })}
                          >
                            {clase === 'ok' ? '✅' : '📦'}{clase === 'parcial' ? ` faltan ${n - hecho}` : ''}
                          </button>
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

      <EditorCantidad info={editando} onCerrar={() => setEditando(null)} onConfirmar={confirmarEditor} />
    </div>
  )
}

// Modal compartido: edita cuántas unidades de UNA celda (una etapa de un
// color/talla/tipo) están hechas. Abrir el modal es el "primer paso"
// (tentativo, nada se guarda todavía); tocar "Guardar" es la confirmación
// final que sí escribe el cambio — así un toque accidental en la tabla
// nunca marca ni desmarca nada por sí solo.
function EditorCantidad({ info, onCerrar, onConfirmar }) {
  const [valor, setValor] = useState(0)
  useEffect(() => { if (info) setValor(info.valorActual || 0) }, [info])
  if (!info) return null
  const { etiqueta, n } = info
  const faltan = Math.max(0, n - valor)

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="modal" style={{ maxWidth: 340 }}>
        <div className="mtitle">{etiqueta}</div>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>Cantidad total de esta celda: <strong>{n}</strong></p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 12 }}>
          <button type="button" className="btn btn-s" onClick={() => setValor((v) => Math.max(0, v - 1))}>−</button>
          <input
            type="number" min="0" max={n} value={valor}
            onChange={(e) => setValor(Math.max(0, Math.min(n, parseInt(e.target.value) || 0)))}
            style={{ width: 74, textAlign: 'center', fontSize: 22, fontWeight: 800, fontFamily: "'DM Mono', monospace", border: '1px solid var(--border)', borderRadius: 8, padding: '6px 4px' }}
          />
          <button type="button" className="btn btn-s" onClick={() => setValor((v) => Math.min(n, v + 1))}>＋</button>
        </div>

        <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, marginBottom: 14, color: valor === 0 ? 'var(--muted)' : faltan === 0 ? 'var(--thread)' : 'var(--warn)' }}>
          {valor === 0 ? 'Nada hecho todavía' : faltan === 0 ? '✅ Completo' : `Van ${valor} de ${n} — faltan ${faltan}`}
        </div>

        <div className="brow" style={{ justifyContent: 'center', gap: 8, marginBottom: 14 }}>
          <button type="button" className="btn btn-s btn-sm" onClick={() => setValor(0)}>Nada</button>
          <button type="button" className="btn btn-s btn-sm" onClick={() => setValor(n)}>✅ Completo</button>
        </div>

        <div className="brow right">
          <button className="btn btn-s" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-p" onClick={() => onConfirmar(valor)}>💾 Guardar</button>
        </div>
      </div>
    </div>
  )
}
