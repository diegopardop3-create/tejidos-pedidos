import { segmentosColor } from './constants'

// Pinta una pequeña muestra visual junto al nombre de un color combinado
// (ej: "Uva-Blanco" se ve como un bloque morado + un bloque blanco).
// Es solo apoyo visual: si no reconoce alguna palabra, se muestra un
// patrón neutro en rayas en vez de adivinar mal.
export default function ColorSwatch({ nombre, size = 13 }) {
  const segmentos = segmentosColor(nombre)
  if (!segmentos.length) return null
  return (
    <div
      title={nombre}
      style={{
        display: 'flex',
        width: size * segmentos.length,
        height: size,
        borderRadius: 4,
        overflow: 'hidden',
        border: '1px solid rgba(0,0,0,.18)',
        flexShrink: 0,
      }}
    >
      {segmentos.map((s, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            background: s.hex || 'repeating-linear-gradient(45deg, #ddd, #ddd 2px, #f0f0f0 2px, #f0f0f0 4px)',
          }}
        />
      ))}
    </div>
  )
}
