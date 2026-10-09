import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

// ============================================
// MOVIMIENTO
// ============================================
// Piezas animadas pequeñas que usan varias pantallas. Todas respetan
// "reducir movimiento" del celular: si está activado, se ven ya terminadas.

const sinMovimiento = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// ============================================
// CAMBIO DE PESTAÑA
// ============================================
// Lo que había se corre un poco hacia un lado y se apaga, y lo nuevo entra
// desde el lado hacia donde vas (pestaña a la derecha → entra por la
// derecha) y frena suave hasta su sitio. Todo en menos de medio segundo.
//
// Para animar lo que SE VA hace falta una foto de cómo estaba: eso lo da la
// "transición de vista" del navegador. Mientras esa foto está en pantalla el
// navegador no deja tocar nada, así que solo dura lo que tarda en apagarse
// (0,11 s). Lo que LLEGA es la página de verdad animándose, así que se puede
// tocar y usar desde el primer instante.
//
// En navegadores sin transiciones de vista, lo viejo desaparece de una y solo
// se ve entrar lo nuevo. La barra de arriba siempre se queda quieta encima,
// para que lo que sale nunca la tape.
let transicionActual = 0
let nombrados = []
function soltarNombres() {
  for (const el of nombrados) el.style.viewTransitionName = ''
  nombrados = []
}
function nombrar(el, nombre) {
  if (!el) return
  el.style.viewTransitionName = nombre
  if (!nombrados.includes(el)) nombrados.push(el)
}

// Entrada de lo nuevo. "retraso": espera a que lo viejo casi se apague; en
// ese rato lo nuevo queda invisible (fill: backwards) para que no se asome.
const entradas = new WeakMap()
function animarEntrada(zona, dir, retraso) {
  if (typeof zona.animate !== 'function') return
  for (const a of entradas.get(zona) || []) a.cancel()
  const base = { delay: retraso, fill: 'backwards' }
  entradas.set(zona, [
    zona.animate({ opacity: [0, 1] }, { ...base, duration: 220, easing: 'cubic-bezier(0, 0, .2, 1)' }),
    zona.animate({ transform: [`translateX(${dir > 0 ? 40 : -40}px)`, 'none'] }, { ...base, duration: 360, easing: 'cubic-bezier(.16, 1, .3, 1)' }),
  ])
}

// cambio: función que cambia el estado (ej. () => setTab('lista')).
// zona: el elemento cuyo contenido cambia (es lo que se anima).
// dir: 1 si se va hacia la derecha, -1 si hacia la izquierda.
// subir: volver al principio de la página al cambiar.
export function cambiarConTransicion(cambio, { zona, dir = 1, subir = false } = {}) {
  const aplicar = () => {
    flushSync(cambio)
    if (subir && window.scrollY > 0) window.scrollTo(0, 0)
  }
  if (!zona || sinMovimiento()) { aplicar(); return }

  if (typeof document.startViewTransition !== 'function') {
    aplicar()
    animarEntrada(zona, dir, 0)
    return
  }

  const id = ++transicionActual
  const raiz = document.documentElement
  soltarNombres()
  raiz.dataset.pestana = dir > 0 ? 'der' : 'izq'
  nombrar(zona, 'pestana-sale')
  nombrar(document.querySelector('.hdr'), 'pestana-cabecera')

  let vt
  try {
    vt = document.startViewTransition(() => {
      aplicar()
      if (id !== transicionActual) return
      // Lo nuevo ya no va en la foto: es la página real, que entra sola.
      zona.style.viewTransitionName = ''
      animarEntrada(zona, dir, 90)
    })
  } catch {
    soltarNombres()
    delete raiz.dataset.pestana
    aplicar()
    animarEntrada(zona, dir, 0)
    return
  }
  const fin = () => {
    if (id !== transicionActual) return
    soltarNombres()
    delete raiz.dataset.pestana
  }
  vt.ready.catch(() => {})
  vt.updateCallbackDone.catch(() => {})
  vt.finished.then(fin, fin)
}

// Indicador que se desliza hasta la opción activa (la rayita verde de las
// pestañas, la pastilla blanca de "Lista | Tablero"). Se estira como un hilo
// que se jala: el borde de adelante sale primero y el de atrás lo alcanza.
//
// Devuelve una ref para el contenedor. Dentro van los botones (el activo con
// la clase "on") y un elemento con la clase "indicador".
export function useIndicador(clave) {
  const ref = useRef(null)
  const primera = useRef(true)

  useLayoutEffect(() => {
    if (!ref.current) return
    colocarIndicador(ref.current, !primera.current)
    primera.current = false
  }, [clave])

  // Si cambia el tamaño (cargan las letras, aparece un número, se gira el
  // celular, sale o se va la barra de desplazamiento), se acomoda: de una si
  // estaba quieto, o corrigiendo el rumbo si iba en camino.
  useEffect(() => {
    const cont = ref.current
    if (!cont || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(() => {
      const ind = cont.querySelector(':scope > .indicador')
      const enCamino = !!ind?.getAnimations?.().some((a) => a.playState === 'running')
      colocarIndicador(cont, enCamino)
    })
    ro.observe(cont)
    // El indicador mismo no: su ancho cambia mientras se desliza.
    for (const hijo of cont.children) if (!hijo.classList.contains('indicador')) ro.observe(hijo)
    return () => ro.disconnect()
  }, [])

  return ref
}

function colocarIndicador(cont, animar) {
  const ind = cont.querySelector(':scope > .indicador')
  if (!ind) return
  const act = cont.querySelector(':scope > .on')
  if (!act) { ind.style.opacity = '0'; return }
  const l = act.offsetLeft
  const r = cont.clientWidth - (act.offsetLeft + act.offsetWidth)
  const lPrev = parseFloat(ind.style.getPropertyValue('--l'))
  if (animar && !Number.isNaN(lPrev) && l !== lPrev) ind.dataset.dir = l > lPrev ? 'der' : 'izq'
  if (!animar) ind.classList.add('quieto')
  ind.style.setProperty('--l', `${l}px`)
  ind.style.setProperty('--r', `${r}px`)
  ind.style.opacity = ''
  if (!animar) {
    void ind.offsetWidth // aplica la posición ya, sin transición
    ind.classList.remove('quieto')
  }
}

// Un número que sube hasta su valor. Si el valor cambia (otro mes, un pedido
// nuevo), sigue desde donde estaba hasta el valor nuevo.
export function CuentaNum({ valor, formato = (n) => Math.round(n).toLocaleString('es-CO'), duracion = 1100 }) {
  const desde = useRef(sinMovimiento() ? valor : 0)
  const [n, setN] = useState(desde.current)

  useEffect(() => {
    if (sinMovimiento()) { desde.current = valor; setN(valor); return undefined }
    const a = desde.current
    if (a === valor) return undefined
    let t0 = null
    let raf = 0
    const paso = (t) => {
      if (t0 === null) t0 = t
      const k = Math.min(1, (t - t0) / duracion)
      const v = a + (valor - a) * (1 - Math.pow(1 - k, 3))
      desde.current = v
      setN(v)
      if (k < 1) raf = requestAnimationFrame(paso)
    }
    raf = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf)
  }, [valor, duracion])

  return <>{formato(n)}</>
}

// Anillo de avance. Cada segmento es { valor, color }. Con un solo segmento
// es un avance simple (por ejemplo 54 %); con varios, un reparto por estado.
export function Anillo({ segmentos, total, centro, sub, className = '' }) {
  const suma = total || segmentos.reduce((s, x) => s + x.valor, 0) || 1
  let ini = 0
  return (
    <div className={`mv-anillo ${segmentos.length === 1 ? 'redondo' : ''} ${className}`}>
      <svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
        <circle className="fondo" cx="18" cy="18" r="15.9155" />
        {segmentos.filter((s) => s.valor > 0).map((s, i) => {
          const largo = Math.min(100, (s.valor / suma) * 100)
          const el = (
            <circle
              key={i}
              className="seg"
              cx="18" cy="18" r="15.9155"
              style={{ stroke: s.color, strokeDasharray: `${largo} ${100 - largo}`, strokeDashoffset: -ini, animationDelay: `${i * 0.3}s` }}
            />
          )
          ini += largo
          return el
        })}
      </svg>
      <div className="centro"><b>{centro}</b>{sub ? <small>{sub}</small> : null}</div>
    </div>
  )
}

// Cono de hilo. Con girando=true las vueltas de hilo corren por el cono
// (pantallas que cargan); con girando=false queda quieto (pantallas vacías).
let contadorCono = 0
export function ConoHilo({ girando = true, tam = 84 }) {
  const id = useRef(null)
  if (id.current === null) id.current = `mvc${++contadorCono}`
  const cuerpo = 'M40 22 H60 L84 108 Q86 116 78 116 H22 Q14 116 16 108 Z'
  const vueltas = []
  for (let y = 8; y <= 128; y += 11) vueltas.push(y)
  return (
    <svg className="mv-cono" viewBox="0 0 100 124" width={tam} height={Math.round(tam * 1.24)} aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={`${id.current}c`}><path d={cuerpo} /></clipPath>
        <linearGradient id={`${id.current}g`} x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".3" />
          <stop offset=".45" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".24" />
        </linearGradient>
      </defs>
      <rect x="39" y="6" width="22" height="18" rx="3" fill="#2f5f93" />
      <rect x="39" y="6" width="22" height="5" rx="2.5" fill="#fff" fillOpacity=".18" />
      <path d={cuerpo} fill="#4b8523" />
      <g clipPath={`url(#${id.current}c)`}>
        <g className={girando ? 'mv-gira' : ''}>
          {vueltas.map((y) => (
            <path key={y} d={`M0 ${y} Q50 ${y + 10} 100 ${y}`} fill="none" stroke="#9fd06e" strokeWidth="2.2" strokeLinecap="round" />
          ))}
        </g>
        <rect x="0" y="0" width="100" height="124" fill={`url(#${id.current}g)`} />
      </g>
      <path d="M15.2 106 H84.8 L85.6 109 Q86.4 116 78 116 H22 Q13.6 116 14.4 109 Z" fill="#3a6a1c" />
    </svg>
  )
}
