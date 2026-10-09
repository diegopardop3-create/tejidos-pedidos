import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Ico } from './iconos'
import { MuestraHilo, MuestraMezcla, MuestraNombre } from './Muestras'
import { FormHilo } from './FormulaEditor'
import { imprimirEtiquetaCono } from './etiquetaCono'
import {
  normalizar, capitalizar, gamaDe, tituloGama, ESTADOS, MATERIALES,
  hiloTitulo, hiloDetalle, hiloSinColor, esLicra, textoBusquedaHilo, lineasDe, segmentosMezcla,
} from './hilos'

const SIN_COLOR = '~sin'

// Vista Hilos de Colores: la carta de conos. Cada hilo con su marca, número,
// color, material, proveedor y estado, y las fórmulas donde se usa.
export default function VistaHilos({ hilos, setHilos, hilosPorId, formulasDeHilo, sel, setSel, nuevo, setNuevo, onVerFormula, cargando, showToast }) {
  const [busqueda, setBusqueda] = useState('')
  const [material, setMaterial] = useState('')
  const [extra, setExtra] = useState('') // '' | 'sin_rotacion' | 'agotado' | 'sin_color'
  const [edit, setEdit] = useState(null) // { id, ...campos } del hilo que se está editando
  const [guardando, setGuardando] = useState(false)
  const detalleRef = useRef(null)

  const marcas = useMemo(() => [...new Set(hilos.map((h) => (h.hilo_marca || '').trim()).filter(Boolean))].sort(), [hilos])
  const items = useMemo(() => hilos.map((h) => ({
    h,
    titulo: hiloTitulo(h),
    gama: hiloSinColor(h) ? SIN_COLOR : (gamaDe(h.nombre) || normalizar(h.material) || 'otros'),
    mat: normalizar(h.material),
    formulas: formulasDeHilo.get(h.id) || [],
    busca: textoBusquedaHilo(h),
  })).sort((a, b) => (a.gama === SIN_COLOR) - (b.gama === SIN_COLOR) || a.gama.localeCompare(b.gama)
    || normalizar(a.h.nombre).localeCompare(normalizar(b.h.nombre)) || a.titulo.localeCompare(b.titulo, 'es', { numeric: true })),
  [hilos, formulasDeHilo])

  // Materiales presentes, para los filtros (agrupa "Poliester" y "Poliéster").
  const materiales = useMemo(() => {
    const m = new Map()
    for (const i of items) {
      if (!i.mat) continue
      if (!m.has(i.mat)) m.set(i.mat, { label: i.h.material.trim(), n: 0 })
      m.get(i.mat).n++
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n)
  }, [items])
  const cuenta = {
    sin_rotacion: items.filter((i) => i.h.estado === 'sin_rotacion').length,
    agotado: items.filter((i) => i.h.estado === 'agotado').length,
    sin_color: items.filter((i) => i.gama === SIN_COLOR).length,
  }
  const q = normalizar(busqueda)
  const visibles = items.filter((i) =>
    (!material || i.mat === material)
    && (!extra || (extra === 'sin_color' ? i.gama === SIN_COLOR : i.h.estado === extra))
    && (!q || q.split(/\s+/).every((p) => i.busca.includes(p.replace(/^#/, '')))))
  const grupos = []
  for (const i of visibles) {
    if (!grupos.length || grupos[grupos.length - 1].gama !== i.gama) grupos.push({ gama: i.gama, items: [] })
    grupos[grupos.length - 1].items.push(i)
  }
  const elegido = visibles.find((i) => i.h.id === sel) || visibles[0] || null
  const listaRef = useRef(null)
  // Al llegar desde una fórmula, que el hilo elegido se vea en la lista.
  useEffect(() => { listaRef.current?.querySelector('.co-item.on')?.scrollIntoView({ block: 'nearest' }) }, [sel])

  // Muestra un hilo aunque los filtros lo estuvieran escondiendo.
  function verEnLista(id) {
    setBusqueda(''); setMaterial(''); setExtra('')
    setEdit(null)
    setSel(id)
    setNuevo(false)
  }

  function elegir(id) {
    setSel(id)
    setEdit(null)
    setNuevo(false)
    if (window.matchMedia('(max-width: 900px)').matches) setTimeout(() => detalleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
  }

  async function cambiarEstado(h, estado) {
    if (h.estado === estado) return
    const anterior = h.estado
    setHilos((prev) => prev.map((c) => (c.id === h.id ? { ...c, estado } : c)))
    const { error } = await supabase.from('conos').update({ estado, actualizado_en: new Date().toISOString() }).eq('id', h.id)
    if (error) {
      setHilos((prev) => prev.map((c) => (c.id === h.id ? { ...c, estado: anterior } : c)))
      showToast('⚠️', 'No se pudo cambiar el estado')
      return
    }
    showToast('✅', `${hiloTitulo(h)} → ${ESTADOS[estado].label}`)
  }

  function abrirEdicion(h) {
    setEdit({
      id: h.id,
      material: h.material || '', marca: h.hilo_marca || '', numero: h.hilo_col || '',
      nombre: h.nombre || '', proveedor: h.proveedor || '', nota: h.nota || '',
    })
  }

  async function guardar() {
    // Se guarda en el hilo que se abrió para editar, no en el que esté a la vista.
    const h = edit && hilos.find((x) => x.id === edit.id)
    if (!h) { setEdit(null); return }
    const marca = edit.marca.trim(), numero = edit.numero.trim().replace(/^#/, ''), nombre = edit.nombre.trim()
    if (!edit.material.trim()) { showToast('⚠️', 'Escribe el material'); return }
    if (!marca && !nombre && !h.codigo && !esLicra({ material: edit.material })) { showToast('⚠️', 'Un hilo sin marca necesita el color'); return }
    if (marca && numero) {
      const ya = hilos.find((x) => x.id !== h.id && normalizar(x.hilo_marca) === normalizar(marca) && normalizar(x.hilo_col) === normalizar(numero))
      if (ya) { showToast('⚠️', `Ya existe otro ${hiloTitulo(ya)}`); return }
    }
    const cambios = {
      material: edit.material.trim(), hilo_marca: marca || null, hilo_col: numero || null, nombre,
      proveedor: edit.proveedor.trim() || null, nota: edit.nota.trim() || null, actualizado_en: new Date().toISOString(),
    }
    setGuardando(true)
    const { error } = await supabase.from('conos').update(cambios).eq('id', h.id)
    setGuardando(false)
    if (error) { showToast('⚠️', 'No se pudieron guardar los cambios'); return }
    setHilos((prev) => prev.map((c) => (c.id === h.id ? { ...c, ...cambios } : c)))
    setEdit(null)
    showToast('✏️', `${hiloTitulo({ ...h, ...cambios })} actualizado`)
  }

  async function borrar(h) {
    if (!window.confirm(`¿Quitar ${hiloTitulo(h)} de la carta? Esto no se puede deshacer.`)) return
    const { error } = await supabase.from('conos').delete().eq('id', h.id)
    if (error) { showToast('⚠️', 'No se pudo borrar'); return }
    setHilos((prev) => prev.filter((c) => c.id !== h.id))
    setSel(null)
    setEdit(null)
    showToast('🗑️', `${hiloTitulo(h)} quitado de la carta`)
  }

  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.value })
  const listaMateriales = [...new Set([...MATERIALES, ...hilos.map((h) => (h.material || '').trim()).filter(Boolean)])]

  return (
    <>
      {nuevo && (
        <div className="rs-panel co-nuevo">
          <div className="rs-panel-h"><h2>Nuevo hilo en la carta</h2><span>Si tiene marca, con marca y número basta.</span></div>
          <div className="co-bloque">
            <FormHilo
              inicial={{}}
              hilos={hilos}
              marcas={marcas}
              conEstado
              onCancelar={() => setNuevo(false)}
              onCreado={(h) => { setHilos((prev) => [...prev, h]); verEnLista(h.id) }}
              onExiste={(h) => { showToast('ℹ️', `${hiloTitulo(h)} ya estaba en la carta`); verEnLista(h.id) }}
              showToast={showToast}
            />
          </div>
        </div>
      )}

      <div className="lp-filtros">
        <label className="lp-buscar">
          {Ico.buscar}
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Busca por número, marca, color o código" />
        </label>
        <div className="co-chips">
          <button className={`tchip ${!material ? 'on' : ''}`} onClick={() => setMaterial('')}>Todos <span>{items.length}</span></button>
          {materiales.map(([k, v]) => (
            <button key={k} className={`tchip ${material === k ? 'on' : ''}`} onClick={() => setMaterial(material === k ? '' : k)}>{v.label} <span>{v.n}</span></button>
          ))}
          {cuenta.sin_color > 0 && <button className={`tchip aviso ${extra === 'sin_color' ? 'on' : ''}`} onClick={() => setExtra(extra === 'sin_color' ? '' : 'sin_color')}>Falta el color <span>{cuenta.sin_color}</span></button>}
          {cuenta.sin_rotacion > 0 && <button className={`tchip ${extra === 'sin_rotacion' ? 'on' : ''}`} onClick={() => setExtra(extra === 'sin_rotacion' ? '' : 'sin_rotacion')}>Sin rotación <span>{cuenta.sin_rotacion}</span></button>}
          {cuenta.agotado > 0 && <button className={`tchip ${extra === 'agotado' ? 'on' : ''}`} onClick={() => setExtra(extra === 'agotado' ? '' : 'agotado')}>Agotados <span>{cuenta.agotado}</span></button>}
        </div>
      </div>

      <div className="co-dos">
        <div className="rs-panel co-lista" ref={listaRef}>
          {cargando ? <div className="rs-vacio">Cargando hilos…</div>
            : !visibles.length ? <div className="rs-vacio">{items.length ? 'Ningún hilo coincide.' : 'Todavía no hay hilos. Agrega el primero con “Nuevo hilo”.'}</div>
            : grupos.map((g) => (
              <div key={g.gama}>
                <div className="co-gama"><span>{g.gama === SIN_COLOR ? 'Falta el color' : tituloGama(g.gama)}</span><span>{g.items.length}</span></div>
                {g.items.map((i) => {
                  const est = i.h.estado !== 'rotacion' ? ESTADOS[i.h.estado] : null
                  return (
                    <button key={i.h.id} className={`co-item ${elegido?.h.id === i.h.id ? 'on' : ''} ${i.h.estado === 'agotado' ? 'agotado' : ''}`} onClick={() => elegir(i.h.id)}>
                      <MuestraHilo hilo={i.h} />
                      <span className="co-nom">
                        <b>{i.titulo}</b>
                        <span>{[hiloSinColor(i.h) ? 'falta el color' : hiloDetalle(i.h), `${i.formulas.length} fórm.`].filter(Boolean).join(' · ')}</span>
                      </span>
                      {est && <span className={`co-tag ${est.clase}`}>{est.corto}</span>}
                    </button>
                  )
                })}
              </div>
            ))}
        </div>

        <div className="rs-panel co-det" ref={detalleRef}>
          {!elegido ? <div className="rs-vacio">Elige un hilo de la lista.</div> : (() => {
            const h = elegido.h
            const detalle = hiloSinColor(h) ? 'falta el color' : hiloDetalle(h)
            const conCodigo = h.codigo && h.codigo !== elegido.titulo
            const editandoEste = edit?.id === h.id
            return (
              <>
                <div className="co-cabeza">
                  <MuestraHilo hilo={h} tam="grande" />
                  <div className="co-titulo">
                    <h2>{elegido.titulo}</h2>
                    <div>{[detalle, conCodigo ? `código ${h.codigo}` : ''].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div className="lp-acc">
                    <button className="lp-ico" title="Imprimir etiqueta del cono" aria-label="Imprimir etiqueta del cono" onClick={() => imprimirEtiquetaCono(h)}>{Ico.etiqueta}</button>
                    <button className="lp-ico" title="Editar el hilo" aria-label="Editar el hilo" onClick={() => (editandoEste ? setEdit(null) : abrirEdicion(h))}>{Ico.editar}</button>
                  </div>
                </div>

                {editandoEste && (
                  <div className="co-bloque co-edit co-edit-h">
                    <datalist id="vh-mat">{listaMateriales.map((m) => <option key={m} value={m} />)}</datalist>
                    <datalist id="vh-marca">{marcas.map((m) => <option key={m} value={m} />)}</datalist>
                    <div className="fld"><label>Material</label><input list="vh-mat" value={edit.material} onChange={set('material')} /></div>
                    <div className="fld"><label>Marca</label><input list="vh-marca" value={edit.marca} onChange={set('marca')} placeholder="Si tiene" /></div>
                    <div className="fld"><label>Número</label><input value={edit.numero} onChange={set('numero')} placeholder="Ej: 725" /></div>
                    <div className="fld"><label>Color</label><input value={edit.nombre} onChange={set('nombre')} placeholder="Ej: Gris claro" /></div>
                    <div className="fld"><label>Proveedor</label><input value={edit.proveedor} onChange={set('proveedor')} placeholder="Opcional" /></div>
                    <div className="fld"><label>Nota</label><input value={edit.nota} onChange={set('nota')} placeholder="Opcional" /></div>
                    <div className="co-facc">
                      {elegido.formulas.length
                        ? <span className="co-ayuda co-izq">No se puede quitar: está en {elegido.formulas.length} fórmula{elegido.formulas.length === 1 ? '' : 's'}.</span>
                        : <button className="btn btn-d btn-sm co-izq" onClick={() => borrar(h)}>Quitar de la carta</button>}
                      <button className="btn btn-s btn-sm" onClick={() => setEdit(null)}>Cancelar</button>
                      <button className="btn btn-p btn-sm" disabled={guardando} onClick={guardar}>Guardar</button>
                    </div>
                    {h.codigo && <p className="co-ayuda">El código {h.codigo} no cambia aunque cambies el color.</p>}
                  </div>
                )}

                <div className="co-bloque">
                  <h3>Estado</h3>
                  <div className="lp-seg co-seg" role="group" aria-label="Estado del hilo">
                    {Object.entries(ESTADOS).map(([k, v]) => (
                      <button key={k} className={h.estado === k ? `on ${v.clase}` : ''} onClick={() => cambiarEstado(h, k)}>{v.label}</button>
                    ))}
                  </div>
                  <p className="co-ayuda">
                    {(ESTADOS[h.estado] || ESTADOS.rotacion).desc}
                    {h.estado !== 'rotacion' && elegido.formulas.length ? ` Las ${elegido.formulas.length} fórmulas que lo usan quedan marcadas.` : ''}
                  </p>
                </div>

                {h.nota && !editandoEste && (
                  <div className="co-bloque">
                    <h3>Nota</h3>
                    <p className="cf-nota">{h.nota}</p>
                  </div>
                )}

                <div className="co-bloque">
                  <h3>{elegido.formulas.length ? `Se usa en ${elegido.formulas.length} fórmula${elegido.formulas.length === 1 ? '' : 's'}` : 'Fórmulas'}</h3>
                  {elegido.formulas.length ? (
                    <div className="co-forms">
                      {elegido.formulas.map((f) => {
                        const ls = lineasDe(f)
                        return (
                          <button key={f.id} onClick={() => onVerFormula(f.id)} title="Ver la ficha de la fórmula">
                            {ls ? <MuestraMezcla segmentos={segmentosMezcla(ls, hilosPorId)} tam="mini" /> : <MuestraNombre nombre={f.color_nombre} tam="mini" />}
                            {capitalizar(f.color_nombre)}
                          </button>
                        )
                      })}
                    </div>
                  ) : <p className="co-ayuda">Todavía no está en ninguna fórmula.</p>}
                </div>
              </>
            )
          })()}
        </div>
      </div>
    </>
  )
}
