import { useState } from 'react'
import { PESO_PANTALLA, useDiseno } from './fotosDisenos'

// La foto de un diseño dentro de una tarjeta: cuadrada, con un brillo que
// pasa mientras carga y que aparece suave cuando llega. Con visto=true se
// pide primero (está en pantalla).
export default function MarcoDiseno({ d, visto, children }) {
  const f = useDiseno(d.rep.id, d.rep.tabla, visto, PESO_PANTALLA)
  const [img, setImg] = useState('') // '' cargando | 'lista' | 'rota'
  const mini = f.minis[d.rep.idx]
  return (
    <span className={`dz-marco${img === 'lista' ? ' lista' : ''}${img === 'rota' ? ' error' : ''}`}>
      {mini && <img src={mini} alt="" draggable={false} decoding="async" onLoad={() => setImg('lista')} onError={() => setImg('rota')} />}
      {img === 'rota' && <span className="dz-err">No se puede mostrar</span>}
      {children}
    </span>
  )
}
