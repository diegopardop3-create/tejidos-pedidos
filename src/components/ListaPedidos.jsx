import { useState, Fragment } from 'react'
import { supabase } from '../supabaseClient'
import { TIPO_LABEL, TIPO_ICON, fmtCOP, calcProgreso, totalesPorTipoCam, ESTADOS, ESTADO_ICON, ESTADO_DOT, PAGO_COLOR, PAGO_ICON } from './constants'
import { imprimirEtiqueta } from './factura'
import PanelPagos from './PanelPagos'
import { InsigniaTipos } from './Insignias'
import { ConoHilo } from './Movimiento'

// Iconos simples para los botones de cada fila (heredan el color del botón).
const Ico = {
  etiqueta: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 12 12 20 3 11V3h8z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>,
  enlace: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>,
  borrar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>,
  buscar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
}

// Color de cada etapa del taller (punto y texto del selector de estado).
const ETAPA_COLOR = { 'Pendiente': 'var(--jtx)', 'En proceso': 'var(--ink)', 'Listo': 'var(--thread)', 'Entregado': 'var(--muted)' }

// Días desde que se creó el pedido. Sirve para ver de un vistazo qué lleva
// mucho tiempo en el taller (más de 10 días se pinta en rojo).
function diasDesde(p) {
  const base = p.creado_en || p.fecha
  if (!base) return null
  const d = Math.floor((Date.now() - new Date(base).getTime()) / 86400000)
  return d < 0 ? 0 : d
}
function textoDias(d) {
  if (d == null) return ''
  if (d === 0) return 'hoy'
  return `hace ${d} día${d === 1 ? '' : 's'}`
}

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
  return `${n.toLocaleString('es-CO')} ${n === 1 ? sing : plu}`
}

export function unidadesCamiseta(items) {
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

export function unidadesChaqueta(items) {
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

// CSV con una fila por celda (talla/color/tipo). Lo usan Activos y Entregados.
export function exportarCSV(pedidos, showToast) {
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

export default function ListaPedidos({ pedidos, loading, onVerDetalle, onEliminar, onCompartir, showToast, refrescar, actualizarPedidoLocal, titulo = 'Pedidos', soloEntregados = false }) {
  const [busqueda, setBusqueda] = useState('')
  const [filEstado, setFilEstado] = useState('')
  const [modo, setModo] = useState('lista') // 'lista' | 'tablero' (solo en Activos)
  const [abiertoPago, setAbiertoPago] = useState(null) // id del pedido con panel pago abierto

  const coincide = (p) => (p.cliente + ' ' + p.numero).toLowerCase().includes(busqueda.toLowerCase())
  // En Activos se muestra primero lo más viejo (lo que lleva más tiempo en el
  // taller). En Entregados se deja el orden de siempre (lo más reciente arriba).
  const ordenados = soloEntregados ? pedidos : [...pedidos].sort((a, b) => String(a.creado_en || a.fecha).localeCompare(String(b.creado_en || b.fecha)))
  const filtrados = ordenados.filter((p) => coincide(p) && (!filEstado || p.estado === filEstado))
  const etapas = ESTADOS.filter((e) => e !== 'Entregado')
  const cuenta = (e) => pedidos.filter((p) => p.estado === e).length

  // Pinta el nuevo estado de una vez (el desplegable ya lo cambió solo en
  // pantalla, pero el resto de la fila —badge, filtros— depende de esto) y
  // guarda en Supabase en segundo plano. Si falla, se devuelve al estado
  // anterior y se avisa, para no dejar la pantalla mintiendo.
  async function cambiarEstado(pedido, nuevoEstado) {
    const anterior = { estado: pedido.estado, fecha_entregado: pedido.fecha_entregado }
    const cambios = { estado: nuevoEstado, actualizado_en: new Date().toISOString() }
    if (nuevoEstado === 'Entregado') cambios.fecha_entregado = new Date().toISOString().slice(0, 10)

    actualizarPedidoLocal?.(pedido.id, cambios)
    showToast(ESTADO_ICON[nuevoEstado], `Pedido ${pedido.numero} → ${nuevoEstado}`)

    const { error } = await supabase.from('pedidos').update(cambios).eq('id', pedido.id)
    if (error) {
      actualizarPedidoLocal?.(pedido.id, anterior)
      showToast('⚠️', 'No se pudo guardar, revisa la conexión')
    }
  }

  const exportCSV = () => exportarCSV(pedidos, showToast)

  // Datos calculados de un pedido que usan la tabla y el tablero.
  function datos(p) {
    const tipsCam = [...new Set((p.items_camiseta || []).flatMap((it) => it.tipos || []))]
    const tipsChaq = [...new Set((p.items_chaqueta || []).flatMap((it) => it.tipos || []))]
    const itemsChaq = p.items_chaqueta || []
    const totalReal = (p.total_camiseta || 0) + itemsChaq.reduce((s, it) => s + (it.total_final || 0), 0)
    const abonado = p.total_abonado || 0
    return {
      tipsCam, tipsChaq,
      ni: (p.items_camiseta || []).length + itemsChaq.length,
      unidCam: unidadesCamiseta(p.items_camiseta),
      unidChaq: unidadesChaqueta(p.items_chaqueta),
      totalReal,
      algunChaqPendiente: itemsChaq.some((it) => it.kilos_reales == null),
      pctPago: totalReal > 0 ? Math.min(100, Math.round((abonado / totalReal) * 100)) : 0,
      pr: calcProgreso(p),
      estadoPago: p.estado_pago || 'Pendiente',
      dias: diasDesde(p),
    }
  }

  const Productos = ({ d }) => (
    <>
      {d.tipsCam.length > 0 && (
        <div className="lp-prod">
          <InsigniaTipos tipos={d.tipsCam} prenda="cam" />
          {d.unidCam && <div className="lp-unid">{d.unidCam}</div>}
        </div>
      )}
      {d.tipsChaq.length > 0 && (
        <div className="lp-prod">
          <InsigniaTipos tipos={d.tipsChaq} prenda="chaq" />
          {d.unidChaq && <div className="lp-unid">{d.unidChaq}</div>}
        </div>
      )}
      {!d.tipsCam.length && !d.tipsChaq.length && '—'}
      {d.ni > 1 && <div className="lp-unid">{d.ni} ítems</div>}
    </>
  )

  const Avance = ({ d }) => d.pr.total > 0 ? (
    <div className="lp-avance">
      <div className="prog-wrap"><div className="prog-bar" style={{ width: `${d.pr.pct}%` }} /></div>
      <span>{d.pr.ok} de {d.pr.total} empacadas{d.pr.falta > 0 && <b className="lp-falta"> · faltan {d.pr.falta}</b>}</span>
    </div>
  ) : <span className="lp-unid">—</span>

  const Pago = ({ p, d }) => {
    const color = PAGO_COLOR[d.estadoPago]
    const texto = d.estadoPago === 'Pagado' ? 'pagado' : d.estadoPago === 'Parcial' ? `abonó ${d.pctPago}%` : 'sin pago'
    const clase = d.estadoPago === 'Pagado' ? 'ok' : d.estadoPago === 'Parcial' ? 'parcial' : 'debe'
    return (
      <button className={`lp-pago ${clase}`} onClick={(e) => { e.stopPropagation(); setAbiertoPago(abiertoPago === p.id ? null : p.id) }} title="Ver y registrar pagos" style={{ '--c': color }}>
        {texto}
        {d.algunChaqPendiente && <span title="Falta pesar la chaqueta: el total aún no es el definitivo"> ⚖️</span>}
      </button>
    )
  }

  const Acciones = ({ p }) => (
    <div className="lp-acc" onClick={(e) => e.stopPropagation()}>
      <button className="lp-ico" title="Imprimir etiqueta" aria-label="Imprimir etiqueta" onClick={() => imprimirEtiqueta(p)}>{Ico.etiqueta}</button>
      <button className="lp-ico" title="Compartir con el cliente" aria-label="Compartir con el cliente" onClick={() => onCompartir(p)}>{Ico.enlace}</button>
      <button className="lp-ico peligro" title="Eliminar pedido" aria-label="Eliminar pedido" onClick={() => onEliminar(p)}>{Ico.borrar}</button>
    </div>
  )

  const vacio = (
    <div className="empty"><ConoHilo girando={false} />
      <p>{busqueda || filEstado ? 'Ningún pedido coincide con la búsqueda' : soloEntregados ? 'Aún no hay pedidos entregados' : 'No hay pedidos en el taller'}</p>
    </div>
  )

  return (
    <div className="lp">
      <div className="lp-cab">
        <div>
          <h1>{soloEntregados ? 'Entregados' : 'Activos'}</h1>
          <p>{soloEntregados ? 'El historial de lo que ya salió del taller.' : 'Lo que está en el taller, de lo más viejo a lo más nuevo.'}</p>
        </div>
        {!soloEntregados && (
          <div className="lp-seg" role="group" aria-label="Forma de ver">
            <button className={modo === 'lista' ? 'on' : ''} onClick={() => setModo('lista')}>Lista</button>
            <button className={modo === 'tablero' ? 'on' : ''} onClick={() => setModo('tablero')}>Tablero</button>
          </div>
        )}
      </div>

      {!soloEntregados && modo === 'lista' && (
        <div className="lp-etapas">
          <button className={`lp-etapa ${!filEstado ? 'on' : ''}`} onClick={() => setFilEstado('')}>
            <span className="n">{pedidos.length}</span><span className="l">Todos</span>
          </button>
          {etapas.map((e) => (
            <button key={e} className={`lp-etapa ${filEstado === e ? 'on' : ''}`} onClick={() => setFilEstado(filEstado === e ? '' : e)}>
              <span className="n">{cuenta(e)}</span>
              <span className="l"><i className="lp-punto" style={{ background: ETAPA_COLOR[e] }} />{e === 'Listo' ? 'Listo para entregar' : e}</span>
            </button>
          ))}
        </div>
      )}

      <div className="lp-filtros">
        <label className="lp-buscar">
          {Ico.buscar}
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar cliente o número de pedido" />
        </label>
        <button className="lp-btn" onClick={exportCSV}>Exportar CSV</button>
      </div>

      {loading ? (
        <div className="twrap"><div className="empty"><ConoHilo /><p>Cargando…</p></div></div>
      ) : !soloEntregados && modo === 'tablero' ? (
        <div className="lp-tablero">
          {etapas.map((e) => {
            const cols = ordenados.filter((p) => p.estado === e && coincide(p))
            return (
              <div key={e} className="lp-col">
                <h3><i className="lp-punto" style={{ background: ETAPA_COLOR[e] }} />{e}<span>{cols.length}</span></h3>
                {cols.length ? cols.map((p) => {
                  const d = datos(p)
                  return (
                    <div key={p.id} className="lp-tarj" onClick={() => onVerDetalle(pedidos.indexOf(p))}>
                      <div className="fila"><span className="td-nlbl">{p.numero}</span><span className={`lp-dias ${d.dias > 10 ? 'tarde' : ''}`}>{textoDias(d.dias)}</span></div>
                      <div className="lp-cli"><b>{p.cliente}</b>{p.observaciones && <span>{p.observaciones}</span>}</div>
                      <Productos d={d} />
                      <Avance d={d} />
                      <div className="fila"><Pago p={p} d={d} /><Acciones p={p} /></div>
                      {abiertoPago === p.id && (
                        <div onClick={(ev) => ev.stopPropagation()}>
                          <PanelPagos pedido={p} onUpdated={refrescar} onCambioLocal={(cambios) => actualizarPedidoLocal?.(p.id, cambios)} showToast={showToast} compact={false} />
                        </div>
                      )}
                    </div>
                  )
                }) : <div className="lp-vacia">Nada aquí</div>}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="twrap lp-tabla">
          <table>
            <thead>
              <tr><th>N°</th><th>Cliente</th><th>Productos</th><th>Avance</th><th>Pago</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {!filtrados.length ? (
                <tr><td colSpan={7}>{vacio}</td></tr>
              ) : filtrados.map((p) => {
                const idx = pedidos.indexOf(p)
                const d = datos(p)
                const pagoAbierto = abiertoPago === p.id
                return (
                  <Fragment key={p.id}>
                    <tr className={pagoAbierto ? 'abierto' : ''} onClick={() => onVerDetalle(idx)}>
                      <td className="c-num"><span className="td-nlbl">{p.numero}</span></td>
                      <td className="c-cli">
                        <div className="lp-cli">
                          <b>{p.cliente}</b>
                          <span title={p.observaciones || ''}>
                            {p.observaciones ? <span className="lp-obs">{p.observaciones}</span> : null}
                            {p.observaciones && !soloEntregados && ' · '}
                            {!soloEntregados && <span className={`lp-dias ${d.dias > 10 ? 'tarde' : ''}`}>{textoDias(d.dias)}</span>}
                          </span>
                        </div>
                      </td>
                      <td className="c-prod"><Productos d={d} /></td>
                      <td className="c-av"><Avance d={d} /></td>
                      <td className="c-pago"><Pago p={p} d={d} /></td>
                      <td className="c-est" onClick={(e) => e.stopPropagation()}>
                        <select className="estado-select" value={p.estado} onChange={(e) => cambiarEstado(p, e.target.value)} style={{ color: ETAPA_COLOR[p.estado] }} aria-label={`Estado de ${p.numero}`}>
                          {ESTADOS.map((es) => <option key={es} value={es}>{es}</option>)}
                        </select>
                      </td>
                      <td className="c-acc"><Acciones p={p} /></td>
                    </tr>
                    {pagoAbierto && (
                      <tr className="lp-pagofila">
                        <td colSpan={7} onClick={(e) => e.stopPropagation()}>
                          <PanelPagos
                            pedido={p}
                            onUpdated={refrescar}
                            onCambioLocal={(cambios) => actualizarPedidoLocal?.(p.id, cambios)}
                            showToast={showToast}
                            compact={false}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
