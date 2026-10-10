import { useEffect, useState } from 'react'

// ============================================
// ¿HAY UNA VERSIÓN NUEVA DE LA APP?
// ============================================
// La app del celular puede quedarse abierta días enteros con la versión que
// tenía, aunque ya se haya publicado una nueva. Esto revisa de vez en cuando
// (al abrirla, al volver a ella y cada 10 minutos) si la versión publicada
// es otra, para avisar y que con un toque se actualice.

const actual = () => document.querySelector('script[type="module"][src*="/assets/"]')?.getAttribute('src') || null

export function useVersionNueva() {
  const [nueva, setNueva] = useState(false)
  useEffect(() => {
    const mia = actual()
    if (!import.meta.env.PROD || !mia) return undefined
    let vivo = true
    let ultima = 0
    async function revisar() {
      if (!vivo || document.visibilityState !== 'visible' || Date.now() - ultima < 45000) return
      ultima = Date.now()
      try {
        const r = await fetch('/', { cache: 'no-store' })
        if (!r.ok) return
        const m = (await r.text()).match(/src="(\/assets\/index-[^"]+\.js)"/)
        if (vivo && m && m[1] !== mia) setNueva(true)
      } catch { /* sin internet: se revisa la próxima vez */ }
    }
    const t = window.setTimeout(revisar, 10000)
    const cada = window.setInterval(revisar, 10 * 60000)
    const alVolver = () => { if (document.visibilityState === 'visible') revisar() }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)
    return () => {
      vivo = false
      window.clearTimeout(t)
      window.clearInterval(cada)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
    }
  }, [])
  return nueva
}
