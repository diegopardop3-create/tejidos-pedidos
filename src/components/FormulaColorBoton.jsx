import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { segmentosColor } from './constants'

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

// Botón (🧪) que abre un cuadro para ver/guardar la fórmula de CADA color
// que compone el nombre, por separado. Ej: "Uva-Blanco" se guarda como
// dos fórmulas independientes: "Uva" y "Blanco". Así, si después piden
// "Uva-Camel", la fórmula de "Uva" ya aparece lista y solo falta la de "Camel".
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
      const existente = (data || []).find((d) => d.color_clave === clave)
      return {
        texto: s.texto, clave,
        id: existente?.id || null,
        descripcion: existente?.descripcion || '',
        guardando: false,
      }
    })
    setItems(nuevosItems)
    setCargando(false)
  }

  function actualizarDescripcion(idx, valor) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, descripcion: valor } : it)))
  }

  async function guardarUno(idx) {
    const it = items[idx]
    setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, guardando: true } : x)))
    if (it.id) {
      await supabase.from('formulas_color').update({
        descripcion: it.descripcion, color_nombre: it.texto, actualizado_en: new Date().toISOString(),
      }).eq('id', it.id)
    } else {
      const { data } = await supabase.from('formulas_color').insert({
        color_clave: it.clave, color_nombre: it.texto, descripcion: it.descripcion,
      }).select().single()
      if (data) setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, id: data.id } : x)))
    }
    setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, guardando: false } : x)))
    showToast?.('🧪', `Fórmula de "${it.texto}" guardada`)
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
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="mtitle">🧪 Fórmulas de color</div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
              Cada color de <strong>{nombreColor}</strong> se guarda por separado — así puedes reutilizar
              la fórmula de uno aunque después lo combines con una raya distinta.
            </p>

            {cargando ? (
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>Buscando fórmulas guardadas…</p>
            ) : (
              items.map((it, idx) => (
                <div key={idx} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: idx < items.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div className="fld">
                    <label>
                      {it.texto} — {it.id ? <span style={{ color: 'var(--thread)' }}>ya tiene fórmula guardada</span> : <span style={{ color: 'var(--muted)' }}>sin fórmula guardada</span>}
                    </label>
                    <textarea
                      value={it.descripcion}
                      onChange={(e) => actualizarDescripcion(idx, e.target.value)}
                      placeholder="Ej: 70% hilo negro + 30% poliéster blanco, 2 vueltas de..."
                      style={{ minHeight: 70 }}
                    />
                  </div>
                  <div className="brow right" style={{ marginTop: 8 }}>
                    <button className="btn btn-p btn-sm" onClick={() => guardarUno(idx)} disabled={it.guardando}>
                      {it.guardando ? 'Guardando…' : `💾 Guardar "${it.texto}"`}
                    </button>
                  </div>
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
