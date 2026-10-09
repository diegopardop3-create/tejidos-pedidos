import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fmtFecha } from './constants'
import { InsigniaTipos } from './Insignias'
import { PESO_VECINO, PESO_VISOR, compartirFoto, reintentarErrores, useDiseno, useFotosGrandes } from './fotosDisenos'
import { raizVentanas, useAtrasCierra, useBloquearFondo } from './capas'

// ============================================
// VISOR DE DISEÑOS
// ============================================
// La foto sale de su tarjeta y crece hasta llenar la pantalla; al cerrar
// vuelve a su sitio. Se pasa al siguiente diseño deslizando de lado o con las
// flechas; deslizar hacia abajo cierra. Doble toque o dos dedos amplían para
// ver el detalle del tejido. El botón "atrás" del celular cierra el visor en
// vez de salir de la app. Abajo: los pedidos donde se usó el diseño y el
// botón para mandar la foto por WhatsApp.

const sinMovimiento = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const CURVA = 'cubic-bezier(.2, 0, 0, 1)'
const ZOOM_MAX = 4
const ZOOM_DOBLE = 2.5
const SIN_RECORTE = 'inset(0px 0px 0px 0px round 6px)' // esquinas de la foto grande

// Cómo transformar la foto grande (rectángulo F, sin transformar) para que
// quede exactamente sobre su tarjeta (T), recortada igual que en la cuadrícula.
function haciaTarjeta(F, T) {
  const s = Math.max(T.width / F.width, T.height / F.height)
  const dx = T.left + T.width / 2 - (F.left + F.width / 2)
  const dy = T.top + T.height / 2 - (F.top + F.height / 2)
  const ix = Math.max(0, (F.width - T.width / s) / 2)
  const iy = Math.max(0, (F.height - T.height / s) / 2)
  return {
    transform: `translate(${dx}px, ${dy}px) scale(${s})`,
    clipPath: `inset(${iy}px ${ix}px ${iy}px ${ix}px round ${11 / s}px)`,
  }
}

const marcoDe = (id) => document.querySelector(`.dz-tarj[data-id="${CSS.escape(String(id))}"] .dz-marco`)
const enPantalla = (r) => !!r && r.width > 0 && r.bottom > 0 && r.top < window.innerHeight

// Deja la tarjeta a la vista (detrás del visor) para que la foto vuelva a ella.
function traerAVista(el) {
  const r = el.getBoundingClientRect()
  const arriba = document.querySelector('.hdr')?.getBoundingClientRect().bottom || 0
  if (r.top >= arriba && r.bottom <= window.innerHeight) return
  window.scrollBy({ top: r.top - arriba - (window.innerHeight - arriba - r.height) / 2, behavior: 'instant' })
}

// Pide de antemano el diseño vecino, para que al pasar ya esté.
function Precarga({ d }) {
  useDiseno(d.rep.id, d.rep.tabla, true, PESO_VECINO)
  return null
}

// lista: los diseños de la galería, al día (mientras se revisan las fotos
// pueden aparecer más o juntarse dos). inicio: el diseño que se tocó.
export default function VisorDisenos({ lista, inicio, onCerrar, onVerPedido, showToast }) {
  const [pos, setPos] = useState({ key: inicio, dir: 0 })
  const [chrome, setChrome] = useState(true) // botones e información a la vista
  const ultimaPos = useRef(0)
  let di = lista.findIndex((x) => x.key === pos.key)
  // Si se juntó con otro mientras se miraba, se sigue en el que lo contiene.
  if (di < 0) di = lista.findIndex((x) => x.claves.includes(pos.key))
  if (di < 0) di = Math.min(ultimaPos.current, lista.length - 1)
  ultimaPos.current = di
  const d = lista[di] || lista[0]
  const idx = d.rep.idx
  const f = useDiseno(d.rep.id, d.rep.tabla, true, PESO_VISOR)
  const listo = f.estado === 'listo'
  const clave = d.key
  const grandes = useFotosGrandes(d.rep.id, listo)
  const blob = grandes?.blobs?.[idx] || null

  // La foto grande se muestra cuando ya está lista para pintarse; mientras
  // tanto se ve la pequeña (ya en memoria), así nunca queda en blanco.
  const [grande, setGrande] = useState({ clave: null, src: null, de: null })
  useEffect(() => {
    const url = grandes?.urls?.[idx]
    if (!url) return undefined
    let vivo = true
    const im = new Image()
    im.src = url
    const mostrar = () => { if (vivo) setGrande({ clave, src: url, de: grandes }) }
    if (im.decode) im.decode().then(mostrar, mostrar)
    else im.onload = mostrar
    return () => { vivo = false }
  }, [grandes, idx, clave])
  // Solo si es de las fotos vigentes (al volver a un diseño se crean de nuevo).
  const src = (grande.clave === clave && grande.de === grandes && grande.src) || f.minis[idx] || null

  const [rotas, setRotas] = useState(() => new Set()) // fotos que el navegador no pudo abrir
  const haySiguiente = di + 1 < lista.length
  const hayAnterior = di > 0
  const usos = d.usos
  const u = d.ultimo

  const raizRef = useRef(null)
  const veloRef = useRef(null)
  const escenaRef = useRef(null)
  const imgRef = useRef(null)
  const cerrarBtnRef = useRef(null)
  const cerrando = useRef(false)
  const abiertoEn = useRef(performance.now())
  const primera = useRef(true) // la primera foto llega volando desde su tarjeta
  const animada = useRef(null) // última foto a la que ya se le hizo la entrada
  const zoom = useRef({ s: 1, tx: 0, ty: 0 })
  const gesto = useRef(null)
  const punteros = useRef(new Map())
  const ultimoToque = useRef({ t: 0, x: 0, y: 0 })
  const esperaToque = useRef(0)

  // ---------- Ampliar y mover ----------
  function ponerZoom(z, animar = false) {
    zoom.current = z
    const img = imgRef.current
    if (!img) return
    const t = z.s === 1 && !z.tx && !z.ty ? 'none' : `translate(${z.tx}px, ${z.ty}px) scale(${z.s})`
    if (animar && !sinMovimiento()) {
      const de = getComputedStyle(img).transform
      img.animate([{ transform: de }, { transform: t }], { duration: 240, easing: CURVA })
    }
    img.style.transform = t === 'none' ? '' : t
  }

  // Tamaño y centro de la foto sin ampliar.
  function geometria(img) {
    for (const a of img.getAnimations()) a.finish()
    const r = img.getBoundingClientRect()
    const { s, tx, ty } = zoom.current
    return { W: r.width / s, H: r.height / s, cx: r.left + r.width / 2 - tx, cy: r.top + r.height / 2 - ty }
  }

  // Que la foto ampliada no deje bordes vacíos dentro de la pantalla.
  function limitar(z, g) {
    const lim = (t, c, tam, vista) => {
      if (tam <= vista) return 0
      return Math.min(tam / 2 - c, Math.max(vista - c - tam / 2, t))
    }
    return { s: z.s, tx: lim(z.tx, g.cx, g.W * z.s, window.innerWidth), ty: lim(z.ty, g.cy, g.H * z.s, window.innerHeight) }
  }

  // Al soltar: si quedó más chica que normal vuelve a normal; si quedó más
  // grande que el máximo, baja al máximo sin perder lo que se estaba mirando.
  function asentarZoom(g) {
    const z = zoom.current
    if (z.s <= 1.02) { ponerZoom({ s: 1, tx: 0, ty: 0 }, true); return }
    const s = Math.min(ZOOM_MAX, z.s)
    ponerZoom(limitar({ s, tx: z.tx * s / z.s, ty: z.ty * s / z.s }, g), true)
  }

  function volverAlCentro(img) {
    const de = img.style.transform || 'none'
    img.style.transform = ''
    if (!sinMovimiento()) img.animate([{ transform: de }, { transform: 'none' }], { duration: 220, easing: CURVA })
  }

  function soltarVelo() {
    const v = veloRef.current
    raizRef.current?.classList.remove('arrastrando')
    if (!v || !v.style.opacity) return
    const de = v.style.opacity
    v.style.opacity = ''
    if (!sinMovimiento()) v.animate([{ opacity: de }, { opacity: 1 }], { duration: 220, easing: CURVA })
  }

  // ---------- Pasar de foto ----------
  function rebotar(dir) {
    const img = imgRef.current
    if (!img) return
    const de = img.style.transform || 'none'
    img.style.transform = ''
    if (!sinMovimiento()) img.animate([{ transform: de }, { transform: `translateX(${-dir * 16}px)` }, { transform: 'none' }], { duration: 300, easing: CURVA })
  }

  function ir(delta) {
    if (cerrando.current) return
    zoom.current = { s: 1, tx: 0, ty: 0 }
    const otro = lista[di + delta]
    if (!otro) { rebotar(delta); return }
    setPos({ key: otro.key, dir: delta })
  }

  // La foto nueva entra desde el lado hacia donde se va.
  useLayoutEffect(() => {
    const img = imgRef.current
    if (primera.current || !pos.dir || !img) return
    animada.current = clave
    if (!sinMovimiento()) img.animate([{ transform: `translateX(${pos.dir * 48}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: CURVA })
  }, [pos.key]) // eslint-disable-line react-hooks/exhaustive-deps

  function alCargar(e) {
    const img = e.currentTarget
    if (primera.current) {
      primera.current = false
      animada.current = clave
      img.classList.remove('esperando')
      if (sinMovimiento()) return
      const T = marcoDe(d.key)?.getBoundingClientRect()
      const F = img.getBoundingClientRect()
      const aTiempo = performance.now() - abiertoEn.current < 800
      if (aTiempo && enPantalla(T) && F.width) {
        img.animate([haciaTarjeta(F, T), { transform: 'none', clipPath: SIN_RECORTE }], { duration: 380, easing: CURVA })
      } else {
        img.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: CURVA })
      }
      return
    }
    // Una foto que llegó después de pasar a ella (no estaba cargada).
    if (animada.current !== clave) {
      animada.current = clave
      if (!sinMovimiento()) img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 })
    }
  }

  // ---------- Cerrar ----------
  // El botón "atrás" del celular (o del navegador) cierra el visor.
  const soltarHistoria = useAtrasCierra('llVisor', () => cerrarRef.current({ desdeHistoria: true }))

  function cerrar({ desdeHistoria = false } = {}) {
    if (cerrando.current) return
    cerrando.current = true
    window.clearTimeout(esperaToque.current)
    if (!desdeHistoria) soltarHistoria()
    const raiz = raizRef.current
    const img = imgRef.current
    raiz?.classList.add('cerrando')
    if (!raiz || sinMovimiento()) { onCerrar(); return }

    const velo = veloRef.current
    if (velo) velo.animate([{ opacity: getComputedStyle(velo).opacity }, { opacity: 0 }], { duration: 280, easing: 'ease-out', fill: 'forwards' })

    let anim = null
    if (img && !img.classList.contains('esperando')) {
      const actual = getComputedStyle(img).transform // con lo arrastrado o ampliado
      for (const a of img.getAnimations()) a.cancel()
      const antes = img.style.transform
      img.style.transform = 'none'
      const F = img.getBoundingClientRect()
      img.style.transform = antes
      const marco = marcoDe(d.key)
      if (marco) traerAVista(marco)
      const T = marco?.getBoundingClientRect()
      if (enPantalla(T) && F.width) {
        anim = img.animate([{ transform: actual, clipPath: SIN_RECORTE }, haciaTarjeta(F, T)], { duration: 320, easing: CURVA, fill: 'forwards' })
      } else {
        const base = actual === 'none' ? '' : actual
        anim = img.animate([{ transform: actual, opacity: 1 }, { transform: `${base} scale(.9)`, opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' })
      }
    }
    if (anim) anim.finished.then(onCerrar, onCerrar)
    else window.setTimeout(onCerrar, 240)
  }

  function verPedido(pedidoId) {
    if (cerrando.current) return
    cerrando.current = true
    soltarHistoria()
    onCerrar()
    onVerPedido?.(pedidoId)
  }

  // Manda la foto completa por WhatsApp (menú de compartir del celular). Si
  // el navegador no puede compartir archivos, la descarga.
  async function compartir() {
    if (!blob) return
    try {
      const r = await compartirFoto(blob, `diseno-${String(u.pedido.numero || 'LyL').replace(/[^\w-]/g, '')}.jpg`)
      if (r === 'descargada') showToast?.('⬇️', 'Foto descargada: adjúntala en WhatsApp')
    } catch {
      showToast?.('⚠️', 'No se pudo compartir la foto')
    }
  }

  // Las funciones más nuevas, para los escuchas que se crean una sola vez.
  const cerrarRef = useRef(cerrar)
  const irRef = useRef(ir)
  const zoomRef = useRef(ponerZoom)
  cerrarRef.current = cerrar
  irRef.current = ir
  zoomRef.current = ponerZoom

  // ---------- Toques y gestos ----------
  function alBajar(e) {
    if (cerrando.current || e.target.closest('button')) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const img = imgRef.current
    if (punteros.current.size === 2 && img) {
      // Dos dedos: ampliar. Si venía deslizando, la foto vuelve a su sitio.
      if (gesto.current?.tipo === 'pasar' || gesto.current?.tipo === 'bajar') { img.style.transform = ''; soltarVelo() }
      const [a, b] = [...punteros.current.values()]
      gesto.current = {
        tipo: 'pellizco', g: geometria(img), z0: { ...zoom.current },
        d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      }
      return
    }
    if (punteros.current.size > 1) return
    gesto.current = { tipo: null, x0: e.clientX, y0: e.clientY, t0: performance.now(), z0: { ...zoom.current }, g: img ? geometria(img) : null }
  }

  function alMover(e) {
    const p = punteros.current.get(e.pointerId)
    if (!p) return
    p.x = e.clientX
    p.y = e.clientY
    const gs = gesto.current
    const img = imgRef.current
    if (!gs) return
    if (gs.tipo === 'pellizco') {
      if (punteros.current.size < 2 || !img) return
      const [a, b] = [...punteros.current.values()]
      const s = Math.min(ZOOM_MAX * 1.15, Math.max(0.75, gs.z0.s * Math.hypot(a.x - b.x, a.y - b.y) / gs.d0))
      // El punto que estaba entre los dedos sigue entre los dedos.
      const lx = (gs.m0.x - gs.g.cx - gs.z0.tx) / gs.z0.s
      const ly = (gs.m0.y - gs.g.cy - gs.z0.ty) / gs.z0.s
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
      ponerZoom({ s, tx: mx - gs.g.cx - s * lx, ty: my - gs.g.cy - s * ly })
      return
    }
    const dx = e.clientX - gs.x0
    const dy = e.clientY - gs.y0
    if (!gs.tipo) {
      if (Math.hypot(dx, dy) < 8) return
      if (zoom.current.s > 1.01) gs.tipo = 'mover'
      else if (Math.abs(dx) > Math.abs(dy)) gs.tipo = 'pasar'
      else gs.tipo = dy > 0 ? 'bajar' : 'nada'
    }
    if (gs.tipo === 'mover' && img && gs.g) {
      ponerZoom(limitar({ s: zoom.current.s, tx: gs.z0.tx + dx, ty: gs.z0.ty + dy }, gs.g))
    } else if (gs.tipo === 'pasar' && img) {
      const hay = dx < 0 ? haySiguiente : hayAnterior
      img.style.transform = `translateX(${hay ? dx : dx * 0.3}px)`
    } else if (gs.tipo === 'bajar') {
      const y = Math.max(0, dy)
      if (img) img.style.transform = `translate(${dx * 0.35}px, ${y}px) scale(${1 - Math.min(y, 500) / 1700})`
      if (veloRef.current) veloRef.current.style.opacity = String(1 - Math.min(y, 420) / 560)
      raizRef.current?.classList.toggle('arrastrando', y > 10)
    }
  }

  function alSoltar(e) {
    if (!punteros.current.has(e.pointerId)) return
    punteros.current.delete(e.pointerId)
    const gs = gesto.current
    const img = imgRef.current
    if (!gs) return
    if (gs.tipo === 'pellizco') {
      if (punteros.current.size === 1) {
        // Queda un dedo: sigue moviendo la foto desde donde está.
        const [q] = [...punteros.current.values()]
        gesto.current = { tipo: zoom.current.s > 1.01 ? 'mover' : 'nada', x0: q.x, y0: q.y, t0: performance.now(), z0: { ...zoom.current }, g: gs.g, trasPellizco: true }
        return
      }
      gesto.current = null
      asentarZoom(gs.g)
      return
    }
    if (punteros.current.size) return
    gesto.current = null
    // Venía de dos dedos y soltó el último: acomoda el tamaño.
    if (gs.trasPellizco) { asentarZoom(gs.g); return }
    const dt = Math.max(1, performance.now() - gs.t0)
    const dx = e.clientX - gs.x0
    const dy = e.clientY - gs.y0
    if (!gs.tipo) { tocar(e, dt); return }
    if (gs.tipo === 'pasar') {
      const rapido = Math.abs(dx) > 30 && Math.abs(dx) / dt > 0.45
      if ((dx < -70 || (rapido && dx < 0)) && haySiguiente) { ir(1); return }
      if ((dx > 70 || (rapido && dx > 0)) && hayAnterior) { ir(-1); return }
      if (img) volverAlCentro(img)
      return
    }
    if (gs.tipo === 'bajar') {
      if (dy > 120 || (dy > 40 && dy / dt > 0.5)) { cerrar(); return }
      if (img) volverAlCentro(img)
      soltarVelo()
    }
  }

  function alCancelar(e) {
    punteros.current.delete(e.pointerId)
    if (punteros.current.size) return
    const gs = gesto.current
    gesto.current = null
    const img = imgRef.current
    if (!gs || !img) return
    if (gs.tipo === 'pasar' || gs.tipo === 'bajar') { volverAlCentro(img); soltarVelo() }
    else if (gs.tipo === 'pellizco' || gs.trasPellizco) asentarZoom(gs.g)
  }

  // Un toque en la foto esconde o muestra los botones; fuera de la foto,
  // cierra. Dos toques seguidos amplían (o vuelven a como estaba).
  function tocar(e, dt) {
    if (dt > 400) return
    const ahora = performance.now()
    const u = ultimoToque.current
    const img = imgRef.current
    window.clearTimeout(esperaToque.current)
    if (ahora - u.t < 320 && Math.hypot(e.clientX - u.x, e.clientY - u.y) < 32) {
      ultimoToque.current = { t: 0, x: 0, y: 0 }
      if (!img) return
      if (zoom.current.s > 1.01) { ponerZoom({ s: 1, tx: 0, ty: 0 }, true); return }
      const g = geometria(img)
      const s = ZOOM_DOBLE
      ponerZoom(limitar({ s, tx: (e.clientX - g.cx) * (1 - s), ty: (e.clientY - g.cy) * (1 - s) }, g), true)
      return
    }
    ultimoToque.current = { t: ahora, x: e.clientX, y: e.clientY }
    const r = img?.getBoundingClientRect()
    const sobreFoto = !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    esperaToque.current = window.setTimeout(() => {
      if (sobreFoto || zoom.current.s > 1.01 || !img) setChrome((v) => !v)
      else cerrarRef.current()
    }, 270)
  }

  // ---------- Al abrir y cerrar ----------
  // Mientras está abierto: la página de atrás no se mueve ni recibe el foco.
  useBloquearFondo(cerrarBtnRef)

  // Teclado: Esc cierra, flechas pasan. Rueda con Ctrl (o pellizco en el
  // panel táctil del computador) amplía.
  useEffect(() => {
    const tecla = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); cerrarRef.current() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); irRef.current(1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); irRef.current(-1) }
    }
    const esc = escenaRef.current
    const rueda = (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const img = imgRef.current
      if (!img) return
      const g = geometria(img)
      const z = zoom.current
      const s = Math.min(ZOOM_MAX, Math.max(1, z.s * Math.exp(-e.deltaY / 200)))
      if (s === 1) { zoomRef.current({ s: 1, tx: 0, ty: 0 }); return }
      const lx = (e.clientX - g.cx - z.tx) / z.s
      const ly = (e.clientY - g.cy - z.ty) / z.s
      zoomRef.current(limitar({ s, tx: e.clientX - g.cx - s * lx, ty: e.clientY - g.cy - s * ly }, g))
    }
    const alCambiarTamano = () => { if (zoom.current.s !== 1) zoomRef.current({ s: 1, tx: 0, ty: 0 }) }
    window.addEventListener('keydown', tecla)
    window.addEventListener('resize', alCambiarTamano)
    esc?.addEventListener('wheel', rueda, { passive: false })
    return () => {
      window.removeEventListener('keydown', tecla)
      window.removeEventListener('resize', alCambiarTamano)
      esc?.removeEventListener('wheel', rueda)
      window.clearTimeout(esperaToque.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const siguiente = lista[di + 1]
  const anterior = lista[di - 1]
  const visor = (
    <div ref={raizRef} className={`dz-visor${chrome ? '' : ' sin-chrome'}`} role="dialog" aria-modal="true" aria-label="Fotos de los diseños">
      <div ref={veloRef} className="dz-velo" />

      <div className="dz-arriba dz-chrome">
        <span className="dz-cont">{di + 1} / {lista.length}</span>
        <button ref={cerrarBtnRef} type="button" className="dz-btn" onClick={() => cerrar()} aria-label="Cerrar">{IcoCerrar}</button>
      </div>

      <div
        ref={escenaRef}
        className="dz-escena"
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alCancelar}
      >
        {src && !rotas.has(src) ? (
          <img
            key={clave}
            ref={imgRef}
            className={`dz-foto${primera.current ? ' esperando' : ''}`}
            src={src}
            alt={`Diseño de ${d.clientes.join(', ') || 'un pedido'}`}
            draggable={false}
            onLoad={alCargar}
            onError={() => { primera.current = false; setRotas((r) => new Set(r).add(src)) }}
          />
        ) : src ? (
          <div className="dz-estado"><p>Esta foto no se puede mostrar.</p></div>
        ) : f.estado === 'error' ? (
          <div className="dz-estado">
            <p>No se pudo cargar la foto. Revisa la conexión.</p>
            <button type="button" className="btn btn-s btn-sm" onClick={reintentarErrores}>Reintentar</button>
          </div>
        ) : listo ? (
          <div className="dz-estado"><p>Esta foto ya no está en el pedido.</p></div>
        ) : (
          <div className="dz-gira" role="status" aria-label="Cargando la foto" />
        )}
      </div>

      {hayAnterior && <button type="button" className="dz-btn dz-flecha izq dz-chrome" onClick={() => ir(-1)} aria-label="Diseño anterior">{IcoIzq}</button>}
      {haySiguiente && <button type="button" className="dz-btn dz-flecha der dz-chrome" onClick={() => ir(1)} aria-label="Diseño siguiente">{IcoDer}</button>}

      <div className="dz-abajo dz-chrome">
        <div className="dz-info" key={d.key}>
          <div className="dz-info-txt">
            <div className="dz-info-1">
              <b>{d.clientes.join(', ') || 'Sin cliente'}</b>
              {usos.length === 1 && <span className="dz-info-num">{u.pedido.numero}</span>}
            </div>
            <div className="dz-info-2">
              <InsigniaTipos tipos={u.it?.tipos} prenda={u.prenda} />
              <span>{usos.length > 1 ? `Usado en ${usos.length} pedidos` : fmtFecha(u.pedido.fecha)}</span>
            </div>
            {d.ref && <p className="dz-info-ref">{d.ref}</p>}
            {usos.length > 1 && (
              <div className="dz-usos" role="list" aria-label="Pedidos con este diseño">
                {usos.map((x) => (
                  <button key={x.pedido.id} type="button" role="listitem" className="dz-uso" onClick={() => verPedido(x.pedido.id)} title={`Abrir el pedido ${x.pedido.numero}`}>
                    <b>{x.pedido.numero}</b>
                    <span>{d.clientes.length > 1 ? `${x.pedido.cliente} · ` : ''}{fmtFecha(x.pedido.fecha)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="dz-info-acc">
            <button type="button" className="btn dz-wa" onClick={compartir} disabled={!blob} title="Mandar la foto por WhatsApp">
              {IcoEnviar}WhatsApp
            </button>
            {usos.length === 1 && <button type="button" className="btn btn-p dz-ver" onClick={() => verPedido(u.pedido.id)}>Ver pedido</button>}
          </div>
        </div>
      </div>

      {siguiente && <Precarga key={siguiente.key} d={siguiente} />}
      {anterior && <Precarga key={anterior.key} d={anterior} />}
    </div>
  )
  return createPortal(visor, raizVentanas())
}

const IcoEnviar = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></svg>

const IcoCerrar = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
const IcoIzq = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
const IcoDer = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
