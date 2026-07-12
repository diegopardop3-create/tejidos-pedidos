import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import ColorSwatch from './ColorSwatch'
import { imprimirEtiquetaCono } from './etiquetaCono'

const ESTADOS = {
  rotacion: { label: 'Rotación', color: '#2e7d32', desc: 'Se puede reponer' },
  sin_rotacion: { label: 'Sin rotación', color: '#c9820a', desc: 'Cuídalo: cuando se acabe no vuelve' },
  agotado: { label: 'Agotado', color: '#b23', desc: 'Ya no se consigue' },
}

// La GAMA de un tono sale de la primera palabra de su nombre (Opción A).
// "Camel oscuro" y "Camel rojizo" caen ambos en la gama "camel".
function gamaDe(nombre) {
  const prim = String(nombre || '').trim().split(/\s+/)[0] || ''
  return prim.toLowerCase()
}

function tituloGama(g) {
  return g ? g.charAt(0).toUpperCase() + g.slice(1) : 'Sin gama'
}

// El PREFIJO es la primera letra del nombre (Azul→A, Rosado→R, Camel→C).
// La numeración es propia por letra: A-001, A-002... y aparte C-001, C-002...
// El prefijo se congela al crear el cono (se guarda en la columna 'codigo'),
// así que aunque después se edite el nombre, el código nunca cambia y el
// historial de fórmulas nunca queda apuntando a un código inexistente.
function letraDe(nombre) {
  const prim = String(nombre || '').trim()
  const m = prim.normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-zA-Z]/)
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

export default function CatalogoConos({ showToast }) {
  const [conos, setConos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [gamaFiltro, setGamaFiltro] = useState('todas')
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoEstado, setNuevoEstado] = useState('rotacion')
  const [nuevaNota, setNuevaNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [editando, setEditando] = useState(null) // id del cono en edición
  const [edNombre, setEdNombre] = useState('')
  const [edEstado, setEdEstado] = useState('rotacion')
  const [edNota, setEdNota] = useState('')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const { data } = await supabase.from('conos').select('*').order('codigo', { ascending: true })
    setConos(data || [])
    setCargando(false)
  }

  const proximoCodigo = useMemo(() => siguienteCodigo(conos, nuevoNombre), [conos, nuevoNombre])

  // Lista de gamas existentes, para el filtro de arriba.
  const gamas = useMemo(() => {
    const set = new Set(conos.map((c) => gamaDe(c.nombre)).filter(Boolean))
    return Array.from(set).sort()
  }, [conos])

  async function agregar() {
    if (!nuevoNombre.trim()) { showToast?.('⚠️', 'Escribe el nombre del color'); return }
    setGuardando(true)
    const codigo = siguienteCodigo(conos, nuevoNombre)
    const { data, error } = await supabase.from('conos').insert({
      codigo, nombre: nuevoNombre.trim(), estado: nuevoEstado, nota: nuevaNota.trim() || null,
    }).select().single()
    if (error) { showToast?.('⚠️', 'Error al guardar el color'); setGuardando(false); return }
    setConos((prev) => [...prev, data])
    setNuevoNombre(''); setNuevaNota(''); setNuevoEstado('rotacion')
    setGuardando(false)
    showToast?.('🧵', `${codigo} agregado`)
  }

  async function cambiarEstado(cono, nuevo) {
    const { error } = await supabase.from('conos').update({ estado: nuevo, actualizado_en: new Date().toISOString() }).eq('id', cono.id)
    if (error) { showToast?.('⚠️', 'Error al cambiar estado'); return }
    setConos((prev) => prev.map((c) => (c.id === cono.id ? { ...c, estado: nuevo } : c)))
    showToast?.('✅', `${cono.codigo} → ${ESTADOS[nuevo].label}`)
  }

  function abrirEdicion(cono) {
    setEditando(cono.id)
    setEdNombre(cono.nombre || '')
    setEdEstado(cono.estado || 'rotacion')
    setEdNota(cono.nota || '')
  }

  async function guardarEdicion(cono) {
    if (!edNombre.trim()) { showToast?.('⚠️', 'El nombre no puede quedar vacío'); return }
    const { error } = await supabase.from('conos').update({
      nombre: edNombre.trim(), estado: edEstado, nota: edNota.trim() || null, actualizado_en: new Date().toISOString(),
    }).eq('id', cono.id)
    if (error) { showToast?.('⚠️', 'Error al guardar los cambios'); return }
    setConos((prev) => prev.map((c) => (c.id === cono.id ? { ...c, nombre: edNombre.trim(), estado: edEstado, nota: edNota.trim() || null } : c)))
    setEditando(null)
    showToast?.('✏️', `${cono.codigo} actualizado`)
  }

  // Revisa si el código está usado en alguna fórmula de color (Parte 2).
  // Por ahora la tabla formulas_color no guarda códigos de cono, así que
  // esto devuelve 0; queda listo para cuando conectemos fórmulas↔conos.
  async function contarUsos(cono) {
    try {
      const { count } = await supabase
        .from('formulas_color')
        .select('id', { count: 'exact', head: true })
        .ilike('descripcion', `%${cono.codigo}%`)
      return count || 0
    } catch {
      return 0
    }
  }

  async function borrar(cono) {
    const usos = await contarUsos(cono)
    let msg = `¿Borrar el color ${cono.codigo} (${cono.nombre})? Esto no se puede deshacer.`
    if (usos > 0) {
      msg = `⚠️ ATENCIÓN: el código ${cono.codigo} aparece en ${usos} fórmula(s) de color. ` +
        `Si lo borras, esas fórmulas seguirán mencionando ${cono.codigo} pero ya no existirá en la carta. ` +
        `¿Borrar de todas formas?`
    }
    if (!window.confirm(msg)) return
    const { error } = await supabase.from('conos').delete().eq('id', cono.id)
    if (error) { showToast?.('⚠️', 'Error al borrar'); return }
    setConos((prev) => prev.filter((c) => c.id !== cono.id))
    showToast?.('🗑️', `${cono.codigo} borrado`)
  }

  // Filtrado + agrupado por gama.
  const grupos = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    const filtrados = conos.filter((c) => {
      if (filtro !== 'todos' && c.estado !== filtro) return false
      if (gamaFiltro !== 'todas' && gamaDe(c.nombre) !== gamaFiltro) return false
      if (!q) return true
      return (c.codigo || '').toLowerCase().includes(q) || (c.nombre || '').toLowerCase().includes(q)
    })
    const mapa = new Map()
    for (const c of filtrados) {
      const g = gamaDe(c.nombre)
      if (!mapa.has(g)) mapa.set(g, [])
      mapa.get(g).push(c)
    }
    return Array.from(mapa.entries())
      .map(([gama, items]) => ({ gama, items }))
      .sort((a, b) => a.gama.localeCompare(b.gama))
  }, [conos, busqueda, filtro, gamaFiltro])

  const totalFiltrados = grupos.reduce((n, g) => n + g.items.length, 0)

  return (
    <div className="card">
      <div className="ctitle">🎨 Carta de colores</div>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
        Cada color lleva un código único (C-001, C-002…) que <strong>nunca se reutiliza</strong>.
        Los tonos se agrupan por gama según la primera palabra del nombre (ej. "Camel oscuro"
        y "Camel claro" quedan juntos en la gama <em>Camel</em>). Cuando un color se agota y
        no vuelve, márcalo como "Agotado": se atenúa pero su registro se conserva.
      </p>

      {/* Alta de color nuevo */}
      <div style={{ background: 'var(--weave)', borderRadius: 10, padding: 14, marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
          Agregar color nuevo{nuevoNombre.trim() ? <> — próximo código: <span style={{ fontFamily: "'DM Mono', monospace", color: 'var(--thread)' }}>{proximoCodigo}</span></> : <span style={{ fontWeight: 400, color: 'var(--muted)' }}> — el código se genera con la primera letra del nombre (Azul→A, Rosado→R)</span>}
        </div>
        <div className="brow" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="fld" style={{ flex: '2 1 180px', margin: 0 }}>
            <label>Nombre del color (empieza con la gama, ej. "Camel oscuro")</label>
            <input type="text" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} placeholder="Ej: Camel oscuro" />
          </div>
          <div className="fld" style={{ flex: '1 1 140px', margin: 0 }}>
            <label>Estado</label>
            <select value={nuevoEstado} onChange={(e) => setNuevoEstado(e.target.value)}>
              <option value="rotacion">Rotación (se repone)</option>
              <option value="sin_rotacion">Sin rotación</option>
            </select>
          </div>
          <div className="fld" style={{ flex: '2 1 180px', margin: 0 }}>
            <label>Nota (opcional)</label>
            <input type="text" value={nuevaNota} onChange={(e) => setNuevaNota(e.target.value)} placeholder="Ej: proveedor X, brillante…" />
          </div>
        </div>
        <div className="brow right" style={{ marginTop: 12 }}>
          <button className="btn btn-p" onClick={agregar} disabled={guardando}>
            {guardando ? 'Guardando…' : '+ Agregar color'}
          </button>
        </div>
      </div>

      {/* Buscador + filtros */}
      <div className="brow" style={{ gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="🔍 Buscar por código o color…"
          style={{ flex: '2 1 180px', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
        />
        <select value={gamaFiltro} onChange={(e) => setGamaFiltro(e.target.value)} style={{ flex: '1 1 130px', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>
          <option value="todas">Todas las gamas</option>
          {gamas.map((g) => <option key={g} value={g}>{tituloGama(g)}</option>)}
        </select>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} style={{ flex: '1 1 130px', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>
          <option value="todos">Todos los estados</option>
          <option value="rotacion">Solo rotación</option>
          <option value="sin_rotacion">Solo sin rotación</option>
          <option value="agotado">Solo agotados</option>
        </select>
      </div>

      {cargando ? (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Cargando carta de colores…</p>
      ) : totalFiltrados === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          {conos.length === 0 ? 'Todavía no hay colores. Agrega el primero arriba.' : 'Ningún color coincide con la búsqueda.'}
        </p>
      ) : (
        <div>
          {grupos.map((grupo) => (
            <div key={grupo.gama} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--thread)', borderBottom: '2px solid var(--thread)', paddingBottom: 5, marginBottom: 8 }}>
                {tituloGama(grupo.gama)} <span style={{ color: 'var(--muted)', fontWeight: 600 }}>({grupo.items.length})</span>
              </div>
              {grupo.items.map((c) => {
                const est = ESTADOS[c.estado] || ESTADOS.rotacion
                const agotado = c.estado === 'agotado'
                if (editando === c.id) {
                  return (
                    <div key={c.id} style={{ background: 'var(--weave)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800, color: 'var(--thread)', fontSize: 14 }}>{c.codigo}</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>editando…</span>
                      </div>
                      <div className="brow" style={{ flexWrap: 'wrap', gap: 10 }}>
                        <div className="fld" style={{ flex: '2 1 180px', margin: 0 }}>
                          <label>Nombre</label>
                          <input type="text" value={edNombre} onChange={(e) => setEdNombre(e.target.value)} />
                        </div>
                        <div className="fld" style={{ flex: '1 1 140px', margin: 0 }}>
                          <label>Estado</label>
                          <select value={edEstado} onChange={(e) => setEdEstado(e.target.value)}>
                            <option value="rotacion">Rotación</option>
                            <option value="sin_rotacion">Sin rotación</option>
                            <option value="agotado">Agotado</option>
                          </select>
                        </div>
                        <div className="fld" style={{ flex: '2 1 180px', margin: 0 }}>
                          <label>Nota</label>
                          <input type="text" value={edNota} onChange={(e) => setEdNota(e.target.value)} />
                        </div>
                      </div>
                      <div className="brow right" style={{ marginTop: 10 }}>
                        <button className="btn btn-s btn-sm" onClick={() => setEditando(null)}>Cancelar</button>
                        <button className="btn btn-p btn-sm" onClick={() => guardarEdicion(c)}>💾 Guardar</button>
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)', opacity: agotado ? 0.55 : 1 }}>
                    <ColorSwatch nombre={c.nombre} size={18} />
                    <div style={{ minWidth: 62 }}>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800, color: 'var(--thread)', fontSize: 14 }}>{c.codigo}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, textDecoration: agotado ? 'line-through' : 'none' }}>{c.nombre}</div>
                      {c.nota && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.nota}</div>}
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: est.color, border: `1px solid ${est.color}`, borderRadius: 20, padding: '2px 9px', whiteSpace: 'nowrap' }}>
                      {est.label}
                    </span>
                    <select
                      value={c.estado}
                      onChange={(e) => cambiarEstado(c, e.target.value)}
                      style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12 }}
                      title="Cambiar estado"
                    >
                      <option value="rotacion">Rotación</option>
                      <option value="sin_rotacion">Sin rotación</option>
                      <option value="agotado">Agotado</option>
                    </select>
                    <button className="btn btn-s btn-sm" onClick={() => abrirEdicion(c)} title="Editar">✏️</button>
                    <button className="btn btn-s btn-sm" onClick={() => imprimirEtiquetaCono(c)} title="Imprimir etiqueta 2x1">🏷️</button>
                    <button className="btn btn-s btn-sm" onClick={() => borrar(c)} title="Borrar" style={{ color: '#c0392b' }}>🗑️</button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
