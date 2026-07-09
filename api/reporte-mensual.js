// api/reporte-mensual.js
//
// Genera un Excel organizado de los pedidos ENTREGADOS de un mes y lo envía
// por correo. Se puede llamar de dos formas:
//   1) Automática: Vercel Cron la llama una vez al día; la función solo
//      hace algo si hoy es el día 1 del mes (así se respeta el límite del
//      plan gratuito de Vercel, que solo permite crons de una vez al día).
//   2) Manual: un botón dentro de la app la llama pidiendo un mes puntual,
//      validando que quien pide es un usuario con sesión iniciada.

import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'
import { Resend } from 'resend'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const TIPO_LABEL = { puno: 'Puño', cuello: 'Cuello', pretina: 'Pretina' }

function fmtCOP(n) {
  return '$' + Math.round(n || 0).toLocaleString('es-CO')
}

export default async function handler(req, res) {
  try {
    const esCron = req.headers['authorization'] === `Bearer ${process.env.CRON_SECRET}`
    const esManual = await validarUsuario(req)

    if (!esCron && !esManual) {
      return res.status(401).json({ error: 'No autorizado' })
    }

    const ahora = new Date()
    let mes, anio

    if (esCron) {
      // Solo actuar si hoy es el día 1 del mes. Cualquier otro día, no hacer nada.
      if (ahora.getUTCDate() !== 1) {
        return res.status(200).json({ ok: true, mensaje: 'No es día 1, no se genera reporte hoy.' })
      }
      // El reporte es del mes que acaba de terminar.
      const mesAnterior = new Date(ahora.getUTCFullYear(), ahora.getUTCMonth() - 1, 1)
      mes = mesAnterior.getMonth()
      anio = mesAnterior.getFullYear()
    } else {
      // Manual: el mes viene en el body de la petición.
      const body = req.body || {}
      mes = body.mes ?? ahora.getMonth()
      anio = body.anio ?? ahora.getFullYear()
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

    const desde = `${anio}-${String(mes + 1).padStart(2, '0')}-01`
    const finMes = new Date(anio, mes + 1, 0).getDate()
    const hasta = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(finMes).padStart(2, '0')}`

    // Traer pedidos entregados en ese mes (usa fecha_entregado; si un pedido
    // viejo no la tiene, se usa la fecha del pedido como respaldo).
    const { data: pedidos, error } = await supabase
      .from('pedidos')
      .select('*, items_camiseta(*), items_chaqueta(*), abonos(*)')
      .eq('estado', 'Entregado')
      .or(`and(fecha_entregado.gte.${desde},fecha_entregado.lte.${hasta}),and(fecha_entregado.is.null,fecha.gte.${desde},fecha.lte.${hasta})`)
      .order('fecha_entregado', { ascending: true })

    if (error) throw error

    const libro = construirExcel(pedidos || [], mes, anio)
    const buffer = await libro.xlsx.writeBuffer()

    const resend = new Resend(process.env.RESEND_API_KEY)
    const nombreArchivo = `Pedidos-entregados-${MESES[mes]}-${anio}.xlsx`

    await resend.emails.send({
      from: 'Tejidos y Confecciones <onboarding@resend.dev>',
      to: process.env.NOTIFICACION_EMAIL,
      subject: `📊 Pedidos entregados — ${MESES[mes]} ${anio}`,
      html: `<p>Hola,</p>
             <p>Adjunto el reporte de pedidos entregados de <strong>${MESES[mes]} ${anio}</strong>.</p>
             <p>Total de pedidos: <strong>${(pedidos || []).length}</strong></p>
             <p style="color:#6a7d5a;font-size:12px">Tejidos y Confecciones Laura Lizeth — reporte generado automáticamente.</p>`,
      attachments: [{ filename: nombreArchivo, content: Buffer.from(buffer).toString('base64') }],
    })

    return res.status(200).json({ ok: true, pedidos: (pedidos || []).length })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
}

async function validarUsuario(req) {
  try {
    const auth = req.headers['authorization'] || ''
    const token = auth.replace('Bearer ', '')
    if (!token) return false
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const { data, error } = await supabase.auth.getUser(token)
    return !error && !!data?.user
  } catch {
    return false
  }
}

function construirExcel(pedidos, mes, anio) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Tejidos y Confecciones Laura Lizeth'

  // ============ HOJA 1: RESUMEN ============
  const resumen = wb.addWorksheet(`Resumen ${MESES[mes]} ${anio}`)
  resumen.columns = [
    { header: 'N° Pedido', key: 'numero', width: 12 },
    { header: 'Cliente', key: 'cliente', width: 26 },
    { header: 'Fecha Pedido', key: 'fecha', width: 13 },
    { header: 'Fecha Entrega', key: 'fecha_entregado', width: 13 },
    { header: 'Productos', key: 'productos', width: 34 },
    { header: 'Total', key: 'total', width: 14 },
    { header: 'Abonado', key: 'abonado', width: 14 },
    { header: 'Saldo', key: 'saldo', width: 14 },
    { header: 'Estado Pago', key: 'estado_pago', width: 14 },
  ]
  estilarEncabezado(resumen)

  let totalGeneral = 0, totalAbonado = 0
  pedidos.forEach((p) => {
    const totCam = p.total_camiseta || 0
    const totChaq = (p.items_chaqueta || []).reduce((s, it) => s + (it.total_final || 0), 0)
    const total = totCam + totChaq
    const abonado = (p.abonos || []).reduce((s, a) => s + (a.monto || 0), 0)
    const saldo = Math.max(0, total - abonado)

    const productos = []
    ;(p.items_camiseta || []).forEach((it) => productos.push(`${(it.tipos || []).map(t => TIPO_LABEL[t]).join('+')} camiseta (${it.total_unidades}u)`))
    ;(p.items_chaqueta || []).forEach((it) => productos.push(`${(it.tipos || []).map(t => TIPO_LABEL[t]).join('+')} chaqueta (${it.kilos_reales || '?'}kg)`))

    const fila = resumen.addRow({
      numero: p.numero,
      cliente: p.cliente,
      fecha: p.fecha,
      fecha_entregado: p.fecha_entregado || '—',
      productos: productos.join(' · '),
      total: total,
      abonado: abonado,
      saldo: saldo,
      estado_pago: p.estado_pago || 'Pendiente',
    })
    fila.getCell('total').numFmt = '"$"#,##0'
    fila.getCell('abonado').numFmt = '"$"#,##0'
    fila.getCell('saldo').numFmt = '"$"#,##0'
    if (saldo > 0) fila.getCell('saldo').font = { color: { argb: 'FFC0392B' }, bold: true }

    totalGeneral += total
    totalAbonado += abonado
  })

  // Fila de totales
  const filaTotal = resumen.addRow({
    numero: '', cliente: '', fecha: '', fecha_entregado: '',
    productos: 'TOTAL DEL MES', total: totalGeneral, abonado: totalAbonado, saldo: totalGeneral - totalAbonado, estado_pago: '',
  })
  filaTotal.font = { bold: true }
  filaTotal.getCell('total').numFmt = '"$"#,##0'
  filaTotal.getCell('abonado').numFmt = '"$"#,##0'
  filaTotal.getCell('saldo').numFmt = '"$"#,##0'
  filaTotal.eachCell((cell) => { cell.border = { top: { style: 'double' } } })

  resumen.views = [{ state: 'frozen', ySplit: 1 }]
  resumen.autoFilter = { from: 'A1', to: 'I1' }

  // ============ HOJA 2: DETALLE POR PRODUCTO ============
  const detalle = wb.addWorksheet('Detalle por ítem')
  detalle.columns = [
    { header: 'N° Pedido', key: 'numero', width: 12 },
    { header: 'Cliente', key: 'cliente', width: 26 },
    { header: 'Sección', key: 'seccion', width: 12 },
    { header: 'Tipo', key: 'tipo', width: 22 },
    { header: 'Diseño', key: 'diseno', width: 26 },
    { header: 'Cantidad', key: 'cantidad', width: 12 },
    { header: 'Precio', key: 'precio', width: 14 },
    { header: 'Subtotal', key: 'subtotal', width: 14 },
  ]
  estilarEncabezado(detalle)

  pedidos.forEach((p) => {
    ;(p.items_camiseta || []).forEach((it) => {
      const fila = detalle.addRow({
        numero: p.numero, cliente: p.cliente, seccion: 'Camiseta',
        tipo: (it.tipos || []).map(t => TIPO_LABEL[t]).join(' + '),
        diseno: it.diseno || '—', cantidad: it.total_unidades,
        precio: it.precios?.juego || Object.values(it.precios || {})[0] || 0,
        subtotal: it.total_precio || 0,
      })
      fila.getCell('precio').numFmt = '"$"#,##0'
      fila.getCell('subtotal').numFmt = '"$"#,##0'
    })
    ;(p.items_chaqueta || []).forEach((it) => {
      const fila = detalle.addRow({
        numero: p.numero, cliente: p.cliente, seccion: 'Chaqueta',
        tipo: (it.tipos || []).map(t => TIPO_LABEL[t]).join(' + '),
        diseno: it.diseno || '—', cantidad: `${it.kilos_reales || '?'} kg`,
        precio: Object.values(it.precios || {})[0] || 0,
        subtotal: it.total_final || 0,
      })
      fila.getCell('precio').numFmt = '"$"#,##0/kg'
      fila.getCell('subtotal').numFmt = '"$"#,##0'
    })
  })
  detalle.views = [{ state: 'frozen', ySplit: 1 }]
  detalle.autoFilter = { from: 'A1', to: 'H1' }

  return wb
}

function estilarEncabezado(hoja) {
  const header = hoja.getRow(1)
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3C63' } }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
  })
  header.height = 22
}
