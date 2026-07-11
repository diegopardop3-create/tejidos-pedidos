import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { segmentosColor } from './constants'

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

// Botón (🧪) que abre un cuadro para ver/guardar la fórmula de CADA color
// que compone el nombre, por separado. Ej: "Uva-Blanco" se guarda como
// dos fórmulas independientes: "Uva" y "Blanco".
//
// Un mismo nombre de color (ej. "Camel") puede tener VARIAS fórmulas
// distintas — tonos diferentes de un mismo nombre. Por eso cada color
// guarda una LISTA de variantes (cada una con una etiqueta corta, ej.
// "más claro", "pedido Uriel", y su receta). Guardar nunca sobreescribe
// una variante existente a menos que la estés editando a propósito —
// siempre se puede agregar una variante nueva sin perder las anteriores.
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
    const { data } = await supabase.from('formulas_color').select('*').in('color_clave', claves)
    const nuevosItems = segmentos.map((s) => {
      const clave = normalizar(s.texto)
      const variantes = (data || [])
        .filter((d) => d.color_clave === clave)
        .sort((a, b) => (a.id || 0) - (b.id || 0))
      return {
        texto: s.texto,
        clave,
        variantes,
        expandido: null, // id de la variante abierta, o 'nueva' para el formulario en blanco
        formEtiqueta: '',
        formDescripcion: '',
        guardando: false,
      }
    })
    setItems(nuevosItems)
    setCargando(false)
  }

  function abrirNueva(idx) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, expandido: 'nueva', formEtiqueta: '', formDescripcion: '' } : it)))
  }

  function abrirVariante(idx, variante) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, expandido: variante.id, formEtiqueta: variante.etiqueta || '', formDescripcion: variante.descripcion || '' } : it)))
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
      const etiqueta = it.formEtiqueta.trim() || `Variante ${it.variantes.length + 1}`
      const { data, error } = await supabase.from('formulas_color').insert({
        color_clave: it.clave, color_nombre: it.texto, etiqueta, descripcion: it.formDescripcion,
      }).select().single()
      if (error) { showToast?.('⚠️', 'Error al guardar'); setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, guardando: false } : x))); return }
      setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, variantes: [...x.variantes, data], expandido: null, guardando: false } : x)))
      showToast?.('🧪', `Nueva variante de "${it.texto}" guardada`)
    } else {
      const etiqueta = it.formEtiqueta.trim() || 'Sin nombre'
      const { error } = await supabase.from('formulas_color').update({
        etiqueta, descripcion: it.formDescripcion, color_nombre: it.texto, actualizado_en: new Date().toISOString(),
      }).eq('id', it.expandido)
      if (error) { showToast?.('⚠️', 'Error al guardar'); setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, guardando: false } : x))); return }
      setItems((prev) => prev.map((x, i) => (i === idx ? {
        ...x,
        variantes: x.variantes.map((v) => (v.id === it.expandido ? { ...v, etiqueta, descripcion: it.formDescripcion } : v)),
        expandido: null, guardando: false,
      } : x)))
      showToast?.('🧪', `Variante de "${it.texto}" actualizada`)
    }
  }

  async function eliminar(idx, variante) {
    if (!window.confirm(`¿Eliminar la variante "${variante.etiqueta || 'sin nombre'}" de "${items[idx].texto}"? Esto no se puede deshacer.`)) return
    const { error } = await supabase.from('formulas_color').delete().eq('id', variante.id)
    if (error) { showToast?.('⚠️', 'Error al eliminar'); return }
    setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, variantes: x.variantes.filter((v) => v.id !== variante.id), expandido: x.expandido === variante.id ? null : x.expandido } : x)))
    showToast?.('🗑️', 'Variante eliminada')
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
              Cada color de <strong>{nombreColor}</strong> se guarda por separado. Si un mismo nombre
              tiene varios tonos, guarda cada uno como una variante distinta — nunca se sobreescriben.
            </p>

            {cargando ? (
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>Buscando fórmulas guardadas…</p>
            ) : (
              items.map((it, idx) => (
                <div key={idx} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: idx < items.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{it.texto}</div>

                  {it.variantes.length === 0 && it.expandido !== 'nueva' && (
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Sin fórmulas guardadas todavía.</p>
                  )}

                  {it.variantes.map((v) => (
                    <div key={v.id} style={{ marginBottom: 8 }}>
                      {it.expandido === v.id ? (
                        <div style={{ background: 'var(--ink)', borderRadius: 8, padding: 10 }}>
                          <div className="fld">
                            <label>Etiqueta (para reconocerla, ej. "más claro", "pedido Uriel")</label>
                            <input
                              type="text"
                              value={it.formEtiqueta}
                              onChange={(e) => actualizarCampo(idx, 'formEtiqueta', e.target.value)}
                              placeholder="Ej: más claro"
                            />
                          </div>
                          <div className="fld" style={{ marginTop: 8 }}>
                            <label>Fórmula</label>
                            <textarea
                              value={it.formDescripcion}
                              onChange={(e) => actualizarCampo(idx, 'formDescripcion', e.target.value)}
                              placeholder="Ej: 70% hilo negro + 30% poliéster blanco, 2 vueltas de..."
                              style={{ minHeight: 70 }}
                            />
                          </div>
                          <div className="brow right" style={{ marginTop: 8 }}>
                            <button className="btn btn-s btn-sm" onClick={() => eliminar(idx, v)} style={{ color: '#c0392b' }}>🗑️ Eliminar</button>
                            <button className="btn btn-s btn-sm" onClick={() => cerrarForm(idx)}>Cancelar</button>
                            <button className="btn btn-p btn-sm" onClick={() => guardar(idx)} disabled={it.guardando}>
                              {it.guardando ? 'Guardando…' : '💾 Guardar cambios'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => abrirVariante(idx, v)}
                          style={{ width: '100%', textAlign: 'left', background: 'var(--ink)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer' }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--thread)' }}>{v.etiqueta || 'Sin nombre'}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.descripcion}</div>
                        </button>
                      )}
                    </div>
                  ))}

                  {it.expandido === 'nueva' ? (
                    <div style={{ background: 'var(--ink)', borderRadius: 8, padding: 10, marginTop: 4 }}>
                      <div className="fld">
                        <label>Etiqueta (para reconocerla, ej. "más claro", "pedido Uriel")</label>
                        <input
                          type="text"
                          value={it.formEtiqueta}
                          onChange={(e) => actualizarCampo(idx, 'formEtiqueta', e.target.value)}
                          placeholder="Ej: más claro"
                        />
                      </div>
                      <div className="fld" style={{ marginTop: 8 }}>
                        <label>Fórmula</label>
                        <textarea
                          value={it.formDescripcion}
                          onChange={(e) => actualizarCampo(idx, 'formDescripcion', e.target.value)}
                          placeholder="Ej: 70% hilo negro + 30% poliéster blanco, 2 vueltas de..."
                          style={{ minHeight: 70 }}
                        />
                      </div>
                      <div className="brow right" style={{ marginTop: 8 }}>
                        <button className="btn btn-s btn-sm" onClick={() => cerrarForm(idx)}>Cancelar</button>
                        <button className="btn btn-p btn-sm" onClick={() => guardar(idx)} disabled={it.guardando}>
                          {it.guardando ? 'Guardando…' : '💾 Guardar variante nueva'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn btn-s btn-sm" onClick={() => abrirNueva(idx)} style={{ marginTop: 4 }}>
                      + Agregar variante de "{it.texto}"
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
