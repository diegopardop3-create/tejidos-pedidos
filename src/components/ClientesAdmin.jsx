import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { raizVentanas } from './capas'
import { supabase } from '../supabaseClient'

// ============================================
// ADMINISTRAR CLIENTES
// ============================================
// No hay una tabla de clientes: el nombre está escrito en cada pedido. Por eso
// "arreglar" un nombre es cambiarlo en todos los pedidos que lo tienen. Si el
// nombre nuevo ya existe (por ejemplo "Samael Mendez" -> "Samael Méndez"), los
// pedidos quedan juntos bajo ese nombre y el mal escrito desaparece.

const sinTilde = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export default function ClientesAdmin({ pedidos, onCerrar, onRenombrado, showToast }) {
  const [editando, setEditando] = useState(null) // nombre que se está cambiando
  const [nuevo, setNuevo] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' && !guardando) onCerrar() }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onCerrar, guardando])

  const cuenta = new Map()
  for (const p of pedidos || []) if (p.cliente) cuenta.set(p.cliente, (cuenta.get(p.cliente) || 0) + 1)
  const lista = [...cuenta.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))

  const limpio = nuevo.trim().replace(/\s+/g, ' ')
  const destino = limpio && limpio !== editando ? lista.find(([n]) => n === limpio) : null
  const parecido = !destino && limpio ? lista.find(([n]) => n !== editando && sinTilde(n) === sinTilde(limpio)) : null

  async function guardar() {
    if (!limpio || limpio === editando) { setEditando(null); return }
    setGuardando(true)
    const { error } = await supabase.from('pedidos').update({ cliente: limpio }).eq('cliente', editando)
    setGuardando(false)
    if (error) { showToast('⚠️', 'No se pudo cambiar el nombre: ' + error.message); return }
    showToast('✅', destino ? `Pedidos juntados en "${limpio}"` : `Nombre cambiado a "${limpio}"`)
    onRenombrado(editando, limpio)
    setEditando(null)
  }

  const ventana = (
    <div className="ca-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget && !guardando) onCerrar() }}>
      <div className="ca-caja" role="dialog" aria-modal="true" aria-label="Administrar clientes">
        <div className="ca-cab">
          <b>Clientes</b>
          <button type="button" className="btn btn-s btn-sm" onClick={onCerrar} disabled={guardando}>Cerrar</button>
        </div>
        <p className="ca-ayuda">
          Toca <b>Cambiar nombre</b> para corregir uno mal escrito. Si el nombre nuevo ya existe, sus pedidos se juntan con él.
          Para un cliente nuevo, solo escribe su nombre en el campo Cliente al crear el pedido.
        </p>
        <div className="ca-lista">
          {lista.map(([nombre, n]) => (
            <div key={nombre} className="ca-fila">
              {editando === nombre ? (
                <div className="ca-edicion">
                  <input
                    autoFocus
                    value={nuevo}
                    onChange={(e) => setNuevo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') guardar() }}
                    placeholder="Nombre correcto"
                    autoComplete="off"
                  />
                  {destino && <div className="ca-nota">Ya existe "{destino[0]}" ({destino[1]} {destino[1] === 1 ? 'pedido' : 'pedidos'}): se juntarán.</div>}
                  {parecido && <div className="ca-nota">Ojo: ya existe "{parecido[0]}", casi igual. Escríbelo igual si quieres juntarlos.</div>}
                  <div className="ca-botones">
                    <button type="button" className="btn btn-s btn-sm" onClick={() => setEditando(null)} disabled={guardando}>Cancelar</button>
                    <button type="button" className="btn btn-p btn-sm" onClick={guardar} disabled={guardando || !limpio}>{guardando ? 'Guardando…' : 'Guardar'}</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="ca-nom"><b>{nombre}</b><span>{n} {n === 1 ? 'pedido' : 'pedidos'}</span></div>
                  <button type="button" className="btn btn-s btn-sm" onClick={() => { setEditando(nombre); setNuevo(nombre) }}>Cambiar nombre</button>
                </>
              )}
            </div>
          ))}
          {!lista.length && <div className="ca-nota">Todavía no hay clientes.</div>}
        </div>
      </div>
    </div>
  )
  return createPortal(ventana, raizVentanas())
}
