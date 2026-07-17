import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import NuevoPedido from './NuevoPedido'
import ListaPedidos from './ListaPedidos'
import Resumen from './Resumen'
import ListaPrecios from './ListaPrecios'
import BuscadorColores from './BuscadorColores'
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

  const showToast = useCallback((icon, msg) => {
    setToast({ icon, msg })
    setTimeout(() => setToast(null), 2800)
  }, [])

  const cargarPedidos = useCallback(async () => {
    setLoading(true)
    const { data: pedidosData, error } = await supabase
      .from('pedidos')
      .select('*, items_camiseta(*), items_chaqueta(*)')
      .order('creado_en', { ascending: false })

    if (error) {
      showToast('⚠️', 'Error cargando pedidos: ' + error.message)
      setLoading(false)
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

    setPedidos((pedidosData || []).map((p) => ({ ...p, total_abonado: abonadoPorPedido[p.id] || 0 })))
    setLoading(false)
  }, [showToast])

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

  const totalPedidos = pedidos.length
  const totalPendientes = pedidos.filter((p) => p.estado === 'Pendiente').length

  return (
    <div className="app-root">
      <header className="hdr">
        <div className="hbrand">
          <img src={logo} alt="L&L Tejidos y Confecciones" className="hlogo" />
          <div>
            <div className="htitle">Tejidos y Confecciones Laura Lizeth</div>
            <div className="hsub">GESTIÓN DE PRODUCCIÓN</div>
          </div>
        </div>
        <div className="hstats">
          <div className="hst"><strong>{totalPedidos}</strong> pedidos</div>
          <div className="hst"><strong>{totalPendientes}</strong> pendientes</div>
          <div className="huser">
            <span>{session.user.email}</span>
            <button className="logout-btn" onClick={handleLogout}>Salir</button>
          </div>
        </div>
      </header>

      <div className="wrap">
        <div className="tabs">
          <button className={`tab ${tab === 'nuevo' ? 'on' : ''}`} onClick={() => setTab('nuevo')}>
            ＋ Nuevo Pedido
          </button>
          <button className={`tab ${tab === 'lista' ? 'on' : ''}`} onClick={() => setTab('lista')}>
            📋 Activos
          </button>
          <button className={`tab ${tab === 'entregados' ? 'on' : ''}`} onClick={() => setTab('entregados')}>
            ✅ Entregados
          </button>
          <button className={`tab ${tab === 'resumen' ? 'on' : ''}`} onClick={() => setTab('resumen')}>
            📊 Resumen
          </button>
          <button className={`tab ${tab === 'precios' ? 'on' : ''}`} onClick={() => setTab('precios')}>
            🏷️ Precios
          </button>
          <button className={`tab ${tab === 'colores' ? 'on' : ''}`} onClick={() => setTab('colores')}>
            🎨 Colores
          </button>
        </div>

        {tab === 'nuevo' && (
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
        )}

        {tab === 'lista' && (
          <ListaPedidos
            pedidos={pedidos.filter(p => p.estado !== 'Entregado')}
            loading={loading}
            onVerDetalle={(idx) => {
              const p = pedidos.filter(p => p.estado !== 'Entregado')[idx]
              setDetalleIdx(pedidos.indexOf(p))
            }}
            onCompartir={handleCompartir}
            refrescar={cargarPedidos}
            onEliminar={(pedido) => setPedidoAEliminar(pedido)}
            showToast={showToast}
            titulo="Pedidos Activos"
          />
        )}

        {tab === 'entregados' && (
          <ListaPedidos
            pedidos={pedidos.filter(p => p.estado === 'Entregado')}
            loading={loading}
            onVerDetalle={(idx) => {
              const p = pedidos.filter(p => p.estado === 'Entregado')[idx]
              setDetalleIdx(pedidos.indexOf(p))
            }}
            onCompartir={handleCompartir}
            refrescar={cargarPedidos}
            onEliminar={(pedido) => setPedidoAEliminar(pedido)}
            showToast={showToast}
            titulo="Pedidos Entregados"
            soloEntregados
          />
        )}

        {tab === 'resumen' && <Resumen pedidos={pedidos} session={session} showToast={showToast} />}

        {tab === 'precios' && <ListaPrecios showToast={showToast} />}

        {tab === 'colores' && <BuscadorColores showToast={showToast} />}
      </div>

      {detalleIdx !== null && (
        <DetalleModal
          pedido={pedidos[detalleIdx]}
          onClose={() => setDetalleIdx(null)}
          onUpdated={cargarPedidos}
          onCompartir={handleCompartir}
          onEditar={() => {
            setEditPedido(pedidos[detalleIdx])
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
