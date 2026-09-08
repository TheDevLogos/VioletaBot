import Link from 'next/link';

import { AdminNav } from '@/components/admin/AdminNav';
import { LiveRefresh } from '@/components/admin/LiveRefresh';
import { requireStaffPage } from '@/lib/auth/staff';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function riskBadge(level?: string) {
  return `opBadge op-${level || 'none'}`;
}

function distressBadge(level?: string) {
  return `opBadge op-distress-${level || 'none'}`;
}

function selfHarmBadge(level?: string) {
  return `opBadge op-self-${level || 'none'}`;
}

function shortCase(row: any) {
  return (
    row.subject_label ||
    `Caso ${String(row.id).slice(0, 8).toUpperCase()}`
  );
}

export default async function OperationCenter({
  searchParams,
}: {
  searchParams: Promise<{
    org?: string;
    channel?: string;
  }>;
}) {
  const ctx = await requireStaffPage();
  const params = await searchParams;
  const db = supabaseAdmin();

  const { data: allOrgs } =
    ctx.role === 'super_admin'
      ? await db
          .from('organizations')
          .select('id,name,active')
          .eq('active', true)
          .order('name')
      : ({ data: null } as any);

  const requested =
    ctx.role === 'super_admin' &&
    params.org &&
    allOrgs?.some(
      (item: any) => item.id === params.org
    )
      ? params.org
      : null;

  const orgId =
    requested || ctx.organizationId;

  if (!orgId) {
    return (
      <main className="opShell">
        <div className="opWrap">
          <AdminNav ctx={ctx} />
          <div className="opPanel">
            Tu perfil no tiene una
            organización asignada.
          </div>
        </div>
      </main>
    );
  }

  const { data: org } = await db
    .from('organizations')
    .select('id,name')
    .eq('id', orgId)
    .single();

  let conversationQuery = db
    .from('conversations')
    .select(
      [
        'id',
        'wa_user_id',
        'subject_label',
        'channel',
        'is_test',
        'status',
        'conversation_stage',
        'assigned_to',
        'updated_at',
        'risk_events(level,score,created_at)',
        'distress_events(distress_level,self_harm_level,created_at)',
        'alerts(id,status,priority,created_at)',
      ].join(',')
    )
    .eq('organization_id', orgId)
    .order('updated_at', {
      ascending: false,
    })
    .limit(100);

  if (
    params.channel === 'simulator' ||
    params.channel === 'whatsapp'
  ) {
    conversationQuery =
      conversationQuery.eq(
        'channel',
        params.channel
      );
  }

  const [
    conversationResult,
    referralResult,
    therapistResult,
    auditResult,
    referralEventsResult,
  ] = await Promise.all([
    conversationQuery,

    db
      .from('referrals')
      .select(
        'id,conversation_id,referral_type,priority,status,is_test,assigned_therapist_id,created_at,updated_at'
      )
      .eq('organization_id', orgId)
      .order('updated_at', {
        ascending: false,
      })
      .limit(100),

    db
      .from('therapists')
      .select(
        'id,full_name,availability_status,active'
      )
      .eq('organization_id', orgId)
      .eq('active', true),

    db
      .from('audit_logs')
      .select(
        'id,action,entity_type,entity_id,metadata,created_at'
      )
      .eq('organization_id', orgId)
      .order('created_at', {
        ascending: false,
      })
      .limit(20),

    db
      .from('referral_events')
      .select(
        'id,referral_id,event_type,note,created_at'
      )
      .eq('organization_id', orgId)
      .order('created_at', {
        ascending: false,
      })
      .limit(20),
  ]);

  const cases = conversationResult.data || [];
  const referrals = referralResult.data || [];
  const therapists = therapistResult.data || [];

  const rows = cases.map((conversation: any) => {
    const risks = [
      ...(conversation.risk_events || []),
    ].sort(
      (a: any, b: any) =>
        +new Date(b.created_at) -
        +new Date(a.created_at)
    );

    const distress = [
      ...(conversation.distress_events || []),
    ].sort(
      (a: any, b: any) =>
        +new Date(b.created_at) -
        +new Date(a.created_at)
    );

    const pending = (
      conversation.alerts || []
    ).filter(
      (alert: any) =>
        alert.status === 'pending'
    );

    return {
      ...conversation,
      risk: risks[0],
      distress: distress[0],
      pendingAlerts: pending.length,
    };
  });

  const activeRows = rows.filter(
    (row: any) => row.status !== 'closed'
  );

  const violencePriority =
    activeRows.filter((row: any) =>
      ['high', 'critical'].includes(
        row.risk?.level
      )
    ).length;

  const emotionalPriority =
    activeRows.filter((row: any) =>
      ['high', 'severe'].includes(
        row.distress?.distress_level
      )
    ).length;

  const selfHarmPriority =
    activeRows.filter((row: any) =>
      ['concern', 'high', 'imminent'].includes(
        row.distress?.self_harm_level
      )
    ).length;

  const pendingAlerts =
    activeRows.reduce(
      (total: number, row: any) =>
        total + row.pendingAlerts,
      0
    );

  const activeReferrals =
    referrals.filter((item: any) =>
      [
        'queued',
        'assigned',
        'accepted',
        'contacted',
        'in_progress',
        'follow_up',
      ].includes(item.status)
    );

  const availableTherapists =
    therapists.filter(
      (item: any) =>
        item.availability_status ===
        'available'
    ).length;

  const caseById = new Map(
    cases.map((item: any) => [
      item.id,
      item,
    ])
  );

  const activity = [
    ...(auditResult.data || []).map(
      (item: any) => ({
        kind: 'audit',
        at: item.created_at,
        title: item.action,
        detail:
          item.entity_type ===
          'conversation'
            ? `Caso ${String(
                item.entity_id || ''
              ).slice(0, 8)}`
            : item.entity_type,
      })
    ),
    ...(referralEventsResult.data || []).map(
      (item: any) => ({
        kind: 'referral',
        at: item.created_at,
        title: item.event_type,
        detail:
          item.note ||
          `Canalización ${String(
            item.referral_id
          ).slice(0, 8)}`,
      })
    ),
  ]
    .sort(
      (a: any, b: any) =>
        +new Date(b.at) -
        +new Date(a.at)
    )
    .slice(0, 20);

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

            <h1>Centro de Operación</h1>

            <p>
              Violencia, angustia,
              canalizaciones y seguimiento de{' '}
              {org?.name}.
            </p>
          </div>

          <div className="opActions">
            <Link
              className="opBtn secondary"
              href="/admin/analitica"
            >
              Analítica preventiva
            </Link>

            <Link
              className="opBtn secondary"
              href="/admin/canalizaciones"
            >
              Ver canalizaciones
            </Link>

            <Link
              className="opBtn"
              href="/admin/simulador"
            >
              Nueva simulación
            </Link>
          </div>
        </div>

        {ctx.role === 'super_admin' && (
          <div className="opPanel">
            <form className="opFilter">
              <div>
                <label className="opLabel">
                  Centro / dependencia
                </label>

                <select
                  className="opSelect"
                  name="org"
                  defaultValue={orgId}
                >
                  {(allOrgs || []).map(
                    (item: any) => (
                      <option
                        key={item.id}
                        value={item.id}
                      >
                        {item.name}
                      </option>
                    )
                  )}
                </select>
              </div>

              <button className="opBtn secondary">
                Cambiar centro
              </button>
            </form>
          </div>
        )}

        <div className="opGrid6">
          <div className="opStat">
            <small>
              Casos activos
            </small>
            <strong>
              {activeRows.length}
            </strong>
          </div>

          <div className="opStat opStatDanger">
            <small>
              Violencia alta/crítica
            </small>
            <strong>
              {violencePriority}
            </strong>
          </div>

          <div className="opStat opStatEmotional">
            <small>
              Angustia alta/severa
            </small>
            <strong>
              {emotionalPriority}
            </strong>
          </div>

          <div className="opStat opStatCrisis">
            <small>
              Señal autolesión
            </small>
            <strong>
              {selfHarmPriority}
            </strong>
          </div>

          <div className="opStat">
            <small>
              Canalizaciones activas
            </small>
            <strong>
              {activeReferrals.length}
            </strong>
          </div>

          <div className="opStat opStatAvailable">
            <small>
              Terapeutas disponibles
            </small>
            <strong>
              {availableTherapists}
            </strong>
          </div>
        </div>

        <div className="opPanel">
          <div className="opSectionTitle">
            <div>
              <h2>
                Casos que requieren atención
              </h2>
              <p className="opMuted">
                Vista combinada de violencia,
                angustia y autolesión.
              </p>
            </div>

            <div className="opActions">
              <span className="opCounter">
                {pendingAlerts} alertas
                pendientes
              </span>

              <Link
                className="opBtn secondary"
                href={
                  ctx.role === 'super_admin'
                    ? `/admin/centro?org=${orgId}&channel=whatsapp`
                    : '/admin/centro?channel=whatsapp'
                }
              >
                Solo WhatsApp
              </Link>

              <Link
                className="opBtn secondary"
                href={
                  ctx.role === 'super_admin'
                    ? `/admin/centro?org=${orgId}`
                    : '/admin/centro'
                }
              >
                Todos
              </Link>
            </div>
          </div>

          <div className="opTableWrap">
            <table className="opTable">
              <thead>
                <tr>
                  <th>Caso</th>
                  <th>Canal</th>
                  <th>Violencia</th>
                  <th>Angustia</th>
                  <th>Autolesión</th>
                  <th>Etapa</th>
                  <th>Alertas</th>
                  <th>Actualizado</th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {rows.map((row: any) => (
                  <tr key={row.id}>
                    <td>
                      <strong>
                        {shortCase(row)}
                      </strong>

                      <div className="opMuted">
                        ••••{String(
                          row.wa_user_id
                        ).slice(-4)}
                      </div>
                    </td>

                    <td>
                      {row.channel ===
                      'simulator' ? (
                        <span className="opBadge op-test">
                          TEST
                        </span>
                      ) : (
                        'WhatsApp'
                      )}
                    </td>

                    <td>
                      <span
                        className={riskBadge(
                          row.risk?.level
                        )}
                      >
                        {row.risk?.level ||
                          'sin evaluar'}
                      </span>
                    </td>

                    <td>
                      <span
                        className={distressBadge(
                          row.distress
                            ?.distress_level
                        )}
                      >
                        {row.distress
                          ?.distress_level ||
                          'none'}
                      </span>
                    </td>

                    <td>
                      <span
                        className={selfHarmBadge(
                          row.distress
                            ?.self_harm_level
                        )}
                      >
                        {row.distress
                          ?.self_harm_level ||
                          'none'}
                      </span>
                    </td>

                    <td>
                      <span className="opStage">
                        {row.conversation_stage ||
                          'listening'}
                      </span>
                    </td>

                    <td>
                      {row.pendingAlerts || 0}
                    </td>

                    <td>
                      {new Date(
                        row.updated_at
                      ).toLocaleString(
                        'es-MX'
                      )}
                    </td>

                    <td>
                      <Link
                        className="opLink"
                        href={`/admin/casos/${row.id}`}
                      >
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {rows.length === 0 && (
              <div className="opEmpty">
                No hay expedientes para este
                filtro.
              </div>
            )}
          </div>
        </div>

        <div className="opTwo">
          <section className="opPanel">
            <div className="opSectionTitle">
              <div>
                <h2>
                  Canalizaciones recientes
                </h2>
                <p className="opMuted">
                  Consentimiento, asignación y
                  progreso.
                </p>
              </div>

              <Link
                className="opLink"
                href="/admin/canalizaciones"
              >
                Ver todas
              </Link>
            </div>

            <div className="opMiniList">
              {referrals
                .filter(
                  (item: any) =>
                    !item.is_test
                )
                .slice(0, 8)
                .map((item: any) => {
                  const conversation =
                    caseById.get(
                      item.conversation_id
                    ) as any;

                  return (
                    <div
                      className="opMiniRow"
                      key={item.id}
                    >
                      <div>
                        <strong>
                          {conversation
                            ? shortCase(
                                conversation
                              )
                            : `Canalización ${String(
                                item.id
                              ).slice(0, 8)}`}
                        </strong>

                        <div className="opMeta">
                          {item.referral_type}{' '}
                          · {item.priority}
                        </div>
                      </div>

                      <span
                        className={`opReferralStatus status-${item.status}`}
                      >
                        {item.status}
                      </span>
                    </div>
                  );
                })}

              {!referrals.filter(
                (item: any) =>
                  !item.is_test
              ).length && (
                <div className="opEmpty">
                  Aún no hay canalizaciones
                  reales.
                </div>
              )}
            </div>
          </section>

          <aside className="opPanel">
            <div className="opSectionTitle">
              <div>
                <h2>
                  Actividad en vivo
                </h2>
                <p className="opMuted">
                  Últimas acciones operativas.
                </p>
              </div>
            </div>

            <div className="opActivity">
              {activity.map(
                (item: any, index) => (
                  <div
                    className="opActivityItem"
                    key={`${item.kind}-${index}-${item.at}`}
                  >
                    <span
                      className={`opActivityDot ${item.kind}`}
                    />

                    <div>
                      <strong>
                        {item.title}
                      </strong>

                      <div className="opMeta">
                        {item.detail}
                      </div>

                      <div className="opMeta">
                        {new Date(
                          item.at
                        ).toLocaleString(
                          'es-MX'
                        )}
                      </div>
                    </div>
                  </div>
                )
              )}

              {!activity.length && (
                <div className="opEmpty">
                  Sin actividad reciente.
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
