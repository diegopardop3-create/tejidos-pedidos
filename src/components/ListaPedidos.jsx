import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { TIPO_LABEL, TIPO_ICON, fmtCOP, calcProgreso, totalesPorTipoCam, ESTADOS, ESTADO_ICON, ESTADO_DOT, PAGO_COLOR, PAGO_ICON } from './constants'
import { imprimirEtiqueta } from './factura'
import PanelPagos from './PanelPagos'

// ============================================
// RESUMEN DE UNIDADES POR PEDIDO
// ============================================
// Se muestra junto a los ítems en la lista, para saber de un vistazo el
// tamaño del pedido sin tener que abrirlo. Reglas del negocio:
//  - Si el ítem de camiseta tiene precio de "juego", se cuenta por CUELLOS
//    (los puños van incluidos y no se cobran aparte) -> "632 juegos".
//  - Si cuello y puño tienen precios separados, se muestran los dos
//    números por aparte -> "632 cuellos · 345 puños".
//  - La chaqueta se cobra por kilo (se pesa al entregar), pero igual se
//    muestran sus unidades por tipo -> "40 pretinas · 20 cuellos".
// Camiseta y chaqueta se muestran en líneas separadas para que un "cuello"
// de camiseta nunca se confunda con uno de chaqueta.
function plural(n, sing, plu) {
  return `${n} ${n === 1 ? sing : plu}`
}

function unidadesCamiseta(items) {
  let juegos = 0, cuellos = 0, punos = 0
  for (const it of (items || [])) {
    const { cuello, puno } = totalesPorTipoCam(it.tabla)
    if (it.precios?.juego) juegos += cuello
    else { cuellos += cuello; punos += puno }
  }
  const partes = []
  if (juegos > 0) partes.push(plural(juegos, 'juego', 'juegos'))
  if (cuellos > 0) partes.push(plural(cuellos, 'cuello', 'cuellos'))
  if (punos > 0) partes.push(plural(punos, 'puño', 'puños'))
  return partes.join(' · ')
}

function unidadesChaqueta(items) {
  let pretina = 0, cuello = 0, puno = 0
  for (const it of (items || [])) {
    // En chaqueta la tabla va por color (sin tallas): tabla[color][tipo]
    Object.values(it.tabla || {}).forEach((rObj) => {
      pretina += rObj.pretina || 0
      cuello += rObj.cuello || 0
      puno += rObj.puno || 0
    })
  }
  const partes = []
  if (pretina > 0) partes.push(plural(pretina, 'pretina', 'pretinas'))
  if (cuello > 0) partes.push(plural(cuello, 'cuello', 'cuellos'))
  if (puno > 0) partes.push(plural(puno, 'puño', 'puños'))
  return partes.join(' · ')
}

export default function ListaPedidos({ pedidos, loading, onVerDetalle, onEliminar, onCompartir, showToast, refrescar, titulo = 'Pedidos', soloEntregados = false }) {
  const [busqueda, setBusqueda] = useState('')
  const [filEstado, setFilEstado] = useState('')
  const [abiertoPago, setAbiertoPago] = useState(null) // id del pedido con panel pago abierto

  const filtrados = pedidos.filter((p) => {
    const match = (p.cliente + ' ' + p.numero).toLowerCase().includes(busqueda.toLowerCase())
    const me = !filEstado || p.estado === filEstado
    return match && me
  })

  async function cambiarEstado(pedido, nuevoEstado) {
    const cambios = { estado: nuevoEstado, actualizado_en: new Date().toISOString() }
    if (nuevoEstado === 'Entregado') cambios.fecha_entregado = new Date().toISOString().slice(0, 10)
    const { error } = await supabase.from('pedidos').update(cambios).eq('id', pedido.id)
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
      {titulo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <div style={{ width: 3, height: 18, background: 'var(--thread)', borderRadius: 2 }} />
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', fontFamily: "'Playfair Display', serif" }}>{titulo}</h2>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: "'DM Mono', monospace" }}>({filtrados.length})</span>
        </div>
      )}

      <div className="filters">
        <div className="sw">
          <span className="sico">🔍</span>
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar cliente o N° pedido..." />
        </div>
        {!soloEntregados && (
          <select className="fsel" value={filEstado} onChange={(e) => setFilEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            {ESTADOS.filter(e => e !== 'Entregado').map((es) => <option key={es} value={es}>{ESTADO_ICON[es]} {es}</option>)}
          </select>
        )}
        <button className="btn btn-s btn-sm" onClick={exportCSV}>⬇ CSV</button>
      </div>

      <div className="twrap">
        <table>
          <thead>
            <tr>
              <th>N°</th><th>Cliente</th><th>Observaciones</th><th>Ítems</th>
              <th>Progreso</th><th>Pago</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8}><div className="empty"><div className="empty-ico">⏳</div><p>Cargando…</p></div></td></tr>
            ) : !filtrados.length ? (
              <tr><td colSpan={8}><div className="empty"><div className="empty-ico">🧵</div>
                <p>{busqueda || filEstado ? 'Sin resultados' : soloEntregados ? 'Aún no hay pedidos entregados' : 'Sin pedidos activos'}</p>
              </div></td></tr>
            ) : (
              filtrados.map((p, rowIdx) => {
                const idx = pedidos.indexOf(p)
                const tipsCam = [...new Set((p.items_camiseta || []).flatMap((it) => it.tipos || []))].map((t) => TIPO_ICON[t] + TIPO_LABEL[t])
                const tipsChaq = [...new Set((p.items_chaqueta || []).flatMap((it) => it.tipos || []))].map((t) => TIPO_ICON[t] + TIPO_LABEL[t])
                const ni = (p.items_camiseta || []).length + (p.items_chaqueta || []).length
                const unidCam = unidadesCamiseta(p.items_camiseta)
                const unidChaq = unidadesChaqueta(p.items_chaqueta)
                // Calcular total real: camiseta + chaqueta pesada
                const totCam = p.total_camiseta || 0
                const itemsChaq = p.items_chaqueta || []
                const algunChaqPendiente = itemsChaq.some(it => it.kilos_reales == null)
                const totChaqPesada = itemsChaq.reduce((s, it) => s + (it.total_final || 0), 0)
                const totalReal = totCam + totChaqPesada

                // % pagado, con el total abonado que adjunta Pedidos.jsx.
                // Si el pedido tiene chaqueta sin pesar, el total todavía no
                // es el definitivo — por eso se avisa con ⚖️ junto a la barra.
                const abonado = p.total_abonado || 0
                const pctPago = totalReal > 0 ? Math.min(100, Math.round((abonado / totalReal) * 100)) : 0
                const pr = calcProgreso(p)
                const estadoPago = p.estado_pago || 'Pendiente'
                const colorPago = PAGO_COLOR[estadoPago]
                const pagoAberto = abiertoPago === p.id

                return (
                  <>
                    <tr key={p.id} style={{ borderBottom: pagoAberto ? 'none' : undefined }}>
                      <td onClick={() => onVerDetalle(idx)} style={{ cursor: 'pointer' }}><span className="td-nlbl">{p.numero}</span></td>
                      <td onClick={() => onVerDetalle(idx)} style={{ fontWeight: 600, cursor: 'pointer' }}>{p.cliente}</td>
                      <td
                        onClick={() => onVerDetalle(idx)}
                        title={p.observaciones || ''}
                        style={{
                          cursor: 'pointer', fontSize: 12, color: 'var(--muted)',
                          // Tope de ancho: si la nota es larga se corta con "…"
                          // (el texto completo queda en el tooltip) para que no
                          // se estire la columna y descuadre el resto de la tabla.
                          maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                      >
                        {p.observaciones || <span style={{ color: 'var(--border)' }}>—</span>}
                      </td>
                      <td onClick={() => onVerDetalle(idx)} style={{ cursor: 'pointer', minWidth: 150 }}>
                        {tipsCam.length > 0 && (
                          <div style={{ marginBottom: tipsChaq.length > 0 ? 5 : 0 }}>
                            <span className="badge cam">👔 {tipsCam.join(' · ')}</span>
                            {unidCam && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--thread)', fontFamily: "'DM Mono', monospace", marginTop: 2 }}>{unidCam}</div>}
                          </div>
                        )}
                        {tipsChaq.length > 0 && (
                          <div>
                            <span className="badge chaq">🧥 {tipsChaq.join(' · ')}</span>
                            {unidChaq && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--yarn)', fontFamily: "'DM Mono', monospace", marginTop: 2 }}>{unidChaq}</div>}
                          </div>
                        )}
                        {!tipsCam.length && !tipsChaq.length && '—'}
                        {ni > 1 && <span style={{ fontSize: 10, color: 'var(--muted)' }}>({ni} ítems)</span>}
                      </td>
                      <td onClick={() => onVerDetalle(idx)} style={{ minWidth: 120, cursor: 'pointer' }}>
                        {pr.total > 0 ? (
                          <>
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, fontFamily: "'DM Mono', monospace" }}>
                              ✅ {pr.ok}/{pr.total} {pr.falta > 0 && `· ❓ ${pr.falta}`}
                            </div>
                            <div className="prog-wrap"><div className="prog-bar" style={{ width: `${pr.pct}%` }} /></div>
                          </>
                        ) : <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setAbiertoPago(pagoAberto ? null : p.id)}
                          style={{
                            padding: '4px 10px', borderRadius: 20, border: `1.5px solid ${colorPago}`,
                            background: `${colorPago}12`, color: colorPago,
                            fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Mono', monospace",
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {PAGO_ICON[estadoPago]} {estadoPago}
                        </button>
                        {totalReal > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                            <div style={{ width: 54, height: 5, background: '#e0e0e0', borderRadius: 20, overflow: 'hidden', flexShrink: 0 }}>
                              <div style={{ width: `${pctPago}%`, height: '100%', background: colorPago, borderRadius: 20, transition: 'width .3s' }} />
                            </div>
                            <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: colorPago, fontWeight: 700 }}>{pctPago}%</span>
                            {algunChaqPendiente && <span style={{ fontSize: 10, color: 'var(--warn)' }} title="Falta pesar la chaqueta: el total aún no es el definitivo">⚖️</span>}
                          </div>
                        )}
                      </td>
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
                          <button className="btn btn-s btn-sm" title="Imprimir etiqueta" onClick={() => imprimirEtiqueta(p)}>🏷️</button>
                          <button className="btn btn-s btn-sm" title="Compartir" onClick={() => onCompartir(p)}>🔗</button>
                          <button className="btn btn-d btn-sm" onClick={() => onEliminar(p)}>🗑</button>
                        </div>
                      </td>
                    </tr>
                    {pagoAberto && (
                      <tr key={p.id + '-pago'}>
                        <td colSpan={8} style={{ padding: '0 14px 12px', background: 'var(--loom)' }}>
                          <PanelPagos
                            pedido={p}
                            onUpdated={refrescar}
                            showToast={showToast}
                            compact={false}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
