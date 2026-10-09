import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Ico } from './iconos'
import VistaFormulas from './VistaFormulas'
import VistaHilos from './VistaHilos'
import { lineasDe } from './hilos'

// ============================================
// COLORES
// ============================================
// Dos vistas que se apuntan entre sí:
//  - Fórmulas: cómo se saca cada color de pedido, con sus hilos (paso por el
//    guiahilo y cabos) y los pedidos donde se eligió.
//  - Hilos: la carta de conos, cada uno con marca, número, color, material,
//    proveedor y estado, y las fórmulas donde se usa.
// Tocar un hilo en una fórmula abre su ficha, y al revés. Si un hilo se marca
// agotado, todas sus fórmulas quedan marcadas.

const VISTA_KEY = 'tejidos_colores_vista'
function leerVista() {
  try { return localStorage.getItem(VISTA_KEY) === 'hilos' ? 'hilos' : 'formulas' } catch { return 'formulas' }
}

export default function Colores({ pedidos, showToast, onAbrirPedido }) {
  const [hilos, setHilos] = useState([])
  const [formulas, setFormulas] = useState([])
  const [usos, setUsos] = useState([]) // filas de pedido_color_formula: { formula_id, pedido_id }
  const [cargando, setCargando] = useState(true)
  const [vista, setVistaEstado] = useState(leerVista)
  const [selFormula, setSelFormula] = useState(null)
  const [selHilo, setSelHilo] = useState(null)
  const [nuevo, setNuevo] = useState(false)

  function setVista(v) {
    setVistaEstado(v)
    setNuevo(false)
    try { localStorage.setItem(VISTA_KEY, v) } catch { /* sin almacenamiento: no pasa nada */ }
  }

  useEffect(() => {
    let vivo = true
    Promise.all([
      supabase.from('conos').select('*'),
      supabase.from('formulas_color').select('*'),
      supabase.from('pedido_color_formula').select('formula_id, pedido_id'),
    ]).then(([h, f, u]) => {
      if (!vivo) return
      if (h.error || f.error || u.error) showToast('⚠️', 'No se pudieron cargar los colores')
      setHilos(h.data || [])
      setFormulas(f.data || [])
      setUsos(u.data || [])
      setCargando(false)
    })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hilosPorId = useMemo(() => new Map(hilos.map((h) => [h.id, h])), [hilos])
  const pedidosPorId = useMemo(() => new Map((pedidos || []).map((p) => [p.id, p])), [pedidos])

  // Fórmula -> pedidos donde se eligió (sin repetir, el más reciente primero).
  const pedidosDeFormula = useMemo(() => {
    const m = new Map()
    for (const u of usos) {
      const p = u.formula_id && pedidosPorId.get(u.pedido_id)
      if (!p) continue
      if (!m.has(u.formula_id)) m.set(u.formula_id, new Map())
      m.get(u.formula_id).set(p.id, p)
    }
    const out = new Map()
    for (const [id, ps] of m) out.set(id, [...ps.values()].sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || ''))))
    return out
  }, [usos, pedidosPorId])

  // Hilo -> fórmulas que lo usan.
  const formulasDeHilo = useMemo(() => {
    const m = new Map()
    for (const f of formulas) {
      for (const id of new Set((lineasDe(f) || []).map((l) => l.cono_id))) {
        if (!m.has(id)) m.set(id, [])
        m.get(id).push(f)
      }
    }
    return m
  }, [formulas])

  const verHilo = (id) => { setVista('hilos'); setSelHilo(id); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const verFormula = (id) => { setVista('formulas'); setSelFormula(id); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  return (
    <div className="co">
      <div className="lp-cab">
        <div>
          <h1>Colores</h1>
          <p>{vista === 'formulas' ? 'Cómo se saca cada color: hilos, paso por el guiahilo y cabos.' : 'La carta de hilos: marca, número, color y estado de cada cono.'}</p>
        </div>
        <div className="co-cab-acc">
          <div className="lp-seg co-vistas" role="group" aria-label="Vista">
            <button className={vista === 'formulas' ? 'on' : ''} onClick={() => setVista('formulas')}>Fórmulas <span>{formulas.length}</span></button>
            <button className={vista === 'hilos' ? 'on' : ''} onClick={() => setVista('hilos')}>Hilos <span>{hilos.length}</span></button>
          </div>
          <button className="btn btn-p pr-nuevo" onClick={() => setNuevo(!nuevo)}>{Ico.mas}{vista === 'formulas' ? 'Nueva fórmula' : 'Nuevo hilo'}</button>
        </div>
      </div>

      {vista === 'formulas' ? (
        <VistaFormulas
          formulas={formulas} setFormulas={setFormulas}
          hilos={hilos} setHilos={setHilos} hilosPorId={hilosPorId}
          pedidosDeFormula={pedidosDeFormula}
          sel={selFormula} setSel={setSelFormula}
          nuevo={nuevo} setNuevo={setNuevo}
          onVerHilo={verHilo} onAbrirPedido={onAbrirPedido}
          cargando={cargando} showToast={showToast}
        />
      ) : (
        <VistaHilos
          hilos={hilos} setHilos={setHilos} hilosPorId={hilosPorId}
          formulasDeHilo={formulasDeHilo}
          sel={selHilo} setSel={setSelHilo}
          nuevo={nuevo} setNuevo={setNuevo}
          onVerFormula={verFormula}
          cargando={cargando} showToast={showToast}
        />
      )}
    </div>
  )
}
