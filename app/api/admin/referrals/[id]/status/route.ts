import { NextResponse } from 'next/server';

import { getStaffContext } from '@/lib/auth/staff';
import { supabaseAdmin } from '@/lib/supabase/admin';

const ALLOWED = [
  'assigned',
  'accepted',
  'contacted',
  'in_progress',
  'follow_up',
  'completed',
  'unavailable',
  'cancelled',
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

  const status = String(
    form.get('status') || ''
  );

  const note = String(
    form.get('note') || ''
  )
    .trim()
    .slice(0, 2000);

  if (!ALLOWED.includes(status)) {
    return NextResponse.json(
      { error: 'Estado inválido' },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();

  const { data: referral } = await db
    .from('referrals')
    .select(
      'id,organization_id,conversation_id,assigned_therapist_id'
    )
    .eq('id', id)
    .maybeSingle();

  if (
    !referral ||
    referral.organization_id !==
      ctx.organizationId
  ) {
    return NextResponse.json(
      { error: 'No encontrado' },
      { status: 404 }
    );
  }

  const now =
    new Date().toISOString();

  const patch: Record<
    string,
    unknown
  > = {
    status,
    updated_at: now,
  };

  if (status === 'accepted') {
    patch.accepted_at = now;
  }

  if (status === 'contacted') {
    patch.contacted_at = now;
  }

  if (
    status === 'completed' ||
    status === 'cancelled' ||
    status === 'unavailable'
  ) {
    patch.closed_at = now;
  }

  const { error } = await db
    .from('referrals')
    .update(patch)
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
          `status_${status}`,
        note: note || null,
        metadata: {
          therapist_id:
            referral.assigned_therapist_id,
        },
      }),

    db.from('audit_logs').insert({
      organization_id:
        ctx.organizationId,
      actor_id: ctx.userId,
      action:
        'referral.status_updated',
      entity_type:
        'referral',
      entity_id: id,
      metadata: {
        status,
        has_note:
          Boolean(note),
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
