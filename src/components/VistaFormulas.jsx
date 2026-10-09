import { useEffect, useMemo, useRef, useState } from 'react'
import { Ico } from './iconos'
import { MuestraHilo, MuestraMezcla, MuestraNombre } from './Muestras'
import FormulaEditor from './FormulaEditor'
import {
  normalizar, capitalizar, gamaDe, tituloGama, ESTADOS, pasoLabel,
  hiloTitulo, hiloDetalle, hiloSinColor, textoBusquedaHilo,
  lineasDe, partesDe, textoFormula, resumenFormula, alertaFormula, segmentosMezcla,
} from './hilos'

const ddmm = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : '')
const ALERTA = {
  agotado: { corto: 'Hilo agotado', clase: 'debe' },
  borrado: { corto: 'Hilo borrado', clase: 'debe' },
  sin_rotacion: { corto: 'Sin rotación', clase: 'aviso' },
}

// Vista Fórmulas de Colores: la lista agrupada por gama y, a la derecha, la
// ficha de la fórmula elegida con sus hilos (paso, cabos, estado de cada
// hilo) y los pedidos donde se eligió.
export default function VistaFormulas({ formulas, setFormulas, hilos, setHilos, hilosPorId, pedidosDeFormula, sel, setSel, nuevo, setNuevo, onVerHilo, onAbrirPedido, cargando, showToast }) {
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('')
  // null | { desde, formula } (editar) | { desde, base } (duplicar). `desde` es la
  // fórmula cuya ficha queda fija mientras se edita, aunque cambie la búsqueda.
  const [editando, setEditando] = useState(null)
  const detalleRef = useRef(null)

  const items = useMemo(() => formulas.map((f) => {
    const lineas = lineasDe(f)
    const pedidos = pedidosDeFormula.get(f.id) || []
    return {
      f, lineas, pedidos,
      nombre: capitalizar(f.color_nombre),
      gama: gamaDe(f.color_nombre) || 'otros',
      resumen: lineas ? resumenFormula(lineas, hilosPorId) : String(f.descripcion || '').split('\n')[0],
      alerta: lineas ? alertaFormula(lineas, hilosPorId) : null,
      segs: lineas ? segmentosMezcla(lineas, hilosPorId) : null,
      busca: normalizar([
        f.color_nombre, f.nota, lineas ? '' : f.descripcion,
        ...(lineas || []).map((l) => textoBusquedaHilo(hilosPorId.get(l.cono_id) || {})),
        ...pedidos.map((p) => p.numero),
      ].filter(Boolean).join(' ')),
    }
  }).sort((a, b) => a.gama.localeCompare(b.gama) || normalizar(a.f.color_nombre).localeCompare(normalizar(b.f.color_nombre)) || b.pedidos.length - a.pedidos.length),
  [formulas, hilosPorId, pedidosDeFormula])

  const cuenta = {
    agotado: items.filter((i) => i.alerta === 'agotado' || i.alerta === 'borrado').length,
    sin_rotacion: items.filter((i) => i.alerta === 'sin_rotacion').length,
    texto: items.filter((i) => !i.lineas).length,
  }
  const pasaFiltro = (i) => !filtro
    || (filtro === 'agotado' && (i.alerta === 'agotado' || i.alerta === 'borrado'))
    || (filtro === 'sin_rotacion' && i.alerta === 'sin_rotacion')
    || (filtro === 'texto' && !i.lineas)
  const q = normalizar(busqueda)
  const visibles = items.filter((i) => pasaFiltro(i) && (!q || q.split(/\s+/).every((p) => i.busca.includes(p.replace(/^#/, '')))))
  const grupos = []
  for (const i of visibles) {
    if (!grupos.length || grupos[grupos.length - 1].gama !== i.gama) grupos.push({ gama: i.gama, items: [] })
    grupos[grupos.length - 1].items.push(i)
  }
  const fija = editando ? items.find((i) => i.f.id === editando.desde) : null
  const elegido = fija || visibles.find((i) => i.f.id === sel) || visibles[0] || null
  const listaRef = useRef(null)
  // Al llegar desde la ficha de un hilo, que la fórmula elegida se vea en la lista.
  useEffect(() => { listaRef.current?.querySelector('.co-item.on')?.scrollIntoView({ block: 'nearest' }) }, [sel])

  function elegir(id) {
    setSel(id)
    setEditando(null)
    setNuevo(false)
    if (window.matchMedia('(max-width: 900px)').matches) setTimeout(() => detalleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
  }

  function guardada(fila) {
    const esNueva = !formulas.some((x) => x.id === fila.id)
    // Que la fórmula recién creada no quede escondida por la búsqueda.
    if (esNueva) { setBusqueda(''); setFiltro('') }
    setFormulas((prev) => (prev.some((x) => x.id === fila.id) ? prev.map((x) => (x.id === fila.id ? fila : x)) : [...prev, fila]))
    setSel(fila.id)
    setEditando(null)
    setNuevo(false)
  }

  function eliminada(id) {
    setFormulas((prev) => prev.filter((x) => x.id !== id))
    setSel(null)
    setEditando(null)
  }

  async function copiar(i) {
    const texto = `${i.nombre}:\n${i.lineas ? textoFormula(i.lineas, hilosPorId) : (i.f.descripcion || '')}`
    try { await navigator.clipboard.writeText(texto); showToast('📋', 'Fórmula copiada') }
    catch { window.prompt('Copia la fórmula:', texto) }
  }

  const agregarHilo = (h) => setHilos((prev) => [...prev, h])
  const editor = (key, props) => (
    <FormulaEditor
      key={key}
      hilos={hilos}
      onHiloCreado={agregarHilo}
      onGuardada={guardada}
      onEliminada={eliminada}
      showToast={showToast}
      {...props}
    />
  )

  return (
    <>
      <div className="lp-filtros">
        <label className="lp-buscar">
          {Ico.buscar}
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Busca un color, un hilo (725, mH) o un pedido" />
        </label>
        <div className="co-chips">
          <button className={`tchip ${!filtro ? 'on' : ''}`} onClick={() => setFiltro('')}>Todas <span>{items.length}</span></button>
          {cuenta.agotado > 0 && <button className={`tchip ${filtro === 'agotado' ? 'on' : ''}`} onClick={() => setFiltro(filtro === 'agotado' ? '' : 'agotado')}>Con hilo agotado <span>{cuenta.agotado}</span></button>}
          {cuenta.sin_rotacion > 0 && <button className={`tchip ${filtro === 'sin_rotacion' ? 'on' : ''}`} onClick={() => setFiltro(filtro === 'sin_rotacion' ? '' : 'sin_rotacion')}>Con hilo sin rotación <span>{cuenta.sin_rotacion}</span></button>}
          {cuenta.texto > 0 && <button className={`tchip ${filtro === 'texto' ? 'on' : ''}`} onClick={() => setFiltro(filtro === 'texto' ? '' : 'texto')}>Sin pasar a hilos <span>{cuenta.texto}</span></button>}
        </div>
      </div>

      <div className="co-dos">
        <div className="rs-panel co-lista" ref={listaRef}>
          {cargando ? <div className="rs-vacio">Cargando fórmulas…</div>
            : !visibles.length ? <div className="rs-vacio">{items.length ? 'Ninguna fórmula coincide.' : 'Todavía no hay fórmulas. Crea la primera con “Nueva fórmula”.'}</div>
            : grupos.map((g) => (
              <div key={g.gama}>
                <div className="co-gama"><span>{tituloGama(g.gama)}</span><span>{g.items.length}</span></div>
                {g.items.map((i) => {
                  const al = i.alerta ? ALERTA[i.alerta] : null
                  return (
                    <button key={i.f.id} className={`co-item ${!nuevo && elegido?.f.id === i.f.id ? 'on' : ''}`} onClick={() => elegir(i.f.id)}>
                      {i.segs ? <MuestraMezcla segmentos={i.segs} /> : <MuestraNombre nombre={i.f.color_nombre} />}
                      <span className="co-nom">
                        <b>{i.nombre}</b>
                        <span>{i.resumen || 'sin hilos'}{i.pedidos.length ? ` · ${i.pedidos.length} ped` : ''}</span>
                      </span>
                      {al && <span className={`co-tag ${al.clase}`}>{al.corto}</span>}
                    </button>
                  )
                })}
              </div>
            ))}
        </div>

        <div className="rs-panel co-det" ref={detalleRef}>
          {nuevo ? (
            <>
              <div className="co-cabeza"><div className="co-titulo"><h2>Nueva fórmula</h2><div>Elige los hilos, cómo pasan por el guiahilo y cuántos cabos.</div></div></div>
              <div className="co-bloque">{editor('nueva', { formula: null, onCancelar: () => setNuevo(false) })}</div>
            </>
          ) : !elegido ? <div className="rs-vacio">Elige una fórmula de la lista.</div> : (
            <>
              <div className="co-cabeza">
                {elegido.segs ? <MuestraMezcla segmentos={elegido.segs} tam="grande" /> : <MuestraNombre nombre={elegido.f.color_nombre} tam="grande" />}
                <div className="co-titulo">
                  <h2>{elegido.nombre}</h2>
                  <div>gama {elegido.gama}{elegido.lineas ? '' : ' · todavía escrita a mano'}</div>
                </div>
                {!editando && (
                  <div className="lp-acc">
                    <button className="lp-ico" title="Copiar la fórmula" aria-label="Copiar la fórmula" onClick={() => copiar(elegido)}>{Ico.copiar}</button>
                    {elegido.lineas && <button className="lp-ico" title="Duplicar para hacer una variante" aria-label="Duplicar fórmula" onClick={() => setEditando({ desde: elegido.f.id, base: { color_nombre: elegido.f.color_nombre, lineas: elegido.lineas, nota: elegido.f.nota } })}>{Ico.duplicar}</button>}
                    <button className="lp-ico" title="Editar la fórmula" aria-label="Editar fórmula" onClick={() => setEditando({ desde: elegido.f.id, formula: elegido.f })}>{Ico.editar}</button>
                  </div>
                )}
              </div>

              {editando ? (
                <div className="co-bloque">
                  {editando.formula
                    ? editor(`e-${editando.desde}`, { formula: editando.formula, usos: elegido.pedidos.length, onCancelar: () => setEditando(null) })
                    : editor(`d-${editando.desde}`, { formula: null, base: editando.base, onCancelar: () => setEditando(null) })}
                </div>
              ) : (
                <>
                  <div className="co-bloque">
                    <h3>Hilos</h3>
                    {elegido.lineas ? partesDe(elegido.lineas).map((g) => (
                      <div key={g.nombre || '-'} className="cf-parte">
                        {g.nombre && <h4>{g.nombre}</h4>}
                        {g.lineas.map((l, n) => {
                          const h = hilosPorId.get(l.cono_id)
                          const est = h && h.estado !== 'rotacion' ? ESTADOS[h.estado] : null
                          return (
                            <div key={n} className="cf-linea">
                              <span className={`cf-paso ${l.paso || 'nada'}`}>{pasoLabel(l.paso) || '—'}</span>
                              <button className="cf-hilo" onClick={() => h && onVerHilo(h.id)} disabled={!h} title={h ? 'Ver la ficha del hilo' : undefined}>
                                <MuestraHilo hilo={h} tam="mini" />
                                <span className="fe-hilo-t">
                                  <b>{hiloTitulo(h)}</b>
                                  <span>{!h ? 'ya no está en la carta' : hiloSinColor(h) ? 'falta el color' : hiloDetalle(h)}</span>
                                </span>
                                {est && <span className={`co-tag ${est.clase}`}>{est.corto}</span>}
                              </button>
                              <span className="cf-cabos">{l.cabos != null ? `${l.cabos} cabo${l.cabos === 1 ? '' : 's'}` : ''}</span>
                            </div>
                          )
                        })}
                      </div>
                    )) : (
                      <div className="co-sincono">
                        <pre className="cf-texto">{elegido.f.descripcion || 'Sin receta escrita'}</pre>
                        <button className="lp-btn" onClick={() => setEditando({ desde: elegido.f.id, formula: elegido.f })}>Pasar a hilos</button>
                      </div>
                    )}
                  </div>

                  {elegido.f.nota && (
                    <div className="co-bloque">
                      <h3>Nota</h3>
                      <p className="cf-nota">{elegido.f.nota}</p>
                    </div>
                  )}

                  <div className="co-bloque">
                    <h3>{elegido.pedidos.length ? `Elegida en ${elegido.pedidos.length} pedido${elegido.pedidos.length === 1 ? '' : 's'}` : 'Pedidos'}</h3>
                    {elegido.pedidos.length ? (
                      <div className="co-peds">
                        {elegido.pedidos.map((p) => (
                          <button key={p.id} onClick={() => onAbrirPedido?.(p.id)} title={`${p.cliente} · ${p.estado}`}><b>{p.numero}</b><span>{ddmm(p.fecha)}</span></button>
                        ))}
                      </div>
                    ) : <p className="co-ayuda">Todavía no se ha elegido en ningún pedido.</p>}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
