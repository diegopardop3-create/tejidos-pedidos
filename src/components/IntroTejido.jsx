import { useEffect, useRef, useState } from 'react'
import logo from '../assets/logo.png'
import { animarLogo } from './tejidoLogo'

// Pantalla de bienvenida al iniciar sesión: el logo se teje y luego la
// pantalla se abre hacia la app. Tocar en cualquier parte la salta.
export default function IntroTejido({ onFin }) {
  const lienzo = useRef(null)
  const control = useRef(null)
  const [saliendo, setSaliendo] = useState(false)
  const [verAviso, setVerAviso] = useState(false)

  useEffect(() => {
    const reducido = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let cerrado = false
    let espera = 0
    const salir = () => {
      if (cerrado) return
      cerrado = true
      setSaliendo(true)
      espera = window.setTimeout(() => onFin?.(), 650)
    }
    const img = new Image()
    img.onload = () => {
      if (!lienzo.current) return
      try {
        control.current = animarLogo(lienzo.current, img, { reducido, alTerminar: salir })
      } catch {
        salir()
      }
    }
    img.onerror = salir
    img.src = logo
    const aviso = window.setTimeout(() => setVerAviso(true), 1200)
    return () => {
      control.current?.detener()
      window.clearTimeout(espera)
      window.clearTimeout(aviso)
    }
  }, [onFin])

  return (
    <div
      onClick={() => control.current?.saltar()}
      role="presentation"
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: '#f5f2e7',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        opacity: saliendo ? 0 : 1,
        transform: saliendo ? 'scale(1.06)' : 'none',
        transition: 'opacity .6s ease, transform .6s ease',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <canvas
        ref={lienzo}
        aria-label="L & L Tejidos y Confecciones"
        role="img"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      />
      <div style={{
        position: 'absolute', bottom: 28, left: 0, right: 0, textAlign: 'center',
        fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: '0.08em',
        color: '#6a7d5a', opacity: verAviso && !saliendo ? 0.6 : 0, transition: 'opacity .5s',
      }}>
        Toca para continuar
      </div>
    </div>
  )
}
