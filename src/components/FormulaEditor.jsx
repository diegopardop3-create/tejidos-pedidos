import { useId, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { MuestraHilo } from './Muestras'
import {
  normalizar, capitalizar, PASOS, PARTES_SUGERIDAS, MATERIALES, ESTADOS,
  hiloTitulo, hiloDetalle, hiloSinColor, esLicra, textoBusquedaHilo,
  lineasDe, textoFormula, necesitaCodigo, siguienteCodigo,
} from './hilos'

let contador = 0
const nuevaKey = () => `k${++contador}`

// Editor de una fórmula: qué color produce y qué hilos lleva, cada uno con
// su paso por el guiahilo (derecho / evanizado) y sus cabos. Se puede dividir
// en partes (Liso, Transferencia) cuando cada parte lleva hilos distintos.
// Lo usan la vista Fórmulas de Colores y el botón 🧪 de los pedidos.
//
//   formula    fórmula a editar (null = nueva)
//   base       para una nueva: { color_nombre, lineas, nota } (ej. al duplicar)
//   colorFijo  no deja cambiar el color (desde un pedido)
//   hilos      todos los hilos (conos)
//   usos       en cuántos pedidos se eligió (para el aviso al eliminar)
export default function FormulaEditor({ formula, base, colorFijo, hilos, usos = 0, onHiloCreado, onGuardada, onEliminada, onCancelar, showToast }) {
  const idLista = useId()
  const [estado, setEstado] = useState(() => {
    const ls = formula ? lineasDe(formula) : (base?.lineas || null)
    const grupos = []
    const lineas = []
    for (const l of (ls && ls.length ? ls : [{ parte: '', paso: 'derecho', cono_id: null, cabos: 3 }])) {
      let g = grupos.find((x) => x.nombre === l.parte)
      if (!g) { g = { gid: nuevaKey(), nombre: l.parte }; grupos.push(g) }
      lineas.push({ key: nuevaKey(), gid: g.gid, paso: l.paso, cono_id: l.cono_id, cabos: l.cabos })
    }
    return { grupos, lineas }
  })
  const { grupos, lineas } = estado
  const [color, setColor] = useState(formula?.color_nombre ?? base?.color_nombre ?? '')
  const [nota, setNota] = useState(formula?.nota ?? base?.nota ?? '')
  const [abierto, setAbierto] = useState(null) // línea con el buscador de hilos abierto
  const [guardando, setGuardando] = useState(false)
  const textoViejo = formula && !lineasDe(formula) ? (formula.descripcion || '') : null

  const hilosPorId = useMemo(() => new Map(hilos.map((h) => [h.id, h])), [hilos])
  const conPartes = grupos.length > 1 || !!grupos[0]?.nombre

  const setLineas = (fn) => setEstado((e) => ({ ...e, lineas: fn(e.lineas) }))
  const cambiarLinea = (key, cambios) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...cambios } : l)))

  function agregarLinea(gid) {
    const delGrupo = lineas.filter((l) => l.gid === gid)
    const paso = delGrupo.some((l) => l.paso === 'derecho') ? 'evanizado' : 'derecho'
    const nueva = { key: nuevaKey(), gid, paso, cono_id: null, cabos: lineas.length ? 1 : 3 }
    const ult = lineas.map((l) => l.gid).lastIndexOf(gid)
    const ls = [...lineas]
    ls.splice(ult < 0 ? ls.length : ult + 1, 0, nueva)
    setEstado({ grupos, lineas: ls })
    setAbierto(nueva.key)
  }

  function quitarLinea(key) {
    setEstado((e) => {
      const l = e.lineas.find((x) => x.key === key)
      const ls = e.lineas.filter((x) => x.key !== key)
      // Una parte nunca queda vacía: si era su última línea, se quita la parte
      // (salvo que sea la única parte que queda).
      if (l && !ls.some((x) => x.gid === l.gid)) {
        if (e.grupos.length > 1) return { grupos: e.grupos.filter((g) => g.gid !== l.gid), lineas: ls }
        return { ...e, lineas: [{ key: nuevaKey(), gid: l.gid, paso: 'derecho', cono_id: null, cabos: 3 }] }
      }
      return { ...e, lineas: ls }
    })
  }

  // Pasa la fórmula a dos partes: lo que ya hay queda en "Liso" y se crea
  // "Transferencia" con los mismos hilos (sin la licra), para solo ajustar cabos.
  function dividirEnPartes() {
    setEstado((e) => {
      const g1 = { ...e.grupos[0], nombre: e.grupos[0].nombre || PARTES_SUGERIDAS[0] }
      const g2 = { gid: nuevaKey(), nombre: PARTES_SUGERIDAS[1] }
      const copia = e.lineas
        .filter((l) => l.cono_id != null && !esLicra(hilosPorId.get(l.cono_id)))
        .map((l) => ({ ...l, key: nuevaKey(), gid: g2.gid }))
      const extra = copia.length ? copia : [{ key: nuevaKey(), gid: g2.gid, paso: 'derecho', cono_id: null, cabos: 1 }]
      return { grupos: [g1, g2], lineas: [...e.lineas, ...extra] }
    })
  }

  function agregarParte() {
    const usados = grupos.map((g) => normalizar(g.nombre))
    const sugerida = PARTES_SUGERIDAS.find((p) => !usados.includes(normalizar(p))) || ''
    const g = { gid: nuevaKey(), nombre: sugerida }
    const l = { key: nuevaKey(), gid: g.gid, paso: 'derecho', cono_id: null, cabos: 1 }
    setEstado({ grupos: [...grupos, g], lineas: [...lineas, l] })
    setAbierto(l.key)
  }

  function quitarParte(gid) {
    const tiene = lineas.some((l) => l.gid === gid && l.cono_id != null)
    if (tiene && !window.confirm('¿Quitar esta parte con sus hilos?')) return
    setEstado((e) => ({ grupos: e.grupos.filter((g) => g.gid !== gid), lineas: e.lineas.filter((l) => l.gid !== gid) }))
  }

  const renombrarParte = (gid, nombre) => setEstado((e) => ({ ...e, grupos: e.grupos.map((g) => (g.gid === gid ? { ...g, nombre } : g)) }))

  function cambiarCabos(key, valor) {
    const n = String(valor).replace(/\D/g, '').slice(0, 2)
    cambiarLinea(key, { cabos: n === '' ? null : Math.max(1, parseInt(n, 10)) })
  }

  async function guardar() {
    const nombre = color.trim()
    if (!nombre) { showToast?.('⚠️', 'Escribe el color que da la fórmula'); return }
    if (!lineas.some((l) => l.cono_id != null)) { showToast?.('⚠️', 'Agrega al menos un hilo'); return }
    if (lineas.some((l) => l.cono_id == null)) { showToast?.('⚠️', 'Elige el hilo de cada línea o quita la que sobra'); return }
    if (grupos.length > 1) {
      const nombres = grupos.map((g) => normalizar(g.nombre))
      if (nombres.some((n) => !n)) { showToast?.('⚠️', 'Ponle nombre a cada parte (ej. Liso, Transferencia)'); return }
      if (new Set(nombres).size !== nombres.length) { showToast?.('⚠️', 'Dos partes tienen el mismo nombre'); return }
    }
    const nombreDe = new Map(grupos.map((g) => [g.gid, g.nombre.trim()]))
    // Se guarda en el orden en que se ven: parte por parte.
    const ingredientes = grupos.flatMap((g) => lineas.filter((l) => l.gid === g.gid).map((l) => ({
      parte: nombreDe.get(l.gid) || '', paso: l.paso, cono_id: l.cono_id, cabos: l.cabos ?? null,
    })))
    const fila = {
      ingredientes,
      descripcion: textoFormula(ingredientes, hilosPorId),
      nota: nota.trim() || null,
      actualizado_en: new Date().toISOString(),
    }
    if (!colorFijo || !formula) { fila.color_nombre = nombre; fila.color_clave = normalizar(nombre) }
    setGuardando(true)
    const res = formula
      ? await supabase.from('formulas_color').update(fila).eq('id', formula.id).select().single()
      : await supabase.from('formulas_color').insert({ ...fila, etiqueta: nombre }).select().single()
    setGuardando(false)
    if (res.error) { showToast?.('⚠️', 'No se pudo guardar la fórmula'); return }
    showToast?.('🧪', formula ? 'Fórmula actualizada' : `Fórmula de "${capitalizar(nombre)}" guardada`)
    onGuardada?.(res.data)
  }

  async function eliminar() {
    const aviso = usos ? ` Se eligió en ${usos} pedido${usos === 1 ? '' : 's'}: ahí quedará sin fórmula para este color.` : ''
    if (!window.confirm(`¿Eliminar esta fórmula de "${capitalizar(formula.color_nombre)}"?${aviso} Esto no se puede deshacer.`)) return
    const { error } = await supabase.from('formulas_color').delete().eq('id', formula.id)
    if (error) { showToast?.('⚠️', 'No se pudo eliminar'); return }
    showToast?.('🗑️', 'Fórmula eliminada')
    onEliminada?.(formula.id)
  }

  return (
    <div className="fe">
      {!colorFijo && (
        <div className="fld fe-color">
          <label>Color que da la fórmula</label>
          <input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Ej: Verde menta" autoFocus={!formula && !base} />
        </div>
      )}

      {textoViejo != null && (
        <div className="fe-viejo">
          <span>Así estaba escrita:</span>
          <b>{textoViejo || '(vacía)'}</b>
        </div>
      )}

      <datalist id={`${idLista}-partes`}>{PARTES_SUGERIDAS.map((p) => <option key={p} value={p} />)}</datalist>

      {grupos.map((g) => (
        <div key={g.gid} className={`fe-grupo ${conPartes ? 'con-parte' : ''}`}>
          {conPartes && (
            <div className="fe-grupo-cab">
              <input
                list={`${idLista}-partes`}
                value={g.nombre}
                onChange={(e) => renombrarParte(g.gid, e.target.value)}
                placeholder="Nombre de la parte"
                aria-label="Nombre de la parte"
              />
              {grupos.length > 1 && (
                <button type="button" className="fe-x" onClick={() => quitarParte(g.gid)} aria-label={`Quitar la parte ${g.nombre}`} title="Quitar esta parte">✕</button>
              )}
            </div>
          )}
          {lineas.filter((l) => l.gid === g.gid).map((l) => {
            const h = l.cono_id != null ? hilosPorId.get(l.cono_id) : null
            const est = h && h.estado !== 'rotacion' ? ESTADOS[h.estado] : null
            return (
              <div key={l.key} className="fe-l">
                <div className="fe-linea">
                  <select className="fe-paso" value={l.paso} onChange={(e) => cambiarLinea(l.key, { paso: e.target.value })} aria-label="Paso por el guiahilo">
                    {PASOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                  <button type="button" className={`fe-hilo ${h ? '' : 'vacio'}`} onClick={() => setAbierto(abierto === l.key ? null : l.key)} aria-expanded={abierto === l.key}>
                    {h ? <MuestraHilo hilo={h} tam="mini" /> : null}
                    <span className="fe-hilo-t">
                      <b>{h ? hiloTitulo(h) : (l.cono_id != null ? 'Hilo borrado' : 'Elegir hilo')}</b>
                      {h && <span>{hiloSinColor(h) ? 'falta el color' : hiloDetalle(h)}</span>}
                    </span>
                    {est && <span className={`co-tag ${est.clase}`}>{est.corto}</span>}
                  </button>
                  <div className="fe-cabos">
                    <button type="button" onClick={() => cambiarLinea(l.key, { cabos: Math.max(1, (l.cabos || 2) - 1) })} aria-label="Un cabo menos">−</button>
                    <input inputMode="numeric" value={l.cabos ?? ''} onChange={(e) => cambiarCabos(l.key, e.target.value)} aria-label="Cabos" placeholder="–" />
                    <button type="button" onClick={() => cambiarLinea(l.key, { cabos: Math.min(99, (l.cabos || 0) + 1) })} aria-label="Un cabo más">+</button>
                    <span>cabos</span>
                  </div>
                  <button type="button" className="fe-x" onClick={() => quitarLinea(l.key)} aria-label="Quitar este hilo" title="Quitar">✕</button>
                </div>
                {abierto === l.key && (
                  <BuscadorHilo
                    hilos={hilos}
                    onElegir={(hilo) => { cambiarLinea(l.key, { cono_id: hilo.id }); setAbierto(null) }}
                    onCrear={async (nuevo) => {
                      onHiloCreado?.(nuevo)
                      cambiarLinea(l.key, { cono_id: nuevo.id })
                      setAbierto(null)
                    }}
                    onCerrar={() => setAbierto(null)}
                    showToast={showToast}
                  />
                )}
              </div>
            )
          })}
          <button type="button" className="fe-mas" onClick={() => agregarLinea(g.gid)}>+ Agregar hilo{conPartes && g.nombre ? ` a ${g.nombre}` : ''}</button>
        </div>
      ))}

      <button type="button" className="fe-link" onClick={conPartes ? agregarParte : dividirEnPartes}>
        {conPartes ? '+ Agregar otra parte' : 'Dividir en partes (Liso y Transferencia)'}
      </button>

      <div className="fld fe-nota">
        <label>Nota (opcional)</label>
        <textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: queda un poco más oscuro que la muestra" />
      </div>

      <div className="co-facc">
        {formula && onEliminada && <button type="button" className="btn btn-d btn-sm co-izq" onClick={eliminar}>Eliminar</button>}
        <button type="button" className="btn btn-s btn-sm" onClick={onCancelar}>Cancelar</button>
        <button type="button" className="btn btn-p btn-sm" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar fórmula'}</button>
      </div>
    </div>
  )
}

// ---- Buscador de hilos (con creación rápida) ----
function BuscadorHilo({ hilos, onElegir, onCrear, onCerrar, showToast }) {
  const [q, setQ] = useState('')
  const [creando, setCreando] = useState(null) // datos del hilo nuevo, o null

  const resultados = useMemo(() => {
    const n = normalizar(q).replace(/^#/, '')
    const lista = hilos.map((h) => ({ h, t: textoBusquedaHilo(h), titulo: normalizar(hiloTitulo(h)) }))
    const filtrados = n ? lista.filter((x) => n.split(/\s+/).every((p) => x.t.includes(p.replace(/^#/, '')))) : lista
    const puntaje = (x) => (n && normalizar(x.h.hilo_col) === n ? 0 : n && x.titulo.startsWith(n) ? 1 : 2)
    return filtrados
      .sort((a, b) => puntaje(a) - puntaje(b) || a.titulo.localeCompare(b.titulo, 'es', { numeric: true }))
      .slice(0, 60)
      .map((x) => x.h)
  }, [hilos, q])

  const marcas = useMemo(() => [...new Set(hilos.map((h) => (h.hilo_marca || '').trim()).filter(Boolean))].sort(), [hilos])

  // Arma el hilo nuevo con lo que se buscó: "mH 725" -> marca mH, número 725.
  function empezarCrear() {
    const toks = q.trim().split(/\s+/).filter(Boolean)
    let marca = '', numero = ''
    const resto = []
    for (const t of toks) {
      const m = marcas.find((x) => normalizar(x) === normalizar(t))
      if (!marca && m) marca = m
      else if (!numero && /^#?\d+[a-z]?$/i.test(t)) numero = t.replace(/^#/, '')
      else resto.push(t)
    }
    let material = ''
    if (marca) {
      const cuenta = {}
      for (const h of hilos) if (normalizar(h.hilo_marca) === normalizar(marca) && h.material) cuenta[h.material] = (cuenta[h.material] || 0) + 1
      material = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
    } else if (resto.some((t) => normalizar(t).startsWith('poli'))) {
      material = 'Poliéster'
    }
    const nombre = capitalizar(resto.filter((t) => !normalizar(t).startsWith('poli')).join(' '))
    setCreando({ marca, numero, nombre, material, proveedor: '' })
  }

  return (
    <div className="fe-buscador">
      {!creando ? (
        <>
          <div className="fe-busca">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca: 725, mH, verde, V-001…" aria-label="Buscar hilo" />
            <button type="button" className="fe-x" onClick={onCerrar} aria-label="Cerrar buscador">✕</button>
          </div>
          <div className="fe-res">
            {resultados.map((h) => {
              const est = h.estado !== 'rotacion' ? ESTADOS[h.estado] : null
              return (
                <button key={h.id} type="button" onClick={() => onElegir(h)}>
                  <MuestraHilo hilo={h} tam="mini" />
                  <span className="fe-hilo-t">
                    <b>{hiloTitulo(h)}</b>
                    <span>{hiloSinColor(h) ? 'falta el color' : hiloDetalle(h)}</span>
                  </span>
                  {est && <span className={`co-tag ${est.clase}`}>{est.corto}</span>}
                </button>
              )
            })}
            {!resultados.length && <p className="co-ayuda">Ningún hilo coincide con “{q}”.</p>}
          </div>
          <button type="button" className="fe-mas" onClick={empezarCrear}>+ Crear hilo nuevo{q.trim() ? ` “${q.trim()}”` : ''}</button>
        </>
      ) : (
        <FormHilo
          inicial={creando}
          hilos={hilos}
          marcas={marcas}
          onCancelar={() => setCreando(null)}
          onCreado={(h) => onCrear(h)}
          onExiste={(h) => { showToast?.('ℹ️', `${hiloTitulo(h)} ya estaba en la carta`); onElegir(h) }}
          showToast={showToast}
        />
      )}
    </div>
  )
}

// Formulario corto para crear un hilo (también lo usa la vista Hilos).
export function FormHilo({ inicial, hilos, marcas, onCancelar, onCreado, onExiste, showToast, conEstado }) {
  const idLista = useId()
  const [d, setD] = useState({ marca: '', numero: '', nombre: '', material: '', proveedor: '', nota: '', estado: 'rotacion', ...inicial })
  const [guardando, setGuardando] = useState(false)
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value })
  const materiales = useMemo(() => [...new Set([...MATERIALES, ...hilos.map((h) => (h.material || '').trim()).filter(Boolean)])], [hilos])
  const codigo = necesitaCodigo(d) ? siguienteCodigo(hilos, d.nombre) : null
  const previo = hiloTitulo({ hilo_marca: d.marca, hilo_col: d.numero, nombre: d.nombre, material: d.material, codigo })

  async function crear() {
    const marca = d.marca.trim(), numero = d.numero.trim().replace(/^#/, ''), nombre = d.nombre.trim(), material = d.material.trim()
    if (!material) { showToast?.('⚠️', 'Escribe el material (Hilo, Poliéster…)'); return }
    if (!marca && !nombre && !esLicra({ material })) { showToast?.('⚠️', 'Un hilo sin marca necesita el color'); return }
    if (marca && !numero && !nombre) { showToast?.('⚠️', 'Escribe el número o el color'); return }
    if (marca && numero) {
      const ya = hilos.find((h) => normalizar(h.hilo_marca) === normalizar(marca) && normalizar(h.hilo_col) === normalizar(numero))
      if (ya) { onExiste?.(ya); return }
    }
    setGuardando(true)
    const fila = {
      codigo, nombre, estado: d.estado || 'rotacion', nota: d.nota?.trim() || null,
      hilo_marca: marca || null, hilo_col: numero || null, material, proveedor: d.proveedor.trim() || null,
    }
    const { data, error } = await supabase.from('conos').insert(fila).select().single()
    setGuardando(false)
    if (error) { showToast?.('⚠️', 'No se pudo crear el hilo'); return }
    showToast?.('🧵', `${hiloTitulo(data)} agregado a la carta`)
    onCreado?.(data)
  }

  return (
    <div className="fe-nuevo">
      <datalist id={`${idLista}-mat`}>{materiales.map((m) => <option key={m} value={m} />)}</datalist>
      <datalist id={`${idLista}-marca`}>{marcas.map((m) => <option key={m} value={m} />)}</datalist>
      <div className="fe-nuevo-g">
        <div className="fld"><label>Material</label><input list={`${idLista}-mat`} value={d.material} onChange={set('material')} placeholder="Hilo, Poliéster…" /></div>
        <div className="fld"><label>Marca</label><input list={`${idLista}-marca`} value={d.marca} onChange={set('marca')} placeholder="mH, Alfa… (si tiene)" /></div>
        <div className="fld"><label>Número</label><input value={d.numero} onChange={set('numero')} placeholder="Ej: 725" /></div>
        <div className="fld"><label>Color</label><input value={d.nombre} onChange={set('nombre')} placeholder="Ej: Gris claro" /></div>
        <div className="fld"><label>Proveedor</label><input value={d.proveedor} onChange={set('proveedor')} placeholder="Opcional" /></div>
        {conEstado && (
          <div className="fld"><label>Estado</label>
            <select value={d.estado} onChange={set('estado')}>
              <option value="rotacion">En rotación (se repone)</option>
              <option value="sin_rotacion">Sin rotación</option>
            </select>
          </div>
        )}
      </div>
      <p className="co-ayuda">Queda como <b>{previo}</b>{codigo ? ` · lleva el código ${codigo} para la etiqueta` : ''}.</p>
      <div className="co-facc">
        <button type="button" className="btn btn-s btn-sm" onClick={onCancelar}>Cancelar</button>
        <button type="button" className="btn btn-p btn-sm" onClick={crear} disabled={guardando}>{guardando ? 'Guardando…' : 'Crear hilo'}</button>
      </div>
    </div>
  )
}
