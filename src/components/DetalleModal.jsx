import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { TIPO_LABEL, TIPO_ICON, fmtFecha, fmtCOP, calcProgreso, etapaCelda, faltanCelda, ESTADOS, ESTADO_ICON, TALLAS, TALLA_SIN_DIVIDIR, totalesPorTipoCam } from './constants'
import { generarFacturaPDF, generarFacturaMini, imprimirEtiqueta } from './factura'
import PanelPagos from './PanelPagos'
import ColorSwatch from './ColorSwatch'
import FormulaColorBoton from './FormulaColorBoton'

// Un toque avanza la etapa; nunca la devuelve. Para borrar se mantiene
// presionada la celda — así un toque de más no desmarca algo ya hecho.
function siguienteEtapa(actual) {
  if (actual === 'tejido') return 'empacado'
  if (actual === 'empacado') return 'empacado' // ya está al final: no cambia
  return 'tejido'
}

export default function DetalleModal({ pedido, onClose, onUpdated, onEditar, onCompartir, showToast }) {
  const [lightbox, setLightbox] = useState(null)
  // Copia local de los estados de cada ítem. Al tocar una celda se actualiza
  // aquí de una vez (se ve instantáneo) y el guardado en la base va aparte,
  // en segundo plano. Antes cada toque recargaba TODOS los pedidos con sus
  // ítems y abonos, y por eso demoraba varios segundos en pintarse.
  const [estadosLocal, setEstadosLocal] = useState({})
  const huboCambios = useRef(false)
  if (!pedido) return null

  const estadosDe = (item) => estadosLocal[item.id] ?? item.estados ?? {}

  // Versión del pedido con los estados que se ven en pantalla ahora mismo,
  // para que la barra de progreso también se mueva al instante.
  const pedidoVivo = {
    ...pedido,
    items_camiseta: (pedido.items_camiseta || []).map((it) => ({ ...it, estados: estadosDe(it) })),
    items_chaqueta: (pedido.items_chaqueta || []).map((it) => ({ ...it, estados: estadosDe(it) })),
  }

  // Al cerrar sí refrescamos la lista una sola vez, para que afuera se vea
  // el progreso actualizado.
  function cerrar() {
    if (huboCambios.current) onUpdated()
    onClose()
  }

  const pr = calcProgreso(pedidoVivo)
  const esSoloCamiseta = (pedido.items_camiseta || []).length > 0 && (pedido.items_chaqueta || []).length === 0
  const pedidoCompleto = pedido.estado === 'Entregado' ||
    (pr.total > 0 && pr.ok === pr.total) ||
    (pr.total === 0 && (pedido.items_chaqueta || []).every((it) => it.kilos_reales != null)) ||
    // Pedidos solo de camiseta: el precio ya se conoce sin pesar nada, así que
    // el botón de factura puede aparecer desde que se marca "Listo", sin
    // esperar a que se completen los ✅ de producción uno por uno. Los pedidos
    // con chaqueta NO entran aquí porque su precio depende del peso, que
    // normalmente se registra al entregar.
    (esSoloCamiseta && pedido.estado === 'Listo')

  async function cambiarEstado(nuevoEstado) {
    const cambios = { estado: nuevoEstado, actualizado_en: new Date().toISOString() }
    if (nuevoEstado === 'Entregado') cambios.fecha_entregado = new Date().toISOString().slice(0, 10)
    const { error } = await supabase.from('pedidos').update(cambios).eq('id', pedido.id)
    if (error) { showToast('⚠️', 'Error al cambiar estado'); return }
    showToast(ESTADO_ICON[nuevoEstado], `Estado actualizado a ${nuevoEstado}`)
    onUpdated()
  }

  // Pinta el cambio de una vez y guarda en segundo plano. Si el guardado
  // falla, se devuelve la celda a como estaba y se avisa — así nunca queda
  // marcada en pantalla algo que no alcanzó a guardarse.
  async function persistir(item, estados) {
    const anterior = estadosDe(item)
    setEstadosLocal((prev) => ({ ...prev, [item.id]: estados }))
    huboCambios.current = true
    const esCam = (pedido.items_camiseta || []).some((x) => x.id === item.id)
    const { error } = await supabase
      .from(esCam ? 'items_camiseta' : 'items_chaqueta')
      .update({ estados }).eq('id', item.id)
    if (error) {
      setEstadosLocal((prev) => ({ ...prev, [item.id]: anterior }))
      showToast('⚠️', 'No se pudo guardar, revisa la conexión')
    }
  }

  // Guarda la etapa de una celda. Al borrar (etapa null) también se limpian
  // las claves de los formatos viejos ('|tejido' y '|revisado'); si no, la
  // marca antigua reaparecería y la celda no se vería vacía.
  function guardarEtapa(item, base, etapa) {
    const estados = { ...estadosDe(item) }
    delete estados[`${base}|tejido`]
    delete estados[`${base}|revisado`]
    if (etapa) estados[base] = etapa
    else delete estados[base]
    persistir(item, estados)
  }

  // Guarda cuántas unidades faltan de una celda (0 = no falta nada, se borra).
  function guardarFaltan(item, base, n) {
    const estados = { ...estadosDe(item) }
    if (n > 0) estados[`${base}|faltan`] = n
    else delete estados[`${base}|faltan`]
    persistir(item, estados)
  }

  async function guardarPesaje(item, kilos) {
    const kg = parseFloat(kilos)
    if (!kg) { showToast('⚠️', 'Ingresa los kilos'); return }
    const p0 = item.precios[item.tipos[0]] || 0
    const totalFinal = kg * p0
    const { error } = await supabase.from('items_chaqueta').update({ kilos_reales: kg, total_final: totalFinal }).eq('id', item.id)
    if (error) { showToast('⚠️', 'Error al guardar el peso'); return }

    // Recalcular total del pedido
    const itemsChaq = (pedido.items_chaqueta || []).map((it) => it.id === item.id ? { ...it, kilos_reales: kg, total_final: totalFinal } : it)
    const allPesado = itemsChaq.every((it) => it.kilos_reales != null)
    const totalChaq = itemsChaq.reduce((s, it) => s + (it.total_final || 0), 0)
    await supabase.from('pedidos').update({
      total_final: allPesado ? (pedido.total_camiseta || 0) + totalChaq : null,
      hay_chaqueta: !allPesado,
    }).eq('id', pedido.id)

    showToast('✅', `${kg} kg guardados`)
    onUpdated()
    onClose()
  }

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) cerrar() }}>
      <div className="modal">
        <div className="mtitle">Pedido {pedido.numero} — {pedido.cliente}</div>

        <div className="msec">
          <h4>Información General</h4>
          <div className="dgrid">
            <div className="dp"><span className="dk">N° Pedido</span><span className="dv" style={{ fontFamily: "'DM Mono', monospace", fontSize: 17, fontWeight: 800, color: 'var(--thread)' }}>{pedido.numero}</span></div>
            <div className="dp"><span className="dk">Fecha</span><span className="dv">{fmtFecha(pedido.fecha)}</span></div>
            <div className="dp"><span className="dk">Cliente</span><span className="dv">{pedido.cliente}</span></div>
            <div className="dp"><span className="dk">Estado</span><span className="dv">
              <select className="estado-select" value={pedido.estado} onChange={(e) => cambiarEstado(e.target.value)}>
                {ESTADOS.map((es) => <option key={es} value={es}>{ESTADO_ICON[es]} {es}</option>)}
              </select>
            </span></div>
            {pedido.observaciones && <div className="dp" style={{ gridColumn: '1/-1' }}><span className="dk">Observaciones</span><span className="dv">{pedido.observaciones}</span></div>}
          </div>
        </div>

        {pr.total > 0 && (
          <>
            <div style={{ background: 'var(--ink)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: 'var(--yarn)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>Progreso de producción</div>
                <div className="prog-wrap" style={{ height: 8 }}><div className="prog-bar" style={{ width: `${pr.pct}%` }} /></div>
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", color: '#fff', fontSize: 13, whiteSpace: 'nowrap' }}>📦 {pr.ok}/{pr.total} {pr.falta > 0 && `· 🔴 ${pr.falta}`}</div>
            </div>
            <div className="prod-legend">
              <span>Toca una celda: 1ª vez 🧵 tejido · 2ª vez 📦 empacado</span>
              <span style={{ color: 'var(--muted)', fontSize: 10 }}>· Mantén presionado para borrar la marca</span>
            </div>
          </>
        )}

        {(pedido.items_camiseta || []).length > 0 && (
          <div className="msec">
            <h4>👔 Camiseta — {pedido.items_camiseta.length} ítem(s)</h4>
            {pedido.items_camiseta.map((it, idx) => (
              <ItemCamView key={it.id} it={it} estados={estadosDe(it)} itemIndice={idx} onEtapa={guardarEtapa} onFaltan={guardarFaltan} onImgClick={setLightbox} showToast={showToast} pedidoId={pedido.id} />
            ))}
          </div>
        )}

        {(pedido.items_chaqueta || []).length > 0 && (
          <div className="msec">
            <h4>🧥 Chaqueta — {pedido.items_chaqueta.length} ítem(s)</h4>
            {pedido.items_chaqueta.map((it, idx) => (
              <ItemChaqView key={it.id} it={it} estados={estadosDe(it)} itemIndice={idx} estadoPedido={pedido.estado} onEtapa={guardarEtapa} onFaltan={guardarFaltan} onPesaje={guardarPesaje} onImgClick={setLightbox} showToast={showToast} pedidoId={pedido.id} />
            ))}
          </div>
        )}

        <div className="brow right">
          <button className="btn btn-s" onClick={cerrar}>Cerrar</button>
          <button className="btn btn-s" onClick={() => imprimirEtiqueta(pedido)}>🏷️ Etiqueta</button>
          <button className="btn btn-s" onClick={() => onCompartir(pedido)}>🔗 Compartir con cliente</button>
          {pedidoCompleto && (
            <button className="btn btn-s" onClick={() => generarFacturaPDF(pedido)} style={{ background: 'var(--weave)', color: 'var(--thread)', fontWeight: 700 }}>
              🧾 Descargar Factura
            </button>
          )}
          {pedidoCompleto && (
            <button className="btn btn-s" onClick={() => generarFacturaMini(pedido)} style={{ background: 'var(--weave)', color: 'var(--thread)', fontWeight: 700 }} title="Recibo condensado 10.5x15cm para impresora térmica Jadens">
              🧾 Factura mini (Jadens)
            </button>
          )}
          <button className="btn btn-p" onClick={onEditar}>✏️ Editar</button>
        </div>

        {/* Panel de pagos */}
        <div className="msec" style={{ marginTop: 8 }}>
          <h4>💳 Pagos y Abonos</h4>
          <PanelPagos
            pedido={pedido}
            onUpdated={onUpdated}
            showToast={showToast}
            compact={false}
          />
        </div>
      </div>

      {lightbox && (
        <div className="lb" onClick={() => setLightbox(null)}>
          <span className="lb-close">✕</span>
          <img src={lightbox} alt="" />
        </div>
      )}
    </div>
  )
}

// Celda tocable: un toque avanza (nada -> 🧵 -> 📦) y mantener presionado
// borra la marca. El botón ocupa toda la celda para que sea fácil de dar
// en el celular, sin apuntarle a un ícono diminuto.
function CeldaEtapa({ etapa, n, onAvanzar, onLimpiar }) {
  const temporizador = useRef(null)
  const fueLargo = useRef(false)

  function iniciar() {
    fueLargo.current = false
    // 700 ms: en el celular un toque normal dura más que en el computador,
    // así que un umbral corto haría que un toque común borre la marca.
    temporizador.current = setTimeout(() => { fueLargo.current = true; onLimpiar() }, 700)
  }
  function terminar() { clearTimeout(temporizador.current) }
  function manejarClic() {
    // Si acabó de dispararse el "mantener presionado", ese toque ya cumplió
    // su función (borrar) y no debe además avanzar la etapa.
    if (fueLargo.current) { fueLargo.current = false; return }
    onAvanzar()
  }

  return (
    <button
      type="button"
      className={`celda-etapa ${etapa || 'vacia'}`}
      onPointerDown={iniciar}
      onPointerUp={terminar}
      onPointerLeave={terminar}
      onPointerCancel={terminar}
      onClick={manejarClic}
      onContextMenu={(e) => e.preventDefault()}
      title="Toca: 🧵 tejido → 📦 empacado · Mantén presionado para borrar"
    >
      <span className="celda-num">{n}</span>
      <span className="celda-ico">{etapa === 'empacado' ? '📦' : etapa === 'tejido' ? '🧵' : ''}</span>
    </button>
  )
}

// Casilla roja para escribir cuántas unidades faltan de esa celda. Solo se
// ve cuando está activado el modo faltantes. Guarda al salir del campo
// (no en cada tecla) para no golpear la base de datos en cada número.
function CasillaFaltan({ valor, max, onGuardar }) {
  const [txt, setTxt] = useState(valor ? String(valor) : '')
  useEffect(() => { setTxt(valor ? String(valor) : '') }, [valor])

  function guardar() {
    const n = Math.max(0, Math.min(max, parseInt(txt) || 0))
    setTxt(n ? String(n) : '')
    if (n !== valor) onGuardar(n)
  }

  return (
    <input
      type="number" min="0" max={max}
      value={txt}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={guardar}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      className={`casilla-faltan ${valor > 0 ? 'con-falta' : ''}`}
      placeholder="—"
      title="Cuántas unidades faltan de esta celda"
    />
  )
}

function ItemCamView({ it, estados, itemIndice, onEtapa, onFaltan, onImgClick, showToast, pedidoId }) {
  const [modoFaltan, setModoFaltan] = useState(false)
  // La fórmula elegida se ancla a la POSICIÓN del ítem, no a su identificador.
  // Al guardar un pedido editado los ítems se borran y se vuelven a crear con
  // identificadores nuevos, así que amarrarla al id hacía que la selección se
  // perdiera al corregir cantidades. La posición sí sobrevive a esa recreación.
  const refItem = String(itemIndice)
  const tLabel = it.tipos.map((t) => `${TIPO_ICON[t]} ${TIPO_LABEL[t]}`).join(' + ')
  // Orden explícito guardado; si el ítem es viejo y no lo tiene, lo derivamos
  // como respaldo (Postgres no garantiza el orden de un objeto jsonb).
  const coloresPresentes = (it.colores && it.colores.length) ? it.colores : (() => {
    const list = []
    Object.values(it.tabla || {}).forEach((tallaObj) => {
      Object.keys(tallaObj).forEach((c) => { if (!list.includes(c)) list.push(c) })
    })
    return list
  })()
  const tallasPresentes = TALLAS.filter((t) => it.tabla && it.tabla[t])
  if (it.tabla && it.tabla[TALLA_SIN_DIVIDIR]) tallasPresentes.push(TALLA_SIN_DIVIDIR)

  return (
    <div style={{ background: 'var(--loom)', border: '1px solid var(--cbd)', borderRadius: 9, padding: 12, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="badge cam">{tLabel}</span>
          {it.precios?.juego && <span className="badge cam" style={{ background: '#4b8523', color: '#fff' }}>🎽 Juego {fmtCOP(it.precios.juego)} c/u</span>}
          {it.diseno && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{it.diseno}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className={`btn-faltan ${modoFaltan ? 'on' : ''}`}
            onClick={() => setModoFaltan((v) => !v)}
            title="Muestra una casilla en cada celda para anotar cuántas faltan"
          >
            🔴 Faltantes
          </button>
          <span className="itot">{fmtCOP(it.total_precio)}</span>
        </div>
      </div>

      <div className="tscroll cam-scroll">
        <table className="tg">
          <thead>
            <tr>
              <th className="th-l" rowSpan={2}>Talla</th>
              {coloresPresentes.map((c) => (
                <th key={c} colSpan={it.tipos.length} style={{ borderLeft: '2px solid rgba(255,255,255,.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    <ColorSwatch nombre={c} />
                    <span>{c}</span>
                   <FormulaColorBoton nombreColor={c} showToast={showToast} pedidoId={pedidoId} itemTipo="camiseta" itemId={refItem} />
                  </div>
                </th>
              ))}
              <th rowSpan={2}>Total</th>
            </tr>
            <tr>
              {coloresPresentes.map((c) => it.tipos.map((t) => (
                <th key={`${c}_${t}`} className="th-item-cam" style={{ borderLeft: '1px solid rgba(255,255,255,.15)' }}>{TIPO_LABEL[t]}</th>
              )))}
            </tr>
          </thead>
          <tbody>
            {tallasPresentes.map((talla) => {
              const tallaObj = it.tabla[talla]
              let totFila = 0
              return (
                <tr key={talla}>
                  <td className="td-key cam">{talla}</td>
                  {coloresPresentes.map((c) => it.tipos.map((t) => {
                    const n = (tallaObj[c] || {})[t] || 0
                    if (!n) return <td key={`${c}_${t}`} style={{ borderLeft: t === it.tipos[0] ? '2px solid #c8e6c9' : '1px solid var(--border)', textAlign: 'center', color: '#ccc' }}>—</td>
                    totFila += n
                    const base = `${talla}|${c}|${t}`
                    const etapa = etapaCelda(estados, base)
                    const faltan = faltanCelda(estados, base)
                    return (
                      <td
                        key={`${c}_${t}`}
                        className={`celda-td ${faltan > 0 ? 'con-falta' : ''}`}
                        style={{ borderLeft: t === it.tipos[0] ? '2px solid #c8e6c9' : '1px solid var(--border)' }}
                      >
                        <div className="celda-wrap">
                          <CeldaEtapa
                            etapa={etapa}
                            n={n}
                            onAvanzar={() => onEtapa(it, base, siguienteEtapa(etapa))}
                            onLimpiar={() => onEtapa(it, base, null)}
                          />
                          {modoFaltan && (
                            <CasillaFaltan valor={faltan} max={n} onGuardar={(v) => onFaltan(it, base, v)} />
                          )}
                          {!modoFaltan && faltan > 0 && <span className="falta-txt">faltan {faltan}</span>}
                        </div>
                      </td>
                    )
                  }))}
                  <td className="td-tot-end cam">{totFila}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {it.imagenes?.length > 0 && (
        <div className="item-imgs">{it.imagenes.map((s, i) => <img key={i} className="item-img" src={s} alt="" onClick={() => onImgClick(s)} />)}</div>
      )}

      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, fontFamily: "'DM Mono', monospace" }}>
        {it.precios?.juego
          ? `Juego (cuello + puño incluido): ${fmtCOP(it.precios.juego)} por cuello`
          : it.tipos.map((t) => `${TIPO_LABEL[t]}: ${fmtCOP(it.precios[t] || 0)}/u`).join(' · ')}
      </div>

      {(() => {
        const { cuello, puno } = totalesPorTipoCam(it.tabla)
        const esJuego = it.precios?.juego
        return (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, padding: '8px 12px', background: 'var(--ink)', borderRadius: 7 }}>
            {esJuego ? (
              <span style={{ fontSize: 12, color: 'var(--yarn)' }}>🎽 Total de juegos (cuellos): <strong style={{ color: '#fff' }}>{cuello}</strong>{puno > 0 && ` · +${puno} puños incluidos`}</span>
            ) : (
              <>
                {cuello > 0 && <span style={{ fontSize: 12, color: 'var(--yarn)' }}>🔵 Total cuellos: <strong style={{ color: '#fff' }}>{cuello}</strong></span>}
                {puno > 0 && <span style={{ fontSize: 12, color: 'var(--yarn)' }}>🧤 Total puños: <strong style={{ color: '#fff' }}>{puno}</strong></span>}
              </>
            )}
          </div>
        )
      })()}
    </div>
  )
}

function ItemChaqView({ it, estados, itemIndice, estadoPedido, onEtapa, onFaltan, onPesaje, onImgClick, showToast, pedidoId }) {
  const [kg, setKg] = useState(it.kilos_reales || '')
  const [modoFaltan, setModoFaltan] = useState(false)
  const refItem = String(itemIndice)
  const tLabel = it.tipos.map((t) => `${TIPO_ICON[t]} ${TIPO_LABEL[t]}`).join(' + ')
  const p0 = it.precios[it.tipos[0]] || 0
  const coloresPresentes = ((it.colores && it.colores.length) ? it.colores : Object.keys(it.tabla || {})).filter((c) => it.tabla && it.tabla[c])

  return (
    <div style={{ background: 'var(--loom)', border: '1px solid var(--jbd)', borderRadius: 9, padding: 12, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="badge chaq">{tLabel}</span>
          {it.diseno && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{it.diseno}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className={`btn-faltan ${modoFaltan ? 'on' : ''}`}
            onClick={() => setModoFaltan((v) => !v)}
            title="Muestra una casilla en cada celda para anotar cuántas faltan"
          >
            🔴 Faltantes
          </button>
          <span className={`itot ${it.kilos_reales ? '' : 'pend'}`}>{it.kilos_reales ? `✅ ${fmtCOP(it.total_final)}` : '⚖️ Pendiente de pesaje'}</span>
        </div>
      </div>

      <div className="tscroll chaq-scroll">
        <table className="tg">
          <thead><tr><th className="th-l">Color / Referencia</th>{it.tipos.map((t) => <th key={t} className="th-item-chaq">{TIPO_LABEL[t]}</th>)}<th>Total</th></tr></thead>
          <tbody>
            {coloresPresentes.map((color) => {
              const rowObj = it.tabla[color]
              let totF = 0
              return (
                <tr key={color}>
                 <td className="td-key chaq"><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><ColorSwatch nombre={color} /><span>{color}</span><FormulaColorBoton nombreColor={color} showToast={showToast} pedidoId={pedidoId} itemTipo="chaqueta" itemId={refItem} /></div></td>
                  {it.tipos.map((t) => {
                    const n = rowObj[t] || 0
                    if (!n) return <td key={t} style={{ textAlign: 'center', color: '#ccc' }}>—</td>
                    totF += n
                    const base = `${color}|${t}`
                    const etapa = etapaCelda(estados, base)
                    const faltan = faltanCelda(estados, base)
                    return (
                      <td key={t} className={`celda-td ${faltan > 0 ? 'con-falta' : ''}`}>
                        <div className="celda-wrap">
                          <CeldaEtapa
                            etapa={etapa}
                            n={n}
                            onAvanzar={() => onEtapa(it, base, siguienteEtapa(etapa))}
                            onLimpiar={() => onEtapa(it, base, null)}
                          />
                          {modoFaltan && (
                            <CasillaFaltan valor={faltan} max={n} onGuardar={(v) => onFaltan(it, base, v)} />
                          )}
                          {!modoFaltan && faltan > 0 && <span className="falta-txt">faltan {faltan}</span>}
                        </div>
                      </td>
                    )
                  })}
                  <td className="td-tot-end chaq">{totF}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {it.imagenes?.length > 0 && (
        <div className="item-imgs">{it.imagenes.map((s, i) => <img key={i} className="item-img" src={s} alt="" onClick={() => onImgClick(s)} />)}</div>
      )}

      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, fontFamily: "'DM Mono', monospace" }}>
        {it.tipos.map((t) => `${TIPO_LABEL[t]}: ${fmtCOP(it.precios[t] || 0)}/kg`).join(' · ')} · {it.total_unidades} piezas
      </div>

      {estadoPedido !== 'Entregado' ? (
        <div className="pesaje-frm">
          <h5>⚖️ Registrar peso al entregar</h5>
          <div className="prow">
            <label>Kilos reales:</label>
            <input type="number" step="0.01" min="0" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="0.00" />
            <span className="ptot">{kg ? fmtCOP(parseFloat(kg) * p0) : ''}</span>
            <button className="btn btn-p btn-sm" onClick={() => onPesaje(it, kg)}>Guardar</button>
          </div>
        </div>
      ) : it.kilos_reales ? (
        <div style={{ fontSize: 12, color: 'var(--thread)', marginTop: 6, fontWeight: 600 }}>✅ {it.kilos_reales} kg · {fmtCOP(it.total_final)}</div>
      ) : null}
    </div>
  )
}
