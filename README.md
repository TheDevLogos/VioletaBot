# VioletaBot MVP

MVP de bajo costo para acompañamiento inicial, detección temprana y escalamiento institucional vía WhatsApp.

## Stack
- Next.js 16.3.3 + React 19.2.8
- Supabase Postgres/Auth/RLS
- WhatsApp Cloud API
- Vercel + GitHub
- Motor de riesgo determinístico sin dependencia obligatoria de LLM

## Arranque
1. Copia `.env.example` a `.env.local`.
2. Configura URL y publishable key de Supabase.
3. Crea una Secret Key server-side en Supabase y colócala SOLO como `SUPABASE_SECRET_KEY` en Vercel/local.
4. Ejecuta `supabase/migrations/001_violeta_mvp.sql` en SQL Editor después de revisar conflictos con el esquema existente.
5. `npm install && npm run dev`.
6. En Meta configura el webhook `https://TU_DOMINIO/api/webhooks/whatsapp`.

## Seguridad
No subas `.env.local` ni credenciales al repositorio. La integración con autoridad está deshabilitada por defecto. Este MVP no sustituye servicios profesionales ni de emergencia.

## Importante antes de producción
- Conectar Supabase Auth real al panel (la pantalla incluida es UI de demostración).
- Verificar firma HMAC de webhooks de Meta.
- Añadir idempotencia para mensajes webhook.
- Cifrar/seudonimizar identificadores sensibles.
- Formalizar retención, aviso de privacidad, convenio y protocolo humano.
- Probar casos críticos con ejercicios controlados y revisión institucional.
