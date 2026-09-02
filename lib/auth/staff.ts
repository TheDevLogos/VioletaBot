import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export type StaffRole = 'super_admin'|'admin'|'supervisor'|'operator'|'auditor';
export type StaffContext = {
  userId: string;
  email: string | null;
  organizationId: string | null;
  fullName: string | null;
  role: StaffRole;
  active: boolean;
  mustChangePassword: boolean;
};

export async function getStaffContext(): Promise<StaffContext | null> {
  const sessionClient = await createSupabaseServerClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return null;
  const db = supabaseAdmin();
  const { data: profile } = await db.from('profiles')
    .select('organization_id,full_name,role,active,must_change_password')
    .eq('id', user.id).maybeSingle();
  if (!profile) return null;
  return {
    userId: user.id,
    email: user.email ?? null,
    organizationId: profile.organization_id ?? null,
    fullName: profile.full_name ?? null,
    role: profile.role as StaffRole,
    active: profile.active !== false,
    mustChangePassword: profile.must_change_password === true,
  };
}

export async function requireStaffPage(roles?: StaffRole[], allowPasswordChange = false) {
  const ctx = await getStaffContext();
  if (!ctx || !ctx.active) redirect('/admin/login');
  if (!allowPasswordChange && ctx.mustChangePassword) redirect('/admin/cambiar-clave');
  if (roles && !roles.includes(ctx.role)) redirect('/admin/centro');
  return ctx;
}

export function canManageUsers(role: StaffRole) {
  return role === 'super_admin' || role === 'admin';
}
