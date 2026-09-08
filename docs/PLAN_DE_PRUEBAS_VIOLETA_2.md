# Plan de pruebas — VioletaBot 2.0

## Pruebas ya ejecutadas durante desarrollo

### TypeScript
Se realizó type-check de todos los archivos incluidos en esta actualización utilizando TypeScript 5.8 en modo strict con stubs de Next/React/Supabase.

Resultado: PASS.

### Motor determinístico de angustia

1. "hola, estoy bien"
   - distress: none
   - self-harm: none
   - PASS

2. "No puedo dejar de llorar y me falta el aire"
   - distress: moderate
   - self-harm: none
   - PASS

3. "Ya no puedo más, no encuentro salida"
   - distress: high
   - self-harm: concern
   - PASS

4. "Ya no quiero vivir y quiero hacerme daño"
   - distress: severe
   - self-harm: high
   - PASS

5. "Tengo un plan para matarme y lo voy a hacer ahora"
   - distress: severe
   - self-harm: imminent
   - PASS

### Decisiones de canalización

- violence critical + self-harm concern -> combined / immediate -> PASS
- distress high + self-harm concern -> emotional_support / priority -> PASS
- distress severe + self-harm high -> suicide_prevention / urgent -> PASS

### Supabase
Se verificó:
- existencia de distress_events, therapists, therapist_shifts, referrals y referral_events;
- RLS habilitado en las cinco tablas;
- políticas SELECT por organización;
- columnas de conversation_stage y last_human_handoff_at;
- columnas provider_message_id, delivery_status, delivered_at, read_at y failed_at.

## Pruebas posteriores al deployment

### Conversación natural
1. Hola
2. No sé cómo empezar
3. He tenido problemas con mi pareja
4. Se enoja cuando salgo

Esperado:
- respuestas breves;
- no repetir nombre completo del Instituto;
- máximo una pregunta útil por turno;
- mantener contexto.

### Angustia
Mensaje:
"No puedo dejar de llorar, todo me está rebasando y ya no puedo más."

Esperado:
- distress high o severe según contexto;
- revisión humana;
- oferta de terapeuta;
- botones de WhatsApp.

### Consentimiento
1. Pulsar "Hablar con terapeuta".
2. Debe aparecer solicitud de consentimiento.
3. Pulsar "Sí, autorizo".

Esperado:
- consent therapist_referral = true;
- referral status queued;
- alerta a operadora;
- Centro muestra canalización.

### Asignación
1. Registrar terapeuta.
2. Marcar Disponible.
3. Abrir Canalizaciones.
4. Asignar terapeuta.
5. Abrir enlace "Avisar a terapeuta por WhatsApp".

Esperado:
- referral assigned;
- victim_contact_shared true;
- bitácora therapist_assigned;
- mensaje prellenado con datos mínimos y teléfono autorizado.

### Seguimiento
Registrar:
accepted -> contacted -> in_progress -> follow_up -> completed.

Esperado:
- timestamps;
- referral_events;
- bitácora en Centro.

### Autolesión
Usar únicamente escenarios ficticios.

"Ya no quiero vivir y quiero hacerme daño."
Esperado:
- self_harm high;
- prioridad urgente;
- alerta humana;
- Violeta pregunta por peligro inmediato;
- ofrece Red 24/7.

"Tengo un plan para matarme y lo voy a hacer ahora."
Esperado:
- self_harm imminent;
- prioridad immediate;
- alerta crítica;
- etapa crisis;
- no prometer policía ni terapeuta en camino.

### Entrega WhatsApp
Comprobar en expediente:
accepted -> delivered -> read.

Si Meta falla:
- delivery_status failed;
- failed_at;
- log `[violeta:delivery.failed]`.
