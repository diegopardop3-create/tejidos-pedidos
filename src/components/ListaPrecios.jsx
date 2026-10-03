import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { fmtCOP } from './constants'
import { IconoPrenda } from './Insignias'

// ============================================
// PRECIOS
// ============================================
// A la izquierda, la lista de precios de referencia agrupada por producto
// (con el icono de la prenda). A la derecha, un cotizador: se eligen
// productos de la lista y cantidades, y se copia el texto listo para pegar
// en WhatsApp. El formulario para agregar o editar un precio aparece arriba
// del cotizador solo cuando se necesita.

const MATERIALES_SUGERIDOS = ['Lana', 'Hilo', 'Hilo con licra', 'Poliéster', 'Poliéster con licra', 'Nailon', 'Algodón', 'Acrílico']
const PRODUCTOS_SUGERIDOS = ['Cuello camiseta', 'Puño camiseta', 'Juego camiseta (cuello + puño)', 'Cuello chaqueta', 'Puño chaqueta', 'Pretina chaqueta']

const Ico = {
  mas: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 5v14M5 12h14" /></svg>,
  editar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>,
  quitar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M18 6 6 18M6 6l12 12" /></svg>,
}

// Del nombre del producto (texto libre) se deduce la prenda y la pieza para
// ponerle el icono: "Pretina chaqueta" -> chaqueta / pretina.
function piezaDe(producto) {
  const t = String(producto || '').toLowerCase()
  const prenda = t.includes('chaq') ? 'chaq' : 'cam'
  const tipo = t.includes('juego') ? 'juego' : t.includes('pretina') ? 'pretina' : (t.includes('puño') || t.includes('puno')) ? 'puno' : t.includes('cuello') ? 'cuello' : null
  return { prenda, tipo }
}
function IconoProducto({ producto }) {
  const { prenda, tipo } = piezaDe(producto)
  if (tipo === 'juego') return <span className="pr-ico"><IconoPrenda tipo="cuello" prenda={prenda} /><IconoPrenda tipo="puno" prenda={prenda} /></span>
  if (!tipo) return <span className="pr-ico pr-ico-vacio">🏷️</span>
  return <span className="pr-ico"><IconoPrenda tipo={tipo} prenda={prenda} /></span>
}

const unidadCorta = (pr) => (pr?.unidad === 'kilo' ? 'kg' : 'u')
const numero = (v) => parseFloat(String(v).replace(',', '.')) || 0
const VACIO = { producto: '', material: '', precio: '', unidad: 'unidad', nota: '' }

export default function ListaPrecios({ showToast }) {
  const [precios, setPrecios] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('') // '' | 'cam' | 'chaq'
  const [form, setForm] = useState(null) // null = cerrado; si no, los campos
  const [editId, setEditId] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [cliente, setCliente] = useState('')
  const [lineas, setLineas] = useState([]) // [{ id, c }]
  const [copiado, setCopiado] = useState('')
  const formRef = useRef(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const { data, error } = await supabase.from('precios_referencia').select('*').order('producto').order('material')
    if (error) showToast('⚠️', 'No se pudieron cargar los precios')
    setPrecios(data || [])
    setLoading(false)
  }

  function abrir(datos, id = null) {
    setForm(datos)
    setEditId(id)
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
  }
  const cerrar = () => { setForm(null); setEditId(null) }
  const campo = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function guardar() {
    if (!form.producto.trim() || !form.material.trim()) { showToast('⚠️', 'Escribe producto y material'); return }
    const p = Math.round(numero(form.precio))
    if (!p) { showToast('⚠️', 'Escribe un precio válido'); return }
    setGuardando(true)
    const fila = { producto: form.producto.trim(), material: form.material.trim(), precio: p, unidad: form.unidad, nota: form.nota.trim() || null }
    const { error } = editId
      ? await supabase.from('precios_referencia').update(fila).eq('id', editId)
      : await supabase.from('precios_referencia').insert(fila)
    setGuardando(false)
    if (error) { showToast('⚠️', 'No se pudo guardar: ' + error.message); return }
    showToast('✅', editId ? 'Precio actualizado' : 'Precio agregado')
    cerrar()
    cargar()
  }

  async function eliminar() {
    if (!confirm('¿Eliminar este precio de la lista?')) return
    const { error } = await supabase.from('precios_referencia').delete().eq('id', editId)
    if (error) { showToast('⚠️', 'No se pudo eliminar'); return }
    showToast('🗑️', 'Precio eliminado')
    setLineas((ls) => ls.filter((l) => l.id !== editId))
    cerrar()
    cargar()
  }

  // ---- Lista agrupada por producto ----
  const hayChaq = precios.some((p) => piezaDe(p.producto).prenda === 'chaq')
  const hayCam = precios.some((p) => piezaDe(p.producto).prenda === 'cam')
  const grupos = {}
  precios
    .filter((p) => !filtro || piezaDe(p.producto).prenda === filtro)
    .forEach((p) => { (grupos[p.producto] = grupos[p.producto] || []).push(p) })

  // ---- Cotizador ----
  const precioDe = (id) => precios.find((p) => p.id === id)
  const lineasValidas = lineas.filter((l) => precioDe(l.id))
  const total = lineasValidas.reduce((s, l) => s + Math.round(precioDe(l.id).precio * numero(l.c)), 0)
  const cambiarLinea = (i, cambios) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...cambios } : l)))
  const agregarLinea = (id) => { setLineas((ls) => [...ls, { id: id ?? precios[0]?.id, c: '' }]); setCopiado('') }

  async function copiar() {
    if (!lineasValidas.length) { showToast('⚠️', 'Agrega al menos un producto'); return }
    const txt = [
      '*L & L Tejidos y Confecciones*',
      `Cotización${cliente.trim() ? ' para ' + cliente.trim() : ''}`,
      '',
      ...lineasValidas.map((l) => {
        const p = precioDe(l.id)
        const c = numero(l.c)
        return `• ${p.producto} (${p.material}): ${c.toLocaleString('es-CO')} ${unidadCorta(p)} × ${fmtCOP(p.precio)} = ${fmtCOP(Math.round(p.precio * c))}`
      }),
      '',
      `*Total: ${fmtCOP(total)}*`,
    ].join('\n')
    try {
      await navigator.clipboard.writeText(txt)
      setCopiado('Cotización copiada. Pégala en WhatsApp.')
    } catch {
      prompt('Copia este texto para WhatsApp:', txt)
    }
  }

  return (
    <div className="pr">
      <div className="lp-cab">
        <div>
          <h1>Precios</h1>
          <p>Tu lista de referencia y un cotizador para responder rápido a un cliente.</p>
        </div>
        <button className="btn btn-p pr-nuevo" onClick={() => (form && !editId ? cerrar() : abrir({ ...VACIO }))}>
          {Ico.mas}Nuevo precio
        </button>
      </div>

      <div className="pr-dos">
        <div className="rs-panel">
          <div className="rs-panel-h">
            <h2>Lista de precios</h2>
            {hayCam && hayChaq && (
              <div className="pr-chips">
                {[['', 'Todos'], ['cam', 'Camiseta'], ['chaq', 'Chaqueta']].map(([k, t]) => (
                  <button key={k} className={`tchip ${filtro === k ? 'on' : ''}`} onClick={() => setFiltro(k)}>{t}</button>
                ))}
              </div>
            )}
          </div>
          {loading ? (
            <div className="rs-vacio">Cargando…</div>
          ) : !precios.length ? (
            <div className="rs-vacio">Aún no has agregado precios de referencia.<br />Toca <b>Nuevo precio</b> para empezar tu tabla.</div>
          ) : (
            Object.entries(grupos).map(([prod, items]) => (
              <div className="pr-grupo" key={prod}>
                <h3>
                  <IconoProducto producto={prod} />
                  {prod}
                  <span className="pr-linea">{piezaDe(prod).prenda === 'chaq' ? 'Chaqueta' : 'Camiseta'}</span>
                </h3>
                {items.map((pr) => (
                  <div key={pr.id} className={`pr-fila ${editId === pr.id ? 'on' : ''}`}>
                    <div className="pr-mat">
                      <b>{pr.material}</b>
                      {pr.nota && <div>{pr.nota}</div>}
                    </div>
                    <span className="pr-uni">por {pr.unidad === 'kilo' ? 'kilo' : 'unidad'}</span>
                    <span className="pr-precio">{fmtCOP(pr.precio)}</span>
                    <div className="pr-acc">
                      <button className="lp-ico" title="Agregar al cotizador" aria-label={`Agregar ${prod} ${pr.material} al cotizador`} onClick={() => agregarLinea(pr.id)}>{Ico.mas}</button>
                      <button className="lp-ico" title="Editar precio" aria-label={`Editar ${prod} ${pr.material}`} onClick={() => abrir({ producto: pr.producto, material: pr.material, precio: String(pr.precio), unidad: pr.unidad || 'unidad', nota: pr.nota || '' }, pr.id)}>{Ico.editar}</button>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="pr-der">
          {form && (
            <div className="rs-panel" ref={formRef}>
              <div className="rs-panel-h">
                <h2>{editId ? 'Editar precio' : 'Nuevo precio'}</h2>
                <button className="lp-ico" aria-label="Cerrar" onClick={cerrar}>{Ico.quitar}</button>
              </div>
              <div className="pr-form">
                <div className="fld full">
                  <label>Producto</label>
                  <input list="dl-productos" value={form.producto} onChange={campo('producto')} placeholder="Ej: Cuello camiseta" />
                  <datalist id="dl-productos">{PRODUCTOS_SUGERIDOS.map((m) => <option key={m} value={m} />)}</datalist>
                </div>
                <div className="fld full">
                  <label>Material</label>
                  <input list="dl-materiales" value={form.material} onChange={campo('material')} placeholder="Ej: Poliéster con licra" />
                  <datalist id="dl-materiales">{MATERIALES_SUGERIDOS.map((m) => <option key={m} value={m} />)}</datalist>
                </div>
                <div className="fld">
                  <label>Precio</label>
                  <input inputMode="numeric" className="mono" value={form.precio} onChange={campo('precio')} placeholder="Ej: 2600" />
                  {numero(form.precio) > 0 && <span className="pr-ayuda">= {fmtCOP(Math.round(numero(form.precio)))}</span>}
                </div>
                <div className="fld">
                  <label>Se cobra</label>
                  <select value={form.unidad} onChange={campo('unidad')}>
                    <option value="unidad">Por unidad</option>
                    <option value="kilo">Por kilo</option>
                  </select>
                </div>
                <div className="fld full">
                  <label>Nota (opcional)</label>
                  <input value={form.nota} onChange={campo('nota')} placeholder="Ej: mayorista, mínimo 100 unidades" />
                </div>
              </div>
              <div className="ed-acc">
                {editId && <button className="btn btn-d pr-borrar" onClick={eliminar}>Eliminar</button>}
                <button className="btn btn-s" onClick={cerrar}>Cancelar</button>
                <button className="btn btn-p" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Guardar precio'}</button>
              </div>
            </div>
          )}

          <div className="rs-panel pr-coti">
            <div className="rs-panel-h"><h2>Cotizador</h2><span>Usa los precios de la lista</span></div>
            <div className="pr-coti-b">
              <div className="fld">
                <input value={cliente} onChange={(e) => { setCliente(e.target.value); setCopiado('') }} placeholder="Nombre del cliente (opcional)" aria-label="Nombre del cliente" />
              </div>
              {!precios.length ? (
                <p className="pr-ayuda">Primero agrega precios a la lista.</p>
              ) : (
                <>
                  <div className="pr-lineas">
                    {lineas.map((l, i) => {
                      const p = precioDe(l.id)
                      const sub = p ? Math.round(p.precio * numero(l.c)) : 0
                      return (
                        <div className="pr-lin" key={i}>
                          <select value={l.id ?? ''} onChange={(e) => { cambiarLinea(i, { id: precios.find((x) => String(x.id) === e.target.value)?.id }); setCopiado('') }} aria-label="Producto">
                            {precios.map((x) => <option key={x.id} value={x.id}>{x.producto} · {x.material} ({fmtCOP(x.precio)}/{unidadCorta(x)})</option>)}
                          </select>
                          <input className="mono" inputMode="decimal" value={l.c} onChange={(e) => { cambiarLinea(i, { c: e.target.value }); setCopiado('') }} placeholder={p?.unidad === 'kilo' ? 'kg' : 'cant.'} aria-label={`Cantidad en ${p?.unidad === 'kilo' ? 'kilos' : 'unidades'}`} />
                          <button className="lp-ico" aria-label="Quitar" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}>{Ico.quitar}</button>
                          {p && <div className="pr-sub">{numero(l.c).toLocaleString('es-CO')} {unidadCorta(p)} × {fmtCOP(p.precio)} = {fmtCOP(sub)}</div>}
                        </div>
                      )
                    })}
                  </div>
                  <button className="lp-btn pr-add" onClick={() => agregarLinea()}>{Ico.mas}Agregar producto</button>
                  <div className="pr-tot"><span>Total</span><b>{fmtCOP(total)}</b></div>
                  <button className="btn btn-p pr-copiar" onClick={copiar}>Copiar para WhatsApp</button>
                  <div className="pr-ok" role="status">{copiado}</div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
