import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import Login from './components/Login'
import Pedidos from './components/Pedidos'
import VistaPublica from './components/VistaPublica'
import IntroTejido from './components/IntroTejido'

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = cargando

  // Detecta si la URL trae ?pedido=TOKEN -> vista pública, sin login
  const params = new URLSearchParams(window.location.search)
  const tokenPublico = params.get('pedido')

  // Logo que se teje: al entrar con correo y contraseña, y siempre en el
  // enlace del cliente mientras carga su pedido. Con ?intro en la dirección
  // se puede ver cuando se quiera.
  const [intro, setIntro] = useState(() => params.has('intro') || !!tokenPublico)
  const sesionPrevia = useRef(undefined)
  useEffect(() => { sesionPrevia.current = session }, [session])
  const finIntro = useCallback(() => {
    setIntro(false)
    const u = new URL(window.location.href)
    if (u.searchParams.has('intro')) {
      u.searchParams.delete('intro')
      window.history.replaceState(null, '', u.pathname + u.search + u.hash)
    }
  }, [])

  useEffect(() => {
    if (tokenPublico) return // no necesitamos sesión para la vista pública
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // Solo cuando se pasa de la pantalla de inicio de sesión a la app
      if (event === 'SIGNED_IN' && session && sesionPrevia.current === null) setIntro(true)
      setSession(session)
    })

    return () => listener.subscription.unsubscribe()
  }, [tokenPublico])

  const telon = intro ? <IntroTejido onFin={finIntro} /> : null

  if (tokenPublico) {
    return <>{telon}<VistaPublica token={tokenPublico} /></>
  }

  if (session === undefined) {
    return telon || (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Inter', sans-serif", color: '#6b7c6e', background: '#f5f7f5',
      }}>
        Cargando…
      </div>
    )
  }

  if (!session) {
    return <>{telon}<Login /></>
  }

  return <>{telon}<Pedidos session={session} /></>
}
