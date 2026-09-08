import { NextResponse } from 'next/server';

import { getStaffContext } from '@/lib/auth/staff';
import { supabaseAdmin } from '@/lib/supabase/admin';

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
      { error: 'No autorizado' },
      { status: 401 }
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
      { error: 'Sin permiso' },
      { status: 403 }
    );
  }

  const { id } = await params;
  const form = await req.formData();
  const therapistId = String(
    form.get('therapist_id') || ''
  );

  if (!therapistId) {
    return NextResponse.json(
      { error: 'Selecciona terapeuta' },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();

  const [
    referralResult,
    therapistResult,
  ] = await Promise.all([
    db
      .from('referrals')
      .select(
        'id,organization_id,conversation_id,consent_id,status'
      )
      .eq('id', id)
      .maybeSingle(),

    db
      .from('therapists')
      .select(
        'id,organization_id,active,availability_status,full_name'
      )
      .eq('id', therapistId)
      .maybeSingle(),
  ]);

  const referral =
    referralResult.data;

  const therapist =
    therapistResult.data;

  if (
    !referral ||
    referral.organization_id !==
      ctx.organizationId
  ) {
    return NextResponse.json(
      { error: 'Canalización no encontrada' },
      { status: 404 }
    );
  }

  if (
    !therapist ||
    therapist.organization_id !==
      ctx.organizationId ||
    therapist.active !== true
  ) {
    return NextResponse.json(
      { error: 'Terapeuta no válida' },
      { status: 400 }
    );
  }

  if (!referral.consent_id) {
    return NextResponse.json(
      {
        error:
          'No se puede compartir el contacto sin consentimiento registrado',
      },
      { status: 409 }
    );
  }

  const { data: consent } = await db
    .from('consents')
    .select('granted')
    .eq(
      'id',
      referral.consent_id
    )
    .maybeSingle();

  if (!consent?.granted) {
    return NextResponse.json(
      {
        error:
          'El consentimiento no está otorgado',
      },
      { status: 409 }
    );
  }

  const now =
    new Date().toISOString();

  const { error } = await db
    .from('referrals')
    .update({
      assigned_therapist_id:
        therapistId,
      status: 'assigned',
      assigned_at: now,
      updated_at: now,
      victim_contact_shared: true,
    })
    .eq('id', id);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }

  await Promise.all([
    db
      .from('referral_events')
      .insert({
        referral_id: id,
        organization_id:
          ctx.organizationId,
        actor_type: 'operator',
        actor_id: ctx.userId,
        event_type:
          'therapist_assigned',
        note:
          `Asignada a ${therapist.full_name}.`,
        metadata: {
          therapist_id:
            therapistId,
          availability_status:
            therapist.availability_status,
        },
      }),

    db.from('audit_logs').insert({
      organization_id:
        ctx.organizationId,
      actor_id: ctx.userId,
      action:
        'referral.therapist_assigned',
      entity_type:
        'referral',
      entity_id: id,
      metadata: {
        therapist_id:
          therapistId,
      },
    }),
  ]);

  return NextResponse.redirect(
    new URL(
      '/admin/canalizaciones',
      req.url
    ),
    303
  );
}
