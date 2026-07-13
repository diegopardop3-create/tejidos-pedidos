import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { segmentosColor } from './constants'

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

// Botón (🧪) que abre las FÓRMULAS de cada color que compone el nombre.
// Ej: "Rosado bebe-Negro" se maneja como dos colores: "Rosado bebe" y "Negro".
//
// Diseño (simplificado a pedido del usuario):
//   - Una fórmula = etiqueta (automática: el nombre del color) + receta en
//     texto libre. Sin ingredientes estructurados ni sección de hilo.
//   - Un mismo color puede tener varias fórmulas (varios tonos). Se listan
//     todas, y cada una muestra la receta + el pedido MÁS RECIENTE donde se
//     usó ese color, para poder distinguirlas (ej. "Rosado bebe — P-0002").
//   - Puedes ver/editar una existente o agregar una nueva. Nunca se
//     sobreescriben las otras.
export default function FormulaColorBoton({ nombreColor, showToast }) {
  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [items, setItems] = useState([])

  async function abrir() {
    const segmentos = segmentosColor(nombreColor)
    if (!segmentos.length) { showToast?.('⚠️', 'Escribe primero el nombre del color'); return }
    setAbierto(true)
    setCargando(true)

    const claves = segmentos.map((s) => normalizar(s.texto))

    // Fórmulas guardadas de estos colores + todos los pedidos, para calcular
    // el pedido más reciente donde se usó cada nombre de color.
    const [{ data: formulas }, { data: pedidos }] = await Promise.all([
      supabase.from('formulas_color').select('*').in('color_clave', claves),
      supabase.from('pedidos').select('numero, fecha, items_camiseta(colores), items_chaqueta(colores)').order('fecha', { ascending: false }),
    ])

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
      const variantes = (formulas || [])
        .filter((d) => d.color_clave === clave)
        .sort((a, b) => (a.id || 0) - (b.id || 0))
      return {
        texto: s.texto,
        clave,
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

    // La etiqueta es automática: el nombre del color.
    const etiqueta = it.texto

    if (it.expandido === 'nueva') {
      const { data, error } = await supabase.from('formulas_color').insert({
        color_clave: it.clave, color_nombre: it.texto, etiqueta, descripcion: it.formDescripcion,
      }).select().single()
      if (error) { showToast?.('⚠️', 'Error al guardar'); setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, guardando: false } : x))); return }
      setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, variantes: [...x.variantes, data], expandido: null, guardando: false } : x)))
      showToast?.('🧪', `Fórmula de "${it.texto}" guardada`)
    } else {
      const { error } = await supabase.from('formulas_color').update({
        descripcion: it.formDescripcion, color_nombre: it.texto, etiqueta, actualizado_en: new Date().toISOString(),
      }).eq('id', it.expandido)
      if (error) { showToast?.('⚠️', 'Error al guardar'); setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, guardando: false } : x))); return }
      setItems((prev) => prev.map((x, i) => (i === idx ? {
        ...x,
        variantes: x.variantes.map((v) => (v.id === it.expandido ? { ...v, descripcion: it.formDescripcion } : v)),
        expandido: null, guardando: false,
      } : x)))
      showToast?.('🧪', `Fórmula de "${it.texto}" actualizada`)
    }
  }

  async function eliminar(idx, variante) {
    if (!window.confirm(`¿Eliminar esta fórmula de "${items[idx].texto}"? Esto no se puede deshacer.`)) return
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
              Cada color de <strong>{nombreColor}</strong> guarda sus fórmulas por separado. Si un
              mismo color tiene varios tonos, guarda cada uno como una fórmula distinta — se
              distinguen por su receta y por el pedido más reciente donde se usó.
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
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Sin fórmulas guardadas todavía.</p>
                  )}

                  {it.variantes.map((v) => (
                    <div key={v.id} style={{ marginBottom: 8 }}>
                      {it.expandido === v.id ? (
                        <div style={{ background: 'var(--weave)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                          <div className="fld">
                            <label>Fórmula de "{it.texto}"</label>
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
                        <button
                          type="button"
                          onClick={() => abrirVariante(idx, v)}
                          style={{ width: '100%', textAlign: 'left', background: 'var(--weave)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', cursor: 'pointer' }}
                        >
                          <div style={{ fontSize: 13, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>{v.descripcion}</div>
                        </button>
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
