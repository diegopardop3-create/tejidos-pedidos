import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../supabaseClient'

// Editor reutilizable de los ingredientes de una fórmula.
// Cada ingrediente es uno de dos tipos:
//   - tipo 'poliester': { tipo:'poliester', codigo:'A-003', nombre:'Azul', cantidad:'2 cabos' }
//   - tipo 'manual'   : { tipo:'manual', texto:'Hilo negro', cantidad:'1 cabo' }
// El poliéster se elige de la Carta de colores (tabla conos) con un buscador
// que filtra por código o nombre. El hilo (u otros) se escribe a mano.
//
// Props:
//   valor: array de ingredientes
//   onChange: (nuevoArray) => void
export default function EditorIngredientes({ valor = [], onChange }) {
  const [conos, setConos] = useState([])
  const [buscando, setBuscando] = useState('')
  const [mostrarLista, setMostrarLista] = useState(false)
  const [cantidadPend, setCantidadPend] = useState('')
  const cajaRef = useRef(null)

  useEffect(() => {
    // Trae todos los conos, incluidos agotados (para repetir fórmulas viejas).
    supabase.from('conos').select('codigo, nombre, estado').then(({ data }) => setConos(data || []))
  }, [])

  useEffect(() => {
    function fuera(e) { if (cajaRef.current && !cajaRef.current.contains(e.target)) setMostrarLista(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [])

  const coincidencias = useMemo(() => {
    const q = buscando.toLowerCase().trim()
    if (!q) return conos.slice(0, 30)
    return conos.filter((c) =>
      (c.codigo || '').toLowerCase().includes(q) || (c.nombre || '').toLowerCase().includes(q)
    ).slice(0, 30)
  }, [buscando, conos])

  function agregarPoliester(cono) {
    const nuevo = { tipo: 'poliester', codigo: cono.codigo, nombre: cono.nombre, cantidad: cantidadPend.trim() }
    onChange([...(valor || []), nuevo])
    setBuscando(''); setCantidadPend(''); setMostrarLista(false)
  }

  const [manualTexto, setManualTexto] = useState('')
  const [manualCant, setManualCant] = useState('')
  function agregarManual() {
    if (!manualTexto.trim()) return
    const nuevo = { tipo: 'manual', texto: manualTexto.trim(), cantidad: manualCant.trim() }
    onChange([...(valor || []), nuevo])
    setManualTexto(''); setManualCant('')
  }

  function quitar(i) {
    onChange(valor.filter((_, idx) => idx !== i))
  }

  return (
    <div>
      {/* Lista de ingredientes ya agregados */}
      {(valor || []).length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {valor.map((ing, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--ink)', borderRadius: 6, marginBottom: 5 }}>
              {ing.tipo === 'poliester' ? (
                <>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800, color: 'var(--thread)', fontSize: 12 }}>{ing.codigo}</span>
                  <span style={{ fontSize: 12, flex: 1 }}>{ing.nombre}</span>
                </>
              ) : (
                <span style={{ fontSize: 12, flex: 1 }}>🧵 {ing.texto}</span>
              )}
              {ing.cantidad && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{ing.cantidad}</span>}
              <button type="button" onClick={() => quitar(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c0392b', fontSize: 14 }} title="Quitar">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Agregar poliéster desde la Carta */}
      <div ref={cajaRef} style={{ position: 'relative', marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>Poliéster (de la Carta de colores)</div>
        <div className="brow" style={{ gap: 6 }}>
          <input
            type="text"
            value={buscando}
            onChange={(e) => { setBuscando(e.target.value); setMostrarLista(true) }}
            onFocus={() => setMostrarLista(true)}
            placeholder="🔍 Buscar código o color…"
            style={{ flex: '2 1 160px', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13 }}
          />
          <input
            type="text"
            value={cantidadPend}
            onChange={(e) => setCantidadPend(e.target.value)}
            placeholder="cantidad (ej. 2 cabos)"
            style={{ flex: '1 1 110px', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13 }}
          />
        </div>
        {mostrarLista && coincidencias.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, maxHeight: 220, overflowY: 'auto', boxShadow: '0 6px 20px rgba(0,0,0,.12)' }}>
            {coincidencias.map((c) => (
              <button
                key={c.codigo}
                type="button"
                onClick={() => agregarPoliester(c)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
              >
                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800, color: 'var(--thread)', fontSize: 12, minWidth: 48 }}>{c.codigo}</span>
                <span style={{ fontSize: 12, flex: 1 }}>{c.nombre}</span>
                {c.estado === 'agotado' && <span style={{ fontSize: 9, color: '#b23', fontWeight: 700 }}>AGOTADO</span>}
              </button>
            ))}
          </div>
        )}
        {mostrarLista && buscando && coincidencias.length === 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, padding: '10px', fontSize: 12, color: 'var(--muted)' }}>
            Ningún código coincide. Agrégalo primero en la Carta de colores.
          </div>
        )}
      </div>

      {/* Agregar manual (hilo u otros) */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>Hilo u otro (a mano)</div>
        <div className="brow" style={{ gap: 6 }}>
          <input
            type="text"
            value={manualTexto}
            onChange={(e) => setManualTexto(e.target.value)}
            placeholder="Ej: Hilo negro"
            style={{ flex: '2 1 160px', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13 }}
          />
          <input
            type="text"
            value={manualCant}
            onChange={(e) => setManualCant(e.target.value)}
            placeholder="cantidad"
            style={{ flex: '1 1 110px', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13 }}
          />
          <button type="button" className="btn btn-s btn-sm" onClick={agregarManual}>+ Agregar</button>
        </div>
      </div>
    </div>
  )
}
