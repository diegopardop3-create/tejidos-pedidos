import { NEGOCIO, TIPO_LABEL, fmtFecha, fmtCOP } from './constants'
import logoUrl from './../assets/logo.png'
import { supabase } from '../supabaseClient'

// Genera la factura como HTML imprimible y abre el diálogo de impresión/guardar como PDF.
// Esto evita depender de librerías pesadas de generación de PDF en el navegador.
export function generarFacturaPDF(pedido) {
  const itemsCam = pedido.items_camiseta || []
  const itemsChaq = pedido.items_chaqueta || []

  const filasCam = itemsCam.map((it) => {
    const tLabel = it.tipos.map((t) => TIPO_LABEL[t]).join(' + ')
    return `
      <tr>
        <td>${tLabel} (Camiseta)</td>
        <td>${it.diseno || '—'}</td>
        <td style="text-align:center">${it.total_unidades}</td>
        <td style="text-align:right">${fmtCOP(it.total_precio / (it.total_unidades || 1))}</td>
        <td style="text-align:right">${fmtCOP(it.total_precio)}</td>
      </tr>`
  }).join('')

  const filasChaq = itemsChaq.map((it) => {
    const tLabel = it.tipos.map((t) => TIPO_LABEL[t]).join(' + ')
    const precioStr = it.tipos.map((t) => `${TIPO_LABEL[t]}: ${fmtCOP(it.precios[t])}/kg`).join(', ')
    const totalStr = it.kilos_reales
      ? fmtCOP(it.total_final)
      : 'Pendiente de pesaje'
    return `
      <tr>
        <td>${tLabel} (Chaqueta)</td>
        <td>${it.diseno || '—'}</td>
        <td style="text-align:center">${it.kilos_reales ? it.kilos_reales + ' kg' : it.total_unidades + ' pzs'}</td>
        <td style="text-align:right">${precioStr}</td>
        <td style="text-align:right">${totalStr}</td>
      </tr>`
  }).join('')

  const totalCam = pedido.total_camiseta || 0
  const totalChaq = itemsChaq.reduce((s, it) => s + (it.total_final || 0), 0)
  const hayPendiente = itemsChaq.some((it) => !it.kilos_reales)
  const totalGeneral = totalCam + totalChaq

  const win = window.open('', '_blank')
  win.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Comprobante ${pedido.numero}</title>
      <style>
        @page { size: A4; margin: 18mm; }
        * { box-sizing: border-box; }
        body { font-family: 'Georgia', 'Times New Roman', serif; color: #1a3c63; font-size: 13px; line-height: 1.5; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #4b8523; padding-bottom: 16px; margin-bottom: 20px; }
        .negocio { display: flex; align-items: center; gap: 14px; }
        .negocio img { height: 56px; }
        .negocio h1 { font-size: 19px; margin: 0 0 4px; color: #1a3c63; font-family: 'Georgia', serif; }
        .negocio p { margin: 1px 0; font-size: 12px; color: #6a7d5a; font-family: Arial, sans-serif; }
        .doc-info { text-align: right; }
        .doc-info .titulo { font-size: 14px; font-weight: bold; color: #4b8523; margin-bottom: 4px; font-family: Arial, sans-serif; letter-spacing: 0.04em; }
        .doc-info .numero { font-size: 22px; font-weight: bold; color: #1a3c63; font-family: 'Courier New', monospace; }
        .doc-info .fecha { font-size: 12px; color: #6a7d5a; margin-top: 4px; font-family: Arial, sans-serif; }
        .cliente-box { background: #f1f6ec; border-radius: 8px; padding: 14px 18px; margin-bottom: 22px; }
        .cliente-box .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #6a7d5a; margin-bottom: 4px; font-family: Arial, sans-serif; }
        .cliente-box .nombre { font-size: 16px; font-weight: bold; color: #1a3c63; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-family: Arial, sans-serif; }
        th { background: #1a3c63; color: #a8c98a; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; padding: 9px 10px; text-align: left; }
        td { padding: 9px 10px; border-bottom: 1px solid #e0e0e0; font-size: 12px; }
        tbody tr:nth-child(even) { background: #faf8f2; }
        .totales { display: flex; justify-content: flex-end; margin-top: 10px; }
        .totales-box { width: 280px; font-family: Arial, sans-serif; }
        .totales-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
        .totales-row.final { border-top: 2px solid #1a3c63; margin-top: 6px; padding-top: 10px; font-size: 17px; font-weight: bold; color: #4b8523; }
        .nota-pendiente { background: #fdf8ee; border: 1px solid #e0bd72; border-radius: 8px; padding: 10px 14px; font-size: 12px; color: #8a5a16; margin-top: 14px; font-family: Arial, sans-serif; }
        .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e0e0e0; font-size: 11px; color: #888; text-align: center; font-family: Arial, sans-serif; }
        .estado-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; background: #f1f6ec; color: #4b8523; margin-top: 6px; font-family: Arial, sans-serif; }
        @media print { .no-print { display: none; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="negocio">
          <img src="${logoUrl}" alt="Logo" onerror="this.style.display='none'">
          <div>
            <h1>${NEGOCIO.nombre}</h1>
            ${NEGOCIO.nit ? `<p>NIT/Cédula: ${NEGOCIO.nit}</p>` : ''}
            ${NEGOCIO.direccion ? `<p>${NEGOCIO.direccion}</p>` : ''}
            ${NEGOCIO.telefono ? `<p>Tel: ${NEGOCIO.telefono}</p>` : ''}
          </div>
        </div>
        <div class="doc-info">
          <div class="titulo">COMPROBANTE DE COBRO</div>
          <div class="numero">${pedido.numero}</div>
          <div class="fecha">Fecha: ${fmtFecha(pedido.fecha)}</div>
          <div class="estado-badge">${pedido.estado}</div>
        </div>
      </div>

      <div class="cliente-box">
        <div class="label">Cliente</div>
        <div class="nombre">${pedido.cliente}</div>
      </div>

      <table>
        <thead>
          <tr><th>Producto</th><th>Diseño / Referencia</th><th style="text-align:center">Cant.</th><th style="text-align:right">Precio</th><th style="text-align:right">Subtotal</th></tr>
        </thead>
        <tbody>
          ${filasCam}${filasChaq}
        </tbody>
      </table>

      <div class="totales">
        <div class="totales-box">
          <div class="totales-row"><span>Subtotal Camiseta</span><span>${fmtCOP(totalCam)}</span></div>
          ${itemsChaq.length ? `<div class="totales-row"><span>Subtotal Chaqueta</span><span>${hayPendiente ? 'Pendiente de pesaje' : fmtCOP(totalChaq)}</span></div>` : ''}
          <div class="totales-row final"><span>TOTAL A PAGAR</span><span>${hayPendiente ? fmtCOP(totalCam) + ' + pesaje' : fmtCOP(totalGeneral)}</span></div>
        </div>
      </div>

      ${hayPendiente ? `<div class="nota-pendiente">⚖️ Este pedido incluye productos de chaqueta cuyo valor final se calcula al momento del pesaje. El total mostrado es preliminar.</div>` : ''}

      ${pedido.observaciones ? `<div style="margin-top:16px; font-size:12px;"><strong>Observaciones:</strong> ${pedido.observaciones}</div>` : ''}

      <div class="footer">
        Comprobante generado el ${new Date().toLocaleDateString('es-CO')} — Documento informativo, no tiene validez fiscal.
      </div>

      <div class="no-print" style="margin-top:24px; text-align:center;">
        <button onclick="window.print()" style="background:#2d6a4f;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer;">🖨 Imprimir / Guardar como PDF</button>
      </div>
    </body>
    </html>
  `)
  win.document.close()
  setTimeout(() => win.print(), 400)
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

// Comprobante condensado de 10.5 x 15 cm — pensado para impresoras térmicas
// de etiquetas (como Jadens) que soportan tamaño de envío 4"x6", a diferencia
// de la factura completa (generarFacturaPDF) que es para hoja carta/A4.
export async function generarFacturaMini(pedido) {
  const { data: abonos } = await supabase.from('abonos').select('monto, fecha').eq('pedido_id', pedido.id).order('fecha', { ascending: true })
  const totalAbonado = (abonos || []).reduce((s, a) => s + (a.monto || 0), 0)

  const itemsCam = pedido.items_camiseta || []
  const itemsChaq = pedido.items_chaqueta || []

  const filas = [
    ...itemsCam.map((it) => {
      const tLabel = it.tipos.map((t) => TIPO_LABEL[t]).join('+')
      return `<div class="fm-row"><span>${tLabel} camiseta</span><span>${fmtCOP(it.total_precio)}</span></div>`
    }),
    ...itemsChaq.map((it) => {
      const tLabel = it.tipos.map((t) => TIPO_LABEL[t]).join('+')
      const val = it.kilos_reales ? fmtCOP(it.total_final) : 'Pend. pesaje'
      return `<div class="fm-row"><span>${tLabel} chaqueta</span><span>${val}</span></div>`
    }),
  ].join('')

  const totalCam = pedido.total_camiseta || 0
  const totalChaqFinal = itemsChaq.reduce((s, it) => s + (it.total_final || 0), 0)
  const pendientePesaje = itemsChaq.some((it) => !it.kilos_reales)
  const totalGeneral = totalCam + totalChaqFinal
  const saldo = Math.max(0, totalGeneral - totalAbonado)

  const win = window.open('', '_blank')
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Comprobante ${pedido.numero}</title>
  <style>
    @page { size: 105mm 150mm; margin: 6mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; color: #1a3c63; font-size: 11pt; }
    .fm-header { text-align: center; border-bottom: 2px solid #4b8523; padding-bottom: 6px; margin-bottom: 8px; }
    .fm-header img { height: 40px; margin-bottom: 4px; }
    .fm-header h1 { font-size: 12pt; margin: 0; }
    .fm-header p { font-size: 8pt; color: #6a7d5a; margin: 1px 0; }
    .fm-num { text-align: center; font-family: monospace; font-size: 20pt; font-weight: bold; margin: 8px 0; }
    .fm-info { font-size: 9pt; margin-bottom: 8px; }
    .fm-info div { display: flex; justify-content: space-between; padding: 1px 0; }
    .fm-sep { border-top: 1px dashed #ccc; margin: 8px 0; }
    .fm-row { display: flex; justify-content: space-between; font-size: 9pt; padding: 3px 0; border-bottom: 1px dotted #eee; }
    .fm-totales { margin-top: 8px; font-size: 10pt; }
    .fm-totales div { display: flex; justify-content: space-between; padding: 2px 0; }
    .fm-final { font-size: 13pt; font-weight: bold; color: #4b8523; border-top: 2px solid #1a3c63; margin-top: 4px; padding-top: 6px; }
    .fm-saldo { color: #c0392b; }
    .fm-nota { font-size: 8pt; color: #8a5a16; background: #fdf8ee; padding: 5px; border-radius: 4px; margin-top: 6px; }
    .fm-footer { text-align: center; font-size: 7pt; color: #999; margin-top: 14px; }
    .no-print { text-align: center; margin-top: 16px; }
    .no-print button { background: #4b8523; color: #fff; border: none; padding: 10px 22px; border-radius: 8px; font-size: 13px; cursor: pointer; }
    .no-print p { font-size: 11px; color: #666; margin-top: 8px; }
    @media print { .no-print { display: none; } }
  </style>
  </head><body>
    <div class="fm-header">
      <img src="${logoUrl}" alt="" onerror="this.style.display='none'">
      <h1>${NEGOCIO.nombre}</h1>
      ${NEGOCIO.nit ? `<p>NIT: ${NEGOCIO.nit}</p>` : ''}
      ${NEGOCIO.telefono ? `<p>Tel: ${NEGOCIO.telefono}</p>` : ''}
    </div>

    <div class="fm-num">${pedido.numero}</div>

    <div class="fm-info">
      <div><span>Cliente:</span><strong>${pedido.cliente}</strong></div>
      <div><span>Fecha:</span><span>${fmtFecha(pedido.fecha)}</span></div>
      <div><span>Estado:</span><span>${pedido.estado}</span></div>
    </div>

    <div class="fm-sep"></div>
    ${filas}
    <div class="fm-sep"></div>

    <div class="fm-totales">
      <div><span>Total pedido</span><span>${pendientePesaje ? fmtCOP(totalCam) + ' + pesaje' : fmtCOP(totalGeneral)}</span></div>
      ${totalAbonado > 0 ? `<div><span>Abonado</span><span>${fmtCOP(totalAbonado)}</span></div>` : ''}
      <div class="fm-final ${saldo > 0 ? 'fm-saldo' : ''}"><span>${saldo > 0 ? 'SALDO' : 'PAGADO'}</span><span>${saldo > 0 ? fmtCOP(saldo) : '✓'}</span></div>
    </div>

    ${pendientePesaje ? `<div class="fm-nota">⚖️ Incluye chaqueta pendiente de pesaje — el total puede cambiar.</div>` : ''}

    <div class="fm-footer">Comprobante informativo, no tiene validez fiscal · ${new Date().toLocaleDateString('es-CO')}</div>

    <div class="no-print">
      <button onclick="window.print()">🖨 Imprimir</button>
      <p>Tamaño de página: 10.5 x 15 cm — selecciona tu impresora Jadens y verifica que el papel esté en ese tamaño (o "4x6 in").</p>
    </div>
  </body></html>`)
  win.document.close()
}
