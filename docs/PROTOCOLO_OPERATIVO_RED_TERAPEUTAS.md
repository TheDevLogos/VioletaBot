# Protocolo operativo MVP — Red de Terapeutas

## Objetivo

Facilitar una canalización rápida y trazable desde VioletaBot hacia terapeutas independientes de la Red 24/7 de Delicias, con consentimiento explícito de la usuaria.

## Roles

### Violeta
- escucha y conserva contexto;
- registra señales de violencia y malestar emocional;
- ofrece apoyo profesional cuando corresponde;
- solicita consentimiento;
- nunca promete que una terapeuta ya está disponible o en camino.

### Operadora
- revisa alertas y canalizaciones;
- valida prioridad;
- identifica una terapeuta disponible;
- asigna;
- notifica por WhatsApp;
- registra confirmación, contacto y seguimiento.

### Terapeuta
- confirma disponibilidad a la operadora;
- contacta directamente a la usuaria cuando existe consentimiento;
- brinda la atención profesional fuera del bot;
- informa a la operadora el estado mínimo requerido para seguimiento.

## Estados

offered -> queued -> assigned -> accepted -> contacted -> in_progress -> follow_up -> completed

Alternativos:
declined / unavailable / cancelled

## Información que puede compartirse

Solo después de consentimiento:

- teléfono de WhatsApp;
- referencia del caso;
- tipo general de apoyo (emocional, prevención suicida, violencia o combinado);
- prioridad;
- resumen mínimo estrictamente necesario.

No compartir automáticamente:

- conversación completa;
- ubicación;
- notas internas;
- historia clínica;
- detalles íntimos no necesarios.

## Crisis suicida

`self_harm = high` o `imminent` genera revisión humana prioritaria.

Violeta:
- continúa conversación breve y directa;
- pregunta por peligro inmediato cuando corresponde;
- ofrece apoyo humano;
- no diagnostica;
- no promete intervención de emergencia;
- no contacta terceros sin el protocolo aplicable y sin las autorizaciones correspondientes.

Antes de producción real, los criterios y mensajes de esta sección deben revisarse con profesionales de la Red y responsables institucionales.
