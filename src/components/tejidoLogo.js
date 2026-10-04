// ============================================
// LOGO QUE SE TEJE
// ============================================
// Anima el logo como si se tejiera: la cámara empieza junto a las agujas, la
// tela verde se teje punto por punto (de abajo hacia arriba, ida y vuelta,
// como se teje de verdad) con las agujas entrando y saliendo, la cámara se
// aleja, el mismo hilo cose "L & L", se estiran las líneas, aparece
// "Tejidos y Confecciones" y un brillo pasa por la tela.
// No usa librerías: un <canvas>, los trazos de logoVector.js y, para las
// líneas y el subtítulo, el PNG del logo.

import { TELA_D, LETRAS_D } from './logoVector'

// Medidas en píxeles del PNG del logo (500 x 500)
const TELA = { x: 194, y: 151, w: 121, h: 120, cols: 4, filas: 4 }
const AGUJAS = [
  { bola: [320, 109.5], punta: [295, 172] },
  { bola: [334.5, 123], punta: [280, 186] },
]
const LETRAS = { x: 168, y: 288, w: 182, h: 58, hilo: 348 }
const VERDE = '#4b8523'
const AZUL = '#1a3c63'

// Tiempos en segundos
const T = {
  agujas: [0, 0.9],
  tejer: [0.9, 4.3],
  camara: [4.25, 5.2],
  bajar: [4.3, 4.9],
  letras: [4.9, 5.8],
  lineas: [5.7, 6.5],
  sub: [5.85, 6.65],
  brillo: [6.6, 7.4],
  fin: 7.55,
}

// Planos de cámara: junto a las agujas, la tela, el logo completo
const PLANOS = {
  agujas: { x: 262, y: 100, w: 82, h: 96, max: 4.6 },
  tela: { x: 186, y: 98, w: 160, h: 180, max: 3.4 },
  logo: { x: 0, y: 96, w: 500, h: 294, max: 1.5 },
}

const lim = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const prog = (t, [a, b]) => lim((t - a) / (b - a))
const salida = (p) => 1 - Math.pow(1 - p, 3)
const suave = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)
const rebote = (p) => 1 + 2.5 * Math.pow(p - 1, 3) + 1.5 * Math.pow(p - 1, 2)
const mezclar = (a, b, e) => {
  const r = {}
  for (const c of ['x', 'y', 'w', 'h', 'max']) r[c] = a[c] + (b[c] - a[c]) * e
  return r
}

// Orden de los puntos: fila de abajo primero, ida y vuelta.
function crearPuntos() {
  const cw = TELA.w / TELA.cols, ch = TELA.h / TELA.filas
  const puntos = []
  for (let f = TELA.filas - 1, n = 0; f >= 0; f--, n++) {
    const cols = [...Array(TELA.cols).keys()]
    const izqADer = n % 2 === 0
    if (!izqADer) cols.reverse()
    cols.forEach((c) => {
      const x = TELA.x + c * cw, y = TELA.y + f * ch
      const ini = [x + cw * 0.08, y + ch * 0.04]
      const fin = [x + cw * 0.92, y + ch * 0.04]
      const fondo = [x + cw * 0.5, y + ch * 0.97]
      const camino = izqADer ? [ini, fondo, fin] : [fin, fondo, ini]
      const l1 = Math.hypot(camino[1][0] - camino[0][0], camino[1][1] - camino[0][1])
      const l2 = Math.hypot(camino[2][0] - camino[1][0], camino[2][1] - camino[1][1])
      puntos.push({ x, y, w: cw, h: ch, camino, l1, l2 })
    })
  }
  return puntos
}

function puntoEn(pt, f) {
  const [a, b, c] = pt.camino
  const d = f * (pt.l1 + pt.l2)
  if (d <= pt.l1) {
    const k = pt.l1 ? d / pt.l1 : 0
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
  }
  const k = pt.l2 ? (d - pt.l1) / pt.l2 : 0
  return [b[0] + (c[0] - b[0]) * k, b[1] + (c[1] - b[1]) * k]
}

// Arranca la animación. Devuelve { saltar, detener }.
export function animarLogo(canvas, img, { reducido = false, alTerminar } = {}) {
  const ctx = canvas.getContext('2d')
  const tela = new Path2D(TELA_D)
  const letras = new Path2D(LETRAS_D)
  const puntos = crearPuntos()
  const mascara = document.createElement('canvas')
  const mx = mascara.getContext('2d')
  const fibras = []
  const cam = { s: 1, tx: 0, ty: 0 }
  let dpr = 1, raf = 0, terminado = false
  let inicio = null, antes = null
  let desfase = reducido ? T.brillo[1] : 0
  let ultimaCabeza = AGUJAS[1].punta

  function medir() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5)
    canvas.width = mascara.width = Math.round((canvas.clientWidth || 360) * dpr)
    canvas.height = mascara.height = Math.round((canvas.clientHeight || 640) * dpr)
  }
  medir()
  window.addEventListener('resize', medir)

  function encuadrar(t) {
    const r = t < T.camara[0]
      ? mezclar(PLANOS.agujas, PLANOS.tela, suave(prog(t, [0.35, 1.6])))
      : mezclar(PLANOS.tela, PLANOS.logo, suave(prog(t, T.camara)))
    const W = canvas.width / dpr, H = canvas.height / dpr
    const s = Math.min((W * 0.86) / r.w, (H * 0.8) / r.h, r.max)
    cam.s = s * dpr
    cam.tx = (W / 2 - (r.x + r.w / 2) * s) * dpr
    cam.ty = (H / 2 - (r.y + r.h / 2) * s) * dpr
  }
  const enLogo = (c) => c.setTransform(cam.s, 0, 0, cam.s, cam.tx, cam.ty)
  const enPixeles = (c) => c.setTransform(1, 0, 0, 1, 0, 0)
  const limpiarMascara = () => { enPixeles(mx); mx.clearRect(0, 0, mascara.width, mascara.height); enLogo(mx) }
  const pegarMascara = () => { enPixeles(ctx); ctx.drawImage(mascara, 0, 0); enLogo(ctx) }

  function pintarTela(c) { c.fillStyle = VERDE; c.fill(tela) }

  function recorte(x, y, w, h, alfa, pintar) {
    if (w <= 0 || h <= 0 || alfa <= 0) return
    ctx.save()
    ctx.globalAlpha = alfa
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
    pintar()
    ctx.restore()
  }
  const delPng = () => ctx.drawImage(img, 0, 0, 500, 500)

  // Agujas: entran y salen a lo largo de su eje, una a la vez, como al tejer
  function pintarAgujas(empujes, dx, dy, alfa) {
    ctx.save()
    ctx.globalAlpha = alfa
    ctx.translate(dx, dy)
    AGUJAS.forEach(({ bola, punta }, i) => {
      const vx = punta[0] - bola[0], vy = punta[1] - bola[1]
      const largo = Math.hypot(vx, vy)
      const ux = vx / largo, uy = vy / largo
      const m = empujes[i]
      const b = [bola[0] + ux * m, bola[1] + uy * m]
      const p = [punta[0] + ux * m, punta[1] + uy * m]
      const nx = -uy, ny = ux
      const a = 1.35
      const cuello = [p[0] - ux * 7, p[1] - uy * 7]
      ctx.fillStyle = '#696d75'
      ctx.beginPath()
      ctx.moveTo(b[0] + nx * a, b[1] + ny * a)
      ctx.lineTo(cuello[0] + nx * a, cuello[1] + ny * a)
      ctx.lineTo(p[0], p[1])
      ctx.lineTo(cuello[0] - nx * a, cuello[1] - ny * a)
      ctx.lineTo(b[0] - nx * a, b[1] - ny * a)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(255, 255, 255, .35)'
      ctx.lineWidth = 0.45
      ctx.beginPath()
      ctx.moveTo(b[0] + nx * 0.5, b[1] + ny * 0.5)
      ctx.lineTo(cuello[0] + nx * 0.5, cuello[1] + ny * 0.5)
      ctx.stroke()
      ctx.fillStyle = '#696d75'
      ctx.beginPath(); ctx.arc(b[0], b[1], 4.5, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(255, 255, 255, .28)'
      ctx.beginPath(); ctx.arc(b[0] - 1.4, b[1] - 1.4, 1.5, 0, Math.PI * 2); ctx.fill()
    })
    ctx.restore()
  }

  function hilo(desde, hasta, t, alfa) {
    if (alfa <= 0) return
    const mx_ = (desde[0] + hasta[0]) / 2, my = (desde[1] + hasta[1]) / 2
    const largo = Math.hypot(hasta[0] - desde[0], hasta[1] - desde[1])
    const cx = mx_ + Math.sin(t * 3.1) * 5, cy = my + 6 + largo * 0.12
    ctx.save()
    ctx.globalAlpha = alfa
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#3a6a1c'
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(...desde); ctx.quadraticCurveTo(cx, cy, ...hasta); ctx.stroke()
    // torsión del hilo: rayitas claras a lo largo
    ctx.strokeStyle = 'rgba(159, 208, 110, .9)'
    ctx.lineWidth = 0.5
    ctx.setLineDash([1.2, 1.6])
    ctx.lineDashOffset = -t * 6
    ctx.beginPath(); ctx.moveTo(...desde); ctx.quadraticCurveTo(cx, cy, ...hasta); ctx.stroke()
    ctx.restore()
  }

  function cabeza([x, y]) {
    ctx.save()
    ctx.shadowColor = 'rgba(159, 208, 110, .9)'
    ctx.shadowBlur = 9 * dpr
    ctx.fillStyle = '#b8e08f'
    ctx.beginPath(); ctx.arc(x, y, 1.9, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }

  function soltarFibras([x, y], dt) {
    if (reducido) return
    if (Math.random() < dt * 36) {
      fibras.push({ x, y, vx: (Math.random() - 0.5) * 14, vy: -(5 + Math.random() * 12), giro: Math.random() * Math.PI * 2, vida: 1 })
    }
  }

  function pintarFibras(dt) {
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineWidth = 0.5
    for (let i = fibras.length - 1; i >= 0; i--) {
      const f = fibras[i]
      f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 4 * dt; f.giro += dt * 2; f.vida -= dt * 0.9
      if (f.vida <= 0) { fibras.splice(i, 1); continue }
      ctx.strokeStyle = `rgba(140, 190, 95, ${f.vida * 0.8})`
      ctx.beginPath(); ctx.arc(f.x, f.y, 1.8, f.giro, f.giro + 1.9); ctx.stroke()
    }
    ctx.restore()
  }

  function cuadro(ahora) {
    if (inicio === null) { inicio = ahora; antes = ahora }
    const dt = Math.min(0.05, (ahora - antes) / 1000)
    antes = ahora
    const t = (ahora - inicio) / 1000 + desfase
    encuadrar(t)

    enPixeles(ctx)
    ctx.fillStyle = '#f5f2e7'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    enLogo(ctx)

    // --- Tela: el dibujo tenue de lo que se va a tejer
    const pTejer = prog(t, T.tejer)
    if (pTejer < 1) {
      ctx.save(); ctx.globalAlpha = 0.08 * prog(t, [0.2, 0.9]); pintarTela(ctx); ctx.restore()
    }

    // --- Tela: puntos terminados, punto en curso y destello
    let cabezaHilo = null
    let vaiven = 0
    let enCurso = 0
    if (pTejer >= 1) {
      pintarTela(ctx)
    } else if (pTejer > 0) {
      const avance = pTejer * puntos.length
      const idx = Math.floor(avance)
      const p = avance - idx
      enCurso = idx
      if (idx > 0) {
        ctx.save()
        ctx.beginPath()
        for (let i = 0; i < idx; i++) ctx.rect(puntos[i].x, puntos[i].y, puntos[i].w, puntos[i].h)
        ctx.clip()
        pintarTela(ctx)
        ctx.restore()
      }
      const pt = puntos[idx]
      if (pt) {
        const f = lim(p / 0.8)
        const fin = puntoEn(pt, f)
        // máscara con la forma del hilo recorrido
        limpiarMascara()
        mx.save()
        mx.beginPath(); mx.rect(pt.x, pt.y, pt.w, pt.h); mx.clip()
        mx.lineWidth = pt.w * 0.64
        mx.lineCap = 'round'; mx.lineJoin = 'round'
        mx.strokeStyle = '#000'
        mx.beginPath()
        mx.moveTo(...pt.camino[0])
        if (f * (pt.l1 + pt.l2) > pt.l1) mx.lineTo(...pt.camino[1])
        mx.lineTo(...fin)
        mx.stroke()
        mx.restore()
        // fuera del recorte, para que el borde del recorte no deje una raya
        mx.globalCompositeOperation = 'source-in'
        pintarTela(mx)
        mx.globalCompositeOperation = 'source-over'
        pegarMascara()
        if (p > 0.7) recorte(pt.x, pt.y, pt.w, pt.h, (p - 0.7) / 0.3, () => pintarTela(ctx))
        cabezaHilo = fin
        vaiven = Math.sin(p * Math.PI)
      }
      const previo = puntos[idx - 1]
      if (previo && p < 0.45) {
        const a = 1 - p / 0.45
        const cx = previo.x + previo.w / 2, cy = previo.y + previo.h / 2
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, previo.w * 0.75)
        g.addColorStop(0, `rgba(198, 236, 160, ${0.5 * a})`)
        g.addColorStop(1, 'rgba(198, 236, 160, 0)')
        ctx.fillStyle = g
        ctx.fillRect(previo.x - previo.w * 0.3, previo.y - previo.h * 0.3, previo.w * 1.6, previo.h * 1.6)
      }
    }

    // --- Agujas: bajan con un rebote y luego se turnan, entra una y sale la otra
    const pAg = prog(t, T.agujas)
    let punta = null
    if (pAg > 0) {
      const e = rebote(pAg)
      const dx = (1 - e) * 60, dy = -(1 - e) * 60
      const turno = enCurso % 2 === 0 ? 1 : -1
      const empujes = [vaiven * 3.2 * turno, -vaiven * 3.2 * turno]
      pintarAgujas(empujes, dx, dy, lim(pAg * 2))
      const { bola, punta: p } = AGUJAS[1]
      const largo = Math.hypot(p[0] - bola[0], p[1] - bola[1])
      punta = [p[0] + ((p[0] - bola[0]) / largo) * empujes[1] + dx, p[1] + ((p[1] - bola[1]) / largo) * empujes[1] + dy]
    }

    // --- Hilo: de las agujas al punto en curso; luego baja a coser las letras
    const pLetras = prog(t, T.letras)
    const pBajar = prog(t, T.bajar)
    const xCosido = LETRAS.x + suave(pLetras) * LETRAS.w
    if (cabezaHilo) ultimaCabeza = cabezaHilo
    let destino = cabezaHilo
    if (!destino && pBajar > 0 && pLetras < 1) {
      const e = suave(pBajar)
      const a = ultimaCabeza, b = [LETRAS.x, LETRAS.hilo]
      destino = pLetras > 0 ? [xCosido, LETRAS.hilo] : [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e]
    }
    const alfaHilo = pTejer > 0 ? 1 - prog(t, [T.letras[1], T.letras[1] + 0.35]) : 0
    if (punta && alfaHilo > 0) {
      hilo(punta, destino || [xCosido, LETRAS.hilo], t, alfaHilo)
      if (destino) {
        cabeza(destino)
        soltarFibras(destino, dt)
      }
    }

    // --- "L & L": se cose de izquierda a derecha
    if (pLetras > 0) {
      recorte(LETRAS.x - 2, LETRAS.y, xCosido - LETRAS.x + 2, LETRAS.h, 1, () => { ctx.fillStyle = AZUL; ctx.fill(letras) })
      const alfaPuntada = 1 - prog(t, [T.letras[1] + 0.1, T.letras[1] + 0.6])
      if (alfaPuntada > 0) {
        ctx.save()
        ctx.globalAlpha = alfaPuntada
        ctx.strokeStyle = VERDE
        ctx.lineWidth = 1.2
        ctx.setLineDash([5, 4])
        ctx.beginPath(); ctx.moveTo(LETRAS.x, LETRAS.hilo); ctx.lineTo(xCosido, LETRAS.hilo); ctx.stroke()
        ctx.restore()
      }
    }

    // --- Líneas que se estiran hacia afuera
    const pL = salida(prog(t, T.lineas))
    if (pL > 0) {
      recorte(113 - pL * 114, 362, pL * 114, 22, 1, delPng)
      recorte(386, 362, pL * 114, 22, 1, delPng)
    }

    // --- "Tejidos y Confecciones": se abre desde el centro
    const pS = salida(prog(t, T.sub))
    if (pS > 0) recorte(250 - pS * 140, 360, pS * 280, 30, pS, delPng)

    // --- Brillo que pasa por la tela
    const pB = prog(t, T.brillo)
    if (pB > 0 && pB < 1) {
      limpiarMascara()
      pintarTela(mx)
      mx.globalCompositeOperation = 'source-atop'
      const bx = TELA.x - 40 + suave(pB) * (TELA.w + 80)
      const g = mx.createLinearGradient(bx - 26, TELA.y, bx + 26, TELA.y + TELA.h * 0.6)
      g.addColorStop(0, 'rgba(255, 255, 255, 0)')
      g.addColorStop(0.5, 'rgba(255, 255, 240, .6)')
      g.addColorStop(1, 'rgba(255, 255, 255, 0)')
      mx.fillStyle = g
      mx.fillRect(TELA.x - 5, TELA.y - 5, TELA.w + 10, TELA.h + 10)
      mx.globalCompositeOperation = 'source-over'
      pegarMascara()
    }

    pintarFibras(dt)

    const fin = reducido ? T.brillo[1] + 1.1 : T.fin
    if (t >= fin && !terminado) {
      terminado = true
      alTerminar?.()
    }
    raf = requestAnimationFrame(cuadro)
  }
  raf = requestAnimationFrame(cuadro)

  return {
    saltar() {
      if (terminado) return
      const transcurrido = inicio === null ? 0 : (antes - inicio) / 1000
      desfase = Math.max(desfase, T.brillo[1] - transcurrido)
      fibras.length = 0
      terminado = true
      alTerminar?.()
    },
    detener() {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', medir)
    },
  }
}
