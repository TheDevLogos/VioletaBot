import { NextResponse } from 'next/server';

import {
  analyticsStart,
  buildDailySeries,
  countBy,
  csvEscape,
  maxLevelByConversation,
  privacyFilteredAreas,
  type AnalyticsPeriod,
} from '@/lib/analytics/aggregate';
import { getStaffContext } from '@/lib/auth/staff';
import { supabaseAdmin } from '@/lib/supabase/admin';

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

function validPeriod(
  raw: string | null
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

function csv(
  rows: unknown[][]
) {
  return rows
    .map((row) =>
      row
        .map(csvEscape)
        .join(',')
    )
    .join('\n');
}

export async function GET(
  req: Request
) {
  const ctx = await getStaffContext();

  if (
    !ctx ||
    !ctx.active ||
    !ctx.organizationId
  ) {
    return NextResponse.json(
      {
        error: 'No autorizado',
      },
      {
        status: 401,
      }
    );
  }

  const url = new URL(req.url);
  const period = validPeriod(
    url.searchParams.get('period')
  );
  const dataset =
    url.searchParams.get(
      'dataset'
    ) || 'daily';

  const start =
    analyticsStart(period);
  const startMs = start
    ? +start
    : null;

  const db = supabaseAdmin();

  const [
    orgResult,
    conversationsResult,
    profilesResult,
    referralsResult,
  ] = await Promise.all([
    db
      .from('organizations')
      .select(
        'name,analytics_min_geo_group_size'
      )
      .eq(
        'id',
        ctx.organizationId
      )
      .single(),

    db
      .from('conversations')
      .select(
        'id,created_at'
      )
      .eq(
        'organization_id',
        ctx.organizationId
      )
      .eq('is_test', false)
      .limit(5000),

    db
      .from('case_profiles')
      .select(
        'conversation_id,neighborhood,zone'
      )
      .eq(
        'organization_id',
        ctx.organizationId
      )
      .limit(5000),

    db
      .from('referrals')
      .select(
        'id,conversation_id,created_at,is_test'
      )
      .eq(
        'organization_id',
        ctx.organizationId
      )
      .eq('is_test', false)
      .limit(5000),
  ]);

  const conversations = (
    conversationsResult.data || []
  ).filter(
    (item: any) =>
      startMs == null ||
      +new Date(item.created_at) >=
        startMs
  );

  const ids = conversations
    .map(
      (item: any) =>
        item.id
    )
    .slice(0, 1500);

  const referrals = (
    referralsResult.data || []
  ).filter(
    (item: any) =>
      startMs == null ||
      +new Date(item.created_at) >=
        startMs
  );

  if (dataset === 'areas') {
    const idSet = new Set(ids);

    const profiles = (
      profilesResult.data || []
    ).filter((item: any) =>
      idSet.has(
        item.conversation_id
      )
    );

    const threshold =
      Number(
        orgResult.data
          ?.analytics_min_geo_group_size ||
          5
      );

    const neighborhoods =
      privacyFilteredAreas(
        countBy(
          profiles.map(
            (item: any) =>
              item.neighborhood
          )
        ),
        threshold
      ).visible;

    const zones =
      privacyFilteredAreas(
        countBy(
          profiles.map(
            (item: any) =>
              item.zone
          )
        ),
        threshold
      ).visible;

    const body = csv([
      [
        'tipo_area',
        'area',
        'casos',
        'umbral_privacidad',
      ],
      ...neighborhoods.map(
        (item) => [
          'colonia',
          item.label,
          item.value,
          threshold,
        ]
      ),
      ...zones.map(
        (item) => [
          'zona',
          item.label,
          item.value,
          threshold,
        ]
      ),
    ]);

    return new Response(body, {
      headers: {
        'content-type':
          'text/csv; charset=utf-8',
        'content-disposition':
          `attachment; filename="violeta_areas_${period}.csv"`,
      },
    });
  }

  const empty = {
    data: [],
  } as any;

  const [
    risksResult,
    distressResult,
  ] = ids.length
    ? await Promise.all([
        db
          .from('risk_events')
          .select(
            'conversation_id,level'
          )
          .in(
            'conversation_id',
            ids
          )
          .limit(15000),

        db
          .from('distress_events')
          .select(
            'conversation_id,distress_level,self_harm_level'
          )
          .in(
            'conversation_id',
            ids
          )
          .limit(15000),
      ])
    : [empty, empty];

  const maxRisk =
    maxLevelByConversation(
      risksResult.data || [],
      'level',
      RISK_RANK
    );

  const maxDistress =
    maxLevelByConversation(
      distressResult.data ||
        [],
      'distress_level',
      DISTRESS_RANK
    );

  const maxSelfHarm =
    maxLevelByConversation(
      distressResult.data ||
        [],
      'self_harm_level',
      SELF_HARM_RANK
    );

  const daily =
    buildDailySeries({
      conversations,
      maxRiskByConversation:
        maxRisk,
      maxDistressByConversation:
        maxDistress,
      maxSelfHarmByConversation:
        maxSelfHarm,
      referrals,
    });

  const body = csv([
    [
      'fecha',
      'casos_nuevos',
      'violencia_alta_critica',
      'angustia_alta_severa',
      'senal_autolesion',
      'canalizaciones',
    ],
    ...daily.map((item) => [
      item.date,
      item.cases,
      item.highCritical,
      item.distressHigh,
      item.selfHarm,
      item.referrals,
    ]),
  ]);

  return new Response(body, {
    headers: {
      'content-type':
        'text/csv; charset=utf-8',
      'content-disposition':
        `attachment; filename="violeta_serie_${period}.csv"`,
    },
  });
}
