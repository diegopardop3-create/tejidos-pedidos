import { MESES, TIPO_LABEL } from './constants'

export default function Resumen({ pedidos }) {
  const now = new Date()
  const mes = now.getMonth()
  const anio = now.getFullYear()

  const total = pedidos.length
  const pend = pedidos.filter((p) => p.estado === 'Pendiente').length
  const proc = pedidos.filter((p) => p.estado === 'En proceso').length
  const entr = pedidos.filter((p) => p.estado === 'Entregado').length
  const val = pedidos.reduce((s, p) => s + (p.total_final || p.total_camiseta || 0), 0)

  const delMes = pedidos.filter((p) => {
    const d = new Date(p.fecha + 'T00:00:00')
    return d.getMonth() === mes && d.getFullYear() === anio
  })

  const prods = {}
  pedidos.forEach((p) => {
    ;(p.items_camiseta || []).forEach((it) => {
      it.tipos.forEach((t) => {
        const k = TIPO_LABEL[t] + ' Camiseta'
        if (!prods[k]) prods[k] = { u: 0, tot: 0 }
        prods[k].u += it.total_unidades || 0
        prods[k].tot += it.total_precio || 0
      })
    })
    ;(p.items_chaqueta || []).forEach((it) => {
      it.tipos.forEach((t) => {
        const k = TIPO_LABEL[t] + ' Chaqueta'
        if (!prods[k]) prods[k] = { u: 0, tot: 0 }
        prods[k].u += it.total_unidades || 0
        prods[k].tot += it.total_final || 0
      })
    })
  })

  const cd = {}
  pedidos.forEach((p) => {
    if (!cd[p.cliente]) cd[p.cliente] = { n: 0, tot: 0, entr: 0 }
    cd[p.cliente].n++
    cd[p.cliente].tot += p.total_final || p.total_camiseta || 0
    if (p.estado === 'Entregado') cd[p.cliente].entr++
  })

  return (
    <div>
      <div className="rgrid">
        <div className="rc dk"><div className="rl">Total Pedidos</div><div className="rv">{total}</div><div className="rsb">registrados</div></div>
        <div className="rc pend"><div className="rl">Pendientes</div><div className="rv">{pend}</div><div className="rsb">por entregar</div></div>
        <div className="rc warn"><div className="rl">En Proceso</div><div className="rv">{proc}</div><div className="rsb">producción</div></div>
        <div className="rc done"><div className="rl">Entregados</div><div className="rv">{entr}</div><div className="rsb">completados</div></div>
        <div className="rc dk"><div className="rl">Valor Total</div><div className="rv" style={{ fontSize: 18 }}>${val.toFixed(2)}</div><div className="rsb">acumulado</div></div>
      </div>

      <div className="mes-card">
        <div className="mes-title">📅 {MESES[mes]} {anio} — Este mes</div>
        <div className="mes-grid">
          <div className="mes-item"><div className="mes-lbl">Pedidos</div><div className="mes-val">{delMes.length}</div></div>
          <div className="mes-item"><div className="mes-lbl">Entregados</div><div className="mes-val acc">{delMes.filter((p) => p.estado === 'Entregado').length}</div></div>
          <div className="mes-item"><div className="mes-lbl">Pendientes</div><div className="mes-val">{delMes.filter((p) => p.estado === 'Pendiente').length}</div></div>
          <div className="mes-item"><div className="mes-lbl">En Proceso</div><div className="mes-val">{delMes.filter((p) => p.estado === 'En proceso').length}</div></div>
          <div className="mes-item"><div className="mes-lbl">Valor mes</div><div className="mes-val acc">${delMes.reduce((s, p) => s + (p.total_final || p.total_camiseta || 0), 0).toFixed(2)}</div></div>
        </div>
      </div>

      <div className="card">
        <div className="ctitle">Por tipo de producto</div>
        {Object.entries(prods).sort((a, b) => b[1].tot - a[1].tot).map(([k, v]) => (
          <div className="rrow" key={k}>
            <span className="rn">{k}</span>
            <div className="rst"><span className="rs">{v.u} u</span><span className="rs g">${v.tot.toFixed(2)}</span></div>
          </div>
        ))}
        {!Object.keys(prods).length && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Sin datos</p>}
      </div>

      <div className="card">
        <div className="ctitle">Por cliente</div>
        {Object.entries(cd).sort((a, b) => b[1].tot - a[1].tot).map(([k, v]) => (
          <div className="rrow" key={k}>
            <span className="rn">{k}</span>
            <div className="rst"><span className="rs">{v.n} ped.</span><span className="rs">{v.entr} entregados</span><span className="rs g">${v.tot.toFixed(2)}</span></div>
          </div>
        ))}
        {!Object.keys(cd).length && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Sin datos</p>}
      </div>
    </div>
  )
}
