import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AdminNav } from '@/components/admin/AdminNav';
import { requireStaffPage } from '@/lib/auth/staff';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function riskBadge(level?: string) {
  return `opBadge op-${level || 'none'}`;
}

function distressBadge(level?: string) {
  return `opBadge op-distress-${level || 'none'}`;
}

function selfBadge(level?: string) {
  return `opBadge op-self-${level || 'none'}`;
}

const statisticalViolenceTypes = [
  ['psychological', 'Psicológica'],
  ['economic', 'Económica'],
  ['social', 'Social / aislamiento'],
  ['sexual', 'Sexual'],
  ['physical', 'Física'],
  ['digital', 'Digital'],
  ['patrimonial', 'Patrimonial'],
  ['threats', 'Amenazas / miedo'],
  ['coercive_control', 'Control coercitivo'],
] as const;

const statisticalServiceNeeds = [
  ['emotional_support', 'Contención / apoyo emocional'],
  ['psychological', 'Atención psicológica'],
  ['legal', 'Orientación jurídica'],
  ['medical', 'Atención médica'],
  ['social_support', 'Apoyo social'],
  ['shelter', 'Refugio / espacio seguro'],
  ['safety_planning', 'Plan de seguridad'],
  ['authority_orientation', 'Orientación institucional'],
  ['other', 'Otro'],
] as const;

export default async function CaseDetail({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const ctx = await requireStaffPage();
  const { id } = await params;
  const db = supabaseAdmin();

  const { data: conv } = await db
    .from('conversations')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!conv) notFound();

  if (
    ctx.role !== 'super_admin' &&
    conv.organization_id !==
      ctx.organizationId
  ) {
    notFound();
  }

  const [
    orgResult,
    messagesResult,
    risksResult,
    distressResult,
    alertsResult,
    notesResult,
    locationsResult,
    staffResult,
    referralsResult,
    referralEventsResult,
    consentsResult,
    caseProfileResult,
  ] = await Promise.all([
    db
      .from('organizations')
      .select('name')
      .eq('id', conv.organization_id)
      .single(),

    db
      .from('messages')
      .select(
        'id,direction,content,message_type,delivery_status,created_at,metadata'
      )
      .eq('conversation_id', id)
      .order('created_at'),

    db
      .from('risk_events')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', {
        ascending: false,
      }),

    db
      .from('distress_events')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', {
        ascending: false,
      }),

    db
      .from('alerts')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', {
        ascending: false,
      }),

    db
      .from('case_notes')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', {
        ascending: false,
      }),

    db
      .from('locations')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', {
        ascending: false,
      }),

    db
      .from('profiles')
      .select(
        'id,full_name,role,active'
      )
      .eq(
        'organization_id',
        conv.organization_id
      )
      .eq('active', true)
      .order('full_name'),

    db
      .from('referrals')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', {
        ascending: false,
      }),

    db
      .from('referral_events')
      .select('*')
      .eq(
        'organization_id',
        conv.organization_id
      )
      .order('created_at', {
        ascending: false,
      }),

    db
      .from('consents')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', {
        ascending: false,
      }),

    db
      .from('case_profiles')
      .select('*')
      .eq('conversation_id', id)
      .maybeSingle(),
  ]);

  const org = orgResult.data;
  const messages =
    messagesResult.data || [];
  const risks = risksResult.data || [];
  const distress =
    distressResult.data || [];
  const alerts =
    alertsResult.data || [];
  const notes = notesResult.data || [];
  const locations =
    locationsResult.data || [];
  const staff = staffResult.data || [];
  const referrals =
    referralsResult.data || [];
  const consents =
    consentsResult.data || [];
  const caseProfile =
    caseProfileResult.data || null;

  const referralIds = new Set(
    referrals.map(
      (item: any) => item.id
    )
  );

  const referralEvents = (
    referralEventsResult.data || []
  ).filter((item: any) =>
    referralIds.has(item.referral_id)
  );

  const risk = risks[0];
  const emotional = distress[0];

  const assigned = staff.find(
    (item: any) =>
      item.id === conv.assigned_to
  );

  const staffById = new Map(
    staff.map((item: any) => [
      item.id,
      item,
    ])
  );

  const activeReferral =
    referrals.find((item: any) =>
      [
        'queued',
        'assigned',
        'accepted',
        'contacted',
        'in_progress',
        'follow_up',
      ].includes(item.status)
    ) || null;

  return (
    <main className="opShell">
      <div className="opWrap">
        <AdminNav
          ctx={ctx}
          organizationName={org?.name}
        />

        <div className="opHero">
          <div>
            <h1>
              {conv.subject_label ||
                `Caso ${String(
                  conv.id
                )
                  .slice(0, 8)
                  .toUpperCase()}`}
            </h1>

            <p>
              {conv.channel ===
              'simulator'
                ? 'Simulación interna'
                : 'Conversación WhatsApp'}{' '}
              · {conv.status} · etapa{' '}
              {conv.conversation_stage ||
                'listening'}
            </p>
          </div>

          <div className="opActions">
            <span
              className={riskBadge(
                risk?.level
              )}
            >
              Violencia{' '}
              {risk?.level ||
                'sin evaluar'}
              {risk?.score != null
                ? ` · ${risk.score}`
                : ''}
            </span>

            <span
              className={distressBadge(
                emotional?.distress_level
              )}
            >
              Angustia{' '}
              {emotional?.distress_level ||
                'none'}
            </span>

            <span
              className={selfBadge(
                emotional?.self_harm_level
              )}
            >
              Autolesión{' '}
              {emotional?.self_harm_level ||
                'none'}
            </span>
          </div>
        </div>

        <div className="opGrid6">
          <div className="opStat">
            <small>Responsable</small>
            <strong
              style={{
                fontSize: 18,
              }}
            >
              {assigned?.full_name ||
                'Sin asignar'}
            </strong>
          </div>

          <div className="opStat">
            <small>Etapa</small>
            <strong
              style={{
                fontSize: 18,
              }}
            >
              {conv.conversation_stage ||
                'listening'}
            </strong>
          </div>

          <div className="opStat">
            <small>Recurrencia</small>
            <strong>
              {conv.recurrence_count}
            </strong>
          </div>

          <div className="opStat">
            <small>Alertas</small>
            <strong>
              {alerts.length}
            </strong>
          </div>

          <div className="opStat">
            <small>Canalizaciones</small>
            <strong>
              {referrals.length}
            </strong>
          </div>

          <div className="opStat">
            <small>Ubicaciones</small>
            <strong>
              {locations.length}
            </strong>
          </div>
        </div>

        {activeReferral && (
          <div className="opCareBanner">
            <div>
              <strong>
                Canalización activa ·{' '}
                {activeReferral.referral_type}
              </strong>

              <div className="opMeta">
                Prioridad{' '}
                {activeReferral.priority} ·
                estado{' '}
                {activeReferral.status}
              </div>
            </div>

            <Link
              className="opBtn secondary"
              href="/admin/canalizaciones"
            >
              Gestionar canalización
            </Link>
          </div>
        )}

        <section className="opPanel" id="estadistica">
          <div className="opSectionTitle">
            <div>
              <h2>Ficha estadística preventiva</h2>
              <p className="opMuted">
                Información estructurada y opcional para análisis agregado, planeación preventiva y evaluación institucional.
              </p>
            </div>

            <Link
              className="opBtn secondary"
              href="/admin/analitica"
            >
              Abrir Analítica
            </Link>
          </div>

          <div className="anDataMinNotice">
            <strong>Minimización de datos:</strong>{' '}
            registra solo información útil para atención y política pública. No captures domicilio, fecha de nacimiento, religión, orientación sexual, etnia, contraseñas ni datos clínicos detallados en esta ficha.
          </div>

          <form
            action={`/api/admin/cases/${id}/profile`}
            method="post"
            className="anProfileForm"
          >
            <div>
              <label className="opLabel">
                Rango de edad
              </label>
              <select
                className="opSelect"
                name="age_band"
                defaultValue={
                  caseProfile?.age_band || 'unknown'
                }
              >
                <option value="unknown">Sin dato</option>
                <option value="under_18">Menor de 18</option>
                <option value="18_24">18–24</option>
                <option value="25_34">25–34</option>
                <option value="35_44">35–44</option>
                <option value="45_54">45–54</option>
                <option value="55_64">55–64</option>
                <option value="65_plus">65+</option>
              </select>
            </div>

            <div>
              <label className="opLabel">
                Colonia
              </label>
              <input
                className="opInput"
                name="neighborhood"
                maxLength={120}
                defaultValue={
                  caseProfile?.neighborhood || ''
                }
                placeholder="Ej. Centro, Lotes Urbanos..."
              />
            </div>

            <div>
              <label className="opLabel">
                Zona / sector
              </label>
              <input
                className="opInput"
                name="zone"
                maxLength={120}
                defaultValue={
                  caseProfile?.zone || ''
                }
                placeholder="Ej. Norte, Centro, Sur..."
              />
            </div>

            <div>
              <label className="opLabel">
                Localidad
              </label>
              <input
                className="opInput"
                name="locality"
                maxLength={120}
                defaultValue={
                  caseProfile?.locality || ''
                }
                placeholder="Ej. Delicias"
              />
            </div>

            <div>
              <label className="opLabel">
                Relación con probable agresor
              </label>
              <select
                className="opSelect"
                name="relationship_to_aggressor"
                defaultValue={
                  caseProfile?.relationship_to_aggressor ||
                  'unknown'
                }
              >
                <option value="unknown">Sin dato</option>
                <option value="partner">Pareja</option>
                <option value="ex_partner">Expareja</option>
                <option value="family">Familiar</option>
                <option value="acquaintance">Conocido</option>
                <option value="work">Entorno laboral</option>
                <option value="community">Entorno comunitario</option>
                <option value="other">Otro</option>
              </select>
            </div>

            <div>
              <label className="opLabel">
                Patrón de recurrencia
              </label>
              <select
                className="opSelect"
                name="recurrence_pattern"
                defaultValue={
                  caseProfile?.recurrence_pattern ||
                  'unknown'
                }
              >
                <option value="unknown">Sin dato</option>
                <option value="first_reported_episode">
                  Primer episodio reportado
                </option>
                <option value="occasional">Ocasional</option>
                <option value="repeated">Repetido</option>
                <option value="escalating">
                  En aumento / escalamiento
                </option>
              </select>
            </div>

            <div>
              <label className="opLabel">
                ¿Vive con el probable agresor?
              </label>
              <select
                className="opSelect"
                name="cohabitation_status"
                defaultValue={
                  caseProfile?.cohabitation_status ||
                  'unknown'
                }
              >
                <option value="unknown">Sin dato</option>
                <option value="yes">Sí</option>
                <option value="no">No</option>
              </select>
            </div>

            <div>
              <label className="opLabel">
                ¿Hay menores presentes o involucrados?
              </label>
              <select
                className="opSelect"
                name="minors_present"
                defaultValue={
                  caseProfile?.minors_present || 'unknown'
                }
              >
                <option value="unknown">Sin dato</option>
                <option value="yes">Sí</option>
                <option value="no">No</option>
              </select>
            </div>

            <div>
              <label className="opLabel">
                ¿Existe reporte/atención previa conocida?
              </label>
              <select
                className="opSelect"
                name="previous_report"
                defaultValue={
                  caseProfile?.previous_report || 'unknown'
                }
              >
                <option value="unknown">Sin dato</option>
                <option value="yes">Sí</option>
                <option value="no">No</option>
              </select>
            </div>

            <div>
              <label className="opLabel">
                Resultado / ruta actual
              </label>
              <select
                className="opSelect"
                name="case_outcome"
                defaultValue={
                  caseProfile?.case_outcome || 'open'
                }
              >
                <option value="open">Abierto</option>
                <option value="orientation">Orientación</option>
                <option value="therapy_referral">
                  Canalización terapéutica
                </option>
                <option value="legal_referral">
                  Canalización jurídica
                </option>
                <option value="medical_referral">
                  Canalización médica
                </option>
                <option value="authority_referral">
                  Canalización institucional
                </option>
                <option value="safety_plan">
                  Plan de seguridad
                </option>
                <option value="unreachable">
                  Sin contacto
                </option>
                <option value="closed">Cerrado</option>
                <option value="other">Otro</option>
              </select>
            </div>

            <fieldset className="anFieldset anFull">
              <legend>Tipos de violencia observados o reportados</legend>
              <div className="anCheckGrid">
                {statisticalViolenceTypes.map(
                  ([value, label]) => (
                    <label key={value}>
                      <input
                        type="checkbox"
                        name="violence_types"
                        value={value}
                        defaultChecked={(
                          caseProfile?.violence_types || []
                        ).includes(value)}
                      />
                      <span>{label}</span>
                    </label>
                  )
                )}
              </div>
            </fieldset>

            <fieldset className="anFieldset anFull">
              <legend>Necesidades / servicios identificados</legend>
              <div className="anCheckGrid">
                {statisticalServiceNeeds.map(
                  ([value, label]) => (
                    <label key={value}>
                      <input
                        type="checkbox"
                        name="service_needs"
                        value={value}
                        defaultChecked={(
                          caseProfile?.service_needs || []
                        ).includes(value)}
                      />
                      <span>{label}</span>
                    </label>
                  )
                )}
              </div>
            </fieldset>

            <label className="anFollowup anFull">
              <input
                type="checkbox"
                name="follow_up_required"
                value="yes"
                defaultChecked={
                  caseProfile?.follow_up_required === true
                }
              />
              <span>
                Requiere seguimiento posterior
              </span>
            </label>

            <div className="anFull">
              <label className="opLabel">
                Nota estadística breve
              </label>
              <textarea
                className="opTextarea"
                name="statistical_notes"
                maxLength={2000}
                defaultValue={
                  caseProfile?.statistical_notes || ''
                }
                placeholder="Contexto operativo útil para clasificación estadística. Evita transcribir información clínica o íntima innecesaria."
              />
            </div>

            <div className="anFull opActions">
              <button className="opBtn">
                Guardar ficha estadística
              </button>

              <span className="opMeta">
                Última actualización:{' '}
                {caseProfile?.updated_at
                  ? new Date(
                      caseProfile.updated_at
                    ).toLocaleString('es-MX')
                  : 'Sin captura'}
              </span>
            </div>
          </form>
        </section>

        <div className="opTwo">
          <section>
            <div className="opPanel">
              <div className="opSectionTitle">
                <div>
                  <h2>Conversación</h2>
                  <p className="opMuted">
                    Historial de WhatsApp y
                    respuestas de Violeta.
                  </p>
                </div>
              </div>

              <div className="opTimeline">
                {messages.map(
                  (message: any) => (
                    <div
                      key={message.id}
                      className={`opMessage ${message.direction}`}
                    >
                      <div>
                        {message.content ||
                          `[${message.message_type}]`}
                      </div>

                      <div className="opMeta">
                        {message.direction ===
                        'inbound'
                          ? 'Usuaria'
                          : 'Violeta'}{' '}
                        ·{' '}
                        {new Date(
                          message.created_at
                        ).toLocaleString(
                          'es-MX'
                        )}

                        {message.direction ===
                          'outbound' &&
                        message.delivery_status
                          ? ` · ${message.delivery_status}`
                          : ''}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>

            <div className="opTwoNested">
              <div className="opPanel">
                <h2>
                  Riesgo de violencia
                </h2>

                {risks.map(
                  (item: any) => (
                    <div
                      key={item.id}
                      className="opNote"
                    >
                      <span
                        className={riskBadge(
                          item.level
                        )}
                      >
                        {item.level}
                      </span>{' '}
                      <strong>
                        {item.score}/100
                      </strong>

                      <div className="opMeta">
                        {(
                          item.triggers ||
                          []
                        ).join(', ') ||
                          'Sin disparadores'}{' '}
                        ·{' '}
                        {new Date(
                          item.created_at
                        ).toLocaleString(
                          'es-MX'
                        )}
                      </div>
                    </div>
                  )
                )}

                {!risks.length && (
                  <p className="opMuted">
                    Sin evaluaciones.
                  </p>
                )}
              </div>

              <div className="opPanel">
                <h2>
                  Estado emocional
                </h2>

                {distress.map(
                  (item: any) => (
                    <div
                      key={item.id}
                      className="opNote emotional"
                    >
                      <div className="opActions">
                        <span
                          className={distressBadge(
                            item.distress_level
                          )}
                        >
                          Angustia{' '}
                          {
                            item.distress_level
                          }
                        </span>

                        <span
                          className={selfBadge(
                            item.self_harm_level
                          )}
                        >
                          Autolesión{' '}
                          {
                            item.self_harm_level
                          }
                        </span>
                      </div>

                      {item.semantic_summary && (
                        <div
                          style={{
                            marginTop: 8,
                          }}
                        >
                          {
                            item.semantic_summary
                          }
                        </div>
                      )}

                      <div className="opMeta">
                        {(
                          item.triggers ||
                          []
                        ).join(', ') ||
                          'Sin señales'}{' '}
                        ·{' '}
                        {new Date(
                          item.created_at
                        ).toLocaleString(
                          'es-MX'
                        )}
                      </div>
                    </div>
                  )
                )}

                {!distress.length && (
                  <p className="opMuted">
                    Sin evaluaciones
                    emocionales.
                  </p>
                )}
              </div>
            </div>

            <div className="opPanel">
              <div className="opSectionTitle">
                <div>
                  <h2>
                    Canalización y
                    consentimiento
                  </h2>

                  <p className="opMuted">
                    Registro operativo, no
                    historia clínica.
                  </p>
                </div>

                <Link
                  className="opLink"
                  href="/admin/canalizaciones"
                >
                  Centro de canalizaciones
                </Link>
              </div>

              {referrals.map(
                (item: any) => (
                  <div
                    className="opReferralSummary"
                    key={item.id}
                  >
                    <div>
                      <strong>
                        {item.referral_type}
                      </strong>

                      <div className="opMeta">
                        {item.priority} ·{' '}
                        {item.status}
                      </div>
                    </div>

                    <div>
                      Consentimiento:{' '}
                      <strong>
                        {item.consent_id
                          ? 'registrado'
                          : 'pendiente'}
                      </strong>
                    </div>

                    <div className="opMeta">
                      {new Date(
                        item.created_at
                      ).toLocaleString(
                        'es-MX'
                      )}
                    </div>
                  </div>
                )
              )}

              {referralEvents.map(
                (event: any) => (
                  <div
                    className="opActivityItem"
                    key={event.id}
                  >
                    <span className="opActivityDot referral" />
                    <div>
                      <strong>
                        {event.event_type}
                      </strong>

                      {event.note && (
                        <div>
                          {event.note}
                        </div>
                      )}

                      <div className="opMeta">
                        {new Date(
                          event.created_at
                        ).toLocaleString(
                          'es-MX'
                        )}
                      </div>
                    </div>
                  </div>
                )
              )}

              {!referrals.length && (
                <p className="opMuted">
                  No existe una canalización
                  asociada.
                </p>
              )}

              {consents.length > 0 && (
                <div className="opConsentBox">
                  <strong>
                    Consentimientos registrados
                  </strong>

                  {consents.map(
                    (item: any) => (
                      <div
                        key={item.id}
                        className="opMeta"
                      >
                        {item.consent_type} ·{' '}
                        {item.granted
                          ? 'otorgado'
                          : 'no otorgado'}{' '}
                        ·{' '}
                        {new Date(
                          item.created_at
                        ).toLocaleString(
                          'es-MX'
                        )}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </section>

          <aside>
            <div className="opPanel">
              <h3>Gestión del caso</h3>

              <form
                action={`/api/admin/cases/${id}/assign`}
                method="post"
              >
                <label className="opLabel">
                  Responsable
                </label>

                <select
                  className="opSelect"
                  name="assigned_to"
                  defaultValue={
                    conv.assigned_to || ''
                  }
                >
                  <option value="">
                    Sin asignar
                  </option>

                  {staff
                    .filter((item: any) =>
                      [
                        'admin',
                        'supervisor',
                        'operator',
                      ].includes(
                        item.role
                      )
                    )
                    .map(
                      (item: any) => (
                        <option
                          key={item.id}
                          value={item.id}
                        >
                          {item.full_name ||
                            item.id.slice(
                              0,
                              8
                            )}{' '}
                          · {item.role}
                        </option>
                      )
                    )}
                </select>

                <button
                  className="opBtn"
                  style={{
                    marginTop: 10,
                  }}
                >
                  Asignar
                </button>
              </form>

              <hr className="opDivider" />

              <form
                action={`/api/admin/cases/${id}/status`}
                method="post"
              >
                <label className="opLabel">
                  Estado
                </label>

                <select
                  className="opSelect"
                  name="status"
                  defaultValue={
                    conv.status
                  }
                >
                  <option value="open">
                    Abierto
                  </option>
                  <option value="in_review">
                    En revisión
                  </option>
                  <option value="closed">
                    Cerrado
                  </option>
                </select>

                <input
                  className="opInput"
                  name="reason"
                  placeholder="Motivo de cierre (opcional)"
                  style={{
                    marginTop: 8,
                  }}
                />

                <button
                  className="opBtn secondary"
                  style={{
                    marginTop: 10,
                  }}
                >
                  Actualizar estado
                </button>
              </form>
            </div>

            <div className="opPanel">
              <h3>Notas internas</h3>

              <form
                action={`/api/admin/cases/${id}/notes`}
                method="post"
              >
                <textarea
                  className="opTextarea"
                  name="note"
                  maxLength={5000}
                  required
                  placeholder="Observación operativa para el equipo..."
                />

                <button
                  className="opBtn"
                  style={{
                    marginTop: 10,
                  }}
                >
                  Guardar nota
                </button>
              </form>

              {notes.map(
                (note: any) => {
                  const author =
                    staffById.get(
                      note.author_id
                    ) as any;

                  return (
                    <div
                      key={note.id}
                      className="opNote"
                    >
                      {note.note}

                      <div className="opMeta">
                        {author?.full_name ||
                          'Equipo'}{' '}
                        ·{' '}
                        {new Date(
                          note.created_at
                        ).toLocaleString(
                          'es-MX'
                        )}
                      </div>
                    </div>
                  );
                }
              )}
            </div>

            <div className="opPanel">
              <h3>Alertas</h3>

              {alerts.map(
                (alert: any) => (
                  <div
                    key={alert.id}
                    className="opAlert"
                  >
                    <strong>
                      {alert.priority} ·{' '}
                      {alert.status}
                    </strong>

                    <div className="opMeta">
                      {new Date(
                        alert.created_at
                      ).toLocaleString(
                        'es-MX'
                      )}
                    </div>
                  </div>
                )
              )}

              {!alerts.length && (
                <p className="opMuted">
                  Sin alertas.
                </p>
              )}

              <p
                className="opDangerText"
                style={{
                  fontSize: 12,
                }}
              >
                VioletaBot no realiza despacho
                policial automático ni sustituye
                atención clínica o de emergencia.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
