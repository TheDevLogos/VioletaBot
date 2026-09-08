# Despliegue — VioletaBot 3.0 Analítica Preventiva

## 1. Base de datos

La migración `005_preventive_analytics.sql` YA fue aplicada al Supabase del piloto:
`Instituto Municipal de las Mujeres de Delicias`.

NO la ejecutes manualmente otra vez en ese mismo proyecto.

## 2. Archivos NUEVOS

Copia estos archivos al repositorio:

- `app/admin/analitica/page.tsx`
- `app/api/admin/analytics/export/route.ts`
- `app/api/admin/cases/[id]/profile/route.ts`
- `components/admin/analytics/Charts.tsx`
- `lib/analytics/aggregate.ts`
- `supabase/migrations/005_preventive_analytics.sql`
- `docs/MODULO_ANALITICA_PREVENTIVA.md`

## 3. Archivos a REEMPLAZAR

Reemplaza con los incluidos en esta versión:

- `app/admin/casos/[id]/page.tsx`
- `app/admin/centro/page.tsx`
- `app/admin/operation.css`
- `components/admin/AdminNav.tsx`
- `app/page.tsx`

El ZIP también contiene la actualización VioletaBot 2.0 completa, por lo que puedes copiar toda la carpeta sobre el repositorio y permitir que el sistema sobrescriba los archivos coincidentes.

## 4. Variables de entorno

No se requiere ninguna variable nueva.

## 5. Git

```bash
git add .
git commit -m "Add preventive analytics dashboard to VioletaBot"
git push origin main
```

Vercel debe generar un deployment nuevo.

## 6. Validación

Después de que Vercel marque `Ready`:

1. Abrir `/admin/centro`.
2. Confirmar que aparece `Analítica preventiva`.
3. Abrir un expediente.
4. Completar `Ficha estadística preventiva`.
5. Guardar y recargar el expediente.
6. Abrir `/admin/analitica`.
7. Cambiar entre Hoy / Semana / Mes / Año / Histórico.
8. Probar `Exportar serie CSV`.
9. Probar `Exportar zonas CSV`.
10. Confirmar que el mapa NO muestra puntos individuales.

## 7. Privacidad territorial

El piloto tiene:

`analytics_min_geo_group_size = 5`

Por lo tanto una colonia, zona o celda geográfica solo aparece si reúne al menos cinco casos en el periodo analizado.

## 8. Interpretación

El dashboard describe registros de VioletaBot.

No debe interpretarse automáticamente como prevalencia poblacional ni utilizarse para etiquetar personas o colonias como "violentas".
