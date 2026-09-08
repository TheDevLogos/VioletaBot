# VioletaBot — Módulo de Analítica Preventiva

## Propósito

Transformar la operación diaria de VioletaBot en información agregada útil para:

- prevención de violencia;
- planeación de campañas;
- cobertura territorial;
- horarios de guardia;
- capacidad de atención;
- evaluación de canalizaciones;
- seguimiento de recurrencia;
- distribución de recursos;
- evaluación institucional.

El módulo NO está diseñado para predecir si una víctima o persona concreta cometerá, sufrirá o reincidirá en violencia.

## Fuentes automáticas

El dashboard utiliza:

- conversations
- messages
- risk_events
- distress_events
- alerts
- referrals
- referral_events
- therapists
- consents
- locations
- case_notes
- audit_logs

Las simulaciones (`is_test=true`) se excluyen de las estadísticas operativas.

## Ficha estadística estructurada

Cada expediente dispone de una ficha opcional con:

- rango de edad;
- colonia;
- zona/sector;
- localidad;
- relación con probable agresor;
- tipos de violencia observados/reportados;
- recurrencia;
- convivencia con probable agresor;
- presencia de menores;
- atención/reporte previo conocido;
- necesidades de servicio;
- resultado/ruta de atención;
- seguimiento requerido;
- nota estadística breve.

No se captura fecha de nacimiento porque el rango de edad es suficiente para planeación.

No se deben capturar en esta ficha:

- domicilio;
- contraseñas;
- religión;
- orientación sexual;
- etnia;
- información clínica extensa;
- documentos de identidad;
- información íntima no necesaria.

## Periodos

El Centro permite:

- Hoy
- Semana actual
- Mes actual
- Año actual
- Histórico

## Indicadores

- casos registrados;
- contactos únicos;
- violencia alta/crítica;
- angustia alta/severa;
- señales de autolesión;
- recurrencia;
- canalizaciones;
- canalizaciones urgentes;
- mediana de primera respuesta;
- mediana hasta contacto terapéutico;
- terapeutas disponibles;
- distribución de riesgo;
- tipologías de violencia;
- franjas horarias;
- días de la semana;
- rangos de edad;
- relación con probable agresor;
- resultado/ruta;
- necesidades de servicio;
- cobertura de ficha estadística;
- anotaciones operativas;
- acciones auditadas;
- consentimientos;
- alertas;
- movimientos de canalización.

## Geografía y privacidad

La visualización geográfica NO dibuja puntos individuales.

Las ubicaciones se agrupan en celdas aproximadas de ~1.1 km.

Una celda solo aparece si reúne al menos el umbral configurado en:

`organizations.analytics_min_geo_group_size`

Valor inicial del piloto: 5.

Colonias y zonas aplican el mismo criterio.

Los grupos que no alcanzan el umbral se suprimen.

Esto disminuye el riesgo de reidentificación en áreas con pocos casos.

## Exportación

`/api/admin/analytics/export`

Permite exportar:

- serie temporal agregada;
- zonas/colonias que alcanzan el umbral de privacidad.

No existe exportación directa de coordenadas individuales desde este módulo.

## Interpretación responsable

Las visualizaciones describen registros de VioletaBot, no necesariamente la prevalencia real de violencia en toda la población.

Ejemplo correcto:

> Durante el periodo, la categoría más registrada en VioletaBot fue violencia psicológica.

Ejemplo incorrecto:

> La colonia X es la colonia más violenta de Delicias.

La primera afirmación describe los datos observados.
La segunda introduce una inferencia causal/generalizadora que los datos del sistema por sí solos no soportan.

## Recomendaciones para publicación externa

Antes de publicar un informe público:

1. aumentar umbrales de privacidad si el universo es pequeño;
2. agrupar categorías raras;
3. eliminar cualquier texto libre;
4. no publicar coordenadas;
5. revisar la metodología con la institución;
6. documentar que los datos corresponden a registros del sistema, no a prevalencia poblacional.
