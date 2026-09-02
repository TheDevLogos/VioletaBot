# VioletaBot — Centro de Operación + Usuarios + Simulador

Este paquete es un overlay para el repositorio `TheDevLogos/VioletaBot`.

## Aplicación

Copie el contenido de esta carpeta sobre la raíz del repositorio conservando las rutas. No elimine archivos que no estén incluidos en este paquete.

Incluye:

- `/admin/centro`: Centro de Operación multi-entidad.
- `/admin/casos/[id]`: expediente, conversación, riesgo, alertas, asignación, estado y notas.
- `/admin/usuarios`: alta de entidades y personal según rol.
- `/admin/simulador`: simulador conversacional sin WhatsApp.
- Contraseña temporal aleatoria y cambio obligatorio en primer acceso.
- APIs server-side con comprobación de sesión, rol y organización.
- Migración `002_operation_center.sql` para reconstrucción de esquema.

## Roles

- `super_admin`: crea entidades y cualquier usuario operativo, incluido `admin`.
- `admin`: solo administra su entidad; puede crear `supervisor`, `operator`, `auditor`.
- `supervisor`: gestiona y asigna casos de su entidad.
- `operator`: atiende casos y puede usar simulador.
- `auditor`: lectura del Centro; no crea usuarios ni ejecuta simulaciones.

## Despliegue

La base de datos de producción ya fue actualizada desde ChatGPT. Por ello NO ejecute manualmente la migración 002 sobre la base actual. El archivo queda en el repo como historial/reconstrucción para entornos nuevos.

1. Copie estos archivos sobre el repositorio.
2. Commit y push a `main`.
3. Vercel debe iniciar un nuevo deploy automáticamente.
4. Ingrese a `/admin/centro` con el Super Admin existente.
5. Abra `/admin/usuarios` para crear una entidad o un Admin.
6. Entregue la contraseña temporal por un canal seguro. El nuevo usuario tendrá que cambiarla al primer acceso.
7. Pruebe `/admin/simulador`. Las conversaciones se guardan con `channel=simulator` e `is_test=true`.

## Seguridad

- No se habilita ningún despacho automático a Policía/autoridades.
- `SUPABASE_SECRET_KEY` debe permanecer solo en Vercel/server-side.
- `staff_invites` no tiene acceso `anon` ni `authenticated`.
- Las escrituras administrativas se realizan en rutas server-side tras comprobar rol y organización.
- Antes de producción formal, habilitar Leaked Password Protection y configurar SMTP institucional en Supabase Auth.
