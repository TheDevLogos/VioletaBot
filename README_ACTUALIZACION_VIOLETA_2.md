# VioletaBot 2.0 — Care Network Update

Actualización integral del MVP:

- conversación más natural;
- detección paralela de violencia, angustia y señales de autolesión;
- clasificación semántica estructurada como apoyo, sin sustituir reglas determinísticas;
- consentimiento por botones de WhatsApp;
- canalización a Red de Terapeutas;
- directorio y disponibilidad de terapeutas;
- bitácora de canalizaciones;
- Centro de Operación con indicadores en vivo;
- seguimiento de estados de entrega de WhatsApp;
- simulador ampliado;
- landing institucional renovada.

## IMPORTANTE

La migración `004_care_network_and_emotional_triage.sql` YA fue aplicada al proyecto piloto conectado.
Conserva el archivo en Git, pero NO vuelvas a ejecutarlo manualmente sobre ese mismo proyecto.

## Variables

No se agregan secretos obligatorios nuevos.

Se recomienda:

OPENAI_TRIAGE_MODEL=gpt-5.6-luna

Si no existe, el clasificador semántico reutiliza `OPENAI_MODEL`.

Continúan siendo necesarias las variables actuales:

- OPENAI_API_KEY
- OPENAI_MODEL
- META_GRAPH_VERSION
- WHATSAPP_VERIFY_TOKEN
- WHATSAPP_ACCESS_TOKEN
- META_APP_SECRET
- NEXT_PUBLIC_SUPABASE_URL
- SUPABASE_SECRET_KEY

## Despliegue

Copia el contenido de esta carpeta sobre la raíz del repo VioletaBot.

Después:

git add .
git commit -m "Add VioletaBot care network and emotional triage"
git push origin main

Vercel debe generar un deployment nuevo.

## Nuevas rutas

- /admin/centro
- /admin/canalizaciones
- /admin/terapeutas
- /admin/simulador

## Primer arranque

1. Confirma que el deployment quede Ready.
2. Entra al Centro.
3. Registra al menos una terapeuta.
4. Marca una terapeuta como Disponible.
5. Prueba primero el Simulador.
6. Después prueba WhatsApp real con escenarios ficticios.
7. No uses escenarios de crisis con personas reales para pruebas.

## Modelo de canalización

Violeta detecta señales -> ofrece terapeuta -> la usuaria elige -> solicita consentimiento ->
se crea canalización -> operadora asigna terapeuta -> operadora abre WhatsApp de la terapeuta ->
terapeuta contacta directamente a la usuaria -> operadora registra aceptación/contacto/seguimiento/cierre.

Este modelo evita obligar a terapeutas independientes a aprender el Centro completo durante el piloto.

## Seguridad

- La IA semántica no puede por sí sola elevar autolesión por encima de `concern`.
- `high` e `imminent` requieren lenguaje determinístico explícito.
- El riesgo de violencia previamente alto/crítico no se rebaja por un mensaje neutro.
- El contacto de la víctima no se comparte con terapeuta sin consentimiento.
- No se automatiza despacho policial.
- Las notas de canalización son operativas; no deben convertirse en historia clínica.
