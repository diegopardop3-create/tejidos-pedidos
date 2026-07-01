import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { fmtCOP } from './constants'

const MATERIALES_SUGERIDOS = ['Lana', 'Hilo', 'Hilo con licra', 'Poliéster', 'Poliéster con licra', 'Nailon', 'Algodón']

export default function ListaPrecios({ showToast }) {
  const [precios, setPrecios] = useState([])
  const [loading, setLoading] = useState(true)
  const [producto, setProducto] = useState('')
  const [material, setMaterial] = useState('')
  const [precio, setPrecio] = useState('')
  const [unidad, setUnidad] = useState('unidad')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [editId, setEditId] = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    const { data } = await supabase.from('precios_referencia').select('*').order('producto').order('material')
    setPrecios(data || [])
    setLoading(false)
  }

  async function guardar() {
    if (!producto.trim() || !material.trim()) { showToast('⚠️', 'Escribe producto y material'); return }
    const p = Math.round(parseFloat(precio) || 0)
    if (!p) { showToast('⚠️', 'Escribe un precio válido'); return }
    setGuardando(true)
    if (editId) {
      await supabase.from('precios_referencia').update({ producto: producto.trim(), material: material.trim(), precio: p, unidad, nota: nota.trim() || null }).eq('id', editId)
      showToast('✅', 'Precio actualizado')
    } else {
      await supabase.from('precios_referencia').insert({ producto: producto.trim(), material: material.trim(), precio: p, unidad, nota: nota.trim() || null })
      showToast('✅', 'Precio agregado')
    }
    setProducto(''); setMaterial(''); setPrecio(''); setUnidad('unidad'); setNota(''); setEditId(null)
    setGuardando(false)
    cargar()
  }

  function editar(pr) {
    setEditId(pr.id)
    setProducto(pr.producto); setMaterial(pr.material); setPrecio(String(pr.precio))
    setUnidad(pr.unidad || 'unidad'); setNota(pr.nota || '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar este precio de la lista?')) return
    await supabase.from('precios_referencia').delete().eq('id', id)
    showToast('🗑️', 'Precio eliminado')
    cargar()
  }

  // Agrupar por producto
  const agrupados = {}
  precios.forEach(p => {
    if (!agrupados[p.producto]) agrupados[p.producto] = []
    agrupados[p.producto].push(p)
  })

  const inp = { padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, background: 'var(--loom)', outline: 'none', width: '100%', fontFamily: "'Inter', sans-serif" }

  return (
    <div>
      {/* Formulario para agregar/editar */}
      <div className="card">
        <div className="ctitle">{editId ? 'Editar precio' : 'Agregar precio de referencia'}</div>
        <div className="g3" style={{ marginBottom: 12 }}>
          <div className="fld">
            <label>Producto</label>
            <input list="dl-productos" value={producto} onChange={e => setProducto(e.target.value)} placeholder="Ej: Cuello camiseta" style={inp} />
            <datalist id="dl-productos">
              <option value="Cuello camiseta" /><option value="Puño camiseta" />
              <option value="Cuello chaqueta" /><option value="Puño chaqueta" /><option value="Pretina chaqueta" />
            </datalist>
          </div>
          <div className="fld">
            <label>Material</label>
            <input list="dl-materiales" value={material} onChange={e => setMaterial(e.target.value)} placeholder="Ej: Poliéster con licra" style={inp} />
            <datalist id="dl-materiales">
              {MATERIALES_SUGERIDOS.map(m => <option key={m} value={m} />)}
            </datalist>
          </div>
          <div className="fld">
            <label>Precio (sin puntos)</label>
            <input type="number" step="1" min="0" value={precio} onChange={e => setPrecio(e.target.value)} placeholder="Ej: 2600" style={{ ...inp, fontFamily: "'DM Mono', monospace" }} />
            {precio > 0 && <span style={{ fontSize: 11, color: 'var(--thread)', fontFamily: "'DM Mono', monospace" }}>= {fmtCOP(precio)}</span>}
          </div>
          <div className="fld">
            <label>Unidad</label>
            <select value={unidad} onChange={e => setUnidad(e.target.value)} style={inp}>
              <option value="unidad">Por unidad</option>
              <option value="kilo">Por kilo</option>
            </select>
          </div>
          <div className="fld" style={{ gridColumn: 'span 2' }}>
            <label>Nota (opcional)</label>
            <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej: precio mayorista, mínimo 100 unidades..." style={inp} />
          </div>
        </div>
        <div className="brow">
          {editId && <button className="btn btn-s" onClick={() => { setEditId(null); setProducto(''); setMaterial(''); setPrecio(''); setNota('') }}>Cancelar</button>}
          <button className="btn btn-p" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : editId ? 'Guardar cambios' : '＋ Agregar a la lista'}</button>
        </div>
      </div>

      {/* Lista agrupada */}
      {loading ? (
        <div className="empty"><div className="empty-ico">⏳</div><p>Cargando…</p></div>
      ) : precios.length === 0 ? (
        <div className="card"><div className="empty"><div className="empty-ico">🏷️</div><p>Aún no has agregado precios de referencia.<br />Usa el formulario de arriba para empezar tu tabla de precios.</p></div></div>
      ) : (
        Object.entries(agrupados).map(([prod, items]) => (
          <div className="card" key={prod}>
            <div className="ctitle">{prod}</div>
            <div className="twrap" style={{ border: 'none' }}>
              <table>
                <thead>
                  <tr><th>Material</th><th>Precio</th><th>Unidad</th><th>Nota</th><th></th></tr>
                </thead>
                <tbody>
                  {items.map(pr => (
                    <tr key={pr.id}>
                      <td style={{ fontWeight: 600 }}>{pr.material}</td>
                      <td><span className="td-p">{fmtCOP(pr.precio)}</span></td>
                      <td className="td-mono">{pr.unidad === 'kilo' ? 'por kilo' : 'por unidad'}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{pr.nota || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button className="btn btn-s btn-sm" onClick={() => editar(pr)}>✏️</button>
                          <button className="btn btn-d btn-sm" onClick={() => eliminar(pr.id)}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
