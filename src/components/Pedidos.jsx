import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import NuevoPedido from './NuevoPedido'
import ListaPedidos from './ListaPedidos'
import Resumen from './Resumen'
import DetalleModal from './DetalleModal'
import { TIPO_LABEL } from './constants'
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

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  const totalPedidos = pedidos.length
  const totalPendientes = pedidos.filter((p) => p.estado === 'Pendiente').length

  return (
    <div className="app-root">
      <header className="hdr">
        <div className="hbrand">
          <div className="hico">
            {Array.from({ length: 9 }).map((_, i) => (
              <span key={i} />
            ))}
          </div>
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
            📋 Pedidos
          </button>
          <button className={`tab ${tab === 'resumen' ? 'on' : ''}`} onClick={() => setTab('resumen')}>
            📊 Resumen
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
            pedidos={pedidos}
            loading={loading}
            onVerDetalle={(idx) => setDetalleIdx(idx)}
            onEliminar={async (pedido) => {
              if (!confirm(`¿Eliminar pedido ${pedido.numero}?`)) return
              const { error } = await supabase.from('pedidos').delete().eq('id', pedido.id)
              if (error) { showToast('⚠️', 'Error al eliminar'); return }
              showToast('🗑️', 'Pedido eliminado')
              cargarPedidos()
            }}
            showToast={showToast}
          />
        )}

        {tab === 'resumen' && <Resumen pedidos={pedidos} />}
      </div>

      {detalleIdx !== null && (
        <DetalleModal
          pedido={pedidos[detalleIdx]}
          onClose={() => setDetalleIdx(null)}
          onUpdated={cargarPedidos}
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
