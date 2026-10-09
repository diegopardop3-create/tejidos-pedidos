import { useEffect, useMemo, useRef, useState } from 'react'
import { MESES, TIPO_LABEL } from './constants'
import { normalizar } from './hilos'
import { Ico } from './iconos'
import { ConoHilo, useIndicador } from './Movimiento'
import { consultarIdsConFotos, idsConFotosConocidos, podarGuardados, reintentar, useDiseno, useEnPantalla } from './fotosDisenos'
import VisorDisenos from './VisorDisenos'

// ============================================
// DISEÑOS
// ============================================
// Todas las fotos de los pedidos en un solo lugar, del más reciente al más
// antiguo y agrupadas por mes. Cada tarjeta es un diseño (un ítem de un
// pedido); al tocarla se abre en grande con todas sus fotos, y desde ahí se
// puede pasar al siguiente o abrir el pedido. Aquí no se repiten precios ni
// cantidades: eso sigue estando solo en el pedido.

const PRENDAS = [['', 'Todos'], ['cam', 'Camiseta'], ['chaq', 'Chaqueta']]
const claveMes = (f) => String(f || '').slice(0, 7)
function nombreMes(k) {
  if (!k) return 'Sin fecha'
  const [y, m] = k.split('-').map(Number)
  return `${MESES[m - 1]} ${y}`
}
const porCreacion = (a, b) => String(a.creado_en || '').localeCompare(String(b.creado_en || ''))

export default function Disenos({ pedidos, loading, onAbrirPedido }) {
  // undefined = todavía no se sabe; null = no se pudo saber (se revisa cada
  // ítem); Set = los id de los ítems que tienen fotos.
  const [conFotos, setConFotos] = useState(() => idsConFotosConocidos() || undefined)
  const [busqueda, setBusqueda] = useState('')
  const [prenda, setPrenda] = useState('')
  const [visor, setVisor] = useState(null) // { lista, di }
  const segRef = useIndicador(prenda)

  useEffect(() => {
    let vivo = true
    let t = 0
    consultarIdsConFotos().then((ids) => {
      if (!vivo) return
      if (ids) {
        setConFotos(ids)
        // Limpia lo guardado de diseños que ya no existen, sin apuro.
        t = window.setTimeout(() => podarGuardados(ids), 4000)
      } else {
        setConFotos((v) => (v === undefined ? null : v))
      }
    })
    return () => { vivo = false; window.clearTimeout(t) }
  }, [])

  const disenos = useMemo(() => {
    if (conFotos === undefined) return []
    const out = []
    for (const p of pedidos) {
      const poner = (items, tabla, pr) => {
        for (const it of [...(items || [])].sort(porCreacion)) {
          if (conFotos && !conFotos.has(String(it.id))) continue
          const tipos = (it.tipos || []).map((t) => TIPO_LABEL[t] || t).join(' · ')
          const ref = String(it.diseno || '').trim()
          out.push({
            id: String(it.id), tabla, prenda: pr, pedido: p, it, tipos, ref,
            busca: normalizar([p.cliente, p.numero, ref, tipos, pr === 'cam' ? 'camiseta' : 'chaqueta', ...(it.colores || [])].join(' ')),
          })
        }
      }
      poner(p.items_camiseta, 'items_camiseta', 'cam')
      poner(p.items_chaqueta, 'items_chaqueta', 'chaq')
    }
    // Lo más reciente primero; dentro de un pedido, en el orden en que se
    // agregaron los ítems (el orden se conserva al ordenar).
    return out.sort((a, b) => String(b.pedido.fecha || '').localeCompare(String(a.pedido.fecha || ''))
      || String(b.pedido.numero || '').localeCompare(String(a.pedido.numero || ''), 'es', { numeric: true }))
  }, [pedidos, conFotos])

  const partes = normalizar(busqueda).split(/\s+/).filter(Boolean)
  const coinciden = partes.length ? disenos.filter((d) => partes.every((p) => d.busca.includes(p))) : disenos
  const cuenta = { '': coinciden.length, cam: 0, chaq: 0 }
  for (const d of coinciden) cuenta[d.prenda]++
  const visibles = prenda ? coinciden.filter((d) => d.prenda === prenda) : coinciden
  const grupos = []
  for (const d of visibles) {
    const k = claveMes(d.pedido.fecha)
    if (!grupos.length || grupos[grupos.length - 1].k !== k) grupos.push({ k, items: [] })
    grupos[grupos.length - 1].items.push(d)
  }

  const cargando = loading || conFotos === undefined

  return (
    <div className="dz">
      <div className="lp-cab">
        <div>
          <h1>Diseños</h1>
          <p>Las fotos de todos los pedidos, del más reciente al más antiguo.</p>
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

      {cargando ? (
        <div className="empty"><ConoHilo /><p>Buscando las fotos…</p></div>
      ) : !visibles.length ? (
        <div className="empty">
          <ConoHilo girando={false} />
          <p>{disenos.length ? 'Ningún diseño coincide con la búsqueda' : 'Todavía no hay fotos en los pedidos'}</p>
        </div>
      ) : grupos.map((g) => (
        <section key={g.k} className="dz-grupo">
          <h2 className="dz-mes"><span>{nombreMes(g.k)}</span><span className="dz-mes-n">{g.items.length}</span></h2>
          <div className="dz-rejilla">
            {g.items.map((d) => (
              <Tarjeta key={d.id} d={d} revisar={conFotos === null} onAbrir={() => setVisor({ lista: visibles, di: visibles.indexOf(d) })} />
            ))}
          </div>
        </section>
      ))}

      {visor && (
        <VisorDisenos
          lista={visor.lista}
          inicio={visor.di}
          onCerrar={() => setVisor(null)}
          onVerPedido={onAbrirPedido}
        />
      )}
    </div>
  )
}

// Un diseño en la cuadrícula: su primera foto, el cliente y el pedido.
// Pide sus fotos solo cuando está en pantalla o a punto de aparecer.
function Tarjeta({ d, revisar, onAbrir }) {
  const ref = useRef(null)
  const visto = useEnPantalla(ref)
  const f = useDiseno(d.id, d.tabla, visto)
  const [img, setImg] = useState('') // '' cargando | 'lista' | 'rota'
  const mini = f.minis[0]
  const vacia = f.estado === 'listo' && !f.n

  // Sin la lista de ítems con fotos, los que resultan no tener se esconden.
  if (revisar && vacia) return null

  const error = f.estado === 'error'
  const aviso = error ? <>No cargó<br />Toca para reintentar</> : vacia ? 'Sin fotos' : img === 'rota' ? 'No se puede mostrar' : null
  return (
    <button
      ref={ref}
      type="button"
      className="dz-tarj"
      data-id={d.id}
      onClick={() => (error ? reintentar(d.id) : onAbrir())}
      aria-label={`Diseño de ${d.pedido.cliente}, pedido ${d.pedido.numero}${f.n > 1 ? `, ${f.n} fotos` : ''}`}
    >
      <span className={`dz-marco${img === 'lista' ? ' lista' : ''}${aviso ? ' error' : ''}`}>
        {mini && <img src={mini} alt="" draggable={false} decoding="async" onLoad={() => setImg('lista')} onError={() => setImg('rota')} />}
        {f.n > 1 && <span className="dz-n" aria-hidden="true">{IcoFotos}{f.n}</span>}
        {aviso && <span className="dz-err">{aviso}</span>}
      </span>
      <span className="dz-pie">
        <span className="dz-l1"><b>{d.pedido.cliente}</b><span className="dz-num">{d.pedido.numero}</span></span>
        <span className="dz-l2"><i className={`dz-punto ${d.prenda}`} />{[d.tipos, d.ref].filter(Boolean).join(' · ')}</span>
      </span>
    </button>
  )
}

const IcoFotos = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
    <rect x="7" y="7" width="14" height="14" rx="2.5" />
    <path d="M3 16V5a2 2 0 0 1 2-2h11" />
  </svg>
)
