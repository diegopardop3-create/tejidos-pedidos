import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Login from './components/Login'
import Pedidos from './components/Pedidos'
import VistaPublica from './components/VistaPublica'

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = cargando

  // Detecta si la URL trae ?pedido=TOKEN -> vista pública, sin login
  const params = new URLSearchParams(window.location.search)
  const tokenPublico = params.get('pedido')

  useEffect(() => {
    if (tokenPublico) return // no necesitamos sesión para la vista pública
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => listener.subscription.unsubscribe()
  }, [tokenPublico])

  if (tokenPublico) {
    return <VistaPublica token={tokenPublico} />
  }

  if (session === undefined) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Inter', sans-serif", color: '#6b7c6e', background: '#f5f7f5',
      }}>
        Cargando…
      </div>
    )
  }

  if (!session) {
    return <Login />
  }

  return <Pedidos session={session} />
}
