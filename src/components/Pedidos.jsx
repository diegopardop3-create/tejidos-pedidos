import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient'
import NuevoPedido from './NuevoPedido'
import ListaPedidos from './ListaPedidos'
import Entregados from './Entregados'
import Resumen from './Resumen'
import ListaPrecios from './ListaPrecios'
import Colores from './Colores'
import DetalleModal from './DetalleModal'
import ConfirmarEliminar from './ConfirmarEliminar'
import logo from '../assets/logo.png'
import './styles.css'

export default function Pedidos({ session }) {
  const [tab, setTab] = useState('nuevo')
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [detalleIdx, setDetalleIdx] = useState(null)
  const [editPedido, setEditPedido] = useState(null)
  const [toast, setToast] = useState(null)
  const [pedidoAEliminar, setPedidoAEliminar] = useState(null)
  // Solo la PRIMERA carga muestra "Cargando…". Las siguientes veces que se
  // vuelve a pedir la lista (después de marcar una celda, cambiar un estado,
  // guardar un abono, etc.) se actualiza en segundo plano: la tabla que ya
  // está en pantalla se queda visible y solo cambia cuando llegan los datos
  // nuevos, sin taparla con la pantalla de carga.
  const primeraCarga = useRef(true)
  const pedidosRef = useRef([])

  const showToast = useCallback((icon, msg) => {
    setToast({ icon, msg })
    setTimeout(() => setToast(null), 2800)
  }, [])

  const cargarPedidos = useCallback(async () => {
    if (primeraCarga.current) setLoading(true)
    const { data: pedidosData, error } = await supabase
      .from('pedidos')
      .select(`*, items_camiseta(id, pedido_id, tipos, precios, diseno, tabla, total_unidades, total_precio, estados, creado_en, colores), items_chaqueta(id, pedido_id, tipos, precios, diseno, tabla, total_unidades, kilos_reales, total_final, estados, creado_en, colores)`)
      .order('creado_en', { ascending: false })

    if (error) {
      showToast('⚠️', 'Error cargando pedidos: ' + error.message)
      setLoading(false)
      primeraCarga.current = false
      return
    }
    // Los abonos se traen en una consulta aparte (no anidada) y se suman por
    // pedido. Así la lista puede pintar la barra de % pagado sin tener que
    // abrir el panel de pagos. Si esta consulta falla, los pedidos igual se
    // muestran — solo quedarían sin barra, no se cae la pantalla.
    const { data: abonosData } = await supabase.from('abonos').select('pedido_id, monto')
    const abonadoPorPedido = {}
    for (const a of (abonosData || [])) {
      abonadoPorPedido[a.pedido_id] = (abonadoPorPedido[a.pedido_id] || 0) + (a.monto || 0)
    }

    // Conserva las fotos ya cargadas de pedidos abiertos (la lista no las trae).
    const fotosPrevias = {}
    for (const p of pedidosRef.current) for (const it of [...(p.items_camiseta || []), ...(p.items_chaqueta || [])]) if (it.fotosCargadas) fotosPrevias[it.id] = it.imagenes
    const conservar = (it) => (fotosPrevias[it.id] ? { ...it, imagenes: fotosPrevias[it.id], fotosCargadas: true } : it)
    setPedidos((pedidosData || []).map((p) => ({ ...p, items_camiseta: (p.items_camiseta || []).map(conservar), items_chaqueta: (p.items_chaqueta || []).map(conservar), total_abonado: abonadoPorPedido[p.id] || 0 })))
    setLoading(false)
    primeraCarga.current = false
  }, [showToast])

  // Cambia solo los campos indicados de UN pedido en la lista que ya está
  // en pantalla, sin pedir nada al servidor. Se usa para que cambiar un
  // estado o registrar un pago se vea al instante — el guardado real en
  // Supabase corre aparte; si falla, quien llamó a esto se encarga de
  // devolver el valor anterior con la misma función.
  const actualizarPedidoLocal = useCallback((id, cambios) => {
    setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, ...cambios } : p)))
  }, [])

  // Igual que arriba, pero para un ÍTEM dentro de un pedido (ej. los estados
  // de producción de una celda). Cambia solo ese ítem, dentro de la lista
  // camiseta o chaqueta que le corresponda, sin tocar nada más.
  const actualizarItemLocal = useCallback((pedidoId, itemId, esCamiseta, estados) => {
    setPedidos((prev) => prev.map((p) => {
      if (p.id !== pedidoId) return p
      const campo = esCamiseta ? 'items_camiseta' : 'items_chaqueta'
      return { ...p, [campo]: (p[campo] || []).map((it) => (it.id === itemId ? { ...it, estados } : it)) }
    }))
  }, [])

  // Las fotos NO viajan con la lista (pesan decenas de MB y hacían que la
  // consulta superara el límite de 8 s). Se piden solo del pedido que se abre
  // o se va a editar. Devuelve true si quedaron cargadas.
  const cargarFotos = useCallback(async (pedidoId) => {
    const [cam, chq] = await Promise.all([
      supabase.from('items_camiseta').select('id, imagenes').eq('pedido_id', pedidoId),
      supabase.from('items_chaqueta').select('id, imagenes').eq('pedido_id', pedidoId),
    ])
    if (cam.error || chq.error) return false
    const mapa = {}
    for (const r of [...(cam.data || []), ...(chq.data || [])]) mapa[r.id] = r.imagenes || []
    setPedidos((prev) => prev.map((p) => {
      if (p.id !== pedidoId) return p
      const conFotos = (it) => ({ ...it, imagenes: mapa[it.id] || [], fotosCargadas: true })
      return { ...p, items_camiseta: (p.items_camiseta || []).map(conFotos), items_chaqueta: (p.items_chaqueta || []).map(conFotos) }
    }))
    return true
  }, [])

  useEffect(() => {
    cargarPedidos()
  }, [cargarPedidos])

  async function handleCompartir(pedido) {
    const url = `${window.location.origin}${window.location.pathname}?pedido=${pedido.token_publico}`
    try {
      await navigator.clipboard.writeText(url)
      showToast('🔗', 'Enlace copiado — ya lo puedes enviar al cliente')
    } catch {
      prompt('Copia este enlace para enviarlo al cliente:', url)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  // Abre el detalle de un pedido a partir de su id (desde Resumen o Colores).
  function abrirPedidoPorId(id) {
    const i = pedidos.findIndex((p) => p.id === id)
    if (i < 0) return
    setDetalleIdx(i)
    cargarFotos(id)
  }

  pedidosRef.current = pedidos
  const nActivos = pedidos.filter((p) => p.estado !== 'Entregado').length
  const nEntregados = pedidos.length - nActivos
  const PESTANAS = [
    ['nuevo', <><span className="hnav-mas">+</span>Nuevo pedido</>],
    ['lista', <>Activos {!loading && <span className="hnav-n">{nActivos}</span>}</>],
    ['entregados', <>Entregados {!loading && <span className="hnav-n">{nEntregados}</span>}</>],
    ['resumen', 'Resumen'],
    ['precios', 'Precios'],
    ['colores', 'Colores'],
  ]

  return (
    <div className="app-root">
      <header className="hdr">
        <div className="hdr-in">
          <div className="hdr-fila">
            {/* Del logo completo se muestra solo el tejido con las agujas,
                recortado con background-position para que se lea en pequeño. */}
            <div className="hsello" style={{ backgroundImage: `url(${logo})` }} role="img" aria-label="Logo de L & L Tejidos y Confecciones" />
            <div className="hmarca">L &amp; L<small>Tejidos y Confecciones</small></div>
            <div className="huser">
              <span className="huser-mail">{session.user.email}</span>
              <button className="logout-btn" onClick={handleLogout}>Salir</button>
            </div>
          </div>
          <nav className="hnav" aria-label="Secciones">
            {PESTANAS.map(([id, txt]) => (
              <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{txt}</button>
            ))}
          </nav>
        </div>
      </header>

      <div className="wrap">
        {/* Se mantiene SIEMPRE montado (solo se esconde con display:none) en
            vez de crearlo y destruirlo con cada cambio de pestaña. Antes,
            cambiar a Activos u otra pestaña mientras se armaba un pedido
            nuevo borraba todo lo que llevabas — ahora el formulario sigue
            vivo en memoria y lo encuentras tal como lo dejaste. */}
        <div style={{ display: tab === 'nuevo' ? 'block' : 'none' }}>
          <NuevoPedido
            pedidos={pedidos}
            editPedido={editPedido}
            onSaved={() => {
              setEditPedido(null)
              cargarPedidos()
              setTab('lista')
              showToast('✅', 'Pedido guardado correctamente')
            }}
            onCancelEdit={() => setEditPedido(null)}
            showToast={showToast}
            userId={session.user.id}
          />
        </div>

        {tab === 'lista' && (
          <ListaPedidos
            pedidos={pedidos.filter(p => p.estado !== 'Entregado')}
            loading={loading}
            onVerDetalle={(idx) => {
              const p = pedidos.filter(p => p.estado !== 'Entregado')[idx]
              setDetalleIdx(pedidos.indexOf(p))
              cargarFotos(p.id)
            }}
            onCompartir={handleCompartir}
            refrescar={cargarPedidos}
            actualizarPedidoLocal={actualizarPedidoLocal}
            onEliminar={(pedido) => setPedidoAEliminar(pedido)}
            showToast={showToast}
            titulo="Pedidos Activos"
          />
        )}

        {tab === 'entregados' && (
          <Entregados
            pedidos={pedidos.filter((p) => p.estado === 'Entregado')}
            loading={loading}
            onVerDetalle={(p) => {
              setDetalleIdx(pedidos.indexOf(p))
              cargarFotos(p.id)
            }}
            onCompartir={handleCompartir}
            refrescar={cargarPedidos}
            actualizarPedidoLocal={actualizarPedidoLocal}
            onEliminar={(pedido) => setPedidoAEliminar(pedido)}
            showToast={showToast}
          />
        )}

        {tab === 'resumen' && (
          <Resumen
            pedidos={pedidos}
            showToast={showToast}
            actualizarPedidoLocal={actualizarPedidoLocal}
            onAbrirPedido={abrirPedidoPorId}
          />
        )}

        {tab === 'precios' && <ListaPrecios showToast={showToast} />}

        {tab === 'colores' && <Colores pedidos={pedidos} showToast={showToast} onAbrirPedido={abrirPedidoPorId} />}
      </div>

      {detalleIdx !== null && (
        <DetalleModal
          pedido={pedidos[detalleIdx]}
          onClose={() => setDetalleIdx(null)}
          onUpdated={cargarPedidos}
          actualizarPedidoLocal={actualizarPedidoLocal}
          actualizarItemLocal={actualizarItemLocal}
          onCompartir={handleCompartir}
          onEditar={async () => {
            // Editar borra y vuelve a insertar los ítems: si las fotos no
            // están cargadas se perderían. Por eso se esperan y, si fallan,
            // NO se abre la edición.
            const id = pedidos[detalleIdx].id
            const ok = await cargarFotos(id)
            if (!ok) { showToast('⚠️', 'No se pudieron cargar las fotos; intenta de nuevo'); return }
            setEditPedido(pedidosRef.current.find((p) => p.id === id))
            setDetalleIdx(null)
            setTab('nuevo')
          }}
          showToast={showToast}
        />
      )}

      {pedidoAEliminar && (
        <ConfirmarEliminar
          pedido={pedidoAEliminar}
          session={session}
          onCancel={() => setPedidoAEliminar(null)}
          onConfirmed={() => {
            setPedidoAEliminar(null)
            cargarPedidos()
          }}
          showToast={showToast}
        />
      )}

      {toast && (
        <div className="toast show">
          <span>{toast.icon}</span>
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  )
}
