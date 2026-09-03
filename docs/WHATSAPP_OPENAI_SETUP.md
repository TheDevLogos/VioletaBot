# VioletaBot — WhatsApp Cloud API + respuestas naturales

## Arquitectura
El motor determinístico de riesgo sigue siendo la autoridad de clasificación.
OpenAI redacta el mensaje conversacional usando el historial reciente.
Si OpenAI falla, VioletaBot usa una respuesta segura de respaldo.
El webhook responde a Meta inmediatamente y procesa con `after()`.

## Meta
1. Crea una app Business en Meta for Developers.
2. Agrega el producto WhatsApp.
3. Crea/selecciona Business Portfolio y WhatsApp Business Account (WABA).
4. Para pruebas usa primero el número de prueba de Meta.
5. Guarda estos datos NO secretos:
   - App ID
   - WABA ID
   - Phone Number ID
   - número mostrado
6. Agrega tu celular como destinatario de prueba si Meta lo solicita.

## Webhook
Callback:
https://violeta-bot.vercel.app/api/webhooks/whatsapp

Usa como Verify Token el mismo valor privado de `WHATSAPP_VERIFY_TOKEN`.
Suscribe el campo `messages` y la app al WABA.

## Secretos en Vercel
- META_APP_SECRET
- WHATSAPP_ACCESS_TOKEN
- WHATSAPP_VERIFY_TOKEN
- OPENAI_API_KEY

Nunca los pegues en GitHub ni en el frontend.

## OpenAI
El código usa Responses API, `store: false`, historial desde Supabase y
`safety_identifier` con hash.
Modelo sugerido para el MVP: `gpt-5.6-luna`, configurable con `OPENAI_MODEL`.

## Vinculación multiinstitucional
Cada organización se identifica por el `phone_number_id` recibido de Meta.
La organización debe tener:
- whatsapp_phone_number_id
- whatsapp_waba_id
- whatsapp_display_phone
- whatsapp_enabled = true

Los tokens NO se guardan en Supabase.

## Primera prueba
1. Sube los archivos de este paquete al repo.
2. Añade OPENAI_API_KEY en Vercel y redeploy.
3. Prueba /admin/simulador: las respuestas deben variar y recordar el contexto.
4. Configura Meta + webhook.
5. Vincula el Phone Number ID a la institución piloto.
6. Envía “Hola” al número de prueba desde el destinatario permitido.
7. Prueba conversaciones de varios turnos.
8. Prueba riesgo alto/crítico solo con datos ficticios.

## Producción
- No hay despacho policial automático.
- Alto/crítico crea alerta humana sin duplicar alertas pendientes.
- Un riesgo previo alto/crítico no se rebaja automáticamente por un mensaje neutro.
- La ubicación solo se solicita condicionalmente en crítico.
- Para operación gubernamental, evalúa ZDR/Modified Abuse Monitoring y el marco de privacidad institucional.
