# Tejidos y Confecciones Laura Lizeth — Sistema de Pedidos

Sistema de gestión de pedidos con login, conectado a Supabase.

## Configuración en Vercel

Al importar este proyecto en Vercel, agrega estas dos variables de entorno
(Settings → Environment Variables):

- `VITE_SUPABASE_URL` → la URL de tu proyecto Supabase
- `VITE_SUPABASE_ANON_KEY` → la clave "publishable" de Supabase

Estos valores se obtienen en Supabase: Project Settings → API.

## Desarrollo local (opcional)

```
npm install
cp .env.example .env.local
# edita .env.local con tus valores reales
npm run dev
```

## Estructura

- `src/components/Login.jsx` — pantalla de inicio de sesión
- `src/components/Pedidos.jsx` — pantalla principal con pestañas
- `src/components/NuevoPedido.jsx` — formulario de creación/edición de pedidos
- `src/components/ListaPedidos.jsx` — tabla de pedidos con progreso y exportar CSV
- `src/components/DetalleModal.jsx` — detalle de pedido, marcado ✅/❓, pesaje y factura
- `src/components/Resumen.jsx` — estadísticas generales y del mes
- `src/components/factura.js` — generador de comprobante de cobro en PDF (vía impresión del navegador)
- `src/components/constants.js` — datos del negocio y utilidades compartidas

## Editar los datos del negocio

Para cambiar NIT, dirección o teléfono que aparecen en la factura, edita
`src/components/constants.js`, el objeto `NEGOCIO`.
