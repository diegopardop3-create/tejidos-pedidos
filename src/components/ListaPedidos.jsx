import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { TIPO_LABEL, TIPO_ICON, fmtFecha, fmtCOP, calcProgreso, ESTADOS, ESTADO_ICON, ESTADO_DOT } from './constants'

export default function ListaPedidos({ pedidos, loading, onVerDetalle, onEliminar, onCompartir, showToast, refrescar }) {
  const [busqueda, setBusqueda] = useState('')
  const [filEstado, setFilEstado] = useState('')

  const filtrados = pedidos.filter((p) => {
    const match = (p.cliente + ' ' + p.numero).toLowerCase().includes(busqueda.toLowerCase())
    const me = !filEstado || p.estado === filEstado
    return match && me
  })

  async function cambiarEstado(pedido, nuevoEstado) {
    const { error } = await supabase.from('pedidos').update({ estado: nuevoEstado, actualizado_en: new Date().toISOString() }).eq('id', pedido.id)
    if (error) { showToast('⚠️', 'Error al cambiar estado'); return }
    showToast(ESTADO_ICON[nuevoEstado], `Pedido ${pedido.numero} → ${nuevoEstado}`)
    refrescar()
  }

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
              rows.push([p.numero, p.fecha, p.cliente, p.estado, 'Camiseta', it.tipos.map((x) => TIPO_LABEL[x]).join('+'), talla, color, TIPO_LABEL[t], n, fmtCOP(it.precios[t] || 0), est, it.diseno || ''])
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
            rows.push([p.numero, p.fecha, p.cliente, p.estado, 'Chaqueta', it.tipos.map((x) => TIPO_LABEL[x]).join('+'), '—', color, TIPO_LABEL[t], n, fmtCOP(it.precios[t] || 0) + '/kg', est, it.diseno || ''])
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
          {ESTADOS.map((es) => <option key={es} value={es}>{ESTADO_ICON[es]} {es}</option>)}
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
                const tipsCam = [...new Set((p.items_camiseta || []).flatMap((it) => it.tipos || []))].map((t) => TIPO_ICON[t] + TIPO_LABEL[t])
                const tipsChaq = [...new Set((p.items_chaqueta || []).flatMap((it) => it.tipos || []))].map((t) => TIPO_ICON[t] + TIPO_LABEL[t])
                const ni = (p.items_camiseta || []).length + (p.items_chaqueta || []).length
                const totStr = p.hay_chaqueta && !p.total_camiseta
                  ? <span className="td-p warn">⚖️ Por pesar</span>
                  : p.hay_chaqueta
                  ? <><span className="td-p">{fmtCOP(p.total_camiseta)}</span><span style={{ fontSize: 10, color: 'var(--warn)', marginLeft: 4 }}>+⚖️</span></>
                  : <span className="td-p">{fmtCOP(p.total_camiseta)}</span>
                const pr = calcProgreso(p)
                return (
                  <tr key={p.id}>
                    <td onClick={() => onVerDetalle(idx)} style={{ cursor: 'pointer' }}><span className="td-nlbl">{p.numero}</span></td>
                    <td onClick={() => onVerDetalle(idx)} className="td-mono" style={{ cursor: 'pointer' }}>{fmtFecha(p.fecha)}</td>
                    <td onClick={() => onVerDetalle(idx)} style={{ fontWeight: 600, cursor: 'pointer' }}>{p.cliente}</td>
                    <td onClick={() => onVerDetalle(idx)} style={{ cursor: 'pointer' }}>
                      {tipsCam.length > 0 && <span className="badge cam" style={{ marginRight: 3 }}>👔 {tipsCam.join(' · ')}</span>}
                      {tipsChaq.length > 0 && <span className="badge chaq">🧥 {tipsChaq.join(' · ')}</span>}
                      {!tipsCam.length && !tipsChaq.length && '—'}
                      <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 4 }}>({ni})</span>
                    </td>
                    <td onClick={() => onVerDetalle(idx)} style={{ minWidth: 130, cursor: 'pointer' }}>
                      {pr.total > 0 ? (
                        <>
                          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, fontFamily: "'DM Mono', monospace" }}>
                            ✅ {pr.ok}/{pr.total} {pr.falta > 0 && `· ❓ ${pr.falta}`}
                          </div>
                          <div className="prog-wrap"><div className="prog-bar" style={{ width: `${pr.pct}%` }} /></div>
                        </>
                      ) : <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>}
                    </td>
                    <td onClick={() => onVerDetalle(idx)} style={{ cursor: 'pointer' }}>{totStr}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select
                        className="estado-select"
                        value={p.estado}
                        onChange={(e) => cambiarEstado(p, e.target.value)}
                        style={{ borderColor: 'transparent' }}
                      >
                        {ESTADOS.map((es) => <option key={es} value={es}>{ESTADO_ICON[es]} {es}</option>)}
                      </select>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button className="btn btn-s btn-sm" title="Compartir con cliente" onClick={() => onCompartir(p)}>🔗</button>
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
