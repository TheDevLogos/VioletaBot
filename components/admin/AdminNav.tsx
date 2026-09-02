import Link from 'next/link';
import type { StaffContext } from '@/lib/auth/staff';

export function AdminNav({ ctx, organizationName }: { ctx: StaffContext; organizationName?: string | null }) {
  const manage = ctx.role === 'super_admin' || ctx.role === 'admin';
  return <div className="opTopbar">
    <div>
      <Link href="/admin/centro" className="opBrand">VioletaBot · Centro de Operación</Link>
      <div className="opOrg">{organizationName || 'Operación institucional'} · {ctx.role}</div>
    </div>
    <nav className="opNav">
      <Link href="/admin/centro">Centro</Link>
      <Link href="/admin/simulador">Simulador</Link>
      {manage && <Link href="/admin/usuarios">Usuarios</Link>}
      <form action="/api/auth/logout" method="post"><button className="opLinkBtn">Salir</button></form>
    </nav>
  </div>;
}
