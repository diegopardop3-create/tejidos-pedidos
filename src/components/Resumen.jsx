import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { MESES, TIPO_LABEL, fmtCOP } from './constants'

export default function Resumen({ pedidos }) {
  const [abonos, setAbonos] = useState([]) // todos los abonos para calcular cartera

  useEffect(() => {
    supabase.from('abonos').select('pedido_id, monto')
      .then(({ data }) => setAbonos(data || []))
  }, [])

  const now = new Date()
  const mes = now.getMonth()
  const anio = now.getFullYear()

  const total = pedidos.length
  const pend = pedidos.filter(p => p.estado === 'Pendiente').length
  const proc = pedidos.filter(p => p.estado === 'En proceso').length
  const listo = pedidos.filter(p => p.estado === 'Listo').length
  const entr = pedidos.filter(p => p.estado === 'Entregado').length

  // Total real de cada pedido (camiseta + chaqueta pesada)
  function totalReal(p) {
    const cam = p.total_camiseta || 0
    const chaq = (p.items_chaqueta || []).reduce((s, it) => s + (it.total_final || 0), 0)
    return cam + chaq
  }

  const val = pedidos.reduce((s, p) => s + totalReal(p), 0)

  // Cartera: mapa de pedido_id → total abonado
  const abonosPorPedido = {}
  abonos.forEach(a => {
    abonosPorPedido[a.pedido_id] = (abonosPorPedido[a.pedido_id] || 0) + a.monto
  })

  // Saldo pendiente por cada pedido
  const carteraTotal = pedidos.reduce((s, p) => {
    const tot = totalReal(p)
    const abonado = abonosPorPedido[p.id] || 0
    return s + Math.max(0, tot - abonado)
  }, 0)

  // Pedidos entregados que NO han pagado nada o deben algo
  const pendientesCobro = pedidos.filter(p => {
    if (p.estado !== 'Entregado') return false
    const tot = totalReal(p)
    const abonado = abonosPorPedido[p.id] || 0
    return tot > abonado
  })

  const delMes = pedidos.filter(p => {
    const d = new Date(p.fecha + 'T00:00:00')
    return d.getMonth() === mes && d.getFullYear() === anio
  })

  const prods = {}
  pedidos.forEach(p => {
    ;(p.items_camiseta || []).forEach(it => {
      it.tipos.forEach(t => {
        const k = TIPO_LABEL[t] + ' Camiseta'
        if (!prods[k]) prods[k] = { u: 0, tot: 0 }
        prods[k].u += it.total_unidades || 0
        prods[k].tot += it.total_precio || 0
      })
    })
    ;(p.items_chaqueta || []).forEach(it => {
      it.tipos.forEach(t => {
        const k = TIPO_LABEL[t] + ' Chaqueta'
        if (!prods[k]) prods[k] = { u: 0, tot: 0 }
        prods[k].u += it.total_unidades || 0
        prods[k].tot += it.total_final || 0
      })
    })
  })

  const cd = {}
  pedidos.forEach(p => {
    if (!cd[p.cliente]) cd[p.cliente] = { n: 0, tot: 0, entr: 0, saldo: 0 }
    cd[p.cliente].n++
    cd[p.cliente].tot += totalReal(p)
    if (p.estado === 'Entregado') cd[p.cliente].entr++
    const abonado = abonosPorPedido[p.id] || 0
    cd[p.cliente].saldo += Math.max(0, totalReal(p) - abonado)
  })

  return (
    <div>
      {/* Tarjetas principales */}
      <div className="rgrid">
        <div className="rc dk"><div className="rl">Total Pedidos</div><div className="rv">{total}</div><div className="rsb">registrados</div></div>
        <div className="rc pend"><div className="rl">Pendientes</div><div className="rv">{pend}</div><div className="rsb">por entregar</div></div>
        <div className="rc warn"><div className="rl">En Proceso</div><div className="rv">{proc}</div><div className="rsb">producción</div></div>
        <div className="rc" style={{ borderColor: '#4a90d9', background: '#f0f6ff' }}>
          <div className="rl">Listos</div>
          <div className="rv" style={{ color: '#4a90d9' }}>{listo}</div>
          <div className="rsb">para entregar</div>
        </div>
        <div className="rc done"><div className="rl">Entregados</div><div className="rv">{entr}</div><div className="rsb">completados</div></div>
      </div>

      {/* Cartera total — lo más importante financieramente */}
      <div style={{
        background: 'var(--ink)', borderRadius: 12, padding: '18px 22px',
        marginBottom: 18, display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14,
      }}>
        <div>
          <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: 'var(--yarn)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>
            💰 Cartera por cobrar
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: carteraTotal > 0 ? '#f0a500' : 'var(--yarn)' }}>
            {fmtCOP(carteraTotal)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--yarn)', marginTop: 3, opacity: .7 }}>
            saldo total pendiente de cobro
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: 'var(--yarn)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>
            📊 Valor producido
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>{fmtCOP(val)}</div>
          <div style={{ fontSize: 11, color: 'var(--yarn)', marginTop: 3, opacity: .7 }}>total facturado acumulado</div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: 'var(--yarn)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>
            ✅ Recaudado
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--yarn)' }}>{fmtCOP(val - carteraTotal)}</div>
          <div style={{ fontSize: 11, color: 'var(--yarn)', marginTop: 3, opacity: .7 }}>pagos recibidos</div>
        </div>
      </div>

      {/* Alertas de cobro — entregados sin pagar */}
      {pendientesCobro.length > 0 && (
        <div style={{
          background: '#fff8e1', border: '1.5px solid #f0a500',
          borderRadius: 12, padding: '16px 20px', marginBottom: 18,
        }}>
          <div style={{ fontWeight: 700, color: '#8a5a16', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            ⚠️ Pedidos entregados con saldo pendiente ({pendientesCobro.length})
          </div>
          {pendientesCobro.map(p => {
            const tot = totalReal(p)
            const abonado = abonosPorPedido[p.id] || 0
            const saldo = tot - abonado
            return (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', background: '#fffdf8', borderRadius: 8,
                marginBottom: 6, border: '1px solid #f0c080', flexWrap: 'wrap', gap: 6,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: '#1a3c63', fontSize: 13 }}>{p.numero}</span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{p.cliente}</span>
                  {abonado > 0 && (
                    <span style={{ fontSize: 11, color: '#4b8523', fontFamily: "'DM Mono', monospace" }}>
                      abonó {fmtCOP(abonado)}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800, color: '#c0392b', fontSize: 14 }}>
                    {fmtCOP(saldo)}
                  </span>
                  <span style={{ fontSize: 11, color: '#8a5a16' }}>por cobrar</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Mes actual */}
      <div className="mes-card">
        <div className="mes-title">📅 {MESES[mes]} {anio} — Este mes</div>
        <div className="mes-grid">
          <div className="mes-item"><div className="mes-lbl">Pedidos</div><div className="mes-val">{delMes.length}</div></div>
          <div className="mes-item"><div className="mes-lbl">Entregados</div><div className="mes-val acc">{delMes.filter(p => p.estado === 'Entregado').length}</div></div>
          <div className="mes-item"><div className="mes-lbl">Pendientes</div><div className="mes-val">{delMes.filter(p => p.estado === 'Pendiente').length}</div></div>
          <div className="mes-item"><div className="mes-lbl">En Proceso</div><div className="mes-val">{delMes.filter(p => p.estado === 'En proceso').length}</div></div>
          <div className="mes-item">
            <div className="mes-lbl">Valor mes</div>
            <div className="mes-val acc">{fmtCOP(delMes.reduce((s, p) => s + totalReal(p), 0))}</div>
          </div>
        </div>
      </div>

      {/* Por producto */}
      <div className="card">
        <div className="ctitle">Por tipo de producto</div>
        {Object.entries(prods).sort((a, b) => b[1].tot - a[1].tot).map(([k, v]) => (
          <div className="rrow" key={k}>
            <span className="rn">{k}</span>
            <div className="rst"><span className="rs">{v.u} u</span><span className="rs g">{fmtCOP(v.tot)}</span></div>
          </div>
        ))}
        {!Object.keys(prods).length && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Sin datos</p>}
      </div>

      {/* Por cliente con saldo */}
      <div className="card">
        <div className="ctitle">Por cliente</div>
        {Object.entries(cd).sort((a, b) => b[1].saldo - a[1].saldo).map(([k, v]) => (
          <div className="rrow" key={k}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap' }}>
              <span className="rn">{k}</span>
              {v.saldo > 0 && (
                <span style={{ fontSize: 11, background: '#fff3cd', color: '#8a5a16', padding: '2px 7px', borderRadius: 10, fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>
                  debe {fmtCOP(v.saldo)}
                </span>
              )}
            </div>
            <div className="rst">
              <span className="rs">{v.n} ped.</span>
              <span className="rs">{v.entr} entregados</span>
              <span className="rs g">{fmtCOP(v.tot)}</span>
            </div>
          </div>
        ))}
        {!Object.keys(cd).length && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Sin datos</p>}
      </div>
    </div>
  )
}
