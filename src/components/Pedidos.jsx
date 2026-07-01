import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import NuevoPedido from './NuevoPedido'
import ListaPedidos from './ListaPedidos'
import Resumen from './Resumen'
import ListaPrecios from './ListaPrecios'
import DetalleModal from './DetalleModal'
import logo from '../assets/logo.png'
import './styles.css'

export default function Pedidos({ session }) {
  const [tab, setTab] = useState('nuevo')
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [detalleIdx, setDetalleIdx] = useState(null)
  const [editPedido, setEditPedido] = useState(null)
  const [toast, setToast] = useState(null)

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
    setPedidos(pedidosData || [])
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
            onEliminar={async (pedido) => {
              if (!confirm(`¿Eliminar pedido ${pedido.numero}?`)) return
              const { error } = await supabase.from('pedidos').delete().eq('id', pedido.id)
              if (error) { showToast('⚠️', 'Error al eliminar'); return }
              showToast('🗑️', 'Pedido eliminado')
              cargarPedidos()
            }}
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
            onEliminar={async (pedido) => {
              if (!confirm(`¿Eliminar pedido ${pedido.numero}?`)) return
              const { error } = await supabase.from('pedidos').delete().eq('id', pedido.id)
              if (error) { showToast('⚠️', 'Error al eliminar'); return }
              showToast('🗑️', 'Pedido eliminado')
              cargarPedidos()
            }}
            showToast={showToast}
            titulo="Pedidos Entregados"
            soloEntregados
          />
        )}

        {tab === 'resumen' && <Resumen pedidos={pedidos} />}

        {tab === 'precios' && <ListaPrecios showToast={showToast} />}
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

      {toast && (
        <div className="toast show">
          <span>{toast.icon}</span>
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  )
}
