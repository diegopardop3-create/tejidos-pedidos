import { useEffect, useState, useMemo, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { segmentosColor } from './constants'
import { imprimirEtiquetaCono } from './etiquetaCono'

// ============================================
// COLORES
// ============================================
// Un solo lugar para la carta de conos, las fórmulas y los pedidos donde se
// usó cada color. A la izquierda, la lista agrupada por gama; a la derecha,
// el color elegido con su estado, sus fórmulas y sus pedidos.
//
// La lista junta dos fuentes:
//  - los conos de la carta (tienen código A-001, estado y nota), y
//  - los colores escritos en los pedidos que no tienen cono (por ejemplo
//    combinaciones como "Azul bebé-Negro").
// Las fórmulas se buscan por cada color simple que forma el nombre, igual
// que el botón 🧪 de Nuevo pedido, así que lo que se guarde aquí aparece allá.

const ESTADOS = {
  rotacion: { label: 'En rotación', corto: 'Rotación', desc: 'Se puede reponer.', clase: 'ok' },
  sin_rotacion: { label: 'Sin rotación', corto: 'Sin rotación', desc: 'Cuídalo: cuando se acabe no vuelve.', clase: 'aviso' },
  agotado: { label: 'Agotado', corto: 'Agotado', desc: 'Ya no se consigue. Se conserva el registro.', clase: 'debe' },
}

const Ico = {
  buscar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  mas: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 5v14M5 12h14" /></svg>,
  etiqueta: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 12 12 20 3 11V3h8z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>,
  editar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>,
  borrar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>,
  copiar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>,
  cerrar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M18 6 6 18M6 6l12 12" /></svg>,
}

const normalizar = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
const claveNombre = (s) => String(s || '').split('-').map(normalizar).filter(Boolean).join('-')
const gamaDe = (nombre) => normalizar(String(nombre || '').split(/[\s-]+/)[0]) || 'otros'
const tituloGama = (g) => (g ? g.charAt(0).toUpperCase() + g.slice(1) : 'Otros')
const ddmm = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : '')

// Código nuevo: primera letra del nombre + número siguiente de esa letra
// (A-001, A-002…). Se congela al crear el cono.
function letraDe(nombre) {
  const m = normalizar(nombre).match(/[a-z]/)
  return m ? m[0].toUpperCase() : 'X'
}
function siguienteCodigo(conos, nombre) {
  const letra = letraDe(nombre)
  let max = 0
  for (const c of conos) {
    const m = String(c.codigo || '').match(/^([A-Z])-(\d+)$/i)
    if (m && m[1].toUpperCase() === letra) max = Math.max(max, parseInt(m[2], 10))
  }
  return `${letra}-${String(max + 1).padStart(3, '0')}`
}

// Código del hilo del cono tal como lo trae el proveedor: marca + color
// (ej. "mH · Col 114"). Los dos campos son opcionales.
function hiloTexto(c) {
  const marca = (c?.hilo_marca || '').trim()
  const col = (c?.hilo_col || '').trim()
  return [marca, col && `Col ${col}`].filter(Boolean).join(' · ')
}

function Muestra({ nombre, grande }) {
  const seg = segmentosColor(nombre)
  return (
    <span className={grande ? 'co-grande' : 'co-muestra'} aria-hidden="true">
      {(seg.length ? seg : [{ hex: null }]).map((s, i) => (
        <i key={i} style={{ background: s.hex || 'repeating-linear-gradient(45deg, #ddd, #ddd 3px, #f4f4f4 3px, #f4f4f4 6px)' }} />
      ))}
    </span>
  )
}

export default function Colores({ pedidos, showToast, onAbrirPedido }) {
  const [conos, setConos] = useState([])
  const [formulas, setFormulas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('') // '' | estado
  const [sel, setSel] = useState(null) // clave del color elegido
  const [nuevo, setNuevo] = useState(null) // formulario de color nuevo
  const [editCono, setEditCono] = useState(null) // { nombre, nota } al editar
  const [formForm, setFormForm] = useState(null) // { id|null, clave, nombre, descripcion }
  const [guardando, setGuardando] = useState(false)
  const detalleRef = useRef(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const [c, f] = await Promise.all([
      supabase.from('conos').select('*').order('codigo', { ascending: true }),
      supabase.from('formulas_color').select('*'),
    ])
    if (c.error || f.error) showToast('⚠️', 'No se pudieron cargar los colores')
    setConos(c.data || [])
    setFormulas(f.data || [])
    setCargando(false)
  }

  // ---- Índice unificado de colores ----
  const colores = useMemo(() => {
    const mapa = new Map()
    const entrada = (nombre) => {
      const k = claveNombre(nombre)
      if (!mapa.has(k)) mapa.set(k, { clave: k, nombre: nombre.trim(), cono: null, pedidosExactos: [] })
      return mapa.get(k)
    }
    for (const c of conos) { const e = entrada(c.nombre); e.cono = c; e.nombre = c.nombre }
    // Pedido -> colores escritos (sin repetir dentro del mismo pedido)
    const usosPorSegmento = new Map()
    for (const p of (pedidos || [])) {
      const delPedido = new Set()
      for (const it of [...(p.items_camiseta || []), ...(p.items_chaqueta || [])]) {
        for (const c of (it.colores || [])) if (c && c.trim()) delPedido.add(c.trim())
      }
      const segsDelPedido = new Set()
      for (const c of delPedido) {
        entrada(c).pedidosExactos.push(p)
        for (const s of c.split('-')) if (normalizar(s)) segsDelPedido.add(normalizar(s))
      }
      for (const s of segsDelPedido) {
        if (!usosPorSegmento.has(s)) usosPorSegmento.set(s, [])
        usosPorSegmento.get(s).push(p)
      }
    }
    const formPorClave = new Map()
    for (const f of formulas) {
      if (!formPorClave.has(f.color_clave)) formPorClave.set(f.color_clave, [])
      formPorClave.get(f.color_clave).push(f)
    }
    const porFecha = (a, b) => String(b.fecha || '').localeCompare(String(a.fecha || ''))
    return Array.from(mapa.values()).map((e) => {
      const segs = segmentosColor(e.nombre).map((s) => ({ texto: s.texto, clave: normalizar(s.texto) }))
      const simple = segs.length <= 1
      // Un color simple (ej. "Negro") se cuenta en todo pedido que lo use,
      // también dentro de combinaciones ("Azul-Negro"). Una combinación
      // solo cuenta donde aparece escrita igual.
      const usos = simple ? (usosPorSegmento.get(segs[0]?.clave) || []) : e.pedidosExactos
      const nForm = segs.reduce((n, s) => n + (formPorClave.get(s.clave) || []).length, 0)
      return {
        ...e,
        segs,
        simple,
        gama: gamaDe(e.nombre),
        pedidos: [...new Set(usos)].sort(porFecha),
        formulasPorSeg: segs.map((s) => ({ ...s, lista: formPorClave.get(s.clave) || [] })),
        nForm,
      }
    }).sort((a, b) => a.gama.localeCompare(b.gama) || a.nombre.localeCompare(b.nombre))
  }, [conos, formulas, pedidos])

  const q = normalizar(busqueda)
  const visibles = colores.filter((c) =>
    (!filtro || c.cono?.estado === filtro) &&
    (!q || normalizar(`${c.nombre} ${c.cono?.codigo || ''} ${c.cono?.hilo_marca || ''} ${c.cono?.hilo_col || ''} ${c.pedidos.map((p) => p.numero).join(' ')}`).includes(q)))
  const grupos = []
  for (const c of visibles) {
    if (!grupos.length || grupos[grupos.length - 1].gama !== c.gama) grupos.push({ gama: c.gama, items: [] })
    grupos[grupos.length - 1].items.push(c)
  }
  const cuenta = (e) => colores.filter((c) => c.cono?.estado === e).length
  const elegido = colores.find((c) => c.clave === sel) || visibles[0] || null

  function elegir(c) {
    setSel(c.clave)
    setEditCono(null)
    setFormForm(null)
    if (window.matchMedia('(max-width: 900px)').matches) setTimeout(() => detalleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
  }

  // ---- Conos ----
  async function crearCono(nombre, estado = 'rotacion', nota = '', hiloMarca = '', hiloCol = '') {
    if (!nombre.trim()) { showToast('⚠️', 'Escribe el nombre del color'); return false }
    setGuardando(true)
    const codigo = siguienteCodigo(conos, nombre)
    const fila = { codigo, nombre: nombre.trim(), estado, nota: nota.trim() || null }
    // Solo se envían si se escribieron, para no fallar si la base aún no tiene esas columnas.
    if (hiloMarca.trim()) fila.hilo_marca = hiloMarca.trim()
    if (hiloCol.trim()) fila.hilo_col = hiloCol.trim()
    const { data, error } = await supabase.from('conos').insert(fila).select().single()
    setGuardando(false)
    if (error) { showToast('⚠️', 'No se pudo guardar el color'); return false }
    setConos((prev) => [...prev, data])
    setSel(claveNombre(data.nombre))
    showToast('🧵', `${codigo} agregado a la carta`)
    return true
  }

  async function cambiarEstado(cono, estado) {
    if (cono.estado === estado) return
    const anterior = cono.estado
    setConos((prev) => prev.map((c) => (c.id === cono.id ? { ...c, estado } : c)))
    const { error } = await supabase.from('conos').update({ estado, actualizado_en: new Date().toISOString() }).eq('id', cono.id)
    if (error) {
      setConos((prev) => prev.map((c) => (c.id === cono.id ? { ...c, estado: anterior } : c)))
      showToast('⚠️', 'No se pudo cambiar el estado')
      return
    }
    showToast('✅', `${cono.codigo} → ${ESTADOS[estado].label}`)
  }

  async function guardarCono(cono) {
    if (!editCono.nombre.trim()) { showToast('⚠️', 'El nombre no puede quedar vacío'); return }
    setGuardando(true)
    const cambios = { nombre: editCono.nombre.trim(), nota: editCono.nota.trim() || null, actualizado_en: new Date().toISOString() }
    if ('hilo_marca' in cono) {
      cambios.hilo_marca = editCono.hilo_marca.trim() || null
      cambios.hilo_col = editCono.hilo_col.trim() || null
    }
    const { error } = await supabase.from('conos').update(cambios).eq('id', cono.id)
    setGuardando(false)
    if (error) { showToast('⚠️', 'No se pudieron guardar los cambios'); return }
    setConos((prev) => prev.map((c) => (c.id === cono.id ? { ...c, ...cambios } : c)))
    setSel(claveNombre(cambios.nombre))
    setEditCono(null)
    showToast('✏️', `${cono.codigo} actualizado`)
  }

  async function borrarCono(cono) {
    if (!window.confirm(`¿Quitar ${cono.codigo} (${cono.nombre}) de la carta de conos? Esto no se puede deshacer. Las fórmulas y los pedidos no se borran.`)) return
    const { error } = await supabase.from('conos').delete().eq('id', cono.id)
    if (error) { showToast('⚠️', 'No se pudo borrar'); return }
    setConos((prev) => prev.filter((c) => c.id !== cono.id))
    setEditCono(null)
    showToast('🗑️', `${cono.codigo} quitado de la carta`)
  }

  // ---- Fórmulas (misma tabla que usa el botón 🧪 de Nuevo pedido) ----
  async function guardarFormula() {
    if (!formForm.descripcion.trim()) { showToast('⚠️', 'Escribe la fórmula antes de guardar'); return }
    setGuardando(true)
    if (formForm.id) {
      const { error } = await supabase.from('formulas_color').update({ descripcion: formForm.descripcion, actualizado_en: new Date().toISOString() }).eq('id', formForm.id)
      setGuardando(false)
      if (error) { showToast('⚠️', 'No se pudo guardar'); return }
      setFormulas((prev) => prev.map((f) => (f.id === formForm.id ? { ...f, descripcion: formForm.descripcion } : f)))
      showToast('🧪', 'Fórmula actualizada')
    } else {
      const { data, error } = await supabase.from('formulas_color').insert({
        color_clave: formForm.clave, color_nombre: formForm.nombre, etiqueta: formForm.nombre, descripcion: formForm.descripcion,
      }).select().single()
      setGuardando(false)
      if (error) { showToast('⚠️', 'No se pudo guardar'); return }
      setFormulas((prev) => [...prev, data])
      showToast('🧪', `Fórmula de "${formForm.nombre}" guardada`)
    }
    setFormForm(null)
  }

  async function borrarFormula() {
    if (!window.confirm('¿Eliminar esta fórmula? Esto no se puede deshacer.')) return
    const { error } = await supabase.from('formulas_color').delete().eq('id', formForm.id)
    if (error) { showToast('⚠️', 'No se pudo eliminar'); return }
    setFormulas((prev) => prev.filter((f) => f.id !== formForm.id))
    setFormForm(null)
    showToast('🗑️', 'Fórmula eliminada')
  }

  async function copiarFormula(f) {
    try { await navigator.clipboard.writeText(`${f.color_nombre}: ${f.descripcion}`); showToast('📋', 'Fórmula copiada') }
    catch { prompt('Copia la fórmula:', f.descripcion) }
  }

  const formularioFormula = (
    <div className="co-fform">
      <label>{formForm?.id ? `Fórmula de "${formForm?.nombre}"` : `Nueva fórmula de "${formForm?.nombre}"`}</label>
      <textarea autoFocus value={formForm?.descripcion || ''} onChange={(e) => setFormForm({ ...formForm, descripcion: e.target.value })} placeholder="Ej: mH 546 cabo 2 derecho + ALFA 1310m cabo 1 evanizado" />
      <div className="co-facc">
        {formForm?.id && <button className="btn btn-d btn-sm co-izq" onClick={borrarFormula}>Eliminar</button>}
        <button className="btn btn-s btn-sm" onClick={() => setFormForm(null)}>Cancelar</button>
        <button className="btn btn-p btn-sm" onClick={guardarFormula} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar fórmula'}</button>
      </div>
    </div>
  )

  return (
    <div className="co">
      <div className="lp-cab">
        <div>
          <h1>Colores</h1>
          <p>Carta de conos, fórmulas y pedidos en un solo lugar.</p>
        </div>
        <button className="btn btn-p pr-nuevo" onClick={() => setNuevo(nuevo ? null : { nombre: '', estado: 'rotacion', nota: '', hiloMarca: '', hiloCol: '' })}>{Ico.mas}Nuevo color</button>
      </div>

      {nuevo && (
        <div className="rs-panel co-nuevo">
          <div className="rs-panel-h">
            <h2>Nuevo color en la carta</h2>
            <span>{nuevo.nombre.trim() ? <>Código: <b className="co-cod">{siguienteCodigo(conos, nuevo.nombre)}</b></> : 'El código sale de la primera letra (Azul → A-…)'}</span>
          </div>
          <div className="co-nuevo-b">
            <div className="fld"><label>Nombre (empieza con la gama)</label><input autoFocus value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Ej: Camel oscuro" /></div>
            <div className="fld"><label>Estado</label>
              <select value={nuevo.estado} onChange={(e) => setNuevo({ ...nuevo, estado: e.target.value })}>
                <option value="rotacion">En rotación (se repone)</option>
                <option value="sin_rotacion">Sin rotación</option>
              </select>
            </div>
            <div className="fld"><label>Nota (opcional)</label><input value={nuevo.nota} onChange={(e) => setNuevo({ ...nuevo, nota: e.target.value })} placeholder="Ej: proveedor X, brillante…" /></div>
            <div className="fld"><label>Hilo: marca (opcional)</label><input value={nuevo.hiloMarca} onChange={(e) => setNuevo({ ...nuevo, hiloMarca: e.target.value })} placeholder="Ej: mH" /></div>
            <div className="fld"><label>Hilo: color / referencia (opcional)</label><input value={nuevo.hiloCol} onChange={(e) => setNuevo({ ...nuevo, hiloCol: e.target.value })} placeholder="Ej: 114" /></div>
            <div className="co-nuevo-acc">
              <button className="btn btn-s" onClick={() => setNuevo(null)}>Cancelar</button>
              <button className="btn btn-p" disabled={guardando} onClick={async () => { if (await crearCono(nuevo.nombre, nuevo.estado, nuevo.nota, nuevo.hiloMarca, nuevo.hiloCol)) setNuevo(null) }}>{guardando ? 'Guardando…' : 'Agregar color'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="lp-filtros">
        <label className="lp-buscar">
          {Ico.buscar}
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Busca un color, código, hilo o número de pedido" />
        </label>
        <div className="co-chips">
          <button className={`tchip ${!filtro ? 'on' : ''}`} onClick={() => setFiltro('')}>Todos <span>{colores.length}</span></button>
          {Object.entries(ESTADOS).map(([k, v]) => (
            <button key={k} className={`tchip ${filtro === k ? 'on' : ''}`} onClick={() => setFiltro(filtro === k ? '' : k)}>{v.label} <span>{cuenta(k)}</span></button>
          ))}
        </div>
      </div>

      <div className="co-dos">
        <div className="rs-panel co-lista">
          {cargando ? <div className="rs-vacio">Cargando colores…</div>
            : !visibles.length ? <div className="rs-vacio">{colores.length ? 'Ningún color coincide con la búsqueda.' : 'Todavía no hay colores. Agrega el primero con “Nuevo color”.'}</div>
            : grupos.map((g) => (
              <div key={g.gama}>
                <div className="co-gama"><span>{tituloGama(g.gama)}</span><span>{g.items.length}</span></div>
                {g.items.map((c) => {
                  const est = c.cono ? ESTADOS[c.cono.estado] || ESTADOS.rotacion : null
                  return (
                    <button key={c.clave} className={`co-item ${elegido?.clave === c.clave ? 'on' : ''} ${c.cono?.estado === 'agotado' ? 'agotado' : ''}`} onClick={() => elegir(c)}>
                      <Muestra nombre={c.nombre} />
                      <span className="co-nom">
                        <b>{c.nombre}</b>
                        <span>{c.cono ? c.cono.codigo : 'sin cono'} · {c.pedidos.length} ped · {c.nForm} fórm.</span>
                      </span>
                      {est && <span className={`co-tag ${est.clase}`}>{est.corto}</span>}
                    </button>
                  )
                })}
              </div>
            ))}
        </div>

        <div className="rs-panel co-det" ref={detalleRef}>
          {!elegido ? <div className="rs-vacio">Elige un color de la lista.</div> : (
            <>
              <div className="co-cabeza">
                <Muestra nombre={elegido.nombre} grande />
                <div className="co-titulo">
                  <h2>{elegido.nombre}</h2>
                  <div>{elegido.cono ? <><b className="co-cod">{elegido.cono.codigo}</b> · </> : null}gama {elegido.gama}{hiloTexto(elegido.cono) ? ` · hilo ${hiloTexto(elegido.cono)}` : ''}{elegido.cono?.nota ? ` · ${elegido.cono.nota}` : ''}</div>
                </div>
                {elegido.cono && (
                  <div className="lp-acc">
                    <button className="lp-ico" title="Imprimir etiqueta del cono" aria-label="Imprimir etiqueta del cono" onClick={() => imprimirEtiquetaCono(elegido.cono)}>{Ico.etiqueta}</button>
                    <button className="lp-ico" title="Editar nombre, nota e hilo" aria-label="Editar color" onClick={() => setEditCono(editCono ? null : { nombre: elegido.cono.nombre, nota: elegido.cono.nota || '', hilo_marca: elegido.cono.hilo_marca || '', hilo_col: elegido.cono.hilo_col || '' })}>{Ico.editar}</button>
                  </div>
                )}
              </div>

              {editCono && elegido.cono && (
                <div className="co-bloque co-edit">
                  <div className="fld"><label>Nombre</label><input value={editCono.nombre} onChange={(e) => setEditCono({ ...editCono, nombre: e.target.value })} /></div>
                  <div className="fld"><label>Nota</label><input value={editCono.nota} onChange={(e) => setEditCono({ ...editCono, nota: e.target.value })} /></div>
                  {'hilo_marca' in elegido.cono && (
                    <>
                      <div className="fld"><label>Hilo: marca</label><input value={editCono.hilo_marca} onChange={(e) => setEditCono({ ...editCono, hilo_marca: e.target.value })} placeholder="Ej: mH" /></div>
                      <div className="fld"><label>Hilo: color / referencia</label><input value={editCono.hilo_col} onChange={(e) => setEditCono({ ...editCono, hilo_col: e.target.value })} placeholder="Ej: 114" /></div>
                    </>
                  )}
                  <div className="co-facc">
                    <button className="btn btn-d btn-sm co-izq" onClick={() => borrarCono(elegido.cono)}>Quitar de la carta</button>
                    <button className="btn btn-s btn-sm" onClick={() => setEditCono(null)}>Cancelar</button>
                    <button className="btn btn-p btn-sm" disabled={guardando} onClick={() => guardarCono(elegido.cono)}>Guardar</button>
                  </div>
                  <p className="co-ayuda">El código {elegido.cono.codigo} no cambia aunque cambies el nombre.</p>
                </div>
              )}

              <div className="co-bloque">
                <h3>{elegido.cono || elegido.simple ? 'Estado del cono' : 'Colores que la forman'}</h3>
                {elegido.cono ? (
                  <>
                    <div className="lp-seg co-seg" role="group" aria-label="Estado del cono">
                      {Object.entries(ESTADOS).map(([k, v]) => (
                        <button key={k} className={elegido.cono.estado === k ? `on ${v.clase}` : ''} onClick={() => cambiarEstado(elegido.cono, k)}>{v.label}</button>
                      ))}
                    </div>
                    <p className="co-ayuda">{(ESTADOS[elegido.cono.estado] || ESTADOS.rotacion).desc}</p>
                  </>
                ) : elegido.simple ? (
                  <div className="co-sincono">
                    <span>Este color está en pedidos pero no en la carta de conos.</span>
                    <button className="lp-btn" disabled={guardando} onClick={() => crearCono(elegido.nombre)}>Agregar a la carta ({siguienteCodigo(conos, elegido.nombre)})</button>
                  </div>
                ) : (
                  <div className="co-sincono">
                    <div className="co-partes">
                      {elegido.segs.map((s) => {
                        const parte = colores.find((c) => c.clave === s.clave)
                        return parte
                          ? <button key={s.clave} className="lp-btn" onClick={() => elegir(parte)}><Muestra nombre={s.texto} />{s.texto}{parte.cono ? ` · ${parte.cono.codigo}` : ''}</button>
                          : <span key={s.clave} className="lp-btn co-parte-x"><Muestra nombre={s.texto} />{s.texto}</span>
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="co-bloque">
                <h3>Fórmulas</h3>
                {elegido.formulasPorSeg.map((s) => (
                  <div key={s.clave} className="co-fseg">
                    {!elegido.simple && <div className="co-fseg-t"><Muestra nombre={s.texto} />{s.texto}</div>}
                    {s.lista.map((f) => (
                      formForm?.id === f.id ? <div key={f.id}>{formularioFormula}</div> : (
                        <div key={f.id} className="co-receta">
                          <button className="co-r" onClick={() => setFormForm({ id: f.id, clave: f.color_clave, nombre: f.color_nombre, descripcion: f.descripcion || '' })} title="Editar fórmula">
                            {normalizar(f.color_nombre) !== s.clave && <span>{f.color_nombre}</span>}
                            <b>{f.descripcion || 'Sin receta escrita'}</b>
                          </button>
                          <button className="lp-ico" aria-label="Copiar fórmula" title="Copiar" onClick={() => copiarFormula(f)}>{Ico.copiar}</button>
                        </div>
                      )
                    ))}
                    {!s.lista.length && !(formForm && !formForm.id && formForm.clave === s.clave) && (
                      <p className="co-ayuda">Todavía no tiene fórmula{elegido.simple ? '' : ` para ${s.texto}`}. Agrégala la próxima vez que lo tiñas.</p>
                    )}
                    {formForm && !formForm.id && formForm.clave === s.clave
                      ? formularioFormula
                      : <button className="lp-btn co-addf" onClick={() => setFormForm({ id: null, clave: s.clave, nombre: s.texto, descripcion: '' })}>{Ico.mas}Agregar fórmula{elegido.simple ? '' : ` de ${s.texto}`}</button>}
                  </div>
                ))}
              </div>

              <div className="co-bloque">
                <h3>Usado en {elegido.pedidos.length} pedido{elegido.pedidos.length === 1 ? '' : 's'}</h3>
                {elegido.pedidos.length ? (
                  <div className="co-peds">
                    {elegido.pedidos.map((p) => (
                      <button key={p.id} onClick={() => onAbrirPedido?.(p.id)} title={`${p.cliente} · ${p.estado}`}><b>{p.numero}</b><span>{ddmm(p.fecha)}</span></button>
                    ))}
                  </div>
                ) : <p className="co-ayuda">Aún no se ha usado en ningún pedido.</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
