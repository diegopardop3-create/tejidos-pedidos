import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import { segmentosColor } from './constants'
import FormulaEditor from './FormulaEditor'
import { MuestraHilo } from './Muestras'
import { normalizar, gamaDe, capitalizar, ESTADOS, lineasDe, partesDe, pasoLabel, hiloTitulo, alertaFormula } from './hilos'

const ALERTA = {
  agotado: { corto: 'Hilo agotado', clase: 'debe' },
  borrado: { corto: 'Hilo borrado', clase: 'debe' },
  sin_rotacion: { corto: 'Sin rotación', clase: 'aviso' },
}

// Botón (🧪) que abre las FÓRMULAS de cada color que compone el nombre.
// Ej: "Rosado bebe-Negro" se maneja como dos colores: "Rosado bebe" y "Negro".
//
//   - Cada fórmula muestra sus hilos (paso por el guiahilo, hilo y cabos), y
//     avisa si alguno está agotado o sin rotación.
//   - Se muestran TODAS las variantes de la misma GAMA (ej. "Azul", "Azul
//     oscuro", "Azul petroleo" son de la gama "azul"), para poder comparar
//     tonos aunque no se llamen exactamente igual.
//   - "Usar esta" ancla la fórmula al ÍTEM y a la COLUMNA de color exacta
//     (no solo al texto), para que dos colores escritos igual en el mismo
//     pedido (ej. dos veces "Azul") NUNCA compartan la selección por accidente.
//   - Crear o editar abre el mismo editor de la vista Fórmulas de Colores.
export default function FormulaColorBoton({ nombreColor, showToast, pedidoId, itemTipo, itemId }) {
  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [items, setItems] = useState([])
  const [hilos, setHilos] = useState([])
  // Mapa clave-de-color -> formula_id seleccionada para ESTE ítem+columna.
  const [seleccion, setSeleccion] = useState({})

  const puedeSeleccionar = !!(pedidoId && itemTipo && itemId)
  const hilosPorId = useMemo(() => new Map(hilos.map((h) => [h.id, h])), [hilos])

  async function abrir() {
    const segmentos = segmentosColor(nombreColor)
    if (!segmentos.length) { showToast?.('⚠️', 'Escribe primero el nombre del color'); return }
    setAbierto(true)
    setCargando(true)

    const claves = segmentos.map((s) => normalizar(s.texto))

    // Todas las fórmulas (para agrupar por gama), los hilos (para mostrar
    // cada línea), los pedidos (para el "pedido más reciente" de cada color)
    // y, si hay pedido+ítem, la selección guardada para ESTA columna exacta.
    const [{ data: formulas }, { data: conos }, { data: pedidos }, seleccionRes] = await Promise.all([
      supabase.from('formulas_color').select('*'),
      supabase.from('conos').select('*'),
      supabase.from('pedidos').select('numero, fecha, items_camiseta(colores), items_chaqueta(colores)').order('fecha', { ascending: false }),
      puedeSeleccionar
        ? supabase.from('pedido_color_formula').select('color_clave, formula_id')
            .eq('pedido_id', pedidoId).eq('item_tipo', itemTipo).eq('item_id', String(itemId)).eq('color_combo', nombreColor)
            .in('color_clave', claves)
        : Promise.resolve({ data: [] }),
    ])
    setHilos(conos || [])

    const selMap = {}
    for (const row of (seleccionRes?.data || [])) selMap[row.color_clave] = row.formula_id
    setSeleccion(selMap)

    // Clave de color -> pedido más reciente donde aparece (en cualquier
    // segmento del color combinado del pedido).
    const recientePorClave = new Map()
    for (const p of (pedidos || [])) {
      for (const it of [...(p.items_camiseta || []), ...(p.items_chaqueta || [])]) {
        for (const combinado of (it.colores || [])) {
          for (const seg of String(combinado).split('-')) {
            const k = normalizar(seg)
            if (!k) continue
            const prev = recientePorClave.get(k)
            if (!prev || (p.fecha || '') > (prev.fecha || '')) recientePorClave.set(k, { numero: p.numero, fecha: p.fecha })
          }
        }
      }
    }

    setItems(segmentos.map((s) => {
      const clave = normalizar(s.texto)
      const gama = gamaDe(s.texto)
      return {
        texto: s.texto,
        clave,
        gama,
        variantes: (formulas || []).filter((d) => gamaDe(d.color_nombre) === gama)
          .sort((a, b) => normalizar(a.color_nombre).localeCompare(normalizar(b.color_nombre))),
        reciente: recientePorClave.get(clave) || null,
        expandido: null, // id de la variante abierta, o 'nueva'
      }
    }))
    setCargando(false)
  }

  const actualizarItem = (idx, fn) => setItems((prev) => prev.map((it, i) => (i === idx ? fn(it) : it)))

  async function usarEsta(idx, variante) {
    const it = items[idx]
    if (!puedeSeleccionar) return
    if (seleccion[it.clave] === variante.id) {
      // Deseleccionar: quitar la fila de ESTE ítem+columna exactos.
      const { error } = await supabase.from('pedido_color_formula').delete()
        .eq('pedido_id', pedidoId).eq('item_tipo', itemTipo).eq('item_id', String(itemId)).eq('color_combo', nombreColor).eq('color_clave', it.clave)
      if (error) { showToast?.('⚠️', 'Error al quitar la selección'); return }
      setSeleccion((prev) => { const n = { ...prev }; delete n[it.clave]; return n })
      showToast?.('↩️', `${it.texto}: fórmula quitada de este pedido`)
      return
    }
    // Upsert: una sola fórmula por color EN ESTE ÍTEM Y COLUMNA exactos.
    const { error } = await supabase.from('pedido_color_formula')
      .upsert(
        { pedido_id: pedidoId, item_tipo: itemTipo, item_id: String(itemId), color_combo: nombreColor, color_clave: it.clave, formula_id: variante.id },
        { onConflict: 'pedido_id,item_tipo,item_id,color_combo,color_clave' }
      )
    if (error) { showToast?.('⚠️', 'Error al seleccionar la fórmula'); return }
    setSeleccion((prev) => ({ ...prev, [it.clave]: variante.id }))
    showToast?.('✅', `${it.texto}: fórmula seleccionada para este pedido`)
  }

  function editor(idx, it, formula) {
    return (
      <div className="fcb-editor">
        <div className="fcb-editor-t">{formula ? `Editando “${capitalizar(formula.color_nombre)}”` : `Nueva fórmula de “${it.texto}”`}</div>
        <FormulaEditor
          formula={formula}
          base={formula ? null : { color_nombre: it.texto }}
          colorFijo
          hilos={hilos}
          onHiloCreado={(h) => setHilos((prev) => [...prev, h])}
          onGuardada={(fila) => actualizarItem(idx, (x) => ({
            ...x,
            expandido: null,
            variantes: x.variantes.some((v) => v.id === fila.id) ? x.variantes.map((v) => (v.id === fila.id ? fila : v)) : [...x.variantes, fila],
          }))}
          onEliminada={(id) => {
            actualizarItem(idx, (x) => ({ ...x, expandido: null, variantes: x.variantes.filter((v) => v.id !== id) }))
            setSeleccion((prev) => Object.fromEntries(Object.entries(prev).filter(([, fid]) => fid !== id)))
          }}
          onCancelar={() => actualizarItem(idx, (x) => ({ ...x, expandido: null }))}
          showToast={showToast}
        />
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        title={`Fórmulas de color${nombreColor ? ': ' + nombreColor : ''}`}
        onClick={abrir}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: '0 2px', lineHeight: 1, opacity: .75, flexShrink: 0 }}
      >
        🧪
      </button>

      {/* La ventana se pinta fuera de la tabla (el botón vive dentro de un
          encabezado <th>), para que no herede su letra en mayúsculas ni su
          ancho; va dentro de .app-root para conservar el modo oscuro. */}
      {abierto && createPortal(
        <div className="overlay fcb-overlay" onClick={(e) => { if (e.target === e.currentTarget) setAbierto(false) }}>
          <div className="modal fcb-modal">
            <div className="mtitle">🧪 Fórmulas de color</div>
            <p className="fcb-ayuda">
              Salen todas las fórmulas de la misma gama (ej. “Azul oscuro” y “Azul petroleo” son de la gama <strong>azul</strong>) para que compares. Toca una para editarla.
            </p>

            {cargando ? (
              <p className="fcb-ayuda">Buscando fórmulas guardadas…</p>
            ) : (
              items.map((it, idx) => (
                <div key={idx} className="fcb-color">
                  <div className="fcb-color-t">
                    {it.texto}
                    {it.reciente && <span>· últ. {it.reciente.numero}</span>}
                  </div>

                  {it.variantes.length === 0 && it.expandido !== 'nueva' && (
                    <p className="fcb-ayuda">Todavía no hay fórmulas de esta gama.</p>
                  )}

                  {it.variantes.map((v) => {
                    if (it.expandido === v.id) return <div key={v.id}>{editor(idx, it, v)}</div>
                    const lineas = lineasDe(v)
                    const alerta = lineas ? alertaFormula(lineas, hilosPorId) : null
                    const usada = seleccion[it.clave] === v.id
                    return (
                      <div key={v.id} className="fcb-var">
                        <button type="button" className={`fcb-card ${usada ? 'usada' : ''}`} onClick={() => actualizarItem(idx, (x) => ({ ...x, expandido: v.id }))} title="Editar esta fórmula">
                          {usada && <span className="fcb-usada">✓ Usada en este pedido</span>}
                          <span className="fcb-nombre">
                            {capitalizar(v.color_nombre)}
                            {alerta && <span className={`co-tag ${ALERTA[alerta].clase}`}>{ALERTA[alerta].corto}</span>}
                          </span>
                          {lineas ? partesDe(lineas).map((g) => (
                            <span key={g.nombre || '-'} className="fcb-parte">
                              {g.nombre && <em>{g.nombre}</em>}
                              {g.lineas.map((l, n) => {
                                const h = hilosPorId.get(l.cono_id)
                                const est = h && h.estado !== 'rotacion' ? ESTADOS[h.estado] : null
                                return (
                                  <span key={n} className="fcb-linea">
                                    <span className={`cf-paso ${l.paso || 'nada'}`}>{pasoLabel(l.paso) || '—'}</span>
                                    <MuestraHilo hilo={h} tam="mini" />
                                    <b className={est ? `fcb-${est.clase}` : ''}>{hiloTitulo(h)}</b>
                                    {l.cabos != null && <span className="fcb-cabos">×{l.cabos}</span>}
                                  </span>
                                )
                              })}
                            </span>
                          )) : <span className="fcb-texto">{v.descripcion || 'Sin receta escrita'}</span>}
                        </button>
                        {puedeSeleccionar && (
                          <button
                            type="button"
                            onClick={() => usarEsta(idx, v)}
                            className={`btn btn-sm fcb-usar ${usada ? 'on' : ''}`}
                            title={usada ? 'Quitar de este pedido' : 'Usar esta fórmula en este pedido'}
                          >
                            {usada ? '✓ Usada' : 'Usar esta'}
                          </button>
                        )}
                      </div>
                    )
                  })}

                  {it.expandido === 'nueva'
                    ? editor(idx, it, null)
                    : <button className="btn btn-s btn-sm" onClick={() => actualizarItem(idx, (x) => ({ ...x, expandido: 'nueva' }))}>+ Agregar fórmula de “{it.texto}”</button>}
                </div>
              ))
            )}

            <div className="brow right" style={{ marginTop: 6 }}>
              <button className="btn btn-s" onClick={() => setAbierto(false)}>Cerrar</button>
            </div>
          </div>
        </div>,
        document.querySelector('.app-root') || document.body
      )}
    </>
  )
}
