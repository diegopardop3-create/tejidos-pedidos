import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { TIPO_LABEL, fmtFecha, fmtCOP, calcProgreso, ESTADO_ICON, PAGO_COLOR, PAGO_ICON } from './constants'
import logo from '../assets/logo.png'

// Vista pública de un pedido: se accede por enlace con token, sin necesidad
// de iniciar sesión. Solo lectura — el cliente ve el estado de su pedido.
export default function VistaPublica({ token }) {
  const [pedido, setPedido] = useState(undefined)
  const [abonos, setAbonos] = useState([])

  useEffect(() => {
    async function cargar() {
      const { data, error } = await supabase
        .from('pedidos')
        .select('*, items_camiseta(*), items_chaqueta(*)')
        .eq('token_publico', token)
        .maybeSingle()
      if (error || !data) { setPedido(null); return }
      setPedido(data)
      // Cargar abonos
      const { data: abonosData } = await supabase
        .from('abonos')
        .select('*')
        .eq('pedido_id', data.id)
        .order('fecha', { ascending: false })
      setAbonos(abonosData || [])
    }
    cargar()
  }, [token])

  if (pedido === undefined) {
    return <div style={styles.center}><p style={{ color: '#6a7d5a' }}>Cargando pedido…</p></div>
  }
  if (pedido === null) {
    return (
      <div style={styles.center}>
        <div style={styles.card}>
          <img src={logo} alt="" style={{ height: 70, marginBottom: 16 }} />
          <p style={{ color: '#c0392b', fontWeight: 600 }}>No se encontró este pedido.</p>
          <p style={{ color: '#6a7d5a', fontSize: 13, marginTop: 6 }}>Verifica el enlace o contacta a Tejidos y Confecciones Laura Lizeth.</p>
        </div>
      </div>
    )
  }

  const pr = calcProgreso(pedido)
  const totalCam = pedido.total_camiseta || 0
  const hayChaq = (pedido.items_chaqueta || []).length > 0
  const totChaqFinal = (pedido.items_chaqueta || []).reduce((s, it) => s + (it.total_final || 0), 0)
  const pendientePesaje = (pedido.items_chaqueta || []).some((it) => !it.kilos_reales)
  const totalPedido = pendientePesaje ? totalCam : totalCam + totChaqFinal
  const totalAbonado = abonos.reduce((s, a) => s + (a.monto || 0), 0)
  const saldoPendiente = Math.max(0, totalPedido - totalAbonado)
  const estadoPago = pedido.estado_pago || 'Pendiente'
  const colorPago = PAGO_COLOR[estadoPago]
  const pctPago = totalPedido > 0 ? Math.min(100, Math.round((totalAbonado / totalPedido) * 100)) : 0

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <img src={logo} alt="L&L" style={{ height: 80 }} />
        </div>

        <div style={styles.numBox}>
          <div style={styles.numLabel}>Tu Pedido</div>
          <div style={styles.numValue}>{pedido.numero}</div>
        </div>

        <div style={styles.infoGrid}>
          <div><span style={styles.k}>Cliente</span><div style={styles.v}>{pedido.cliente}</div></div>
          <div><span style={styles.k}>Fecha</span><div style={styles.v}>{fmtFecha(pedido.fecha)}</div></div>
        </div>

        <div style={styles.estadoBox}>
          <div style={styles.k}>Estado actual</div>
          <div style={styles.estadoVal}>{ESTADO_ICON[pedido.estado]} {pedido.estado}</div>
        </div>

        {pr.total > 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={styles.k}>Progreso de producción</div>
            <div style={styles.progWrap}><div style={{ ...styles.progBar, width: `${pr.pct}%` }} /></div>
            <div style={{ fontSize: 12, color: '#6a7d5a', marginTop: 4 }}>{pr.ok} de {pr.total} listas {pr.falta > 0 ? `· ${pr.falta} pendientes` : ''}</div>
          </div>
        )}

        <div style={{ marginTop: 22 }}>
          <div style={styles.sectionTitle}>Productos</div>
          {(pedido.items_camiseta || []).map((it, i) => (
            <div key={i} style={styles.itemRow}>
              <span>👔 {it.tipos.map((t) => TIPO_LABEL[t]).join(' + ')} (Camiseta)</span>
              <span style={{ fontWeight: 700 }}>{fmtCOP(it.total_precio)}</span>
            </div>
          ))}
          {(pedido.items_chaqueta || []).map((it, i) => (
            <div key={i} style={styles.itemRow}>
              <span>🧥 {it.tipos.map((t) => TIPO_LABEL[t]).join(' + ')} (Chaqueta)</span>
              <span style={{ fontWeight: 700 }}>{it.kilos_reales ? fmtCOP(it.total_final) : 'Pendiente de pesaje'}</span>
            </div>
          ))}
        </div>

        <div style={styles.totalBox}>
          <span>Total</span>
          <span style={{ fontSize: 20, fontWeight: 800 }}>
            {pendientePesaje ? `${fmtCOP(totalCam)} + pesaje` : fmtCOP(totalCam + totChaqFinal)}
          </span>
        </div>

        {/* Estado de pago */}
        {totalPedido > 0 && (
          <div style={{ marginTop: 16, border: `1px solid ${colorPago}30`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: `${colorPago}12`, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: colorPago }}>
                {estadoPago === 'Pagado' ? '✅ Pagado completamente' : estadoPago === 'Parcial' ? '💰 Pago parcial' : '💳 Pendiente de pago'}
              </span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color: colorPago }}>{pctPago}%</span>
            </div>
            {estadoPago !== 'Pagado' && (
              <div style={{ padding: '12px 16px', textAlign: 'left' }}>
                {totalAbonado > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: '#6a7d5a' }}>Total abonado</span>
                    <span style={{ fontWeight: 700, color: '#4b8523', fontFamily: "'DM Mono', monospace" }}>{fmtCOP(totalAbonado)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#6a7d5a' }}>Saldo pendiente</span>
                  <span style={{ fontWeight: 800, color: colorPago, fontFamily: "'DM Mono', monospace", fontSize: 15 }}>{fmtCOP(saldoPendiente)}</span>
                </div>
                {/* Barra de progreso de pago */}
                <div style={{ background: '#e0e0e0', borderRadius: 20, height: 6, marginTop: 10, overflow: 'hidden' }}>
                  <div style={{ width: `${pctPago}%`, height: '100%', background: colorPago, borderRadius: 20 }} />
                </div>
              </div>
            )}
            {/* Historial de abonos */}
            {abonos.length > 0 && (
              <div style={{ padding: '0 16px 12px', borderTop: `1px solid ${colorPago}20` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#6a7d5a', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: '.06em', margin: '10px 0 6px' }}>Historial de pagos</div>
                {abonos.map(a => (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px dotted #eee', fontSize: 12 }}>
                    <span>{fmtFecha(a.fecha)}{a.nota ? ` — ${a.nota}` : ''}</span>
                    <span style={{ fontWeight: 700, color: '#4b8523', fontFamily: "'DM Mono', monospace" }}>{fmtCOP(a.monto)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {pedido.observaciones && (
          <div style={{ marginTop: 16, fontSize: 13, color: '#444' }}>
            <strong>Observaciones:</strong> {pedido.observaciones}
          </div>
        )}

        <div style={styles.footer}>Tejidos y Confecciones Laura Lizeth</div>
      </div>
    </div>
  )
}

const styles = {
  wrap: { minHeight: '100vh', background: '#f5f2e7', display: 'flex', justifyContent: 'center', padding: '32px 16px', fontFamily: "'Inter', sans-serif" },
  center: { minHeight: '100vh', background: '#f5f2e7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', sans-serif" },
  card: { background: '#fffdf8', borderRadius: 16, padding: 28, maxWidth: 480, width: '100%', height: 'fit-content', border: '1px solid #dde3d2', boxShadow: '0 8px 30px rgba(26,60,99,0.08)', textAlign: 'center' },
  numBox: { background: '#1a3c63', borderRadius: 10, padding: '14px 18px', marginBottom: 20 },
  numLabel: { fontSize: 10, color: '#a8c98a', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'DM Mono', monospace" },
  numValue: { fontSize: 26, fontWeight: 800, color: '#fff', fontFamily: "'DM Mono', monospace" },
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16, textAlign: 'left' },
  k: { fontSize: 10, color: '#6a7d5a', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'DM Mono', monospace" },
  v: { fontSize: 14, fontWeight: 600, color: '#1a3c63', marginTop: 2 },
  estadoBox: { background: '#f1f6ec', borderRadius: 10, padding: '14px 18px', textAlign: 'left', marginBottom: 4 },
  estadoVal: { fontSize: 18, fontWeight: 700, color: '#1a3c63', marginTop: 4 },
  progWrap: { background: '#eee', borderRadius: 20, height: 8, marginTop: 6, overflow: 'hidden' },
  progBar: { background: '#4b8523', height: '100%', borderRadius: 20 },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: '#6a7d5a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, textAlign: 'left', fontFamily: "'DM Mono', monospace" },
  itemRow: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #eee', fontSize: 13, textAlign: 'left' },
  totalBox: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 16, borderTop: '2px solid #1a3c63', color: '#4b8523' },
  footer: { marginTop: 28, fontSize: 11, color: '#aaa', borderTop: '1px solid #eee', paddingTop: 14 },
}
