// Genera una etiqueta 2" x 1" (51mm x 25mm) con el CÓDIGO del cono en
// grande, para pegar en el cono de poliéster. Pensada para la impresora
// térmica de etiquetas adhesivas (iEager 2x1 / Jadens). El código se
// imprime lo más grande posible para leerlo de lejos en el estante.
export function imprimirEtiquetaCono(cono) {
  const estadoTxt = cono.estado === 'sin_rotacion' ? 'SIN ROTACIÓN'
    : cono.estado === 'agotado' ? 'AGOTADO' : ''
  const w = window.open('', '_blank', 'width=420,height=320')
  if (!w) return
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiqueta ${cono.codigo}</title>
  <style>
    @page { size: 51mm 25mm; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; }
    .etq {
      width: 51mm; height: 25mm;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 1.5mm 2mm;
      border: 0.3mm solid #ccc;
      margin: 8mm auto;
      overflow: hidden;
    }
    .codigo { font-size: 30pt; font-weight: 900; color: #000; letter-spacing: 0.02em; line-height: 1; }
    .nombre { font-size: 8pt; font-weight: 700; color: #222; margin-top: 1mm; text-align: center; max-width: 47mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .estado { font-size: 6pt; font-weight: 700; color: #b23; margin-top: 0.5mm; letter-spacing: 0.08em; }
    .controls { text-align: center; margin-top: 4mm; }
    .controls button { background: #2d6a4f; color: #fff; border: none; padding: 9px 22px; border-radius: 8px; font-size: 14px; cursor: pointer; }
    .controls p { font-size: 11px; color: #666; margin-top: 8px; max-width: 300px; margin-left: auto; margin-right: auto; }
    @media print { .controls { display: none; } .etq { border: none; margin: 0; } }
  </style></head><body>
    <div class="etq">
      <div class="codigo">${cono.codigo}</div>
      <div class="nombre">${(cono.nombre || '').toUpperCase()}</div>
      ${estadoTxt ? `<div class="estado">${estadoTxt}</div>` : ''}
    </div>
    <div class="controls">
      <button onclick="window.print()">🖨 Imprimir etiqueta</button>
      <p>Selecciona tu impresora de etiquetas en el diálogo. Si el tamaño no coincide, verifica que el papel esté configurado en 51×25mm (2"×1").</p>
    </div>
  </body></html>`)
  w.document.close()
}
