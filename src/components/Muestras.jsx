import { segmentosColor } from './constants'
import { hexHilo } from './hilos'

// Franja rayada para cuando no se sabe el color (ej. un hilo sin color).
const SIN_COLOR = 'repeating-linear-gradient(45deg, #ddd, #ddd 3px, #f4f4f4 3px, #f4f4f4 6px)'

function Franjas({ segmentos, tam }) {
  const clase = tam === 'grande' ? 'co-grande' : tam === 'mini' ? 'co-muestra mini' : 'co-muestra'
  const lista = segmentos.length ? segmentos : [{ hex: null, peso: 1 }]
  return (
    <span className={clase} aria-hidden="true">
      {lista.map((s, i) => <i key={i} style={{ background: s.hex || SIN_COLOR, flex: s.peso || 1 }} />)}
    </span>
  )
}

// Muestra de un hilo (un solo color).
export function MuestraHilo({ hilo, tam }) {
  return <Franjas segmentos={[{ hex: hexHilo(hilo), peso: 1 }]} tam={tam} />
}

// Muestra de una fórmula: franjas con los colores de sus hilos.
export function MuestraMezcla({ segmentos, tam }) {
  return <Franjas segmentos={segmentos} tam={tam} />
}

// Muestra a partir de un nombre de color escrito ("Azul bebé-Negro").
export function MuestraNombre({ nombre, tam }) {
  return <Franjas segmentos={segmentosColor(nombre).map((s) => ({ hex: s.hex, peso: 1 }))} tam={tam} />
}
