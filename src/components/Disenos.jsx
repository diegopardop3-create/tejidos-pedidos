import { useEffect, useRef, useState } from 'react'
import { MESES } from './constants'
import { normalizar } from './hilos'
import { Ico } from './iconos'
import { ConoHilo, useIndicador } from './Movimiento'
import { reintentarErrores, useCarpeta, useEnPantalla } from './fotosDisenos'
import MarcoDiseno from './MarcoDiseno'
import VisorDisenos from './VisorDisenos'

// ============================================
// DISEÑOS
// ============================================
// La carpeta con las fotos de todos los pedidos. Cada diseño aparece una sola
// vez aunque la misma foto se haya subido en varios pedidos, y dice en
// cuáles se usó. Van del más usado recientemente al más viejo, por mes. Al
// tocar uno se abre en grande; desde ahí se pasa al siguiente, se abre un
// pedido o se manda la foto por WhatsApp. Aquí no se repiten precios ni
// cantidades: eso sigue estando solo en el pedido.

const PRENDAS = [['', 'Todos'], ['cam', 'Camiseta'], ['chaq', 'Chaqueta']]
const claveMes = (f) => String(f || '').slice(0, 7)
function nombreMes(k) {
  if (!k) return 'Sin fecha'
  const [y, m] = k.split('-').map(Number)
  return `${MESES[m - 1]} ${y}`
}

// true cuando la condición lleva un rato cumpliéndose (para no hacer
// parpadear avisos que duran un instante).
function useTras(cond, ms) {
  const [si, setSi] = useState(false)
  useEffect(() => {
    if (!cond) { setSi(false); return undefined }
    const t = window.setTimeout(() => setSi(true), ms)
    return () => window.clearTimeout(t)
  }, [cond, ms])
  return cond && si
}

export default function Disenos({ pedidos, loading, onAbrirPedido, showToast }) {
  const car = useCarpeta(pedidos)
  const [busqueda, setBusqueda] = useState('')
  const [prenda, setPrenda] = useState('')
  const [visor, setVisor] = useState(null) // key del diseño abierto en grande
  const segRef = useIndicador(prenda)

  const partes = normalizar(busqueda).split(/\s+/).filter(Boolean)
  const coinciden = partes.length ? car.disenos.filter((d) => partes.every((p) => d.busca.includes(p))) : car.disenos
  const cuenta = { '': coinciden.length, cam: 0, chaq: 0 }
  for (const d of coinciden) for (const p of d.prendas) cuenta[p]++
  const visibles = prenda ? coinciden.filter((d) => d.prendas.has(prenda)) : coinciden
  const meses = []
  for (const d of visibles) {
    const k = claveMes(d.ultimo.pedido.fecha)
    if (!meses.length || meses[meses.length - 1].k !== k) meses.push({ k, items: [] })
    meses[meses.length - 1].items.push(d)
  }

  const faltan = car.total - car.listos - car.errores // ítems todavía por revisar
  const repetidas = car.fotos - car.disenos.length
  const cargando = loading || car.cargando || (!car.disenos.length && faltan > 0)
  const mostrarAvance = useTras(faltan > 0 && !cargando, 700)

  return (
    <div className="dz">
      <div className="lp-cab">
        <div>
          <h1>Diseños</h1>
          <p>
            Cada diseño aparece una sola vez, con los pedidos donde se usó.
            {!faltan && repetidas > 0 && <span className="dz-juntadas"> {repetidas} {repetidas === 1 ? 'foto repetida juntada' : 'fotos repetidas juntadas'}.</span>}
          </p>
        </div>
        <div className="lp-seg con-pildora dz-prendas" role="group" aria-label="Prenda" ref={segRef}>
          <span className="indicador seg-pildora" aria-hidden="true" />
          {PRENDAS.map(([k, txt]) => (
            <button key={k || 'todos'} className={prenda === k ? 'on' : ''} aria-pressed={prenda === k} onClick={() => setPrenda(k)}>
              {txt}{!cargando && <span>{cuenta[k]}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="lp-filtros">
        <label className="lp-buscar">
          {Ico.buscar}
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar cliente, pedido, color o referencia" />
        </label>
      </div>

      {mostrarAvance && (
        <div className="dz-avance" role="status">
          <span>Revisando fotos repetidas… {car.listos} de {car.total}</span>
          <i><b style={{ width: `${Math.round((car.listos / Math.max(1, car.total)) * 100)}%` }} /></i>
        </div>
      )}
      {!faltan && car.errores > 0 && (
        <div className="dz-aviso" role="status">
          No se pudieron revisar {car.errores === 1 ? '1 pedido' : `${car.errores} pedidos`}: revisa la conexión.
          <button type="button" className="btn btn-s btn-sm" onClick={reintentarErrores}>Reintentar</button>
        </div>
      )}

      {cargando ? (
        <div className="empty"><ConoHilo /><p>Buscando las fotos…</p></div>
      ) : !visibles.length ? (
        <div className="empty">
          <ConoHilo girando={false} />
          <p>{car.disenos.length ? 'Ningún diseño coincide con la búsqueda' : 'Todavía no hay fotos en los pedidos'}</p>
        </div>
      ) : meses.map((m) => (
        <section key={m.k} className="dz-grupo">
          <h2 className="dz-mes"><span>{nombreMes(m.k)}</span><span className="dz-mes-n">{m.items.length}</span></h2>
          <div className="dz-rejilla">
            {m.items.map((d) => (
              <Tarjeta key={d.key} d={d} onAbrir={() => setVisor(d.key)} />
            ))}
          </div>
        </section>
      ))}

      {visor && visibles.length > 0 && (
        <VisorDisenos
          lista={visibles}
          inicio={visor}
          onCerrar={() => setVisor(null)}
          onVerPedido={onAbrirPedido}
          showToast={showToast}
        />
      )}
    </div>
  )
}

// Un diseño en la cuadrícula: su foto, el cliente y el último pedido donde se
// usó; si se usó en varios, cuántos.
function Tarjeta({ d, onAbrir }) {
  const ref = useRef(null)
  const visto = useEnPantalla(ref)
  const n = d.usos.length
  const u = d.ultimo
  const cliente = d.clientes.length > 1 ? `${u.pedido.cliente} y otros` : (u.pedido.cliente || 'Sin cliente')
  return (
    <button
      ref={ref}
      type="button"
      className="dz-tarj"
      data-id={d.key}
      onClick={onAbrir}
      aria-label={`Diseño de ${d.clientes.join(', ') || 'sin cliente'}, ${n > 1 ? `usado en ${n} pedidos` : `pedido ${u.pedido.numero}`}`}
    >
      <MarcoDiseno d={d} visto={visto}>
        {n > 1 && <span className="dz-n" aria-hidden="true">{IcoVarios}{n} pedidos</span>}
      </MarcoDiseno>
      <span className="dz-pie">
        <span className="dz-l1"><b>{cliente}</b><span className="dz-num">{u.pedido.numero}</span></span>
        <span className="dz-l2"><i className={`dz-punto ${u.prenda}`} />{[d.tipos, d.ref].filter(Boolean).join(' · ')}</span>
      </span>
    </button>
  )
}

const IcoVarios = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
    <rect x="7" y="7" width="14" height="14" rx="2.5" />
    <path d="M3 16V5a2 2 0 0 1 2-2h11" />
  </svg>
)
