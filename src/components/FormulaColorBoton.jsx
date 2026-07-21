import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { segmentosColor, gamaDe } from './constants'

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

// Botón (🧪) que abre las FÓRMULAS de cada color que compone el nombre.
// Ej: "Rosado bebe-Negro" se maneja como dos colores: "Rosado bebe" y "Negro".
//
// Diseño:
//   - Una fórmula = etiqueta (automática: el nombre del color) + receta en
//     texto libre.
//   - Al elegir cuál usar, se muestran TODAS las variantes de la misma GAMA
//     (ej. "Azul", "Azul oscuro", "Azul petroleo", "Azul día" son todas de
//     la gama "azul"), cada una etiquetada con su nombre original, para que
//     puedas comparar tonos aunque no se llamen exactamente igual.
//   - La selección de "cuál fórmula se usa en este pedido" se ancla al
//     ÍTEM y a la COLUMNA de color exacta (no solo al texto), para que dos
//     colores escritos igual en el mismo pedido (ej. dos veces "Azul") NUNCA
//     compartan la misma selección por accidente.
export default function FormulaColorBoton({ nombreColor, showToast, pedidoId, itemTipo, itemId }) {
  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [items, setItems] = useState([])
  // Mapa clave-de-color -> formula_id seleccionada para ESTE ítem+columna.
  const [seleccion, setSeleccion] = useState({})

  const puedeSeleccionar = !!(pedidoId && itemTipo && itemId)

  async function abrir() {
    const segmentos = segmentosColor(nombreColor)
    if (!segmentos.length) { showToast?.('⚠️', 'Escribe primero el nombre del color'); return }
    setAbierto(true)
    setCargando(true)

    const claves = segmentos.map((s) => normalizar(s.texto))

    // Traemos TODAS las fórmulas (para poder agrupar por gama en el cliente),
    // todos los pedidos (para el "pedido más reciente" de cada palabra), y
    // si hay pedidoId+itemTipo+itemId, la selección guardada para ESTE ítem
    // y columna de color exactos (no la de otros ítems que se llamen igual).
    const [{ data: formulas }, { data: pedidos }, seleccionRes] = await Promise.all([
      supabase.from('formulas_color').select('*'),
      supabase.from('pedidos').select('numero, fecha, items_camiseta(colores), items_chaqueta(colores)').order('fecha', { ascending: false }),
      puedeSeleccionar
        ? supabase.from('pedido_color_formula').select('color_clave, formula_id')
            .eq('pedido_id', pedidoId).eq('item_tipo', itemTipo).eq('item_id', String(itemId)).eq('color_combo', nombreColor)
            .in('color_clave', claves)
        : Promise.resolve({ data: [] }),
    ])

    const selMap = {}
    for (const row of (seleccionRes?.data || [])) selMap[row.color_clave] = row.formula_id
    setSeleccion(selMap)

    // Mapa: clave de color normalizada -> pedido más reciente donde aparece
    // (en cualquier segmento del color combinado del pedido).
    const recientePorClave = new Map()
    for (const p of (pedidos || [])) {
      for (const it of [...(p.items_camiseta || []), ...(p.items_chaqueta || [])]) {
        for (const combinado of (it.colores || [])) {
          for (const seg of String(combinado).split('-')) {
            const k = normalizar(seg)
            if (!k) continue
            const prev = recientePorClave.get(k)
            if (!prev || (p.fecha || '') > (prev.fecha || '')) {
              recientePorClave.set(k, { numero: p.numero, fecha: p.fecha })
            }
          }
        }
      }
    }

    const nuevosItems = segmentos.map((s) => {
      const clave = normalizar(s.texto)
      const gama = gamaDe(s.texto)
      // Variantes de la MISMA GAMA (no solo del mismo texto exacto), para
      // poder elegir entre "Azul oscuro", "Azul petroleo", "Azul día"... aunque
      // el color de este pedido se llame solo "Azul".
      const variantes = (formulas || [])
        .filter((d) => gamaDe(d.color_nombre) === gama)
        .sort((a, b) => (a.color_clave || '').localeCompare(b.color_clave || ''))
      return {
        texto: s.texto,
        clave,
        gama,
        variantes,
        reciente: recientePorClave.get(clave) || null,
        expandido: null, // id de la variante abierta, o 'nueva'
        formDescripcion: '',
        guardando: false,
      }
    })
    setItems(nuevosItems)
    setCargando(false)
  }

  function abrirNueva(idx) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, expandido: 'nueva', formDescripcion: '' } : it)))
  }

  function abrirVariante(idx, variante) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, expandido: variante.id, formDescripcion: variante.descripcion || '' } : it)))
  }

  function cerrarForm(idx) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, expandido: null } : it)))
  }

  function actualizarCampo(idx, campo, valor) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it)))
  }

  async function guardar(idx) {
    const it = items[idx]
    if (!it.formDescripcion.trim()) { showToast?.('⚠️', 'Escribe la fórmula antes de guardar'); return }
    setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, guardando: true } : x)))

    if (it.expandido === 'nueva') {
      // La etiqueta y el nombre de una fórmula NUEVA son automáticos: el
      // nombre del color tal como está escrito en ESTE pedido.
      const etiqueta = it.texto
      const { data, error } = await supabase.from('formulas_color').insert({
        color_clave: it.clave, color_nombre: it.texto, etiqueta, descripcion: it.formDescripcion,
      }).select().single()
      if (error) { showToast?.('⚠️', 'Error al guardar'); setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, guardando: false } : x))); return }
      setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, variantes: [...x.variantes, data], expandido: null, guardando: false } : x)))
      showToast?.('🧪', `Fórmula de "${it.texto}" guardada`)
    } else {
      // Editar una fórmula EXISTENTE: solo se actualiza su receta. Nunca se
      // toca su nombre/clave original — puede que la estés viendo desde una
      // sección de gama distinta (ej. editando "Azul petroleo" mientras
      // navegas "Azul"), y renombrarla por accidente le haría perder su
      // identidad y romper otras fórmulas que ya la referencian.
      const { error } = await supabase.from('formulas_color').update({
        descripcion: it.formDescripcion, actualizado_en: new Date().toISOString(),
      }).eq('id', it.expandido)
      if (error) { showToast?.('⚠️', 'Error al guardar'); setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, guardando: false } : x))); return }
      setItems((prev) => prev.map((x, i) => (i === idx ? {
        ...x,
        variantes: x.variantes.map((v) => (v.id === it.expandido ? { ...v, descripcion: it.formDescripcion } : v)),
        expandido: null, guardando: false,
      } : x)))
      showToast?.('🧪', 'Fórmula actualizada')
    }
  }

  async function usarEsta(idx, variante) {
    const it = items[idx]
    if (!puedeSeleccionar) return
    const yaEsta = seleccion[it.clave] === variante.id
    if (yaEsta) {
      // Deseleccionar: quitar la fila de ESTE ítem+columna exactos.
      const { error } = await supabase.from('pedido_color_formula').delete()
        .eq('pedido_id', pedidoId).eq('item_tipo', itemTipo).eq('item_id', String(itemId)).eq('color_combo', nombreColor).eq('color_clave', it.clave)
      if (error) { showToast?.('⚠️', 'Error al quitar la selección'); return }
      setSeleccion((prev) => { const n = { ...prev }; delete n[it.clave]; return n })
      showToast?.('↩️', `${it.texto}: fórmula quitada de este pedido`)
      return
    }
    // Upsert: una sola fórmula por color EN ESTE ÍTEM Y COLUMNA exactos —
    // así dos colores escritos igual en otro ítem del mismo pedido no chocan.
    const { error } = await supabase.from('pedido_color_formula')
      .upsert(
        { pedido_id: pedidoId, item_tipo: itemTipo, item_id: String(itemId), color_combo: nombreColor, color_clave: it.clave, formula_id: variante.id },
        { onConflict: 'pedido_id,item_tipo,item_id,color_combo,color_clave' }
      )
    if (error) { showToast?.('⚠️', 'Error al seleccionar la fórmula'); return }
    setSeleccion((prev) => ({ ...prev, [it.clave]: variante.id }))
    showToast?.('✅', `${it.texto}: fórmula seleccionada para este pedido`)
  }

  async function eliminar(idx, variante) {
    if (!window.confirm(`¿Eliminar esta fórmula de "${variante.color_nombre}"? Esto no se puede deshacer.`)) return
    const { error } = await supabase.from('formulas_color').delete().eq('id', variante.id)
    if (error) { showToast?.('⚠️', 'Error al eliminar'); return }
    setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, variantes: x.variantes.filter((v) => v.id !== variante.id), expandido: x.expandido === variante.id ? null : x.expandido } : x)))
    showToast?.('🗑️', 'Fórmula eliminada')
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

      {abierto && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setAbierto(false) }}>
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="mtitle">🧪 Fórmulas de color</div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
              Se muestran todas las variantes de la misma gama (ej. "Azul oscuro", "Azul petroleo",
              "Azul día" cuentan como variantes de <strong>Azul</strong>), cada una con su nombre
              original, para que puedas comparar y elegir aunque no se llamen exactamente igual.
            </p>

            {cargando ? (
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>Buscando fórmulas guardadas…</p>
            ) : (
              items.map((it, idx) => (
                <div key={idx} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: idx < items.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {it.texto}
                    {it.reciente && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>· últ. {it.reciente.numero}</span>}
                  </div>

                  {it.variantes.length === 0 && it.expandido !== 'nueva' && (
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Sin fórmulas guardadas todavía para esta gama.</p>
                  )}

                  {it.variantes.map((v) => (
                    <div key={v.id} style={{ marginBottom: 8 }}>
                      {it.expandido === v.id ? (
                        <div style={{ background: 'var(--weave)', border: '1px solid var(--border)', padding: 10, borderRadius: 8 }}>
                          <div className="fld">
                            <label>Fórmula de "{v.color_nombre}"</label>
                            <textarea
                              value={it.formDescripcion}
                              onChange={(e) => actualizarCampo(idx, 'formDescripcion', e.target.value)}
                              placeholder="Ej: mH 546 cabo 2 derecho + ALFA 1310m cabo 1 evanizado"
                              style={{ minHeight: 70 }}
                            />
                          </div>
                          <div className="brow right" style={{ marginTop: 8 }}>
                            <button className="btn btn-s btn-sm" onClick={() => eliminar(idx, v)} style={{ color: '#c0392b' }}>🗑️ Eliminar</button>
                            <button className="btn btn-s btn-sm" onClick={() => cerrarForm(idx)}>Cancelar</button>
                            <button className="btn btn-p btn-sm" onClick={() => guardar(idx)} disabled={it.guardando}>
                              {it.guardando ? 'Guardando…' : '💾 Guardar'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'stretch', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => abrirVariante(idx, v)}
                            style={{ flex: 1, textAlign: 'left', background: seleccion[it.clave] === v.id ? '#eaf5ea' : 'var(--weave)', border: seleccion[it.clave] === v.id ? '1.5px solid var(--thread)' : '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', cursor: 'pointer' }}
                          >
                            {seleccion[it.clave] === v.id && <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--thread)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>✓ Usada en este pedido</div>}
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--thread)', marginBottom: 2 }}>{v.color_nombre}</div>
                            <div style={{ fontSize: 13, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>{v.descripcion}</div>
                          </button>
                          {puedeSeleccionar && (
                            <button
                              type="button"
                              onClick={() => usarEsta(idx, v)}
                              className="btn btn-sm"
                              style={{ flexShrink: 0, alignSelf: 'center', background: seleccion[it.clave] === v.id ? 'var(--thread)' : 'var(--weave)', color: seleccion[it.clave] === v.id ? '#fff' : 'var(--thread)', border: '1px solid var(--thread)' }}
                              title={seleccion[it.clave] === v.id ? 'Quitar de este pedido' : 'Usar esta fórmula en este pedido'}
                            >
                              {seleccion[it.clave] === v.id ? '✓ Usada' : 'Usar esta'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {it.expandido === 'nueva' ? (
                    <div style={{ background: 'var(--weave)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginTop: 4 }}>
                      <div className="fld">
                        <label>Nueva fórmula de "{it.texto}"</label>
                        <textarea
                          value={it.formDescripcion}
                          onChange={(e) => actualizarCampo(idx, 'formDescripcion', e.target.value)}
                          placeholder="Ej: mH 546 cabo 2 derecho + ALFA 1310m cabo 1 evanizado"
                          style={{ minHeight: 70 }}
                        />
                      </div>
                      <div className="brow right" style={{ marginTop: 8 }}>
                        <button className="btn btn-s btn-sm" onClick={() => cerrarForm(idx)}>Cancelar</button>
                        <button className="btn btn-p btn-sm" onClick={() => guardar(idx)} disabled={it.guardando}>
                          {it.guardando ? 'Guardando…' : '💾 Guardar fórmula'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn btn-s btn-sm" onClick={() => abrirNueva(idx)} style={{ marginTop: 4 }}>
                      + Agregar fórmula de "{it.texto}"
                    </button>
                  )}
                </div>
              ))
            )}

            <div className="brow right" style={{ marginTop: 6 }}>
              <button className="btn btn-s" onClick={() => setAbierto(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
