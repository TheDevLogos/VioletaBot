import { NextResponse } from 'next/server';

import { getStaffContext } from '@/lib/auth/staff';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { normalizeWhatsAppRecipient } from '@/lib/whatsapp/phone';

export async function POST(req: Request) {
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
    !['super_admin', 'admin'].includes(
      ctx.role
    )
  ) {
    return NextResponse.json(
      { error: 'Sin permiso' },
      { status: 403 }
    );
  }

  const form = await req.formData();

  const fullName = String(
    form.get('full_name') || ''
  ).trim();

  const whatsapp = normalizeWhatsAppRecipient(
    String(
      form.get('whatsapp_number') ||
        ''
    )
  );

  const specialties = String(
    form.get('specialties') || ''
  )
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);

  const notes = String(
    form.get('notes') || ''
  )
    .trim()
    .slice(0, 2000);

  if (
    !fullName ||
    whatsapp.length < 10
  ) {
    return NextResponse.json(
      { error: 'Datos inválidos' },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();

  const { data, error } = await db
    .from('therapists')
    .insert({
      organization_id:
        ctx.organizationId,
      full_name:
        fullName.slice(0, 160),
      whatsapp_number: whatsapp,
      specialties,
      notes: notes || null,
      active: true,
      availability_status:
        'off_duty',
    })
    .select('id')
    .single();

  if (error) {
    return NextResponse.json(
      {
        error:
          'No se pudo registrar la terapeuta',
        detail: error.message,
      },
      { status: 400 }
    );
  }

  await db.from('audit_logs').insert({
    organization_id:
      ctx.organizationId,
    actor_id: ctx.userId,
    action:
      'therapist.created',
    entity_type:
      'therapist',
    entity_id: data.id,
    metadata: {
      specialties,
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
