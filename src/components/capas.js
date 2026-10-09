import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

// ============================================
// VENTANAS ENCIMA DE LA APP (visor de fotos, carpeta de diseños)
// ============================================

// El botón "atrás" del celular (o del navegador) cierra la ventana en vez de
// salir de la app. La ventana deja una marca en el historial; al volver, si
// su marca ya no está, se cierra. Devuelve la función para quitar la marca
// cuando la ventana se cierra con un botón.
export function useAtrasCierra(marca, alVolver) {
  const fn = useRef(alVolver)
  fn.current = alVolver
  useEffect(() => {
    if (!window.history.state?.[marca]) window.history.pushState({ ...(window.history.state || {}), [marca]: true }, '')
    const alCambiar = () => { if (!window.history.state?.[marca]) fn.current() }
    window.addEventListener('popstate', alCambiar)
    return () => window.removeEventListener('popstate', alCambiar)
  }, [marca])
  return useCallback(() => { if (window.history.state?.[marca]) window.history.back() }, [marca])
}

// Mientras la ventana está abierta, la página de atrás no se mueve ni recibe
// el foco (el teclado y los lectores de pantalla se quedan en la ventana). Al
// cerrar, el foco vuelve a donde estaba.
export function useBloquearFondo(focoInicial) {
  useLayoutEffect(() => {
    const html = document.documentElement
    const barra = window.innerWidth - html.clientWidth
    const antes = { overflow: html.style.overflow, padding: html.style.paddingRight }
    html.style.overflow = 'hidden'
    if (barra > 0) html.style.paddingRight = `${barra}px`
    const fondo = [...document.querySelectorAll('.app-root > .hdr, .app-root > .wrap')]
    for (const el of fondo) el.inert = true
    const foco = document.activeElement
    focoInicial?.current?.focus({ preventScroll: true })
    return () => {
      html.style.overflow = antes.overflow
      html.style.paddingRight = antes.padding
      for (const el of fondo) el.inert = false
      if (foco && document.contains(foco)) foco.focus?.({ preventScroll: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

// Dónde se dibujan las ventanas: dentro de la app (así toman sus colores y
// el modo oscuro), por encima de todo lo demás.
export const raizVentanas = () => document.querySelector('.app-root') || document.body
