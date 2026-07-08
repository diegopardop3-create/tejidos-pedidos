import { useState } from 'react'
import { supabase } from '../supabaseClient'

// Antes de borrar un pedido, se verifica la contraseña directamente contra
// Supabase (el mismo mecanismo del login) — no se compara contra ningún
// texto guardado en el código, que sería inseguro y fácil de saltar.
export default function ConfirmarEliminar({ pedido, session, onCancel, onConfirmed, showToast }) {
  const [password, setPassword] = useState('')
  const [verificando, setVerificando] = useState(false)
  const [error, setError] = useState('')

  if (!pedido) return null

  async function confirmar() {
    if (!password) { setError('Escribe tu contraseña'); return }
    setVerificando(true)
    setError('')

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password,
    })

    if (authError) {
      setVerificando(false)
      setError('Contraseña incorrecta. Inténtalo de nuevo.')
      return
    }

    const { error: delError } = await supabase.from('pedidos').delete().eq('id', pedido.id)
    setVerificando(false)
    if (delError) {
      showToast('⚠️', 'Error al eliminar el pedido')
      return
    }
    showToast('🗑️', `Pedido ${pedido.numero} eliminado`)
    setPassword('')
    onConfirmed()
  }

  function cancelar() {
    setPassword('')
    setError('')
    onCancel()
  }

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) cancelar() }}>
      <div className="modal" style={{ maxWidth: 380 }}>
        <div className="mtitle">⚠️ Confirmar eliminación</div>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
          Vas a eliminar permanentemente el pedido:
        </p>
        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>
          {pedido.numero} — {pedido.cliente}
        </p>
        <div className="fld" style={{ marginBottom: 6 }}>
          <label>Escribe tu contraseña para confirmar</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirmar()}
            placeholder="••••••••"
            autoFocus
          />
        </div>
        {error && <div style={{ background: '#fdf2f2', color: 'var(--danger)', fontSize: 12, padding: '8px 10px', borderRadius: 7, border: '1px solid #f5c6cb', marginBottom: 6 }}>⚠️ {error}</div>}
        <div className="brow right" style={{ marginTop: 16 }}>
          <button className="btn btn-s" onClick={cancelar}>Cancelar</button>
          <button className="btn btn-d" onClick={confirmar} disabled={verificando} style={{ fontWeight: 700 }}>
            {verificando ? 'Verificando…' : '🗑 Eliminar definitivamente'}
          </button>
        </div>
      </div>
    </div>
  )
}
