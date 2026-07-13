import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { fmtFecha, segmentosColor } from './constants'
import ColorSwatch from './ColorSwatch'
import CatalogoConos from './CatalogoConos'

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

// Buscador de colores → pedidos.
//
// No guarda datos nuevos: lee la columna `colores` que cada ítem
// (items_camiseta / items_chaqueta) ya trae, y arma un índice de
// "qué color se usó en qué pedido". Sirve para el flujo físico del
// taller: tienes una muestra en la mano, comparas el tono, y cuando
// coincide necesitas el número de pedido para ir a la bolsita.
//
// La búsqueda encaja tanto por palabra suelta ("camel" encuentra
// "Camel-Negro" y "Camel-Blanco") como por combinación exacta
// ("camel-negro").
export default function BuscadorColores({ showToast }) {
  const [seccion, setSeccion] = useState('buscar') // 'buscar' | 'conos'
  const [cargando, setCargando] = useState(true)
  const [indice, setIndice] = useState([]) // [{ colorNombre, segmentos:[...], pedidos:[{numero, fecha, id}] }]
  const [formulas, setFormulas] = useState([])
  const [formulaAbierta, setFormulaAbierta] = useState(null) // objeto fórmula que se muestra en el modal
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    setCargando(true)
    // Traemos los pedidos con los colores de sus ítems, y las fórmulas guardadas.
    const [{ data: pedidos, error }, { data: formulas }] = await Promise.all([
      supabase.from('pedidos').select('id, numero, fecha, items_camiseta(colores), items_chaqueta(colores)').order('fecha', { ascending: false }),
      supabase.from('formulas_color').select('*'),
    ])

    if (error) { setCargando(false); return }

    // Índice de fórmulas por color_clave (palabra suelta normalizada).
    const formPorClave = new Map()
    for (const f of (formulas || [])) {
      const k = f.color_clave
      if (!formPorClave.has(k)) formPorClave.set(k, [])
      formPorClave.get(k).push(f)
    }
    setFormulas(formulas || [])

    // Mapa: colorNombre (tal cual se escribió) -> lista de pedidos donde aparece.
    const mapa = new Map()
    for (const p of pedidos || []) {
      const coloresDelPedido = new Set()
      for (const it of [...(p.items_camiseta || []), ...(p.items_chaqueta || [])]) {
        for (const c of (it.colores || [])) {
          if (c && c.trim()) coloresDelPedido.add(c.trim())
        }
      }
      for (const color of coloresDelPedido) {
        if (!mapa.has(color)) mapa.set(color, [])
        mapa.get(color).push({ numero: p.numero, fecha: p.fecha, id: p.id })
      }
    }

    const lista = Array.from(mapa.entries())
      .map(([colorNombre, pedidos]) => {
        // fórmulas asociadas: las de cualquier segmento del color combinado
        const claves = colorNombre.split('-').map((s) => normalizar(s))
        const formulasDelColor = []
        for (const k of claves) {
          for (const f of (formPorClave.get(k) || [])) formulasDelColor.push(f)
        }
        return {
          colorNombre,
          segmentos: segmentosColor(colorNombre),
          palabras: claves,
          completo: normalizar(colorNombre.replace(/\s+/g, '')),
          pedidos: pedidos.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')),
          formulas: formulasDelColor,
        }
      })
      .sort((a, b) => a.colorNombre.localeCompare(b.colorNombre))

    setIndice(lista)
    setCargando(false)
  }

  // ¿El texto buscado parece un código de poliéster? (letra-guion-números)
  const esCodigo = (s) => /^[a-zA-Z]-?\d+$/.test(s.replace(/\s+/g, ''))

  const resultados = useMemo(() => {
    const bruto = busqueda.trim()
    if (!bruto) return indice

    // Si parece un código (A-003), filtra colores cuyas fórmulas usen ese código.
    if (esCodigo(bruto)) {
      const q = normalizar(bruto.replace(/\s+/g, ''))
      return indice.filter((item) =>
        (item.formulas || []).some((f) =>
          (f.ingredientes || []).some((ing) => ing.tipo === 'poliester' && normalizar((ing.codigo || '').replace(/\s+/g, '')).includes(q))
        )
      )
    }

    const tienGuion = bruto.includes('-')
    if (tienGuion) {
      const q = normalizar(bruto.replace(/\s+/g, ''))
      return indice.filter((item) => item.completo.includes(q))
    }

    const qPalabra = normalizar(bruto)
    return indice.filter((item) =>
      item.palabras.some((pal) => pal.includes(qPalabra)) || item.completo.includes(qPalabra)
    )
  }, [busqueda, indice])

  return (
    <>
      {/* Sub-pestañas dentro de Colores: fórmula para la muestra, o carta de colores */}
      <div className="brow" style={{ gap: 8, marginBottom: 14 }}>
        <button className={`btn ${seccion === 'buscar' ? 'btn-p' : 'btn-s'}`} onClick={() => setSeccion('buscar')}>
          🔍 Fórmula para la muestra
        </button>
        <button className={`btn ${seccion === 'conos' ? 'btn-p' : 'btn-s'}`} onClick={() => setSeccion('conos')}>
          🎨 Carta de colores
        </button>
      </div>

      {seccion === 'conos' ? (
        <CatalogoConos showToast={showToast} />
      ) : (
    <div className="card">
      <div className="ctitle">🔍 Fórmula para la muestra</div>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
        Escribe un color (ej. <strong>camel</strong>) para ver en qué pedidos se usó y sus fórmulas
        guardadas. También puedes buscar por código de poliéster (ej. <strong>A-003</strong>) para
        encontrar en qué fórmulas se usó. Haz clic en una fórmula para ver la receta completa.
      </p>

      <div className="fld" style={{ marginBottom: 16 }}>
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="🔍 Buscar color o código… (ej. camel, azul, A-003)"
          autoFocus
        />
      </div>

      {cargando ? (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Cargando colores de los pedidos…</p>
      ) : indice.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          Todavía no hay colores registrados. En cuanto guardes pedidos con colores, aparecerán aquí.
        </p>
      ) : resultados.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          Nada coincide con "<strong>{busqueda}</strong>".
        </p>
      ) : (
        <div>
          <p style={{ fontSize: 11, color: 'var(--muted)', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
            {resultados.length} {resultados.length === 1 ? 'color' : 'colores'}
          </p>
          {resultados.map((item) => (
            <div key={item.colorNombre} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <ColorSwatch nombre={item.colorNombre} size={14} />
                <span style={{ fontWeight: 700, fontSize: 14 }}>{item.colorNombre}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: (item.formulas || []).length ? 8 : 0 }}>
                {item.pedidos.map((p, i) => (
                  <div key={i} style={{ background: 'var(--ink)', borderRadius: 7, padding: '5px 11px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800, color: 'var(--thread)', fontSize: 13 }}>{p.numero}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtFecha(p.fecha)}</span>
                  </div>
                ))}
              </div>
              {(item.formulas || []).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {item.formulas.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFormulaAbierta(f)}
                      style={{ background: 'var(--weave)', border: '1px solid var(--thread)', borderRadius: 7, padding: '4px 10px', cursor: 'pointer', fontSize: 12, color: 'var(--thread)', fontWeight: 700 }}
                    >
                      🧪 {f.color_nombre}{f.etiqueta && f.etiqueta !== 'Sin nombre' ? ` · ${f.etiqueta}` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
      )}

      {/* Modal de receta de fórmula */}
      {formulaAbierta && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setFormulaAbierta(null) }}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="mtitle">🧪 {formulaAbierta.color_nombre}{formulaAbierta.etiqueta && formulaAbierta.etiqueta !== 'Sin nombre' ? ` · ${formulaAbierta.etiqueta}` : ''}</div>

            {Array.isArray(formulaAbierta.ingredientes) && formulaAbierta.ingredientes.length > 0 ? (
              <div style={{ marginBottom: 14 }}>
                {formulaAbierta.ingredientes.map((ing, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', background: 'var(--ink)', borderRadius: 7, marginBottom: 6 }}>
                    {ing.tipo === 'poliester' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => { setFormulaAbierta(null); setSeccion('conos') }}
                          title="Ver en la Carta de colores"
                          style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800, color: 'var(--thread)', fontSize: 13, background: 'none', border: '1px solid var(--thread)', borderRadius: 5, padding: '2px 7px', cursor: 'pointer' }}
                        >
                          {ing.codigo}
                        </button>
                        <span style={{ fontSize: 13, flex: 1 }}>{ing.nombre}</span>
                      </>
                    ) : (
                      <span style={{ fontSize: 13, flex: 1 }}>🧵 {ing.texto}</span>
                    )}
                    {ing.cantidad && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{ing.cantidad}</span>}
                  </div>
                ))}
              </div>
            ) : null}

            {formulaAbierta.descripcion && (
              <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginBottom: 14, color: 'var(--muted)' }}>{formulaAbierta.descripcion}</p>
            )}

            {(!formulaAbierta.ingredientes || formulaAbierta.ingredientes.length === 0) && !formulaAbierta.descripcion && (
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>Esta fórmula no tiene receta guardada todavía.</p>
            )}

            <div className="brow right">
              <button className="btn btn-s" onClick={() => setFormulaAbierta(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
