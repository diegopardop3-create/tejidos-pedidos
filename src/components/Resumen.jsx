import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { MESES, fmtCOP, calcProgreso, totalesPorTipoCam } from './constants'
import { InsigniaTipos } from './Insignias'

// ============================================
// RESUMEN
// ============================================
// Arriba, cuatro cifras: lo que te deben hoy, lo producido en el mes elegido,
// los pedidos de ese mes y lo que está en el taller ahora. Debajo, la lista
// de cosas por atender, la gráfica de producido por mes (tocar una barra
// cambia de mes), los clientes por lo que deben y lo que más se vendió.
//
// Reporte mensual: el día 1 de cada mes llega solo por correo (las variables
// de entorno ya están en Vercel). Para apagarlo sin borrar código, poner false.
const REPORTE_MENSUAL_ACTIVO = true

const MES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// Total real de cada pedido (camiseta + chaqueta ya pesada)
function totalReal(p) {
  const cam = p.total_camiseta || 0
  const chaq = (p.items_chaqueta || []).reduce((s, it) => s + (it.total_final || 0), 0)
  return cam + chaq
}
const saldoDe = (p) => Math.max(0, totalReal(p) - (p.total_abonado || 0))
const claveMes = (anio, mes) => anio * 12 + mes
function mesDe(p) {
  if (!p.fecha) return null
  const [y, m] = p.fecha.split('-').map(Number)
  return claveMes(y, m - 1)
}
function diasDesde(fechaTexto) {
  if (!fechaTexto) return null
  const d = Math.floor((Date.now() - new Date(fechaTexto.length <= 10 ? fechaTexto + 'T00:00:00' : fechaTexto).getTime()) / 86400000)
  return d < 0 ? 0 : d
}
function ddmm(fechaTexto) {
  if (!fechaTexto) return ''
  const d = new Date(fechaTexto.length <= 10 ? fechaTexto + 'T00:00:00' : fechaTexto)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}
// Días que tardó un pedido entre su fecha y la entrega (si tiene las dos).
function diasEnTaller(p) {
  if (p.estado !== 'Entregado' || !p.fecha_entregado || !p.fecha) return null
  const a = new Date(String(p.fecha).slice(0, 10) + 'T00:00:00')
  const b = new Date(String(p.fecha_entregado).slice(0, 10) + 'T00:00:00')
  const d = Math.round((b - a) / 86400000)
  return d >= 0 ? d : null
}
const textoMillones = (v) => { const m = v / 1e6; return (Number.isInteger(m) || m >= 10 ? Math.round(m) : m.toFixed(1)) + 'M' }

export default function Resumen({ pedidos, showToast, onAbrirPedido, actualizarPedidoLocal }) {
  const hoy = new Date()
  const mesHoy = claveMes(hoy.getFullYear(), hoy.getMonth())
  const [sel, setSel] = useState(mesHoy)
  const [enviando, setEnviando] = useState(false)

  // Meses disponibles: desde el primer pedido hasta el mes actual.
  const meses = pedidos.map(mesDe).filter((x) => x != null)
  const primero = meses.length ? Math.min(...meses, mesHoy) : mesHoy
  const opciones = []
  for (let k = mesHoy; k >= primero; k--) opciones.push(k)
  const anioDe = (k) => Math.floor(k / 12)
  const nombreMes = (k) => MESES[k % 12]

  const delMes = (k) => pedidos.filter((p) => mesDe(p) === k)
  const producido = (k) => delMes(k).reduce((s, p) => s + totalReal(p), 0)

  // ---- Cifras de arriba ----
  const conSaldo = pedidos.filter((p) => saldoDe(p) > 0)
  const porCobrar = conSaldo.reduce((s, p) => s + saldoDe(p), 0)
  const clientesDeben = new Set(conSaldo.map((p) => p.cliente)).size
  const pedSel = delMes(sel)
  const prodSel = producido(sel)
  const prodAnt = producido(sel - 1)
  const variacion = prodAnt > 0 ? Math.round(((prodSel - prodAnt) / prodAnt) * 100) : null
  const entregadosSel = pedSel.filter((p) => p.estado === 'Entregado').length
  // Tiempo medio en el taller de los pedidos del mes que ya se entregaron.
  const diasSel = pedSel.map(diasEnTaller).filter((d) => d != null)
  const promedioDias = diasSel.length ? Math.round(diasSel.reduce((a, b) => a + b, 0) / diasSel.length) : null
  const nPend = pedidos.filter((p) => p.estado === 'Pendiente').length
  const nProc = pedidos.filter((p) => p.estado === 'En proceso').length
  const nListo = pedidos.filter((p) => p.estado === 'Listo').length
  const enTaller = nPend + nProc + nListo

  // ---- Para atender ----
  const asuntos = [
    ...pedidos.filter((p) => p.estado === 'Listo').map((p) => ({ tipo: 'listo', p })),
    ...pedidos.filter((p) => p.estado === 'Entregado' && saldoDe(p) > 0).sort((a, b) => saldoDe(b) - saldoDe(a)).map((p) => ({ tipo: 'saldo', p })),
    ...pedidos.filter((p) => (p.estado === 'Pendiente' || p.estado === 'En proceso') && diasDesde(p.creado_en || p.fecha) > 10).map((p) => ({ tipo: 'tarde', p })),
  ]

  async function marcarEntregado(p) {
    const cambios = { estado: 'Entregado', actualizado_en: new Date().toISOString(), fecha_entregado: new Date().toISOString().slice(0, 10) }
    const anterior = { estado: p.estado, fecha_entregado: p.fecha_entregado, actualizado_en: p.actualizado_en }
    actualizarPedidoLocal?.(p.id, cambios)
    showToast?.('✅', `Pedido ${p.numero} → Entregado`)
    const { error } = await supabase.from('pedidos').update(cambios).eq('id', p.id)
    if (error) {
      actualizarPedidoLocal?.(p.id, anterior)
      showToast?.('⚠️', 'No se pudo guardar, revisa la conexión')
    }
  }

  // ---- Gráfica: 6 meses que terminan en el mes actual (o en el elegido, si es más viejo) ----
  const finGraf = sel < mesHoy - 5 ? Math.min(mesHoy, sel + 2) : mesHoy
  const barras = []
  for (let k = finGraf - 5; k <= finGraf; k++) barras.push({ k, v: producido(k) })
  const maxV = Math.max(1, ...barras.map((b) => b.v))
  const paso = maxV <= 2e6 ? 5e5 : maxV <= 4e6 ? 1e6 : maxV <= 10e6 ? 2e6 : maxV <= 20e6 ? 5e6 : 10e6
  const tope = Math.ceil(maxV / paso) * paso
  const H = 160, top = 14, left = 34, w = 316
  const y = (v) => top + H - (v / tope) * H
  const slot = w / barras.length, bw = 26
  const marcas = []
  for (let t = 0; t <= tope + 1; t += paso) marcas.push(t)

  // ---- Clientes por lo que deben ----
  const cd = {}
  pedidos.forEach((p) => {
    if (!cd[p.cliente]) cd[p.cliente] = { n: 0, tot: 0, saldo: 0 }
    cd[p.cliente].n++
    cd[p.cliente].tot += totalReal(p)
    cd[p.cliente].saldo += saldoDe(p)
  })
  const clientes = Object.entries(cd).sort((a, b) => b[1].saldo - a[1].saldo || b[1].tot - a[1].tot)
  const visibles = clientes.slice(0, 6)
  const resto = clientes.slice(6)

  // ---- Lo que más se vendió en el mes elegido (unidades reales por tipo) ----
  const vend = {}
  const sumar = (prenda, tipo, n) => {
    if (!n) return
    const k = prenda + '|' + tipo
    vend[k] = (vend[k] || 0) + n
  }
  pedSel.forEach((p) => {
    ;(p.items_camiseta || []).forEach((it) => {
      const { cuello, puno } = totalesPorTipoCam(it.tabla)
      sumar('cam', 'cuello', cuello)
      sumar('cam', 'puno', puno)
    })
    ;(p.items_chaqueta || []).forEach((it) => {
      Object.values(it.tabla || {}).forEach((r) => {
        ;['pretina', 'cuello', 'puno'].forEach((t) => sumar('chaq', t, r[t] || 0))
      })
    })
  })
  const vendidos = Object.entries(vend).sort((a, b) => b[1] - a[1])
  const maxVend = Math.max(1, ...vendidos.map((v) => v[1]))

  async function enviarReporte() {
    setEnviando(true)
    try {
      const { data: { session: s } } = await supabase.auth.getSession()
      const resp = await fetch('/api/reporte-mensual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` },
        body: JSON.stringify({ mes: sel % 12, anio: anioDe(sel) }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Error al generar el reporte')
      showToast?.('📧', `Reporte de ${nombreMes(sel)} enviado a tu correo`)
    } catch (err) {
      showToast?.('⚠️', 'No se pudo enviar: ' + err.message)
    } finally {
      setEnviando(false)
    }
  }

  const mm = nombreMes(sel).toLowerCase()

  return (
    <div className="rsm">
      <div className="lp-cab">
        <div>
          <h1>Resumen</h1>
          <p>Cómo va el negocio y qué necesita tu atención.</p>
        </div>
        <div className="rs-mes">
          <button className="lp-ico" aria-label="Mes anterior" disabled={sel <= primero} onClick={() => setSel(sel - 1)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m15 6-6 6 6 6" /></svg>
          </button>
          <select value={sel} onChange={(e) => setSel(Number(e.target.value))} aria-label="Mes">
            {opciones.map((k) => <option key={k} value={k}>{nombreMes(k)} {anioDe(k)}</option>)}
          </select>
          <button className="lp-ico" aria-label="Mes siguiente" disabled={sel >= mesHoy} onClick={() => setSel(sel + 1)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m9 6 6 6-6 6" /></svg>
          </button>
        </div>
      </div>

      <div className="rs-kpis">
        <div className={`rs-kpi ${porCobrar > 0 ? 'alerta' : ''}`}>
          <div className="lbl">Por cobrar hoy</div>
          <div className="val">{fmtCOP(porCobrar)}</div>
          <div className="pie">{porCobrar > 0 ? `${clientesDeben} cliente${clientesDeben === 1 ? '' : 's'} con saldo` : 'Todos al día'}</div>
        </div>
        <div className="rs-kpi">
          <div className="lbl">Producido en {mm}</div>
          <div className="val">{fmtCOP(prodSel)}</div>
          <div className={`pie ${sel === mesHoy || variacion == null ? '' : variacion >= 0 ? 'sube' : 'baja'}`}>
            {sel === mesHoy ? 'El mes va en curso' : variacion == null ? 'Sin datos del mes anterior' : `${variacion >= 0 ? '▲' : '▼'} ${Math.abs(variacion)}% frente a ${nombreMes(sel - 1).toLowerCase()}`}
          </div>
        </div>
        <div className="rs-kpi">
          <div className="lbl">Pedidos de {mm}</div>
          <div className="val">{pedSel.length}</div>
          <div className="pie">{entregadosSel} entregado{entregadosSel === 1 ? '' : 's'} · {pedSel.length - entregadosSel} en el taller</div>
          {promedioDias != null && <div className="pie">Tardan {promedioDias} día{promedioDias === 1 ? '' : 's'} en promedio en salir</div>}
        </div>
        <div className="rs-kpi">
          <div className="lbl">En el taller hoy</div>
          <div className="val">{enTaller} <small>pedido{enTaller === 1 ? '' : 's'}</small></div>
          <div className="rs-flujo" aria-hidden="true">
            {nPend > 0 && <i style={{ flex: nPend, background: 'var(--jtx)' }} />}
            {nProc > 0 && <i style={{ flex: nProc, background: 'var(--ink)' }} />}
            {nListo > 0 && <i style={{ flex: nListo, background: 'var(--thread)' }} />}
          </div>
          <div className="rs-leyenda">
            <span><i className="lp-punto" style={{ background: 'var(--jtx)' }} />Pendiente <b>{nPend}</b></span>
            <span><i className="lp-punto" style={{ background: 'var(--ink)' }} />En proceso <b>{nProc}</b></span>
            <span><i className="lp-punto" style={{ background: 'var(--thread)' }} />Listo <b>{nListo}</b></span>
          </div>
        </div>
      </div>

      <div className="rs-rejilla">
        <div className="rs-panel">
          <div className="rs-panel-h"><h2>Para atender</h2><span>{asuntos.length ? `${asuntos.length} asunto${asuntos.length === 1 ? '' : 's'}` : 'Todo en orden'}</span></div>
          {asuntos.length ? (
            <ul className="rs-atender">
              {asuntos.map(({ tipo, p }) => {
                const pr = calcProgreso(p)
                return (
                  <li key={tipo + p.id}>
                    <i className={`tipo ${tipo}`} />
                    <div className="txt">
                      <b>{p.numero} · {p.cliente}</b>{' '}
                      {tipo === 'listo' ? 'está listo y sin entregar' : tipo === 'saldo' ? 'entregado con saldo' : 'lleva más de 10 días en el taller'}
                      <div>
                        {tipo === 'listo' && `Listo desde el ${ddmm(p.actualizado_en)} · ${pr.ok} de ${pr.total} empacadas`}
                        {tipo === 'saldo' && (() => { const d = diasDesde(p.fecha_entregado || p.fecha); return d === 0 ? 'Entregado hoy' : `Entregado hace ${d} día${d === 1 ? '' : 's'}` })()}
                        {tipo === 'tarde' && `Creado el ${ddmm(p.fecha)} · ${pr.ok} de ${pr.total} empacadas`}
                      </div>
                    </div>
                    {tipo === 'saldo' && <span className="monto">{fmtCOP(saldoDe(p))}</span>}
                    {tipo === 'listo' && <button className="lp-btn" onClick={() => marcarEntregado(p)}>Marcar entregado</button>}
                    {tipo === 'saldo' && <button className="lp-btn" onClick={() => onAbrirPedido?.(p.id)}>Abonar</button>}
                    {tipo === 'tarde' && <button className="lp-btn" onClick={() => onAbrirPedido?.(p.id)}>Ver</button>}
                  </li>
                )
              })}
            </ul>
          ) : <div className="rs-vacio">No hay pedidos listos sin entregar ni saldos de pedidos entregados.</div>}
        </div>

        <div className="rs-panel">
          <div className="rs-panel-h"><h2>Producido por mes</h2><span>Toca una barra para ver ese mes</span></div>
          <div className="rs-graf">
            <svg viewBox="0 0 360 200" role="img" aria-label="Valor producido por mes">
              {marcas.map((t) => (
                <g key={t}>
                  <line x1={left} x2={left + w} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
                  <text x={left - 6} y={y(t) + 3} textAnchor="end">{t === 0 ? '0' : textoMillones(t)}</text>
                </g>
              ))}
              {barras.map((b, i) => {
                const cx = left + slot * i + slot / 2
                const on = b.k === sel
                return (
                  <g key={b.k} className="barra" onClick={() => setSel(b.k)}>
                    <rect x={cx - slot / 2 + 2} y={top} width={slot - 4} height={H + 22} fill="transparent" />
                    <rect x={cx - bw / 2} y={y(b.v)} width={bw} height={Math.max(0, top + H - y(b.v))} rx="3" fill={on ? 'var(--thread)' : 'var(--ink)'} opacity={on ? 1 : 0.3} />
                    <text x={cx} y={top + H + 16} textAnchor="middle" className={on ? 'on' : ''}>{MES_CORTO[b.k % 12]}</text>
                    {on && b.v > 0 && <text x={cx} y={y(b.v) - 6} textAnchor="middle" className="on">{textoMillones(b.v)}</text>}
                  </g>
                )
              })}
            </svg>
          </div>
        </div>
      </div>

      <div className="rs-rejilla">
        <div className="rs-panel">
          <div className="rs-panel-h"><h2>Clientes</h2><span>Ordenados por lo que deben</span></div>
          <div className="rs-tabla">
            <table>
              <thead><tr><th>Cliente</th><th className="num c-ped">Pedidos</th><th className="num">Comprado</th><th className="num">Debe</th></tr></thead>
              <tbody>
                {visibles.map(([k, v]) => (
                  <tr key={k}>
                    <td><b>{k}</b></td>
                    <td className="num c-ped">{v.n}</td>
                    <td className="num">{fmtCOP(v.tot)}</td>
                    <td className="num">{v.saldo > 0 ? <span className="rs-tag debe">{fmtCOP(v.saldo)}</span> : <span className="rs-tag ok">al día</span>}</td>
                  </tr>
                ))}
                {resto.length > 0 && (
                  <tr>
                    <td><b>Otros {resto.length} cliente{resto.length === 1 ? '' : 's'}</b></td>
                    <td className="num c-ped">{resto.reduce((s, [, v]) => s + v.n, 0)}</td>
                    <td className="num">{fmtCOP(resto.reduce((s, [, v]) => s + v.tot, 0))}</td>
                    <td className="num">{(() => { const d = resto.reduce((s, [, v]) => s + v.saldo, 0); return d > 0 ? <span className="rs-tag debe">{fmtCOP(d)}</span> : <span className="rs-tag ok">al día</span> })()}</td>
                  </tr>
                )}
                {!clientes.length && <tr><td colSpan={4} className="rs-vacio">Sin datos</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rs-panel">
          <div className="rs-panel-h"><h2>Lo que más se vendió</h2><span>Unidades en {mm}</span></div>
          <div className="rs-tabla">
            <table>
              <tbody>
                {vendidos.map(([k, n]) => {
                  const [prenda, tipo] = k.split('|')
                  return (
                    <tr key={k}>
                      <td><InsigniaTipos tipos={[tipo]} prenda={prenda} extra={prenda === 'cam' ? 'camiseta' : 'chaqueta'} /></td>
                      <td style={{ width: '40%' }}><div className="rs-barra"><i style={{ width: `${(n / maxVend) * 100}%`, background: prenda === 'chaq' ? 'var(--jtx)' : 'var(--thread)' }} /></div></td>
                      <td className="num">{n.toLocaleString('es-CO')}</td>
                    </tr>
                  )
                })}
                {!vendidos.length && <tr><td className="rs-vacio">No hay pedidos en {mm}.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {REPORTE_MENSUAL_ACTIVO && (
        <div className="rs-panel rs-reporte">
          <div className="txt"><b>Reporte de entregados en Excel.</b> Llega solo a tu correo el día 1 de cada mes. También puedes pedir ahora el de {nombreMes(sel).toLowerCase()} {anioDe(sel)}.</div>
          <button className="btn btn-p" onClick={enviarReporte} disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar a mi correo'}</button>
        </div>
      )}
    </div>
  )
}
