import { NextResponse } from 'next/server';

import { getStaffContext } from '@/lib/auth/staff';
import { supabaseAdmin } from '@/lib/supabase/admin';

const AGE_BANDS = [
  'under_18',
  '18_24',
  '25_34',
  '35_44',
  '45_54',
  '55_64',
  '65_plus',
  'unknown',
];

const RELATIONSHIPS = [
  'partner',
  'ex_partner',
  'family',
  'acquaintance',
  'work',
  'community',
  'other',
  'unknown',
];

const RECURRENCE = [
  'first_reported_episode',
  'occasional',
  'repeated',
  'escalating',
  'unknown',
];

const YES_NO_UNKNOWN = [
  'yes',
  'no',
  'unknown',
];

const OUTCOMES = [
  'open',
  'orientation',
  'therapy_referral',
  'legal_referral',
  'medical_referral',
  'authority_referral',
  'safety_plan',
  'unreachable',
  'closed',
  'other',
];

const VIOLENCE_TYPES = [
  'psychological',
  'economic',
  'social',
  'sexual',
  'physical',
  'digital',
  'patrimonial',
  'threats',
  'coercive_control',
];

const SERVICE_NEEDS = [
  'emotional_support',
  'psychological',
  'legal',
  'medical',
  'social_support',
  'shelter',
  'safety_planning',
  'authority_orientation',
  'other',
];

function selectValue(
  value: FormDataEntryValue | null,
  allowed: string[],
  fallback: string
) {
  const text = String(
    value || fallback
  );

  return allowed.includes(text)
    ? text
    : fallback;
}

function multiValue(
  form: FormData,
  name: string,
  allowed: string[]
) {
  return [
    ...new Set(
      form
        .getAll(name)
        .map((value) =>
          String(value)
        )
        .filter((value) =>
          allowed.includes(value)
        )
    ),
  ];
}

function optionalText(
  value: FormDataEntryValue | null,
  maxLength: number
) {
  const text = String(
    value || ''
  )
    .trim()
    .slice(0, maxLength);

  return text || null;
}

export async function POST(
  req: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  }
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

  if (
    ![
      'super_admin',
      'admin',
      'supervisor',
      'operator',
    ].includes(ctx.role)
  ) {
    return NextResponse.json(
      {
        error: 'Sin permiso',
      },
      {
        status: 403,
      }
    );
  }

  const { id } = await params;
  const form = await req.formData();
  const db = supabaseAdmin();

  const { data: conversation } =
    await db
      .from('conversations')
      .select(
        'id,organization_id,is_test'
      )
      .eq('id', id)
      .maybeSingle();

  if (
    !conversation ||
    conversation.organization_id !==
      ctx.organizationId
  ) {
    return NextResponse.json(
      {
        error:
          'Expediente no encontrado',
      },
      {
        status: 404,
      }
    );
  }

  const profile = {
    conversation_id: id,
    organization_id:
      ctx.organizationId,

    age_band: selectValue(
      form.get('age_band'),
      AGE_BANDS,
      'unknown'
    ),

    neighborhood: optionalText(
      form.get('neighborhood'),
      120
    ),

    zone: optionalText(
      form.get('zone'),
      120
    ),

    locality: optionalText(
      form.get('locality'),
      120
    ),

    relationship_to_aggressor:
      selectValue(
        form.get(
          'relationship_to_aggressor'
        ),
        RELATIONSHIPS,
        'unknown'
      ),

    violence_types: multiValue(
      form,
      'violence_types',
      VIOLENCE_TYPES
    ),

    recurrence_pattern:
      selectValue(
        form.get(
          'recurrence_pattern'
        ),
        RECURRENCE,
        'unknown'
      ),

    cohabitation_status:
      selectValue(
        form.get(
          'cohabitation_status'
        ),
        YES_NO_UNKNOWN,
        'unknown'
      ),

    minors_present:
      selectValue(
        form.get(
          'minors_present'
        ),
        YES_NO_UNKNOWN,
        'unknown'
      ),

    previous_report:
      selectValue(
        form.get(
          'previous_report'
        ),
        YES_NO_UNKNOWN,
        'unknown'
      ),

    service_needs: multiValue(
      form,
      'service_needs',
      SERVICE_NEEDS
    ),

    case_outcome: selectValue(
      form.get('case_outcome'),
      OUTCOMES,
      'open'
    ),

    follow_up_required:
      form.get(
        'follow_up_required'
      ) === 'yes',

    statistical_notes: optionalText(
      form.get(
        'statistical_notes'
      ),
      2000
    ),

    completed_by: ctx.userId,
    updated_by: ctx.userId,
    updated_at:
      new Date().toISOString(),
  };

  const { error } = await db
    .from('case_profiles')
    .upsert(profile, {
      onConflict:
        'conversation_id',
    });

  if (error) {
    return NextResponse.json(
      {
        error:
          'No se pudo guardar la ficha estadística',
        detail: error.message,
      },
      {
        status: 400,
      }
    );
  }

  await db.from('audit_logs').insert({
    organization_id:
      ctx.organizationId,
    actor_id: ctx.userId,
    action:
      'case.statistical_profile_updated',
    entity_type:
      'conversation',
    entity_id: id,
    metadata: {
      fields: [
        'age_band',
        'neighborhood',
        'zone',
        'locality',
        'relationship_to_aggressor',
        'violence_types',
        'recurrence_pattern',
        'cohabitation_status',
        'minors_present',
        'previous_report',
        'service_needs',
        'case_outcome',
        'follow_up_required',
      ],
      test_case:
        conversation.is_test ===
        true,
    },
  });

  return NextResponse.redirect(
    new URL(
      `/admin/casos/${id}#estadistica`,
      req.url
    ),
    303
  );
}
