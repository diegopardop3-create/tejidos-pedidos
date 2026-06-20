import { useState } from 'react'
import { TIPO_LABEL, TIPO_ICON, fmtFecha, calcProgreso } from './constants'

export default function ListaPedidos({ pedidos, loading, onVerDetalle, onEliminar, showToast }) {
  const [busqueda, setBusqueda] = useState('')
  const [filEstado, setFilEstado] = useState('')

  const filtrados = pedidos.filter((p) => {
    const match = (p.cliente + ' ' + p.numero).toLowerCase().includes(busqueda.toLowerCase())
    const me = !filEstado || p.estado === filEstado
    return match && me
  })

  function exportCSV() {
    if (!pedidos.length) { showToast('⚠️', 'No hay pedidos'); return }
    const rows = [['N°', 'Fecha', 'Cliente', 'Estado', 'Sección', 'Tipo(s)', 'Talla', 'Color', 'Tipo ítem', 'Cantidad', 'Precio', 'Estado celda', 'Diseño']]
    pedidos.forEach((p) => {
      ;(p.items_camiseta || []).forEach((it) => {
        Object.entries(it.tabla || {}).forEach(([talla, tObj]) => {
          Object.entries(tObj).forEach(([color, cObj]) => {
            it.tipos.forEach((t) => {
              const n = cObj[t] || 0
              if (!n) return
              const est = (it.estados || {})[`${talla}|${color}|${t}`] || '—'
              rows.push([p.numero, p.fecha, p.cliente, p.estado, 'Camiseta', it.tipos.map((x) => TIPO_LABEL[x]).join('+'), talla, color, TIPO_LABEL[t], n, it.precios[t] || 0, est, it.diseno || ''])
            })
          })
        })
      })
      ;(p.items_chaqueta || []).forEach((it) => {
        Object.entries(it.tabla || {}).forEach(([color, rObj]) => {
          it.tipos.forEach((t) => {
            const n = rObj[t] || 0
            if (!n) return
            const est = (it.estados || {})[`${color}|${t}`] || '—'
            rows.push([p.numero, p.fecha, p.cliente, p.estado, 'Chaqueta', it.tipos.map((x) => TIPO_LABEL[x]).join('+'), '—', color, TIPO_LABEL[t], n, (it.precios[t] || 0) + '$/kg', est, it.diseno || ''])
          })
        })
      })
    })
    const csv = rows.map((r) => r.map((v) => '"' + String(v || '').replace(/"/g, '""') + '"').join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = 'pedidos-' + new Date().toISOString().slice(0, 10) + '.csv'
    a.click()
    showToast('⬇️', 'CSV exportado')
  }

  return (
    <div>
      <div className="filters">
        <div className="sw">
          <span className="sico">🔍</span>
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar cliente o N° pedido..." />
        </div>
        <select className="fsel" value={filEstado} onChange={(e) => setFilEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="Pendiente">⏳ Pendiente</option>
          <option value="En proceso">🔄 En proceso</option>
          <option value="Entregado">✅ Entregado</option>
        </select>
        <button className="btn btn-s btn-sm" onClick={exportCSV}>⬇ CSV</button>
      </div>

      <div className="twrap">
        <table>
          <thead>
            <tr><th>N°</th><th>Fecha</th><th>Cliente</th><th>Ítems</th><th>Progreso</th><th>Total</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8}><div className="empty"><div className="empty-ico">⏳</div><p>Cargando pedidos…</p></div></td></tr>
            ) : !filtrados.length ? (
              <tr><td colSpan={8}><div className="empty"><div className="empty-ico">🧵</div><p>{busqueda || filEstado ? 'Sin resultados' : 'Aún no hay pedidos registrados'}</p></div></td></tr>
            ) : (
              filtrados.map((p) => {
                const idx = pedidos.indexOf(p)
                const dotC = { Pendiente: 'dot-p', 'En proceso': 'dot-e', Entregado: 'dot-d' }
                const tipsCam = [...new Set((p.items_camiseta || []).flatMap((it) => it.tipos || []))].map((t) => TIPO_ICON[t] + TIPO_LABEL[t])
                const tipsChaq = [...new Set((p.items_chaqueta || []).flatMap((it) => it.tipos || []))].map((t) => TIPO_ICON[t] + TIPO_LABEL[t])
                const ni = (p.items_camiseta || []).length + (p.items_chaqueta || []).length
                const totStr = p.hay_chaqueta && !p.total_camiseta
                  ? <span className="td-p warn">⚖️ Por pesar</span>
                  : p.hay_chaqueta
                  ? <><span className="td-p">${(p.total_camiseta || 0).toFixed(2)}</span><span style={{ fontSize: 10, color: 'var(--warn)', marginLeft: 4 }}>+⚖️</span></>
                  : <span className="td-p">${(p.total_camiseta || 0).toFixed(2)}</span>
                const pr = calcProgreso(p)
                return (
                  <tr key={p.id} onClick={() => onVerDetalle(idx)}>
                    <td><span className="td-nlbl">{p.numero}</span></td>
                    <td className="td-mono">{fmtFecha(p.fecha)}</td>
                    <td style={{ fontWeight: 600 }}>{p.cliente}</td>
                    <td>
                      {tipsCam.length > 0 && <span className="badge cam" style={{ marginRight: 3 }}>👔 {tipsCam.join(' · ')}</span>}
                      {tipsChaq.length > 0 && <span className="badge chaq">🧥 {tipsChaq.join(' · ')}</span>}
                      {!tipsCam.length && !tipsChaq.length && '—'}
                      <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 4 }}>({ni})</span>
                    </td>
                    <td style={{ minWidth: 130 }}>
                      {pr.total > 0 ? (
                        <>
                          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, fontFamily: "'DM Mono', monospace" }}>
                            ✅ {pr.ok}/{pr.total} {pr.falta > 0 && `· ❓ ${pr.falta}`}
                          </div>
                          <div className="prog-wrap"><div className="prog-bar" style={{ width: `${pr.pct}%` }} /></div>
                        </>
                      ) : <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>}
                    </td>
                    <td>{totStr}</td>
                    <td><span className="edot"><span className={`dot ${dotC[p.estado] || 'dot-p'}`} />{p.estado}</span></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button className="btn btn-d btn-sm" onClick={() => onEliminar(p)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
