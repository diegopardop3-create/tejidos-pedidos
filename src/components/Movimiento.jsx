import { useEffect, useRef, useState } from 'react'

// ============================================
// MOVIMIENTO
// ============================================
// Piezas animadas pequeñas que usan varias pantallas. Todas respetan
// "reducir movimiento" del celular: si está activado, se ven ya terminadas.

const sinMovimiento = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

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
