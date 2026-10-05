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
  .marca img { width: 180px; height: auto; display: block; margin: -6px 0 -4px -6px; }
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
        <img src="${MARCA}" alt="L &amp; L Tejidos y Confecciones">
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
        ${NEGOCIO.nombre ? `<p><b>${esc(NEGOCIO.nombre)}</b></p>` : ''}
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
      <div class="marca">L y L · Tejidos y Confecciones</div>
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
  .cab img { width: 26mm; height: auto; filter: grayscale(1) contrast(1.4); }
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
      <img src="${MARCA}" alt="L &amp; L Tejidos y Confecciones">
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

// Logo completo de L & L (tejido, nombre y "Tejidos y Confecciones") con el
// fondo crema quitado, para que se vea limpio sobre papel blanco.
const MARCA = 'data:image/png;base64,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'
