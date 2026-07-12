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
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    setCargando(true)
    // Traemos los pedidos con los colores de sus ítems.
    const { data: pedidos, error } = await supabase
      .from('pedidos')
      .select('id, numero, fecha, items_camiseta(colores), items_chaqueta(colores)')
      .order('fecha', { ascending: false })

    if (error) { setCargando(false); return }

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
      .map(([colorNombre, pedidos]) => ({
        colorNombre,
        segmentos: segmentosColor(colorNombre),
        // palabras individuales normalizadas, para buscar por palabra suelta
        palabras: colorNombre.split('-').map((s) => normalizar(s)),
        completo: normalizar(colorNombre.replace(/\s+/g, '')),
        pedidos: pedidos.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')),
      }))
      .sort((a, b) => a.colorNombre.localeCompare(b.colorNombre))

    setIndice(lista)
    setCargando(false)
  }

  const resultados = useMemo(() => {
    const bruto = busqueda.trim()
    if (!bruto) return indice
    const tienGuion = bruto.includes('-')

    if (tienGuion) {
      // Búsqueda por COMBINACIÓN: "camel-negro" debe encajar contra el nombre
      // completo, no traer todo lo que comparta "negro".
      const q = normalizar(bruto.replace(/\s+/g, ''))
      return indice.filter((item) => item.completo.includes(q))
    }

    // Búsqueda por PALABRA suelta: "camel" encuentra cualquier color cuyo
    // nombre contenga esa palabra (Camel-Negro, Camel-Blanco, etc.).
    const qPalabra = normalizar(bruto)
    return indice.filter((item) =>
      item.palabras.some((pal) => pal.includes(qPalabra)) || item.completo.includes(qPalabra)
    )
  }, [busqueda, indice])

  return (
    <>
      {/* Sub-pestañas dentro de Colores: buscar color→pedido, o catálogo de conos */}
      <div className="brow" style={{ gap: 8, marginBottom: 14 }}>
        <button className={`btn ${seccion === 'buscar' ? 'btn-p' : 'btn-s'}`} onClick={() => setSeccion('buscar')}>
          🔍 Buscar color → pedido
        </button>
        <button className={`btn ${seccion === 'conos' ? 'btn-p' : 'btn-s'}`} onClick={() => setSeccion('conos')}>
          🎨 Carta de colores
        </button>
      </div>

      {seccion === 'conos' ? (
        <CatalogoConos showToast={showToast} />
      ) : (
    <div className="card">
      <div className="ctitle">🎨 Buscador de colores</div>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
        Escribe un color (ej. <strong>camel</strong>) para ver en qué pedidos se usó.
        Encuentra tanto por palabra suelta como por combinación completa. Con el número
        de pedido puedes ir a buscar la bolsita física de muestras.
      </p>

      <div className="fld" style={{ marginBottom: 16 }}>
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="🔍 Buscar color… (ej. camel, azul, negro)"
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
          Ningún color coincide con "<strong>{busqueda}</strong>".
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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {item.pedidos.map((p, i) => (
                  <div key={i} style={{ background: 'var(--ink)', borderRadius: 7, padding: '5px 11px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800, color: 'var(--thread)', fontSize: 13 }}>{p.numero}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtFecha(p.fecha)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
      )}
    </>
  )
}
