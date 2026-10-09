import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { normalizar } from './hilos'
import { Ico } from './iconos'
import { ConoHilo } from './Movimiento'
import { datoDeFoto, shaDeDato, useCarpeta, useEnPantalla } from './fotosDisenos'
import MarcoDiseno from './MarcoDiseno'
import { raizVentanas, useAtrasCierra, useBloquearFondo } from './capas'

// ============================================
// ELEGIR DE MIS DISEÑOS
// ============================================
// La carpeta de diseños dentro del pedido que se está armando: se toca uno o
// varios y se agregan al ítem sin volver a subir la foto. La foto que se
// agrega es idéntica a la original, así que en la galería sigue siendo un
// solo diseño y suma este pedido a la lista de pedidos donde se usó.
//   actuales: fotos que el ítem ya tiene (se ven como "Ya está")
//   onElegir(fotos): las fotos escogidas, listas para el ítem
export default function ElegirDiseno({ pedidos, actuales, onElegir, onCerrar, showToast }) {
  const car = useCarpeta(pedidos)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState([]) // en el orden en que se tocaron
  const [ya, setYa] = useState(() => new Set()) // huellas de las fotos que el ítem ya tiene
  const [agregando, setAgregando] = useState(false)
  const cerrado = useRef(false)
  const cerrarBtnRef = useRef(null)
  const cerrarRef = useRef(null)
  const soltarHistoria = useAtrasCierra('llElegir', () => cerrarRef.current(true))
  useBloquearFondo(cerrarBtnRef)

  function cerrar(desdeHistoria = false) {
    if (cerrado.current) return
    cerrado.current = true
    if (!desdeHistoria) soltarHistoria()
    onCerrar()
  }
  cerrarRef.current = cerrar

  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') { e.preventDefault(); cerrarRef.current() } }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  // Qué fotos ya tiene el ítem, para no agregarlas dos veces.
  useEffect(() => {
    let vivo = true
    Promise.all((actuales || []).map((s) => shaDeDato(s).catch(() => null)))
      .then((l) => { if (vivo) setYa(new Set(l.filter(Boolean))) })
    return () => { vivo = false }
  }, [actuales])

  const yaEsta = (d) => d.shas.some((s) => ya.has(s))
  const partes = normalizar(q).split(/\s+/).filter(Boolean)
  const lista = partes.length ? car.disenos.filter((d) => partes.every((p) => d.busca.includes(p))) : car.disenos
  const faltan = car.total - car.listos - car.errores

  function tocar(d) {
    if (yaEsta(d) || agregando) return
    setSel((s) => (s.includes(d.key) ? s.filter((k) => k !== d.key) : [...s, d.key]))
  }

  async function agregar() {
    if (!sel.length || agregando || cerrado.current) return
    setAgregando(true)
    try {
      const elegidos = sel.map((k) => car.disenos.find((d) => d.key === k)).filter(Boolean)
      const fotos = []
      for (const d of elegidos) fotos.push(await datoDeFoto(d.rep.id, d.rep.tabla, d.rep.idx))
      if (cerrado.current) return
      cerrado.current = true
      soltarHistoria()
      onElegir(fotos)
    } catch {
      setAgregando(false)
      showToast?.('⚠️', 'No se pudo traer la foto; revisa la conexión')
    }
  }

  const ventana = (
    <div className="el-capa" onClick={(e) => { if (e.target === e.currentTarget) cerrar() }}>
      <div className="el-panel" role="dialog" aria-modal="true" aria-labelledby="el-titulo">
        <div className="el-cab">
          <div>
            <h2 id="el-titulo">Mis diseños</h2>
            <p>Toca los que quieras usar en este ítem.</p>
          </div>
          <button ref={cerrarBtnRef} type="button" className="lp-ico" onClick={() => cerrar()} aria-label="Cerrar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <label className="lp-buscar el-buscar">
          {Ico.buscar}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente, pedido, color o referencia" />
        </label>
        <div className="el-cuerpo">
          {faltan > 0 && car.disenos.length > 0 && (
            <p className="el-avance" role="status">Revisando fotos… {car.listos} de {car.total}</p>
          )}
          {car.cargando || (!car.disenos.length && faltan > 0) ? (
            <div className="empty"><ConoHilo /><p>Abriendo la carpeta…</p></div>
          ) : !lista.length ? (
            <div className="empty">
              <ConoHilo girando={false} />
              <p>{car.disenos.length ? 'Ningún diseño coincide con la búsqueda' : car.errores ? 'No se pudo abrir la carpeta. Revisa la conexión.' : 'Todavía no hay diseños con foto'}</p>
            </div>
          ) : (
            <div className="el-rejilla">
              {lista.map((d) => (
                <Opcion key={d.key} d={d} elegido={sel.includes(d.key)} ya={yaEsta(d)} onTocar={() => tocar(d)} />
              ))}
            </div>
          )}
        </div>
        <div className="el-pie">
          <button type="button" className="btn btn-s" onClick={() => cerrar()}>Cancelar</button>
          <button type="button" className="btn btn-p" disabled={!sel.length || agregando} onClick={agregar}>
            {agregando ? 'Agregando…' : `Agregar${sel.length ? ` (${sel.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
  return createPortal(ventana, raizVentanas())
}

function Opcion({ d, elegido, ya, onTocar }) {
  const ref = useRef(null)
  const visto = useEnPantalla(ref)
  const n = d.usos.length
  const u = d.ultimo
  return (
    <button
      ref={ref}
      type="button"
      className={`el-op${elegido ? ' elegido' : ''}${ya ? ' ya' : ''}`}
      onClick={onTocar}
      disabled={ya}
      aria-pressed={elegido}
      aria-label={`Diseño de ${d.clientes.join(', ') || 'sin cliente'}${ya ? ', ya está en este ítem' : ''}`}
    >
      <MarcoDiseno d={d} visto={visto}>
        {(elegido || ya) && <span className="el-marca" aria-hidden="true">{ya ? 'Ya está' : '✓'}</span>}
      </MarcoDiseno>
      <span className="el-op-pie">
        <b>{d.clientes.length > 1 ? `${u.pedido.cliente} y otros` : (u.pedido.cliente || 'Sin cliente')}</b>
        <span>{n > 1 ? `${n} pedidos` : u.pedido.numero}</span>
      </span>
    </button>
  )
}
