import { NEGOCIO, TIPO_LABEL, fmtFecha, fmtCOP, totalesPorTipoCam, tallasDeTabla, TALLA_SIN_DIVIDIR } from './constants'
import { supabase } from '../supabaseClient'

// ============================================
// COMPROBANTE DE COBRO
// ============================================
// Documento que se le entrega al cliente con lo que se le cobra. NO es una
// factura electrónica de la DIAN (esa solo la puede expedir un proveedor
// autorizado), por eso se llama "comprobante de cobro" y lo dice al pie.
// Lleva lo que pide una cuenta de cobro: ciudad y fecha, número, datos de
// quien cobra y de a quién, detalle, valor en números y en letras, abonos,
// saldo y cómo pagar.
//
// Dos tamaños: carta (generarFacturaPDF) y 10,5 x 15 cm para la impresora
// térmica (generarFacturaMini). Los dos se abren en una ventana nueva con el
// diálogo de imprimir / guardar como PDF.

// Escapa texto escrito a mano (cliente, diseño, notas) para que no rompa el HTML.
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const num = (n) => Number(n || 0).toLocaleString('es-CO')

// ---- Valor en letras (pesos colombianos) ----
const UNID = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve']
const DEC = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
const CEN = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos']
function hasta999(n) {
  if (n === 0) return ''
  if (n === 100) return 'cien'
  const c = Math.floor(n / 100), r = n % 100
  let t = CEN[c]
  if (r) {
    const d = r < 30 ? UNID[r] : DEC[Math.floor(r / 10)] + (r % 10 ? ' y ' + UNID[r % 10] : '')
    t = (t ? t + ' ' : '') + d
  }
  return t
}
// "uno" se acorta a "un" delante de mil / millones / pesos.
const apocope = (t) => t.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un')
function enLetras(valor) {
  let n = Math.round(Math.abs(valor || 0))
  if (n === 0) return 'Cero pesos m/cte.'
  if (n === 1) return 'Un peso m/cte.'
  const millones = Math.floor(n / 1e6), miles = Math.floor((n % 1e6) / 1000), resto = n % 1000
  const partes = []
  if (millones) {
    const m = millones >= 1000
      ? (Math.floor(millones / 1000) === 1 ? 'mil' : apocope(hasta999(Math.floor(millones / 1000))) + ' mil') + (millones % 1000 ? ' ' + apocope(hasta999(millones % 1000)) : '')
      : apocope(hasta999(millones))
    partes.push(millones === 1 ? 'un millón' : m + ' millones')
  }
  if (miles) partes.push(miles === 1 ? 'mil' : apocope(hasta999(miles)) + ' mil')
  if (resto) partes.push(apocope(hasta999(resto)))
  const de = !miles && !resto && millones ? ' de' : ''
  const txt = partes.join(' ') + de + ' pesos m/cte.'
  return txt.charAt(0).toUpperCase() + txt.slice(1)
}

// ---- Datos del cobro (comunes a los dos tamaños) ----
function plural(n, s, p) { return `${num(n)} ${n === 1 ? s : p}` }

// Resume las tallas de un ítem de camiseta: "4: 6 · 6-8: 30 · S: 18".
function resumenTallas(it, tipo) {
  const tallas = tallasDeTabla(it.tabla)
  if (it.tabla?.[TALLA_SIN_DIVIDIR]) tallas.push(TALLA_SIN_DIVIDIR)
  return tallas.map((t) => {
    const n = Object.values(it.tabla[t] || {}).reduce((s, c) => s + (c[tipo] || 0), 0)
    return n ? `${t === TALLA_SIN_DIVIDIR ? 'sin talla' : t}: ${num(n)}` : null
  }).filter(Boolean).join(' · ').replace(/^(?=.)/, 'Tallas ')
}
const coloresDe = (it) => (it.colores && it.colores.length ? it.colores : [...new Set(Object.values(it.tabla || {}).flatMap((o) => Object.keys(o)))]).filter(Boolean)

function armarCobro(pedido, abonos) {
  const lineas = []
  for (const it of pedido.items_camiseta || []) {
    const { cuello, puno } = totalesPorTipoCam(it.tabla)
    const colores = coloresDe(it)
    const base = [it.diseno, colores.length ? `Color${colores.length > 1 ? 'es' : ''}: ${colores.join(', ')}` : ''].filter(Boolean).join(' · ')
    let filas
    if (it.precios?.juego) {
      filas = [{ desc: 'Juego cuello + puño · Camiseta', det: [base, resumenTallas(it, 'cuello')].filter(Boolean).join(' — '), cant: plural(cuello, 'juego', 'juegos'), unit: fmtCOP(it.precios.juego), valor: cuello * it.precios.juego }]
    } else {
      filas = (it.tipos || []).map((t) => {
        const n = t === 'cuello' ? cuello : puno
        return { desc: `${TIPO_LABEL[t]} · Camiseta`, det: [base, resumenTallas(it, t)].filter(Boolean).join(' — '), cant: plural(n, 'unidad', 'unidades'), unit: fmtCOP(it.precios?.[t] || 0), valor: n * (it.precios?.[t] || 0) }
      })
    }
    // Pedidos viejos pueden tener un total guardado distinto al cálculo: se
    // respeta lo guardado (es lo que se le dijo al cliente).
    const suma = filas.reduce((s, f) => s + f.valor, 0)
    if (it.total_precio != null && Math.round(suma) !== Math.round(it.total_precio)) {
      filas = [{ desc: `${(it.tipos || []).map((t) => TIPO_LABEL[t]).join(' + ')} · Camiseta`, det: base, cant: plural(it.total_unidades || 0, 'unidad', 'unidades'), unit: '—', valor: it.total_precio }]
    }
    lineas.push(...filas)
  }
  let porPesar = false
  for (const it of pedido.items_chaqueta || []) {
    const piezas = (it.tipos || []).map((t) => {
      const n = Object.values(it.tabla || {}).reduce((s, r) => s + (r[t] || 0), 0)
      return n ? `${num(n)} ${TIPO_LABEL[t].toLowerCase()}${n === 1 ? '' : (t === 'puno' ? 's' : 's')}` : null
    }).filter(Boolean).join(' · ')
    const colores = coloresDe(it)
    const precios = [...new Set((it.tipos || []).map((t) => it.precios?.[t] || 0))]
    const unit = precios.length === 1 ? `${fmtCOP(precios[0])}/kg` : (it.tipos || []).map((t) => `${TIPO_LABEL[t]} ${fmtCOP(it.precios?.[t] || 0)}/kg`).join('<br>')
    const pesado = it.kilos_reales != null && it.kilos_reales !== ''
    if (!pesado) porPesar = true
    lineas.push({
      desc: `${(it.tipos || []).map((t) => TIPO_LABEL[t]).join(' + ')} · Chaqueta`,
      det: [it.diseno, colores.length ? `Color${colores.length > 1 ? 'es' : ''}: ${colores.join(', ')}` : '', piezas].filter(Boolean).join(' — '),
      cant: pesado ? `${String(it.kilos_reales).replace('.', ',')} kg` : 'Por pesar',
      unit,
      valor: pesado ? (it.total_final || 0) : null,
    })
  }
  const total = lineas.reduce((s, l) => s + (l.valor || 0), 0)
  const abonado = (abonos || []).reduce((s, a) => s + (a.monto || 0), 0)
  const saldo = Math.max(0, total - abonado)
  const estado = porPesar ? 'pendiente' : saldo === 0 && total > 0 ? 'pagado' : abonado > 0 ? 'parcial' : 'pendiente'
  return { lineas, total, abonado, saldo, porPesar, estado }
}

// Abre la ventana ANTES de pedir los abonos: si se abre después de esperar,
// el celular la bloquea como ventana emergente.
function abrirVentana(titulo) {
  const win = window.open('', '_blank')
  if (!win) { alert('El navegador bloqueó la ventana. Permite las ventanas emergentes para esta página.'); return null }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${titulo}</title></head><body style="font-family:Arial;color:#1a3c63;padding:30px">Preparando el comprobante…</body></html>`)
  return win
}
async function traerAbonos(pedidoId) {
  const { data } = await supabase.from('abonos').select('monto, fecha, nota').eq('pedido_id', pedidoId).order('fecha', { ascending: true })
  return data || []
}
const ETIQUETA_ESTADO = { pagado: 'Pagado', parcial: 'Abono parcial', pendiente: 'Pendiente de pago' }
const FUENTES = '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">'

// ============================================
// TAMAÑO CARTA
// ============================================
export async function generarFacturaPDF(pedido) {
  const titulo = `Comprobante ${pedido.numero} — ${pedido.cliente}`
  const win = abrirVentana(titulo)
  if (!win) return
  const abonos = await traerAbonos(pedido.id)
  const c = armarCobro(pedido, abonos)
  const hoy = new Date()

  const filas = c.lineas.map((l, i) => `
    <tr>
      <td class="n">${i + 1}</td>
      <td><div class="desc">${esc(l.desc)}</div>${l.det ? `<div class="det">${esc(l.det)}</div>` : ''}</td>
      <td class="r nw">${l.cant}</td>
      <td class="r nw">${l.unit}</td>
      <td class="r nw fuerte">${l.valor == null ? '<span class="pend">Por pesar</span>' : fmtCOP(l.valor)}</td>
    </tr>`).join('')

  const filasAbonos = abonos.map((a) => `<div class="fila sub"><span>Abono ${fmtFecha(a.fecha)}${a.nota && a.nota !== 'Pago total' ? ` · ${esc(a.nota)}` : ''}</span><span>− ${fmtCOP(a.monto)}</span></div>`).join('')

  win.document.open()
  win.document.write(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>${FUENTES}
<style>
  @page { size: letter; margin: 14mm 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root { --azul: #1a3c63; --verde: #4b8523; --gris: #6b7280; --linea: #e3e6dd; --suave: #f6f7f2; }
  html { background: #e9ebe4; }
  body { font-family: 'Inter', Arial, sans-serif; color: #1f2933; font-size: 10.5pt; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .hoja { background: #fff; max-width: 216mm; margin: 18px auto; padding: 16mm 15mm 12mm; box-shadow: 0 6px 30px rgba(0,0,0,.12); position: relative; overflow: hidden; }
  .franja { position: absolute; left: 0; right: 0; top: 0; height: 5px; background: linear-gradient(90deg, var(--azul) 0 70%, var(--verde) 70% 100%); }
  .mono { font-family: 'DM Mono', 'Courier New', monospace; font-variant-numeric: tabular-nums; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; padding-bottom: 14px; border-bottom: 1px solid var(--linea); }
  .marca { display: flex; gap: 12px; align-items: center; }
  .marca img { width: 54px; height: auto; }
  .marca h1 { font-family: 'Playfair Display', Georgia, serif; font-size: 22pt; line-height: 1; color: var(--azul); letter-spacing: .02em; }
  .marca .sub { font-size: 8pt; letter-spacing: .22em; text-transform: uppercase; color: var(--verde); margin-top: 5px; font-weight: 600; }
  .doc { text-align: right; }
  .doc .tipo { font-size: 8pt; letter-spacing: .18em; text-transform: uppercase; color: var(--gris); font-weight: 600; }
  .doc .numero { font-family: 'DM Mono', monospace; font-size: 20pt; font-weight: 500; color: var(--azul); line-height: 1.15; }
  .estado { display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 20px; font-size: 8pt; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
  .estado.pagado { background: #e2ebd8; color: #2f5e18; }
  .estado.parcial { background: #f8ead0; color: #8a5a16; }
  .estado.pendiente { background: #f8e4e0; color: #a5281b; }
  .partes { display: grid; grid-template-columns: 1.2fr 1fr 0.8fr; gap: 18px; padding: 16px 0; border-bottom: 1px solid var(--linea); }
  .lbl { font-size: 7.5pt; letter-spacing: .14em; text-transform: uppercase; color: var(--gris); font-weight: 600; margin-bottom: 4px; }
  .partes .grande { font-size: 12.5pt; font-weight: 700; color: var(--azul); }
  .partes p { font-size: 9.5pt; color: #374151; }
  table { width: 100%; border-collapse: collapse; margin-top: 18px; }
  thead th { font-size: 7.5pt; letter-spacing: .12em; text-transform: uppercase; color: var(--gris); font-weight: 600; text-align: left; padding: 0 8px 8px; border-bottom: 1.5px solid var(--azul); }
  tbody td { padding: 10px 8px; border-bottom: 1px solid var(--linea); vertical-align: top; }
  td.n { color: var(--gris); font-family: 'DM Mono', monospace; width: 22px; }
  .desc { font-weight: 600; color: var(--azul); }
  .det { font-size: 8.5pt; color: var(--gris); margin-top: 2px; }
  .r { text-align: right; } .nw { white-space: nowrap; font-family: 'DM Mono', monospace; font-variant-numeric: tabular-nums; }
  .fuerte { font-weight: 500; color: #111827; }
  .pend { color: #8a5a16; font-family: 'Inter', Arial, sans-serif; font-weight: 600; font-size: 9pt; }
  .pie-tabla { display: grid; grid-template-columns: 1fr 78mm; gap: 22px; margin-top: 16px; align-items: start; }
  .notas { font-size: 9pt; color: #374151; display: flex; flex-direction: column; gap: 12px; }
  .caja { border: 1px solid var(--linea); border-radius: 8px; padding: 10px 12px; background: var(--suave); }
  .aviso { border-color: #e0bd72; background: #fdf8ee; color: #6b4410; }
  .totales .fila { display: flex; justify-content: space-between; padding: 5px 0; font-family: 'DM Mono', monospace; font-variant-numeric: tabular-nums; }
  .totales .fila span:first-child { font-family: 'Inter', Arial, sans-serif; color: #374151; }
  .totales .sub span:first-child { color: var(--gris); font-size: 9pt; }
  .totales .sub { font-size: 9.5pt; color: var(--gris); }
  .totales .saldo { margin-top: 8px; padding: 10px 12px; border-radius: 8px; background: var(--azul); color: #fff; align-items: baseline; }
  .totales .saldo span:first-child { color: #c9d6e6; font-size: 8pt; letter-spacing: .12em; text-transform: uppercase; font-weight: 600; }
  .totales .saldo span:last-child { font-size: 16pt; font-weight: 500; }
  .totales .saldo.ok { background: #2f5e18; }
  .letras { font-size: 8.5pt; color: var(--gris); margin-top: 6px; text-align: right; font-style: italic; }
  footer { margin-top: 26px; padding-top: 12px; border-top: 1px solid var(--linea); display: flex; justify-content: space-between; gap: 20px; font-size: 8pt; color: var(--gris); }
  footer b { color: var(--azul); }
  .acciones { text-align: center; margin: 4px 0 24px; }
  .acciones button { background: var(--verde); color: #fff; border: 0; padding: 11px 26px; border-radius: 8px; font: 600 14px 'Inter', Arial, sans-serif; cursor: pointer; }
  .acciones p { font: 12px 'Inter', Arial, sans-serif; color: #555; margin-top: 8px; }
  @media print { html { background: #fff; } .hoja { margin: 0; padding: 0; box-shadow: none; max-width: none; } .franja { display: none; } .acciones { display: none; } }
  @media (max-width: 640px) { .hoja { padding: 22px 16px; margin: 0; } .partes, .pie-tabla { grid-template-columns: 1fr; } header { flex-direction: column; } .doc { text-align: left; } }
</style></head>
<body>
  <div class="hoja">
    <div class="franja"></div>
    <header>
      <div class="marca">
        <img src="${MARCA}" alt="">
        <div><h1>L &amp; L</h1><div class="sub">Tejidos y Confecciones</div></div>
      </div>
      <div class="doc">
        <div class="tipo">Comprobante de cobro</div>
        <div class="numero">${esc(pedido.numero)}</div>
        <span class="estado ${c.estado}">${ETIQUETA_ESTADO[c.estado]}</span>
      </div>
    </header>

    <section class="partes">
      <div>
        <div class="lbl">Cobrar a</div>
        <div class="grande">${esc(pedido.cliente)}</div>
        ${pedido.observaciones ? `<p>${esc(pedido.observaciones)}</p>` : ''}
      </div>
      <div>
        <div class="lbl">Emitido por</div>
        ${NEGOCIO.nit ? `<p>NIT ${esc(NEGOCIO.nit)}</p>` : ''}
        ${NEGOCIO.direccion ? `<p>${esc(NEGOCIO.direccion)}${NEGOCIO.ciudad ? `, ${esc(NEGOCIO.ciudad)}` : ''}</p>` : ''}
        ${NEGOCIO.telefono ? `<p>Tel. ${esc(NEGOCIO.telefono)}</p>` : ''}
      </div>
      <div>
        <div class="lbl">Fechas</div>
        <p>Pedido: <span class="mono">${fmtFecha(pedido.fecha)}</span></p>
        ${pedido.fecha_entregado ? `<p>Entrega: <span class="mono">${fmtFecha(String(pedido.fecha_entregado).slice(0, 10))}</span></p>` : ''}
        <p>Emisión: <span class="mono">${hoy.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span></p>
      </div>
    </section>

    <table>
      <thead><tr><th></th><th>Descripción</th><th class="r">Cantidad</th><th class="r">Precio unit.</th><th class="r">Valor</th></tr></thead>
      <tbody>${filas || '<tr><td colspan="5" style="color:#6b7280">Sin productos</td></tr>'}</tbody>
    </table>

    <div class="pie-tabla">
      <div class="notas">
        ${c.porPesar ? `<div class="caja aviso">⚖️ La chaqueta se cobra por kilo y todavía no se ha pesado. El total y el saldo se actualizan al registrar el peso.</div>` : ''}
        ${NEGOCIO.pago ? `<div class="caja"><div class="lbl">Cómo pagar</div>${esc(NEGOCIO.pago).replace(/\n/g, '<br>')}</div>` : ''}
      </div>
      <div class="totales">
        <div class="fila"><span>Total del pedido</span><span>${fmtCOP(c.total)}${c.porPesar ? '*' : ''}</span></div>
        ${filasAbonos}
        <div class="fila saldo ${c.saldo === 0 && !c.porPesar ? 'ok' : ''}"><span>${c.saldo === 0 && !c.porPesar ? 'Pagado' : 'Saldo a pagar'}</span><span>${fmtCOP(c.saldo)}</span></div>
        ${c.saldo > 0 ? `<div class="letras">Son: ${enLetras(c.saldo)}</div>` : ''}
      </div>
    </div>

    <footer>
      <div>Gracias por su confianza.</div>
      <div>Documento informativo, no es factura electrónica.</div>
    </footer>
  </div>
  <div class="acciones">
    <button onclick="window.print()">Imprimir o guardar como PDF</button>
    <p>En el diálogo elige "Guardar como PDF" para enviarlo por WhatsApp o correo.</p>
  </div>
</body></html>`)
  win.document.close()
  // Espera a que carguen las fuentes antes de abrir el diálogo de imprimir.
  win.onload = () => setTimeout(() => win.print(), 300)
}

// Genera una etiqueta pequeña (2" x 1" — 51mm x 25mm) lista para imprimir
// en impresoras térmicas de etiquetas tipo Jadens, tanto desde PC como
// desde el navegador del celular (usa el diálogo de impresión del sistema).
export function imprimirEtiqueta(pedido) {
  const win = window.open('', '_blank')
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Etiqueta ${pedido.numero}</title>
  <style>
    @page { size: 51mm 25mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #ddd; }
    .hoja {
      width: 51mm; height: 25mm;
      font-family: Arial, Helvetica, sans-serif;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 2.5mm 2.5mm;
      background: #fff;
      margin: 8mm auto;
      box-shadow: 0 2px 10px rgba(0,0,0,.15);
      overflow: hidden;
    }
    .marca { font-size: 4.5pt; letter-spacing: 0.1em; color: #6a7d5a; text-transform: uppercase; margin-bottom: 0.8mm; font-weight: 600; text-align: center; }
    .linea { width: 100%; border-top: 0.3mm solid #4b8523; margin-bottom: 0.8mm; }
    .numero { font-size: 16pt; font-weight: 900; color: #1a3c63; letter-spacing: 0.02em; line-height: 1; margin-bottom: 0.8mm; }
    .cliente { font-size: 6.5pt; font-weight: 700; color: #1a3c63; text-align: center; line-height: 1.15; max-width: 45mm; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .no-print { text-align: center; margin-top: 14px; }
    .no-print button {
      background: #4b8523; color: #fff; border: none; padding: 12px 28px;
      border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer;
    }
    .no-print p { font-size: 12px; color: #666; margin-top: 10px; padding: 0 20px; }
    @media print {
      html, body { background: #fff; }
      .hoja { margin: 0; box-shadow: none; }
      .no-print { display: none; }
    }
  </style>
  </head><body>
    <div class="hoja">
      <div class="marca">L &amp; L · Tejidos y Confecciones</div>
      <div class="linea"></div>
      <div class="numero">${pedido.numero}</div>
      <div class="cliente">${pedido.cliente}</div>
    </div>
    <div class="no-print">
      <button onclick="window.print()">🖨 Imprimir etiqueta</button>
      <p>Selecciona tu impresora Jadens en el diálogo de impresión. Si el tamaño no coincide, verifica que el papel esté configurado en 51×25mm.</p>
    </div>
  </body></html>`)
  win.document.close()
}

// ============================================
// 10,5 x 15 CM (impresora térmica Jadens, tamaño 4"x6")
// ============================================
export async function generarFacturaMini(pedido) {
  const titulo = `Comprobante ${pedido.numero}`
  const win = abrirVentana(titulo)
  if (!win) return
  const abonos = await traerAbonos(pedido.id)
  const c = armarCobro(pedido, abonos)

  const filas = c.lineas.map((l) => `
    <div class="it">
      <div class="it-1"><b>${esc(l.desc)}</b><span>${l.valor == null ? 'Por pesar' : fmtCOP(l.valor)}</span></div>
      <div class="it-2">${l.cant}${l.unit && l.unit !== '—' ? ` × ${l.unit.replace('<br>', ' · ')}` : ''}</div>
    </div>`).join('')

  win.document.open()
  win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<style>
  @page { size: 105mm 150mm; margin: 5mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 9pt; line-height: 1.35; }
  .hoja { width: 95mm; margin: 0 auto; }
  @media screen { body { padding-top: 14px; } }
  .cab { display: flex; align-items: center; gap: 6px; border-bottom: 1.2pt solid #000; padding-bottom: 5px; }
  .cab img { width: 30px; height: auto; filter: grayscale(1) contrast(1.4); }
  .cab h1 { font-family: Georgia, serif; font-size: 14pt; line-height: 1; }
  .cab .sub { font-size: 6pt; letter-spacing: .18em; text-transform: uppercase; }
  .cab .doc { margin-left: auto; text-align: right; }
  .cab .doc small { display: block; font-size: 6pt; letter-spacing: .12em; text-transform: uppercase; }
  .cab .doc b { font-family: 'Courier New', monospace; font-size: 14pt; }
  .datos { display: grid; grid-template-columns: auto 1fr; gap: 1px 8px; font-size: 8pt; padding: 5px 0; border-bottom: 0.6pt dashed #000; }
  .datos span:nth-child(odd) { text-transform: uppercase; font-size: 6.5pt; letter-spacing: .08em; padding-top: 1px; }
  .it { padding: 4px 0; border-bottom: 0.4pt dotted #000; }
  .it-1 { display: flex; justify-content: space-between; gap: 6px; }
  .it-1 span { font-family: 'Courier New', monospace; font-weight: bold; white-space: nowrap; }
  .it-2 { font-size: 7.5pt; font-family: 'Courier New', monospace; }
  .tot { margin-top: 5px; font-family: 'Courier New', monospace; }
  .tot div { display: flex; justify-content: space-between; padding: 1px 0; }
  .tot .saldo { border-top: 1.2pt solid #000; margin-top: 3px; padding-top: 4px; font-size: 12pt; font-weight: bold; }
  .letras { font-size: 7pt; font-style: italic; text-align: right; margin-top: 2px; }
  .nota { font-size: 7.5pt; border: 0.6pt solid #000; padding: 3px 5px; margin-top: 5px; }
  .pie { font-size: 6.5pt; text-align: center; margin-top: 7px; }
  .acciones { text-align: center; margin-top: 16px; }
  .acciones button { background: #4b8523; color: #fff; border: 0; padding: 10px 22px; border-radius: 8px; font-size: 13px; cursor: pointer; }
  .acciones p { font-size: 11px; color: #666; margin-top: 8px; }
  @media print { .acciones { display: none; } }
</style></head><body>
  <div class="hoja">
    <div class="cab">
      <img src="${MARCA}" alt="">
      <div><h1>L &amp; L</h1><div class="sub">Tejidos y Confecciones</div></div>
      <div class="doc"><small>Comprobante</small><b>${esc(pedido.numero)}</b></div>
    </div>
    <div class="datos">
      <span>Cliente</span><b>${esc(pedido.cliente)}</b>
      <span>Pedido</span><span>${fmtFecha(pedido.fecha)}</span>
      <span>Estado</span><span>${ETIQUETA_ESTADO[c.estado]}</span>
    </div>
    ${filas}
    <div class="tot">
      <div><span>Total</span><span>${fmtCOP(c.total)}${c.porPesar ? '*' : ''}</span></div>
      ${abonos.map((a) => `<div><span>Abono ${fmtFecha(a.fecha).slice(0, 5)}</span><span>-${fmtCOP(a.monto)}</span></div>`).join('')}
      <div class="saldo"><span>${c.saldo === 0 && !c.porPesar ? 'PAGADO' : 'SALDO'}</span><span>${fmtCOP(c.saldo)}</span></div>
    </div>
    ${c.saldo > 0 ? `<div class="letras">Son: ${enLetras(c.saldo)}</div>` : ''}
    ${c.porPesar ? `<div class="nota">* Falta pesar la chaqueta: el total cambia al registrar el peso.</div>` : ''}
    ${NEGOCIO.pago ? `<div class="nota">${esc(NEGOCIO.pago).replace(/\n/g, '<br>')}</div>` : ''}
    <div class="pie">${[NEGOCIO.nit ? `NIT ${esc(NEGOCIO.nit)}` : '', NEGOCIO.telefono ? `Tel. ${esc(NEGOCIO.telefono)}` : ''].filter(Boolean).join(' · ')}<br>Documento informativo, no es factura electrónica.</div>
  </div>
  <div class="acciones">
    <button onclick="window.print()">Imprimir</button>
    <p>Tamaño de página: 10,5 x 15 cm (4"x6"). Elige la impresora Jadens.</p>
  </div>
</body></html>`)
  win.document.close()
}

// Marca del logo (solo el tejido con las agujas, fondo transparente) para
// que se vea limpia sobre papel blanco.
const MARCA = 'data:image/png;base64,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'
