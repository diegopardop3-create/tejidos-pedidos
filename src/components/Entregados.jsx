import { useState, Fragment } from 'react'
import { supabase } from '../supabaseClient'
import { MESES, fmtCOP } from './constants'
import { imprimirEtiqueta } from './factura'
import PanelPagos from './PanelPagos'
import { InsigniaTipos } from './Insignias'
import { unidadesCamiseta, unidadesChaqueta, exportarCSV } from './ListaPedidos'

// ============================================
// ENTREGADOS
// ============================================
// El historial de lo que ya salió del taller, agrupado por el mes en que se
// entregó. Arriba, los totales de lo que se está viendo (cambian con la
// búsqueda y los filtros): cuántos pedidos, cuánto se facturó, cuánto falta
// por cobrar y cuántos días se demora en promedio un pedido en salir.

const Ico = {
  buscar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  mas: <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>,
  etiqueta: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 12 12 20 3 11V3h8z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>,
  enlace: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>,
  volver: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg>,
  borrar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>,
}

function totalReal(p) {
  const cam = p.total_camiseta || 0
  const chaq = (p.items_chaqueta || []).reduce((s, it) => s + (it.total_final || 0), 0)
  return cam + chaq
}
const saldoDe = (p) => Math.max(0, totalReal(p) - (p.total_abonado || 0))

// Fecha en que se entregó. Los pedidos viejos pueden no tener
// fecha_entregado; en ese caso se usa la última modificación y, si tampoco
// hay, la fecha del pedido.
function fechaEntrega(p) {
  return String(p.fecha_entregado || p.actualizado_en || p.fecha || '').slice(0, 10)
}
const aFecha = (t) => new Date(t + 'T00:00:00')
function ddmm(t) {
  if (!t) return '—'
  const d = aFecha(t)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}
const claveMes = (t) => (t ? t.slice(0, 7) : '')
function nombreMes(clave) {
  if (!clave) return 'Sin fecha'
  const [y, m] = clave.split('-').map(Number)
  return `${MESES[m - 1]} ${y}`
}
// Días entre la fecha del pedido y la entrega (solo si las dos existen).
function diasEnTaller(p) {
  if (!p.fecha_entregado || !p.fecha) return null
  const d = Math.round((aFecha(String(p.fecha_entregado).slice(0, 10)) - aFecha(String(p.fecha).slice(0, 10))) / 86400000)
  return d >= 0 ? d : null
}

export default function Entregados({ pedidos, loading, onVerDetalle, onEliminar, onCompartir, showToast, refrescar, actualizarPedidoLocal }) {
  const [busqueda, setBusqueda] = useState('')
  const [mes, setMes] = useState('')
  const [soloSaldo, setSoloSaldo] = useState(false)
  const [menu, setMenu] = useState(null) // id del pedido con el menú "⋯" abierto
  const [abiertoPago, setAbiertoPago] = useState(null)

  // Lo más reciente arriba.
  const ordenados = [...pedidos].sort((a, b) => fechaEntrega(b).localeCompare(fechaEntrega(a)) || String(b.numero).localeCompare(String(a.numero)))
  const mesesDisponibles = [...new Set(ordenados.map((p) => claveMes(fechaEntrega(p))))]
  const q = busqueda.trim().toLowerCase()
  const filas = ordenados.filter((p) =>
    (!q || `${p.cliente} ${p.numero}`.toLowerCase().includes(q)) &&
    (!mes || claveMes(fechaEntrega(p)) === mes) &&
    (!soloSaldo || saldoDe(p) > 0))

  const facturado = filas.reduce((s, p) => s + totalReal(p), 0)
  const porCobrar = filas.reduce((s, p) => s + saldoDe(p), 0)
  const conDias = filas.map(diasEnTaller).filter((d) => d != null)
  const promedioDias = conDias.length ? Math.round(conDias.reduce((a, b) => a + b, 0) / conDias.length) : null

  // Subtotales por mes, para la fila que separa cada mes.
  const porMes = {}
  for (const p of filas) {
    const k = claveMes(fechaEntrega(p))
    porMes[k] = porMes[k] || { n: 0, v: 0 }
    porMes[k].n++
    porMes[k].v += totalReal(p)
  }

  // Devuelve un pedido al taller (queda en "Listo"), por si se marcó
  // entregado por error. Se ve al instante; si falla el guardado se revierte.
  async function devolver(p) {
    setMenu(null)
    const anterior = { estado: p.estado, fecha_entregado: p.fecha_entregado, actualizado_en: p.actualizado_en }
    const cambios = { estado: 'Listo', fecha_entregado: null, actualizado_en: new Date().toISOString() }
    actualizarPedidoLocal?.(p.id, cambios)
    showToast('↩️', `Pedido ${p.numero} devuelto a Activos (Listo)`)
    const { error } = await supabase.from('pedidos').update(cambios).eq('id', p.id)
    if (error) {
      actualizarPedidoLocal?.(p.id, anterior)
      showToast('⚠️', 'No se pudo guardar, revisa la conexión')
    }
  }

  const accion = (fn) => (e) => { e.stopPropagation(); setMenu(null); fn() }

  let mesActual = null
  return (
    <div className="lp en">
      <div className="lp-cab">
        <div>
          <h1>Entregados</h1>
          <p>El historial de lo que ya salió del taller.</p>
        </div>
      </div>

      <div className="lp-filtros">
        <label className="lp-buscar">
          {Ico.buscar}
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar cliente o número de pedido" />
        </label>
        <select className="en-mes" value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mes de entrega">
          <option value="">Todos los meses</option>
          {mesesDisponibles.map((k) => <option key={k} value={k}>{nombreMes(k)}</option>)}
        </select>
        <button className={`en-toggle ${soloSaldo ? 'on' : ''}`} onClick={() => setSoloSaldo(!soloSaldo)} aria-pressed={soloSaldo}>
          <i />Solo con saldo
        </button>
        <button className="lp-btn" onClick={() => exportarCSV(filas, showToast)}>Exportar CSV</button>
      </div>

      <div className="twrap en-panel">
        <div className="en-totales">
          <div><b>{filas.length}</b>pedido{filas.length === 1 ? '' : 's'}</div>
          <div><b>{fmtCOP(facturado)}</b>facturado</div>
          <div className={porCobrar > 0 ? 'rojo' : ''}><b>{fmtCOP(porCobrar)}</b>por cobrar</div>
          {promedioDias != null && <div><b>{promedioDias} día{promedioDias === 1 ? '' : 's'}</b>tiempo medio en el taller</div>}
        </div>

        {loading ? (
          <div className="empty"><div className="empty-ico">⏳</div><p>Cargando…</p></div>
        ) : !filas.length ? (
          <div className="empty"><div className="empty-ico">🧵</div>
            <p>{q || mes || soloSaldo ? 'Ningún pedido entregado coincide con la búsqueda' : 'Aún no hay pedidos entregados'}</p>
          </div>
        ) : (
          <table className="lp-tabla en-tabla">
            <thead>
              <tr><th>N°</th><th>Cliente</th><th>Entregado</th><th>Productos</th><th className="num">Valor</th><th>Pago</th><th></th></tr>
            </thead>
            <tbody>
              {filas.map((p) => {
                const k = claveMes(fechaEntrega(p))
                const cabecera = k !== mesActual
                mesActual = k
                const tipsCam = [...new Set((p.items_camiseta || []).flatMap((it) => it.tipos || []))]
                const tipsChaq = [...new Set((p.items_chaqueta || []).flatMap((it) => it.tipos || []))]
                const unidCam = unidadesCamiseta(p.items_camiseta)
                const unidChaq = unidadesChaqueta(p.items_chaqueta)
                const saldo = saldoDe(p)
                const total = totalReal(p)
                const sinPesar = (p.items_chaqueta || []).some((it) => it.kilos_reales == null)
                const pagoAbierto = abiertoPago === p.id
                return (
                  <Fragment key={p.id}>
                    {cabecera && (
                      <tr className="en-mesfila">
                        <td colSpan={7}>
                          <span>{nombreMes(k)}</span>
                          <span>{porMes[k].n} pedido{porMes[k].n === 1 ? '' : 's'} · {fmtCOP(porMes[k].v)}</span>
                        </td>
                      </tr>
                    )}
                    <tr className={pagoAbierto ? 'abierto' : ''} onClick={() => onVerDetalle(p)}>
                      <td className="c-num"><span className="td-nlbl">{p.numero}</span></td>
                      <td className="c-cli">
                        <div className="lp-cli">
                          <b>{p.cliente}</b>
                          {p.observaciones && <span className="lp-obs" title={p.observaciones}>{p.observaciones}</span>}
                        </div>
                      </td>
                      <td className="c-fecha" title={p.fecha_entregado ? '' : 'Sin fecha de entrega registrada (se usa la última modificación)'}>
                        {ddmm(fechaEntrega(p))}{!p.fecha_entregado && <sup>*</sup>}
                      </td>
                      <td className="c-prod">
                        {tipsCam.length > 0 && <div className="lp-prod"><InsigniaTipos tipos={tipsCam} prenda="cam" />{unidCam && <div className="lp-unid">{unidCam}</div>}</div>}
                        {tipsChaq.length > 0 && <div className="lp-prod"><InsigniaTipos tipos={tipsChaq} prenda="chaq" />{unidChaq && <div className="lp-unid">{unidChaq}</div>}</div>}
                        {!tipsCam.length && !tipsChaq.length && '—'}
                      </td>
                      <td className="c-valor num">{fmtCOP(total)}{sinPesar && <span title="Falta pesar la chaqueta: el total aún no es el definitivo"> ⚖️</span>}</td>
                      <td className="c-pago">
                        <button
                          className={`lp-pago ${saldo > 0 ? 'debe' : 'ok'}`}
                          onClick={(e) => { e.stopPropagation(); setAbiertoPago(pagoAbierto ? null : p.id) }}
                          title="Ver y registrar pagos"
                        >
                          {saldo > 0 ? `debe ${fmtCOP(saldo)}` : 'pagado'}
                        </button>
                      </td>
                      <td className="c-acc" onClick={(e) => e.stopPropagation()}>
                        <div className="en-menuw">
                          <button className="lp-ico" aria-label="Más acciones" aria-expanded={menu === p.id} onClick={() => setMenu(menu === p.id ? null : p.id)}>{Ico.mas}</button>
                          {menu === p.id && (
                            <>
                              <div className="en-velo" onClick={() => setMenu(null)} />
                              <div className="en-menu" role="menu">
                                <button role="menuitem" onClick={accion(() => imprimirEtiqueta(p))}>{Ico.etiqueta}Imprimir etiqueta</button>
                                <button role="menuitem" onClick={accion(() => onCompartir(p))}>{Ico.enlace}Copiar enlace del cliente</button>
                                <button role="menuitem" onClick={(e) => { e.stopPropagation(); devolver(p) }}>{Ico.volver}Devolver a Activos</button>
                                <button role="menuitem" className="peligro" onClick={accion(() => onEliminar(p))}>{Ico.borrar}Eliminar pedido</button>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {pagoAbierto && (
                      <tr className="lp-pagofila">
                        <td colSpan={7} onClick={(e) => e.stopPropagation()}>
                          <PanelPagos pedido={p} onUpdated={refrescar} onCambioLocal={(cambios) => actualizarPedidoLocal?.(p.id, cambios)} showToast={showToast} compact={false} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {filas.some((p) => !p.fecha_entregado) && (
        <p className="en-nota">* Pedido entregado antes de que se guardara la fecha de entrega: se agrupa por su última modificación.</p>
      )}
    </div>
  )
}
