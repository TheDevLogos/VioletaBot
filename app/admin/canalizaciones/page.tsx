import Link from 'next/link';

import { AdminNav } from '@/components/admin/AdminNav';
import { LiveRefresh } from '@/components/admin/LiveRefresh';
import { requireStaffPage } from '@/lib/auth/staff';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  buildWhatsAppLink,
  normalizeWhatsAppRecipient,
} from '@/lib/whatsapp/phone';

export const dynamic = 'force-dynamic';

const ACTIVE = [
  'queued',
  'assigned',
  'accepted',
  'contacted',
  'in_progress',
  'follow_up',
];

function statusClass(status: string) {
  return `opReferralStatus status-${status}`;
}

function priorityClass(priority: string) {
  return `opPriority priority-${priority}`;
}

function typeLabel(type: string) {
  const labels: Record<string, string> = {
    emotional_support:
      'Apoyo emocional',
    suicide_prevention:
      'Prevención suicida',
    violence_support:
      'Violencia',
    combined:
      'Violencia + crisis emocional',
  };

  return labels[type] || type;
}

export default async function ReferralsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
  }>;
}) {
  const ctx = await requireStaffPage();
  const params = await searchParams;
  const db = supabaseAdmin();

  if (!ctx.organizationId) {
    return (
      <main className="opShell">
        <div className="opWrap">
          <AdminNav ctx={ctx} />
          <div className="opPanel">
            Tu perfil no tiene organización.
          </div>
        </div>
      </main>
    );
  }

  const orgId = ctx.organizationId;

  const [
    orgResult,
    referralsResult,
    therapistsResult,
    eventsResult,
  ] = await Promise.all([
    db
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single(),

    db
      .from('referrals')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_test', false)
      .order('created_at', {
        ascending: false,
      })
      .limit(150),

    db
      .from('therapists')
      .select('*')
      .eq('organization_id', orgId)
      .eq('active', true)
      .order('full_name'),

    db
      .from('referral_events')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', {
        ascending: false,
      })
      .limit(80),
  ]);

  const org = orgResult.data;
  let referrals =
    referralsResult.data || [];
  const therapists =
    therapistsResult.data || [];
  const events = eventsResult.data || [];

  if (
    params.status &&
    params.status !== 'all'
  ) {
    if (params.status === 'active') {
      referrals = referrals.filter(
        (item: any) =>
          ACTIVE.includes(item.status)
      );
    } else {
      referrals = referrals.filter(
        (item: any) =>
          item.status === params.status
      );
    }
  }

  const conversationIds = [
    ...new Set(
      referrals.map(
        (item: any) =>
          item.conversation_id
      )
    ),
  ];

  const { data: conversations } =
    conversationIds.length
      ? await db
          .from('conversations')
          .select(
            'id,subject_label,wa_user_id,status,channel,conversation_stage,updated_at'
          )
          .in('id', conversationIds)
      : ({ data: [] } as any);

  const conversationById = new Map(
    (conversations || []).map(
      (item: any) => [
        item.id,
        item,
      ]
    )
  );

  const therapistById = new Map(
    therapists.map((item: any) => [
      item.id,
      item,
    ])
  );

  const queued = referralsResult.data?.filter(
    (item: any) =>
      item.status === 'queued' &&
      !item.is_test
  ).length || 0;

  const inProgress =
    referralsResult.data?.filter(
      (item: any) =>
        [
          'assigned',
          'accepted',
          'contacted',
          'in_progress',
          'follow_up',
        ].includes(item.status) &&
        !item.is_test
    ).length || 0;

  const urgent =
    referralsResult.data?.filter(
      (item: any) =>
        [
          'urgent',
          'immediate',
        ].includes(item.priority) &&
        ACTIVE.concat('queued').includes(
          item.status
        ) &&
        !item.is_test
    ).length || 0;

  return (
    <main className="opShell">
      <LiveRefresh intervalMs={15000} />

      <div className="opWrap">
        <AdminNav
          ctx={ctx}
          organizationName={org?.name}
        />

        <div className="opHero">
          <div>
            <div className="opLivePill">
              <span />
              Actualización cada 15 s
            </div>

            <h1>Canalizaciones</h1>

            <p>
              Consentimiento, asignación a
              terapeuta, contacto y seguimiento.
            </p>
          </div>

          <Link
            className="opBtn secondary"
            href="/admin/terapeutas"
          >
            Ver Red de Terapeutas
          </Link>
        </div>

        <div className="opGrid4">
          <div className="opStat">
            <small>
              Esperando asignación
            </small>
            <strong>{queued}</strong>
          </div>

          <div className="opStat">
            <small>
              En atención / seguimiento
            </small>
            <strong>{inProgress}</strong>
          </div>

          <div className="opStat opStatCrisis">
            <small>
              Urgentes / inmediatas
            </small>
            <strong>{urgent}</strong>
          </div>

          <div className="opStat opStatAvailable">
            <small>
              Terapeutas disponibles
            </small>
            <strong>
              {
                therapists.filter(
                  (item: any) =>
                    item.availability_status ===
                    'available'
                ).length
              }
            </strong>
          </div>
        </div>

        <div className="opPanel">
          <form className="opFilter">
            <div>
              <label className="opLabel">
                Estado
              </label>

              <select
                className="opSelect"
                name="status"
                defaultValue={
                  params.status || 'all'
                }
              >
                <option value="all">
                  Todos
                </option>
                <option value="active">
                  Activas
                </option>
                <option value="queued">
                  Esperando terapeuta
                </option>
                <option value="assigned">
                  Asignada
                </option>
                <option value="accepted">
                  Aceptada
                </option>
                <option value="contacted">
                  Víctima contactada
                </option>
                <option value="in_progress">
                  En atención
                </option>
                <option value="follow_up">
                  Seguimiento
                </option>
                <option value="completed">
                  Concluida
                </option>
              </select>
            </div>

            <button className="opBtn secondary">
              Filtrar
            </button>
          </form>
        </div>

        <div className="opReferralGrid">
          {referrals.map(
            (referral: any) => {
              const conversation =
                conversationById.get(
                  referral.conversation_id
                ) as any;

              const therapist =
                referral.assigned_therapist_id
                  ? (therapistById.get(
                      referral.assigned_therapist_id
                    ) as any)
                  : null;

              const caseLabel =
                conversation?.subject_label ||
                `Caso ${String(
                  referral.conversation_id
                ).slice(0, 8)}`;

              const consented =
                Boolean(
                  referral.consent_id
                );

              const victim =
                normalizeWhatsAppRecipient(
                  conversation?.wa_user_id ||
                    ''
                );

              const therapistNotice =
                therapist && consented
                  ? buildWhatsAppLink(
                      therapist.whatsapp_number,
                      [
                        'VioletaBot · Nueva canalización',
                        `Caso: ${caseLabel}`,
                        `Tipo: ${typeLabel(referral.referral_type)}`,
                        `Prioridad: ${referral.priority}`,
                        'La usuaria autorizó ser contactada por una terapeuta de la Red.',
                        `WhatsApp autorizado: +${victim}`,
                        'Por favor confirma disponibilidad con la operadora y contacta a la usuaria directamente.',
                      ].join('\n')
                    )
                  : null;

              return (
                <article
                  className="opReferralCard"
                  key={referral.id}
                >
                  <div className="opReferralHead">
                    <div>
                      <Link
                        className="opLink"
                        href={`/admin/casos/${referral.conversation_id}`}
                      >
                        {caseLabel}
                      </Link>

                      <div className="opMeta">
                        {typeLabel(
                          referral.referral_type
                        )}
                      </div>
                    </div>

                    <div className="opStackRight">
                      <span
                        className={priorityClass(
                          referral.priority
                        )}
                      >
                        {referral.priority}
                      </span>

                      <span
                        className={statusClass(
                          referral.status
                        )}
                      >
                        {referral.status}
                      </span>
                    </div>
                  </div>

                  <div className="opReferralFacts">
                    <div>
                      <small>
                        Consentimiento
                      </small>
                      <strong>
                        {consented
                          ? 'Autorizado'
                          : 'No registrado'}
                      </strong>
                    </div>

                    <div>
                      <small>
                        Terapeuta
                      </small>
                      <strong>
                        {therapist?.full_name ||
                          'Sin asignar'}
                      </strong>
                    </div>

                    <div>
                      <small>
                        Solicitud
                      </small>
                      <strong>
                        {new Date(
                          referral.created_at
                        ).toLocaleString(
                          'es-MX'
                        )}
                      </strong>
                    </div>
                  </div>

                  {referral.summary && (
                    <div className="opSoftBox">
                      <strong>
                        Resumen mínimo
                      </strong>
                      <div>
                        {referral.summary}
                      </div>
                    </div>
                  )}

                  {referral.status ===
                    'queued' && (
                    <form
                      action={`/api/admin/referrals/${referral.id}/assign`}
                      method="post"
                      className="opInlineForm"
                    >
                      <select
                        className="opSelect"
                        name="therapist_id"
                        required
                        defaultValue=""
                      >
                        <option
                          value=""
                          disabled
                        >
                          Selecciona terapeuta
                        </option>

                        {therapists.map(
                          (
                            item: any
                          ) => (
                            <option
                              key={
                                item.id
                              }
                              value={
                                item.id
                              }
                            >
                              {
                                item.full_name
                              }{' '}
                              ·{' '}
                              {
                                item.availability_status
                              }
                            </option>
                          )
                        )}
                      </select>

                      <button className="opBtn">
                        Asignar
                      </button>
                    </form>
                  )}

                  {therapistNotice && (
                    <a
                      className="opBtn opWhatsappBtn"
                      href={therapistNotice}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Avisar a terapeuta por
                      WhatsApp
                    </a>
                  )}

                  {[
                    'assigned',
                    'accepted',
                    'contacted',
                    'in_progress',
                    'follow_up',
                  ].includes(
                    referral.status
                  ) && (
                    <form
                      action={`/api/admin/referrals/${referral.id}/status`}
                      method="post"
                      className="opReferralStatusForm"
                    >
                      <select
                        className="opSelect"
                        name="status"
                        defaultValue={
                          referral.status
                        }
                      >
                        <option value="assigned">
                          Asignada
                        </option>
                        <option value="accepted">
                          Terapeuta aceptó
                        </option>
                        <option value="contacted">
                          Víctima contactada
                        </option>
                        <option value="in_progress">
                          En atención
                        </option>
                        <option value="follow_up">
                          Requiere seguimiento
                        </option>
                        <option value="completed">
                          Atención concluida
                        </option>
                        <option value="unavailable">
                          Terapeuta no disponible
                        </option>
                        <option value="cancelled">
                          Cancelada
                        </option>
                      </select>

                      <textarea
                        className="opTextarea"
                        name="note"
                        maxLength={2000}
                        placeholder="Nota operativa breve (sin historia clínica)..."
                      />

                      <button className="opBtn secondary">
                        Guardar avance
                      </button>
                    </form>
                  )}
                </article>
              );
            }
          )}

          {!referrals.length && (
            <div className="opPanel opEmpty">
              No hay canalizaciones para este
              filtro.
            </div>
          )}
        </div>

        <div className="opPanel">
          <h2>
            Bitácora de canalizaciones
          </h2>

          <div className="opActivity">
            {events.map(
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
          </div>
        </div>
      </div>
    </main>
  );
}
