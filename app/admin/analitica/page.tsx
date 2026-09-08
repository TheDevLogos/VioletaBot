import Link from 'next/link';

import { AdminNav } from '@/components/admin/AdminNav';
import { LiveRefresh } from '@/components/admin/LiveRefresh';
import {
  DonutChart,
  FunnelChart,
  GeoHeatGrid,
  HorizontalBars,
  HourBars,
  KpiCard,
  LineChart,
} from '@/components/admin/analytics/Charts';
import { requireStaffPage } from '@/lib/auth/staff';
import {
  analyticsStart,
  buildDailySeries,
  coarseGeoCells,
  countArrayValues,
  countBy,
  formatMinutes,
  localHour,
  localWeekDay,
  maxLevelByConversation,
  median,
  minutesBetween,
  periodLabel,
  privacyFilteredAreas,
  type AnalyticsPeriod,
  type NamedCount,
} from '@/lib/analytics/aggregate';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const RISK_RANK = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const DISTRESS_RANK = {
  none: 0,
  mild: 1,
  moderate: 2,
  high: 3,
  severe: 4,
};

const SELF_HARM_RANK = {
  none: 0,
  concern: 1,
  high: 2,
  imminent: 3,
};

const AGE_LABELS: Record<string, string> = {
  under_18: 'Menor de 18',
  '18_24': '18–24',
  '25_34': '25–34',
  '35_44': '35–44',
  '45_54': '45–54',
  '55_64': '55–64',
  '65_plus': '65+',
  unknown: 'Sin dato',
};

const RELATIONSHIP_LABELS: Record<string, string> = {
  partner: 'Pareja',
  ex_partner: 'Expareja',
  family: 'Familiar',
  acquaintance: 'Conocido',
  work: 'Entorno laboral',
  community: 'Entorno comunitario',
  other: 'Otro',
  unknown: 'Sin dato',
};

const OUTCOME_LABELS: Record<string, string> = {
  open: 'Abierto',
  orientation: 'Orientación',
  therapy_referral: 'Canalización terapéutica',
  legal_referral: 'Canalización jurídica',
  medical_referral: 'Canalización médica',
  authority_referral: 'Canalización institucional',
  safety_plan: 'Plan de seguridad',
  unreachable: 'Sin contacto',
  closed: 'Cerrado',
  other: 'Otro',
};

const VIOLENCE_LABELS: Record<string, string> = {
  psychological: 'Psicológica',
  economic: 'Económica',
  social: 'Social / aislamiento',
  sexual: 'Sexual',
  physical: 'Física',
  digital: 'Digital',
  patrimonial: 'Patrimonial',
  threats: 'Amenazas / miedo',
  coercive_control: 'Control coercitivo',
  emergency_language: 'Lenguaje de emergencia',
};

const WEEK_DAYS = [
  'Dom',
  'Lun',
  'Mar',
  'Mié',
  'Jue',
  'Vie',
  'Sáb',
];

function validPeriod(
  raw?: string
): AnalyticsPeriod {
  if (
    raw === 'day' ||
    raw === 'week' ||
    raw === 'month' ||
    raw === 'year' ||
    raw === 'all'
  ) {
    return raw;
  }

  return 'month';
}

function relabel(
  values: NamedCount[],
  labels: Record<string, string>
) {
  return values.map((item) => ({
    ...item,
    label:
      labels[item.label] ||
      item.label,
  }));
}

function percentage(
  numerator: number,
  denominator: number
) {
  if (!denominator) return '0%';

  return `${Math.round(
    (numerator / denominator) *
      100
  )}%`;
}

function latestProfileCompleteness(
  profiles: any[],
  totalCases: number
) {
  return percentage(
    profiles.length,
    totalCases
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
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
            Tu perfil no tiene una organización asignada.
          </div>
        </div>
      </main>
    );
  }

  const orgId = ctx.organizationId;
  const period = validPeriod(params.period);
  const start = analyticsStart(period);
  const startMs = start
    ? +start
    : null;

  const [
    orgResult,
    conversationsResult,
    profilesResult,
    referralsResult,
    referralEventsResult,
    therapistsResult,
    auditResult,
  ] = await Promise.all([
    db
      .from('organizations')
      .select(
        'id,name,analytics_enabled,analytics_min_geo_group_size'
      )
      .eq('id', orgId)
      .single(),

    db
      .from('conversations')
      .select(
        'id,wa_user_id,status,recurrence_count,created_at,updated_at,channel,conversation_stage'
      )
      .eq('organization_id', orgId)
      .eq('is_test', false)
      .order('created_at', {
        ascending: false,
      })
      .limit(5000),

    db
      .from('case_profiles')
      .select('*')
      .eq('organization_id', orgId)
      .limit(5000),

    db
      .from('referrals')
      .select(
        'id,conversation_id,referral_type,priority,status,created_at,consented_at,assigned_at,accepted_at,contacted_at,closed_at,is_test'
      )
      .eq('organization_id', orgId)
      .eq('is_test', false)
      .order('created_at', {
        ascending: false,
      })
      .limit(5000),

    db
      .from('referral_events')
      .select(
        'id,referral_id,event_type,created_at'
      )
      .eq('organization_id', orgId)
      .order('created_at', {
        ascending: false,
      })
      .limit(10000),

    db
      .from('therapists')
      .select(
        'id,availability_status,active'
      )
      .eq('organization_id', orgId)
      .eq('active', true),

    db
      .from('audit_logs')
      .select(
        'id,action,actor_id,entity_type,entity_id,created_at'
      )
      .eq('organization_id', orgId)
      .order('created_at', {
        ascending: false,
      })
      .limit(10000),
  ]);

  const org = orgResult.data;

  if (org?.analytics_enabled === false) {
    return (
      <main className="opShell">
        <div className="opWrap">
          <AdminNav
            ctx={ctx}
            organizationName={org?.name}
          />

          <div className="opPanel">
            El módulo de analítica está deshabilitado para esta organización.
          </div>
        </div>
      </main>
    );
  }

  const allConversations =
    conversationsResult.data || [];

  const newCases = allConversations.filter(
    (item: any) =>
      startMs == null ||
      +new Date(item.created_at) >=
        startMs
  );

  const activeCases =
    allConversations.filter(
      (item: any) =>
        startMs == null ||
        +new Date(item.updated_at) >=
          startMs
    );

  const newIds = newCases.map(
    (item: any) => item.id
  );

  const activeIds = activeCases.map(
    (item: any) => item.id
  );

  const relevantIds = [
    ...new Set([
      ...newIds,
      ...activeIds,
    ]),
  ].slice(0, 1500);

  const periodProfiles = (
    profilesResult.data || []
  ).filter((item: any) =>
    newIds.includes(
      item.conversation_id
    )
  );

  const periodReferrals = (
    referralsResult.data || []
  ).filter(
    (item: any) =>
      startMs == null ||
      +new Date(item.created_at) >=
        startMs
  );

  const periodReferralIds =
    new Set(
      periodReferrals.map(
        (item: any) => item.id
      )
    );

  const periodReferralEvents = (
    referralEventsResult.data || []
  ).filter(
    (item: any) =>
      periodReferralIds.has(
        item.referral_id
      ) ||
      startMs == null ||
      +new Date(item.created_at) >=
        startMs
  );

  const periodAudit = (
    auditResult.data || []
  ).filter(
    (item: any) =>
      startMs == null ||
      +new Date(item.created_at) >=
        startMs
  );

  const empty = {
    data: [],
  } as any;

  const [
    risksResult,
    distressResult,
    messagesResult,
    alertsResult,
    notesResult,
    consentsResult,
    locationsResult,
  ] = relevantIds.length
    ? await Promise.all([
        db
          .from('risk_events')
          .select(
            'conversation_id,level,categories,created_at'
          )
          .in(
            'conversation_id',
            relevantIds
          )
          .limit(15000),

        db
          .from('distress_events')
          .select(
            'conversation_id,distress_level,self_harm_level,created_at'
          )
          .in(
            'conversation_id',
            relevantIds
          )
          .limit(15000),

        db
          .from('messages')
          .select(
            'conversation_id,direction,created_at'
          )
          .in(
            'conversation_id',
            relevantIds
          )
          .order('created_at', {
            ascending: true,
          })
          .limit(30000),

        db
          .from('alerts')
          .select(
            'conversation_id,priority,status,created_at,acknowledged_at'
          )
          .in(
            'conversation_id',
            relevantIds
          )
          .limit(15000),

        db
          .from('case_notes')
          .select(
            'conversation_id,author_id,created_at'
          )
          .in(
            'conversation_id',
            relevantIds
          )
          .limit(15000),

        db
          .from('consents')
          .select(
            'conversation_id,consent_type,granted,created_at'
          )
          .in(
            'conversation_id',
            relevantIds
          )
          .limit(15000),

        newIds.length
          ? db
              .from('locations')
              .select(
                'conversation_id,latitude,longitude,created_at'
              )
              .in(
                'conversation_id',
                newIds.slice(0, 1500)
              )
              .limit(10000)
          : Promise.resolve(empty),
      ])
    : [
        empty,
        empty,
        empty,
        empty,
        empty,
        empty,
        empty,
      ];

  const risks =
    risksResult.data || [];
  const distress =
    distressResult.data || [];
  const messages =
    messagesResult.data || [];
  const alerts =
    alertsResult.data || [];
  const notes =
    notesResult.data || [];
  const consents =
    consentsResult.data || [];
  const locations =
    locationsResult.data || [];

  const maxRisk =
    maxLevelByConversation(
      risks,
      'level',
      RISK_RANK
    );

  const maxDistress =
    maxLevelByConversation(
      distress,
      'distress_level',
      DISTRESS_RANK
    );

  const maxSelfHarm =
    maxLevelByConversation(
      distress,
      'self_harm_level',
      SELF_HARM_RANK
    );

  const daily = buildDailySeries({
    conversations: newCases,
    maxRiskByConversation:
      maxRisk,
    maxDistressByConversation:
      maxDistress,
    maxSelfHarmByConversation:
      maxSelfHarm,
    referrals: periodReferrals,
  });

  const highCriticalCases =
    newCases.filter((item: any) =>
      ['high', 'critical'].includes(
        maxRisk.get(item.id) ||
          'none'
      )
    ).length;

  const distressCases =
    newCases.filter((item: any) =>
      ['high', 'severe'].includes(
        maxDistress.get(item.id) ||
          'none'
      )
    ).length;

  const selfHarmCases =
    newCases.filter((item: any) =>
      [
        'concern',
        'high',
        'imminent',
      ].includes(
        maxSelfHarm.get(item.id) ||
          'none'
      )
    ).length;

  const recurringCases =
    newCases.filter(
      (item: any) =>
        Number(
          item.recurrence_count || 0
        ) > 0
    ).length;

  const uniqueContacts =
    new Set(
      newCases.map(
        (item: any) =>
          item.wa_user_id
      )
    ).size;

  const notesInPeriod =
    notes.filter(
      (item: any) =>
        startMs == null ||
        +new Date(item.created_at) >=
          startMs
    );

  const alertsInPeriod =
    alerts.filter(
      (item: any) =>
        startMs == null ||
        +new Date(item.created_at) >=
          startMs
    );

  const consentsGranted =
    consents.filter(
      (item: any) =>
        item.granted === true &&
        (startMs == null ||
          +new Date(
            item.created_at
          ) >= startMs)
    );

  const responseMinutes: number[] = [];
  const firstInboundByCase =
    new Map<string, string>();
  const firstOutboundByCase =
    new Map<string, string>();

  for (const message of messages) {
    const id =
      message.conversation_id;

    if (
      message.direction === 'inbound' &&
      !firstInboundByCase.has(id)
    ) {
      firstInboundByCase.set(
        id,
        message.created_at
      );
    }

    if (
      message.direction === 'outbound' &&
      !firstOutboundByCase.has(id)
    ) {
      firstOutboundByCase.set(
        id,
        message.created_at
      );
    }
  }

  for (const id of newIds) {
    const value =
      minutesBetween(
        firstInboundByCase.get(id),
        firstOutboundByCase.get(id)
      );

    if (value != null) {
      responseMinutes.push(value);
    }
  }

  const referralContactMinutes =
    periodReferrals
      .map((item: any) =>
        minutesBetween(
          item.created_at,
          item.contacted_at
        )
      )
      .filter(
        (item: number | null): item is number =>
          item != null
      );

  const availableTherapists = (
    therapistsResult.data || []
  ).filter(
    (item: any) =>
      item.availability_status ===
      'available'
  ).length;

  const riskDistribution =
    countBy(
      newCases.map(
        (item: any) =>
          maxRisk.get(item.id) ||
          'none'
      )
    );

  const distressDistribution =
    countBy(
      newCases.map(
        (item: any) =>
          maxDistress.get(
            item.id
          ) || 'none'
      )
    );

  const ageDistribution =
    relabel(
      countBy(
        periodProfiles.map(
          (item: any) =>
            item.age_band
        )
      ),
      AGE_LABELS
    );

  const relationshipDistribution =
    relabel(
      countBy(
        periodProfiles.map(
          (item: any) =>
            item.relationship_to_aggressor
        )
      ),
      RELATIONSHIP_LABELS
    );

  const outcomeDistribution =
    relabel(
      countBy(
        periodProfiles.map(
          (item: any) =>
            item.case_outcome
        )
      ),
      OUTCOME_LABELS
    );

  const profileViolenceTypes =
    countArrayValues(
      periodProfiles.map(
        (item: any) =>
          item.violence_types
      )
    );

  const automaticCategories =
    countArrayValues(
      newCases.map((conversation: any) => {
        const categories = risks
          .filter(
            (item: any) =>
              item.conversation_id ===
              conversation.id
          )
          .flatMap(
            (item: any) =>
              item.categories || []
          );

        return [
          ...new Set(categories),
        ];
      })
    );

  const violenceTypesMap =
    new Map<string, number>();

  for (const item of [
    ...profileViolenceTypes,
    ...automaticCategories,
  ]) {
    violenceTypesMap.set(
      item.label,
      Math.max(
        violenceTypesMap.get(
          item.label
        ) || 0,
        item.value
      )
    );
  }

  const violenceTypes =
    [...violenceTypesMap.entries()]
      .map(([label, value]) => ({
        label:
          VIOLENCE_LABELS[label] ||
          label,
        value,
      }))
      .sort(
        (a, b) =>
          b.value - a.value
      );

  const serviceNeeds =
    countArrayValues(
      periodProfiles.map(
        (item: any) =>
          item.service_needs
      )
    );

  const neighborhoodCounts =
    countBy(
      periodProfiles.map(
        (item: any) =>
          item.neighborhood
      )
    );

  const zoneCounts =
    countBy(
      periodProfiles.map(
        (item: any) =>
          item.zone
      )
    );

  const geoThreshold =
    Number(
      org
        ?.analytics_min_geo_group_size ||
        5
    );

  const neighborhoodPrivacy =
    privacyFilteredAreas(
      neighborhoodCounts,
      geoThreshold
    );

  const zonePrivacy =
    privacyFilteredAreas(
      zoneCounts,
      geoThreshold
    );

  const geo = coarseGeoCells(
    locations,
    geoThreshold
  );

  const hourValues =
    Array.from(
      {
        length: 24,
      },
      () => 0
    );

  for (const conversation of newCases) {
    const inbound =
      firstInboundByCase.get(
        conversation.id
      );

    if (inbound) {
      hourValues[
        localHour(inbound)
      ] += 1;
    } else {
      hourValues[
        localHour(
          conversation.created_at
        )
      ] += 1;
    }
  }

  const weekDayValues =
    WEEK_DAYS.map(
      (label) => ({
        label,
        value: 0,
      })
    );

  for (const conversation of newCases) {
    const day =
      localWeekDay(
        conversation.created_at
      );

    weekDayValues[day].value += 1;
  }

  const referralFunnel: NamedCount[] = [
    {
      label: 'Solicitudes',
      value:
        periodReferrals.length,
    },
    {
      label: 'Consentidas',
      value:
        periodReferrals.filter(
          (item: any) =>
            Boolean(
              item.consented_at
            )
        ).length,
    },
    {
      label: 'Asignadas',
      value:
        periodReferrals.filter(
          (item: any) =>
            Boolean(
              item.assigned_at
            )
        ).length,
    },
    {
      label: 'Aceptadas',
      value:
        periodReferrals.filter(
          (item: any) =>
            Boolean(
              item.accepted_at
            )
        ).length,
    },
    {
      label: 'Contactadas',
      value:
        periodReferrals.filter(
          (item: any) =>
            Boolean(
              item.contacted_at
            )
        ).length,
    },
    {
      label: 'Concluidas',
      value:
        periodReferrals.filter(
          (item: any) =>
            item.status ===
            'completed'
        ).length,
    },
  ];

  const operatorActions =
    periodAudit.filter(
      (item: any) =>
        Boolean(item.actor_id)
    ).length;

  const urgentReferrals =
    periodReferrals.filter(
      (item: any) =>
        [
          'urgent',
          'immediate',
        ].includes(
          item.priority
        )
    ).length;

  const topViolence =
    violenceTypes[0];

  const topAge =
    ageDistribution.find(
      (item) =>
        item.label !==
        'Sin dato'
    );

  const topArea =
    neighborhoodPrivacy
      .visible[0] ||
    zonePrivacy.visible[0];

  const profileCoverage =
    latestProfileCompleteness(
      periodProfiles,
      newCases.length
    );

  return (
    <main className="opShell">
      <LiveRefresh intervalMs={30000} />

      <div className="opWrap">
        <AdminNav
          ctx={ctx}
          organizationName={org?.name}
        />

        <div className="opHero">
          <div>
            <div className="opLivePill">
              <span />
              Datos actualizados cada 30 s
            </div>

            <h1>
              Analítica preventiva
            </h1>

            <p>
              Estadística operativa y territorial para planeación de prevención, atención y reducción de violencia.
            </p>
          </div>

          <div className="opActions">
            <a
              className="opBtn secondary"
              href={`/api/admin/analytics/export?period=${period}&dataset=daily`}
            >
              Exportar serie CSV
            </a>

            <a
              className="opBtn secondary"
              href={`/api/admin/analytics/export?period=${period}&dataset=areas`}
            >
              Exportar zonas CSV
            </a>
          </div>
        </div>

        <div className="anGovernance">
          <strong>
            Analítica para política pública, no perfilamiento individual.
          </strong>
          <span>
            Los indicadores excluyen simulaciones. La geografía se publica únicamente en grupos agregados; no se muestran domicilios ni puntos individuales.
          </span>
        </div>

        <div className="opPanel">
          <div className="opFilter">
            {(
              [
                ['day', 'Hoy'],
                ['week', 'Semana'],
                ['month', 'Mes'],
                ['year', 'Año'],
                ['all', 'Histórico'],
              ] as Array<
                [
                  AnalyticsPeriod,
                  string,
                ]
              >
            ).map(
              ([value, label]) => (
                <Link
                  key={value}
                  className={
                    period === value
                      ? 'anPeriod active'
                      : 'anPeriod'
                  }
                  href={`/admin/analitica?period=${value}`}
                >
                  {label}
                </Link>
              )
            )}
          </div>

          <div className="opMeta">
            Periodo: {periodLabel(period)} · zona horaria operativa UTC-6.
          </div>
        </div>

        <div className="anKpiGrid">
          <KpiCard
            label="Casos registrados"
            value={newCases.length}
            detail={`${uniqueContacts} contactos únicos`}
            tone="violet"
          />

          <KpiCard
            label="Violencia alta/crítica"
            value={highCriticalCases}
            detail={percentage(
              highCriticalCases,
              newCases.length
            )}
            tone="danger"
          />

          <KpiCard
            label="Angustia alta/severa"
            value={distressCases}
            detail={percentage(
              distressCases,
              newCases.length
            )}
            tone="warning"
          />

          <KpiCard
            label="Señal de autolesión"
            value={selfHarmCases}
            detail={percentage(
              selfHarmCases,
              newCases.length
            )}
            tone="danger"
          />

          <KpiCard
            label="Casos recurrentes"
            value={recurringCases}
            detail={percentage(
              recurringCases,
              newCases.length
            )}
          />

          <KpiCard
            label="Canalizaciones"
            value={periodReferrals.length}
            detail={`${urgentReferrals} urgentes/inmediatas`}
          />

          <KpiCard
            label="Mediana primera respuesta"
            value={formatMinutes(
              median(responseMinutes)
            )}
            detail="Mensaje inicial → respuesta de Violeta"
            tone="success"
          />

          <KpiCard
            label="Mediana hasta contacto terapéutico"
            value={formatMinutes(
              median(
                referralContactMinutes
              )
            )}
            detail={`${availableTherapists} terapeutas disponibles ahora`}
            tone="success"
          />
        </div>

        <div className="anTwoWide">
          <section className="opPanel">
            <div className="opSectionTitle">
              <div>
                <h2>
                  Evolución de registros
                </h2>
                <p className="opMuted">
                  Casos nuevos y señales relevantes por fecha de registro.
                </p>
              </div>
            </div>

            <LineChart data={daily} />
          </section>

          <aside className="opPanel">
            <h2>
              Riesgo de violencia
            </h2>
            <DonutChart
              data={riskDistribution}
              centerLabel="casos"
            />
          </aside>
        </div>

        <div className="anThree">
          <section className="opPanel">
            <h2>
              Tipologías observadas
            </h2>
            <p className="opMuted">
              Combina categorías del motor con la ficha estadística completada por operadoras.
            </p>
            <HorizontalBars
              data={violenceTypes}
              limit={10}
            />
          </section>

          <section className="opPanel">
            <h2>
              Angustia expresada
            </h2>
            <DonutChart
              data={distressDistribution}
              centerLabel="casos"
            />
          </section>

          <section className="opPanel">
            <h2>
              Flujo de canalización
            </h2>
            <FunnelChart
              items={referralFunnel}
            />
          </section>
        </div>

        <div className="anTwo">
          <section className="opPanel">
            <h2>
              Horario de primer contacto
            </h2>
            <p className="opMuted">
              Distribución por hora para dimensionar guardias y capacidad operativa.
            </p>
            <HourBars
              values={hourValues}
            />
          </section>

          <section className="opPanel">
            <h2>
              Día de la semana
            </h2>
            <HorizontalBars
              data={weekDayValues}
              limit={7}
            />
          </section>
        </div>

        <div className="anThree">
          <section className="opPanel">
            <h2>
              Rango de edad
            </h2>
            <HorizontalBars
              data={ageDistribution}
              limit={8}
              emptyLabel="Completa la ficha estadística de los expedientes para habilitar este indicador."
            />
          </section>

          <section className="opPanel">
            <h2>
              Vínculo con agresor
            </h2>
            <HorizontalBars
              data={
                relationshipDistribution
              }
              limit={8}
            />
          </section>

          <section className="opPanel">
            <h2>
              Resultado / ruta de atención
            </h2>
            <HorizontalBars
              data={outcomeDistribution}
              limit={9}
            />
          </section>
        </div>

        <div className="anTwoWide">
          <section className="opPanel">
            <div className="opSectionTitle">
              <div>
                <h2>
                  Mapa de calor territorial
                </h2>
                <p className="opMuted">
                  Ubicaciones compartidas por las usuarias, transformadas en celdas agregadas.
                </p>
              </div>
              <span className="anPrivacyPill">
                k ≥ {geoThreshold}
              </span>
            </div>

            <GeoHeatGrid
              cells={geo.visible}
              suppressedCases={
                geo.suppressedCases
              }
              threshold={geoThreshold}
              approximateKm={
                geo.approximateKm
              }
            />
          </section>

          <aside className="opPanel">
            <h2>
              Colonias / zonas
            </h2>
            <p className="opMuted">
              Solo aparecen áreas que alcanzan el umbral institucional de privacidad.
            </p>

            <HorizontalBars
              data={
                neighborhoodPrivacy.visible
                  .length
                  ? neighborhoodPrivacy.visible
                  : zonePrivacy.visible
              }
              limit={12}
              emptyLabel={`No hay áreas con al menos ${geoThreshold} casos en el periodo.`}
            />

            {(neighborhoodPrivacy.suppressed >
              0 ||
              zonePrivacy.suppressed >
                0) && (
              <div className="anSuppressed">
                Hay registros territoriales ocultos porque el grupo es demasiado pequeño para mostrarse de forma segura.
              </div>
            )}
          </aside>
        </div>

        <div className="anThree">
          <section className="opPanel">
            <h2>
              Necesidades de servicio
            </h2>
            <HorizontalBars
              data={serviceNeeds}
              limit={10}
            />
          </section>

          <section className="opPanel">
            <h2>
              Calidad de la base estadística
            </h2>

            <div className="anQuality">
              <div>
                <strong>
                  {profileCoverage}
                </strong>
                <span>
                  expedientes con ficha estadística
                </span>
              </div>

              <div>
                <strong>
                  {notesInPeriod.length}
                </strong>
                <span>
                  anotaciones operativas
                </span>
              </div>

              <div>
                <strong>
                  {operatorActions}
                </strong>
                <span>
                  acciones auditadas de personal
                </span>
              </div>

              <div>
                <strong>
                  {consentsGranted.length}
                </strong>
                <span>
                  consentimientos otorgados
                </span>
              </div>
            </div>
          </section>

          <section className="opPanel">
            <h2>
              Operación del periodo
            </h2>

            <div className="anQuality">
              <div>
                <strong>
                  {alertsInPeriod.length}
                </strong>
                <span>
                  alertas generadas
                </span>
              </div>

              <div>
                <strong>
                  {periodReferralEvents.length}
                </strong>
                <span>
                  movimientos de canalización
                </span>
              </div>

              <div>
                <strong>
                  {activeCases.length}
                </strong>
                <span>
                  expedientes con actividad
                </span>
              </div>

              <div>
                <strong>
                  {
                    (
                      therapistsResult.data ||
                      []
                    ).length
                  }
                </strong>
                <span>
                  terapeutas activas
                </span>
              </div>
            </div>
          </section>
        </div>

        <section className="opPanel">
          <div className="opSectionTitle">
            <div>
              <h2>
                Hallazgos para planeación preventiva
              </h2>
              <p className="opMuted">
                Descripción estadística del periodo. No implica causalidad ni predice conducta individual.
              </p>
            </div>
          </div>

          <div className="anInsightGrid">
            <article>
              <small>
                Tipología más observada
              </small>
              <strong>
                {topViolence?.label ||
                  'Sin información suficiente'}
              </strong>
              <p>
                {topViolence
                  ? `${topViolence.value} expedientes registraron esta categoría.`
                  : 'Completa más expedientes para construir una tendencia.'}
              </p>
            </article>

            <article>
              <small>
                Rango de edad más frecuente
              </small>
              <strong>
                {topAge?.label ||
                  'Sin información suficiente'}
              </strong>
              <p>
                Indicador basado únicamente en rangos de edad, no en fecha de nacimiento.
              </p>
            </article>

            <article>
              <small>
                Concentración territorial publicable
              </small>
              <strong>
                {topArea?.label ||
                  'Sin grupo suficiente'}
              </strong>
              <p>
                Las áreas pequeñas se ocultan automáticamente para proteger a las víctimas.
              </p>
            </article>

            <article>
              <small>
                Recurrencia observada
              </small>
              <strong>
                {percentage(
                  recurringCases,
                  newCases.length
                )}
              </strong>
              <p>
                Proporción de expedientes nuevos con recurrencia registrada por el sistema.
              </p>
            </article>
          </div>
        </section>

        <div className="anPolicyNote">
          <strong>
            Uso recomendado:
          </strong>{' '}
          estos datos pueden apoyar campañas preventivas, horarios de guardia, distribución de recursos, intervención comunitaria y evaluación de rutas de atención. Antes de publicar estadísticas externas, deben aplicarse reglas adicionales de anonimización, revisión institucional y protección de datos.
        </div>
      </div>
    </main>
  );
}
