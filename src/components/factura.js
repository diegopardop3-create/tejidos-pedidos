import { NEGOCIO, TIPO_LABEL, fmtFecha } from './constants'

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
        <td style="text-align:right">$${(it.total_precio / (it.total_unidades || 1)).toFixed(2)}</td>
        <td style="text-align:right">$${it.total_precio.toFixed(2)}</td>
      </tr>`
  }).join('')

  const filasChaq = itemsChaq.map((it) => {
    const tLabel = it.tipos.map((t) => TIPO_LABEL[t]).join(' + ')
    const precioStr = it.tipos.map((t) => `${TIPO_LABEL[t]}: $${it.precios[t]}/kg`).join(', ')
    const totalStr = it.kilos_reales
      ? `$${it.total_final.toFixed(2)}`
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
        body { font-family: Arial, Helvetica, sans-serif; color: #1a1a2e; font-size: 13px; line-height: 1.5; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #2d6a4f; padding-bottom: 16px; margin-bottom: 20px; }
        .negocio h1 { font-size: 20px; margin: 0 0 4px; color: #1a1a2e; }
        .negocio p { margin: 1px 0; font-size: 12px; color: #555; }
        .doc-info { text-align: right; }
        .doc-info .titulo { font-size: 15px; font-weight: bold; color: #2d6a4f; margin-bottom: 4px; }
        .doc-info .numero { font-size: 22px; font-weight: bold; color: #1a1a2e; font-family: monospace; }
        .doc-info .fecha { font-size: 12px; color: #555; margin-top: 4px; }
        .cliente-box { background: #f5f7f5; border-radius: 8px; padding: 14px 18px; margin-bottom: 22px; }
        .cliente-box .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7c6e; margin-bottom: 4px; }
        .cliente-box .nombre { font-size: 16px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background: #1a1a2e; color: #b7e4c7; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; padding: 9px 10px; text-align: left; }
        td { padding: 9px 10px; border-bottom: 1px solid #e0e0e0; font-size: 12px; }
        tbody tr:nth-child(even) { background: #fafafa; }
        .totales { display: flex; justify-content: flex-end; margin-top: 10px; }
        .totales-box { width: 280px; }
        .totales-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
        .totales-row.final { border-top: 2px solid #1a1a2e; margin-top: 6px; padding-top: 10px; font-size: 17px; font-weight: bold; color: #2d6a4f; }
        .nota-pendiente { background: #fff8e1; border: 1px solid #ffe082; border-radius: 8px; padding: 10px 14px; font-size: 12px; color: #795548; margin-top: 14px; }
        .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e0e0e0; font-size: 11px; color: #888; text-align: center; }
        .estado-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; background: #e8f5e9; color: #2d6a4f; margin-top: 6px; }
        @media print { .no-print { display: none; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="negocio">
          <h1>${NEGOCIO.nombre}</h1>
          ${NEGOCIO.nit ? `<p>NIT/Cédula: ${NEGOCIO.nit}</p>` : ''}
          ${NEGOCIO.direccion ? `<p>${NEGOCIO.direccion}</p>` : ''}
          ${NEGOCIO.telefono ? `<p>Tel: ${NEGOCIO.telefono}</p>` : ''}
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
          <div class="totales-row"><span>Subtotal Camiseta</span><span>$${totalCam.toFixed(2)}</span></div>
          ${itemsChaq.length ? `<div class="totales-row"><span>Subtotal Chaqueta</span><span>${hayPendiente ? 'Pendiente de pesaje' : '$' + totalChaq.toFixed(2)}</span></div>` : ''}
          <div class="totales-row final"><span>TOTAL A PAGAR</span><span>${hayPendiente ? '$' + totalCam.toFixed(2) + ' + pesaje' : '$' + totalGeneral.toFixed(2)}</span></div>
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
