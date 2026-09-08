import { NextResponse } from 'next/server';

import { getStaffContext } from '@/lib/auth/staff';
import { supabaseAdmin } from '@/lib/supabase/admin';

const ALLOWED = [
  'available',
  'busy',
  'off_duty',
];

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
    ].includes(ctx.role)
  ) {
    return NextResponse.json(
      { error: 'Sin permiso' },
      { status: 403 }
    );
  }

  const { id } = await params;
  const form = await req.formData();

  const status = String(
    form.get('availability_status') ||
      ''
  );

  if (!ALLOWED.includes(status)) {
    return NextResponse.json(
      { error: 'Estado inválido' },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();

  const { data: therapist } =
    await db
      .from('therapists')
      .select('id,organization_id')
      .eq('id', id)
      .maybeSingle();

  if (
    !therapist ||
    therapist.organization_id !==
      ctx.organizationId
  ) {
    return NextResponse.json(
      { error: 'No encontrado' },
      { status: 404 }
    );
  }

  const { error } = await db
    .from('therapists')
    .update({
      availability_status: status,
      updated_at:
        new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }

  await db.from('audit_logs').insert({
    organization_id:
      ctx.organizationId,
    actor_id: ctx.userId,
    action:
      'therapist.availability_updated',
    entity_type:
      'therapist',
    entity_id: id,
    metadata: {
      availability_status: status,
    },
  });

  return NextResponse.redirect(
    new URL(
      '/admin/terapeutas',
      req.url
    ),
    303
  );
}
