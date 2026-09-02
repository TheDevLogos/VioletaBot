# Arquitectura MVP VioletaBot

## Decisión principal
Para el piloto gratuito se usa un solo proyecto Next.js desplegado en Vercel. Las rutas API sustituyen temporalmente a NestJS y el worker. Supabase concentra PostgreSQL, Auth, RLS, Storage y Realtime.

## Flujo
WhatsApp Cloud API -> `/api/webhooks/whatsapp` -> normalización -> motor determinístico de riesgo -> persistencia Supabase -> respuesta segura -> alerta a operadora.

## Decisiones críticas
- El despacho a autoridad queda apagado por defecto (`AUTHORITY_DISPATCH_ENABLED=false`).
- El motor crítico vive en `lib/risk/engine.ts`, no en un LLM.
- La clave secreta de Supabase solo existe en Vercel server-side.
- El identificador de WhatsApp debe seudonimizarse antes de una operación real de largo plazo.
- La landing y el panel comparten despliegue para reducir costo y complejidad.

## Fase posterior
Cuando el volumen o SLA lo exijan: extraer API a NestJS, introducir cola durable y worker, separar dispatch de autoridad y añadir observabilidad externa.
