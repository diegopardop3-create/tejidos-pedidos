import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { fmtCOP, fmtFecha, PAGO_COLOR } from './constants'

export default function PanelPagos({ pedido, onUpdated, showToast, compact = false }) {
  const [abonos, setAbonos] = useState([])
  const [monto, setMonto] = useState('')
  const [nota, setNota] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [guardando, setGuardando] = useState(false)
  const [expandido, setExpandido] = useState(!compact)
  // Edición de abono existente
  const [editId, setEditId] = useState(null)
  const [editMonto, setEditMonto] = useState('')
  const [editNota, setEditNota] = useState('')
  const [editFecha, setEditFecha] = useState('')

  const totCam = pedido.total_camiseta || 0
  const itemsChaq = pedido.items_chaqueta || []
  const totChaqPesada = itemsChaq.reduce((s, it) => s + (it.total_final || 0), 0)
  const totalPedido = totCam + totChaqPesada
  // Si falta pesar alguna chaqueta, el total mostrado todavía no es el
  // definitivo — se avisa para que no se cobre de menos por error.
  const hayChaqPendiente = itemsChaq.some((it) => it.kilos_reales == null)

  useEffect(() => { cargarAbonos() }, [pedido.id])

  async function cargarAbonos() {
    const { data } = await supabase
      .from('abonos').select('*')
      .eq('pedido_id', pedido.id)
      .order('fecha', { ascending: false })
    setAbonos(data || [])
  }

  async function actualizarEstadoPago(totalAbonadoNuevo) {
    const nuevoEstado = totalAbonadoNuevo <= 0 ? 'Pendiente'
      : totalAbonadoNuevo >= totalPedido ? 'Pagado' : 'Parcial'
    await supabase.from('pedidos').update({ estado_pago: nuevoEstado }).eq('id', pedido.id)
  }

  const totalAbonado = abonos.reduce((s, a) => s + (a.monto || 0), 0)
  const saldoPendiente = Math.max(0, totalPedido - totalAbonado)
  const estadoPago = totalAbonado === 0 ? 'Pendiente' : saldoPendiente === 0 ? 'Pagado' : 'Parcial'
  const pct = totalPedido > 0 ? Math.min(100, Math.round((totalAbonado / totalPedido) * 100)) : 0
  const colorEstado = PAGO_COLOR[estadoPago]

  async function registrarAbono() {
    const n = Math.round(parseFloat(monto) || 0)
    if (!n || n <= 0) { showToast('⚠️', 'Ingresa un monto válido'); return }
    setGuardando(true)
    const { error } = await supabase.from('abonos').insert({
      pedido_id: pedido.id, monto: n, nota: nota.trim() || null, fecha,
    })
    if (error) { showToast('⚠️', 'Error al registrar'); setGuardando(false); return }
    await actualizarEstadoPago(totalAbonado + n)
    setMonto(''); setNota(''); setFecha(new Date().toISOString().slice(0, 10))
    setGuardando(false)
    await cargarAbonos()
    onUpdated?.()
    showToast('💰', `Abono de ${fmtCOP(n)} registrado`)
  }

  async function eliminarAbono(id, montoAbono) {
    if (!confirm(`¿Eliminar este abono de ${fmtCOP(montoAbono)}?`)) return
    await supabase.from('abonos').delete().eq('id', id)
    await actualizarEstadoPago(totalAbonado - montoAbono)
    await cargarAbonos()
    onUpdated?.()
    showToast('🗑️', 'Abono eliminado')
  }

  function abrirEdicion(a) {
    setEditId(a.id)
    setEditMonto(String(a.monto))
    setEditNota(a.nota || '')
    setEditFecha(a.fecha)
  }
  function cancelarEdicion() { setEditId(null) }

  async function guardarEdicion(abonoAnterior) {
    const n = Math.round(parseFloat(editMonto) || 0)
    if (!n || n <= 0) { showToast('⚠️', 'Ingresa un monto válido'); return }
    const { error } = await supabase.from('abonos').update({
      monto: n, nota: editNota.trim() || null, fecha: editFecha,
    }).eq('id', editId)
    if (error) { showToast('⚠️', 'Error al actualizar'); return }
    const nuevoTotal = totalAbonado - abonoAnterior.monto + n
    await actualizarEstadoPago(nuevoTotal)
    setEditId(null)
    await cargarAbonos()
    onUpdated?.()
    showToast('✅', 'Abono actualizado')
  }

  async function marcarPagado() {
    const restante = saldoPendiente
    if (restante <= 0) { showToast('ℹ️', 'Ya está pagado'); return }
    if (!confirm(`¿Registrar pago del saldo restante (${fmtCOP(restante)})?`)) return
    setGuardando(true)
    await supabase.from('abonos').insert({
      pedido_id: pedido.id, monto: restante, nota: 'Pago total', fecha,
    })
    await supabase.from('pedidos').update({ estado_pago: 'Pagado' }).eq('id', pedido.id)
    setGuardando(false)
    await cargarAbonos()
    onUpdated?.()
    showToast('✅', '¡Pedido marcado como pagado!')
  }

  const inp = {
    padding: '7px 10px', border: '1px solid #dde3d2', borderRadius: 7,
    fontSize: 13, background: '#f5f2e7', outline: 'none', width: '100%',
  }
  const lbl = {
    fontSize: 10, color: '#6a7d5a', fontFamily: "'DM Mono', monospace",
    textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3, display: 'block',
  }

  return (
    <div style={{
      border: `1px solid ${colorEstado}30`, borderRadius: 10,
      background: estadoPago === 'Pagado' ? '#f1f6ec' : estadoPago === 'Parcial' ? '#fffbf0' : '#fdf8ee',
      overflow: 'hidden', marginTop: compact ? 0 : 12,
    }}>
      {/* Total del pedido — arriba del todo, porque la lista ya no muestra
          la columna Total: este panel es donde se consulta el valor. */}
      {totalPedido > 0 && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: '10px 14px 0' }}>
          <span style={{ fontSize: 10, color: '#6a7d5a', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Total del pedido
          </span>
          <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', fontFamily: "'DM Mono', monospace" }}>
            {fmtCOP(totalPedido)}
            {hayChaqPendiente && <span style={{ fontSize: 10, color: 'var(--warn)', marginLeft: 5, fontWeight: 700 }}>+⚖️ falta pesar</span>}
          </span>
        </div>
      )}

      {/* Cabecera */}
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: compact ? 'pointer' : 'default', gap: 10 }}
        onClick={() => compact && setExpandido(e => !e)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: colorEstado, background: `${colorEstado}18`, padding: '3px 10px', borderRadius: 20 }}>
            {estadoPago === 'Pagado' ? '✅ Pagado' : estadoPago === 'Parcial' ? `💰 Parcial — abonado ${fmtCOP(totalAbonado)}` : '💳 Sin pago'}
          </span>
          {saldoPendiente > 0 && (
            <span style={{ fontSize: 12, color: '#8a5a16', fontFamily: "'DM Mono', monospace" }}>
              Saldo: <strong>{fmtCOP(saldoPendiente)}</strong>
            </span>
          )}
        </div>
        {totalPedido > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <div style={{ width: 80, height: 6, background: '#e0e0e0', borderRadius: 20, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: colorEstado, borderRadius: 20, transition: 'width .3s' }} />
            </div>
            <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: colorEstado, fontWeight: 700 }}>{pct}%</span>
          </div>
        )}
        {compact && <span style={{ fontSize: 14, color: '#aaa' }}>{expandido ? '▲' : '▼'}</span>}
      </div>

      {expandido && (
        <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${colorEstado}20` }}>

          {/* Historial con edición */}
          {abonos.length > 0 && (
            <div style={{ marginTop: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6a7d5a', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                Historial de pagos
              </div>
              {abonos.map(a => (
                <div key={a.id}>
                  {editId === a.id ? (
                    /* Fila en modo edición */
                    <div style={{ background: '#fff', border: '1px solid #dde3d2', borderRadius: 8, padding: 10, marginBottom: 6 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#1a3c63', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', marginBottom: 8 }}>
                        ✏️ Editando abono
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                        <div>
                          <label style={lbl}>Monto (sin puntos)</label>
                          <input type="number" step="1" min="0" value={editMonto} onChange={e => setEditMonto(e.target.value)} style={{ ...inp, fontFamily: "'DM Mono', monospace" }} />
                          {editMonto > 0 && <span style={{ fontSize: 11, color: '#4b8523', fontFamily: "'DM Mono', monospace" }}>= {fmtCOP(editMonto)}</span>}
                        </div>
                        <div>
                          <label style={lbl}>Fecha</label>
                          <input type="date" value={editFecha} onChange={e => setEditFecha(e.target.value)} style={inp} />
                        </div>
                        <div style={{ gridColumn: '1/-1' }}>
                          <label style={lbl}>Nota (opcional)</label>
                          <input type="text" value={editNota} onChange={e => setEditNota(e.target.value)} placeholder="Ej: efectivo, nequi..." style={inp} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => guardarEdicion(a)} style={{ padding: '6px 12px', background: '#4b8523', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          Guardar cambio
                        </button>
                        <button onClick={cancelarEdicion} style={{ padding: '6px 12px', background: '#f5f2e7', color: '#6a7d5a', border: '1px solid #dde3d2', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Fila normal con botones editar y eliminar */
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px dotted #e0e0e0', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: '#4b8523', fontSize: 13 }}>{fmtCOP(a.monto)}</span>
                        {a.nota && <span style={{ fontSize: 11, color: '#6a7d5a', marginLeft: 8 }}>{a.nota}</span>}
                      </div>
                      <span style={{ fontSize: 11, color: '#aaa', fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>{fmtFecha(a.fecha)}</span>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button onClick={() => abrirEdicion(a)} title="Editar abono" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#1a3c63', padding: '0 3px' }}>✏️</button>
                        <button onClick={() => eliminarAbono(a.id, a.monto)} title="Eliminar abono" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#ccc', padding: '0 3px' }}>✕</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 7, fontWeight: 700, fontSize: 13 }}>
                <span>Total abonado</span>
                <span style={{ color: '#4b8523', fontFamily: "'DM Mono', monospace" }}>{fmtCOP(totalAbonado)}</span>
              </div>
            </div>
          )}

          {/* Nuevo abono */}
          {estadoPago !== 'Pagado' && !editId && (
            <div style={{ background: '#fffdf8', border: '1px solid #e0e0e0', borderRadius: 8, padding: 12, marginTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6a7d5a', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
                Registrar abono
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <label style={lbl}>Monto (sin puntos)</label>
                  <input type="number" step="1" min="0" value={monto} onChange={e => setMonto(e.target.value)} placeholder="Ej: 50000" style={{ ...inp, fontFamily: "'DM Mono', monospace" }} />
                  {monto > 0 && <span style={{ fontSize: 11, color: '#4b8523', fontFamily: "'DM Mono', monospace" }}>= {fmtCOP(monto)}</span>}
                </div>
                <div>
                  <label style={lbl}>Fecha</label>
                  <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inp} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={lbl}>Nota (opcional)</label>
                  <input type="text" value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej: anticipo, resto, efectivo, nequi..." style={inp} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={registrarAbono} disabled={guardando} style={{ padding: '7px 14px', background: '#4b8523', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {guardando ? 'Guardando…' : '＋ Registrar abono'}
                </button>
                {totalPedido > 0 && saldoPendiente > 0 && (
                  <button onClick={marcarPagado} disabled={guardando} style={{ padding: '7px 14px', background: '#fff', color: '#4b8523', border: '1.5px solid #4b8523', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    ✅ Marcar como pagado ({fmtCOP(saldoPendiente)})
                  </button>
                )}
              </div>
            </div>
          )}

          {estadoPago === 'Pagado' && (
            <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 13, color: '#4b8523', fontWeight: 600 }}>
              ✅ Pedido pagado completamente
            </div>
          )}
        </div>
      )}
    </div>
  )
}
