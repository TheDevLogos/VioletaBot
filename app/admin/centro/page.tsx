import Link from 'next/link';
import { AdminNav } from '@/components/admin/AdminNav';
import { requireStaffPage } from '@/lib/auth/staff';
import { supabaseAdmin } from '@/lib/supabase/admin';

function badge(level?: string){return `opBadge op-${level || 'none'}`}
export const dynamic='force-dynamic';

export default async function OperationCenter({searchParams}:{searchParams:Promise<{org?:string;channel?:string}>}){
  const ctx=await requireStaffPage(); const q=await searchParams; const db=supabaseAdmin();
  const {data:allOrgs}=ctx.role==='super_admin'?await db.from('organizations').select('id,name,active').eq('active',true).order('name'): {data:null} as any;
  const requested=ctx.role==='super_admin'&&q.org&&allOrgs?.some((o:any)=>o.id===q.org)?q.org:null;
  const orgId=requested||ctx.organizationId;
  if(!orgId) return <main className="opShell"><div className="opWrap"><AdminNav ctx={ctx}/><div className="opPanel">Tu perfil no tiene una organización asignada.</div></div></main>;
  const {data:org}=await db.from('organizations').select('id,name').eq('id',orgId).single();
  let query=db.from('conversations').select('id,wa_user_id,subject_label,channel,is_test,status,assigned_to,updated_at,risk_events(level,score,created_at),alerts(id,status,priority,created_at)').eq('organization_id',orgId).order('updated_at',{ascending:false}).limit(100);
  if(q.channel==='simulator'||q.channel==='whatsapp') query=query.eq('channel',q.channel);
  const {data:cases}=await query;
  const rows=(cases||[]).map((c:any)=>{const risks=[...(c.risk_events||[])].sort((a:any,b:any)=>+new Date(b.created_at)-+new Date(a.created_at));const pending=(c.alerts||[]).filter((a:any)=>a.status==='pending');return {...c,risk:risks[0],pendingAlerts:pending.length}});
  const high=rows.filter((r:any)=>['high','critical'].includes(r.risk?.level)).length;
  const pendingAlerts=rows.reduce((n:number,r:any)=>n+r.pendingAlerts,0);
  const simulator=rows.filter((r:any)=>r.channel==='simulator').length;
  return <main className="opShell"><div className="opWrap">
    <AdminNav ctx={ctx} organizationName={org?.name}/>
    <div className="opHero"><div><h1>Centro de Operación</h1><p>Casos, riesgo y alertas de {org?.name}.</p></div><Link className="opBtn" href="/admin/simulador">Nueva simulación</Link></div>
    {ctx.role==='super_admin'&&<div className="opPanel"><form className="opFilter"><div><label className="opLabel">Centro / dependencia</label><select className="opSelect" name="org" defaultValue={orgId}>{(allOrgs||[]).map((o:any)=><option key={o.id} value={o.id}>{o.name}</option>)}</select></div><button className="opBtn secondary">Cambiar centro</button></form></div>}
    <div className="opGrid4"><div className="opStat"><small>Casos visibles</small><strong>{rows.length}</strong></div><div className="opStat"><small>Alto / crítico</small><strong>{high}</strong></div><div className="opStat"><small>Alertas pendientes</small><strong>{pendingAlerts}</strong></div><div className="opStat"><small>Simulaciones</small><strong>{simulator}</strong></div></div>
    <div className="opPanel"><div className="opSectionTitle"><h2>Expedientes</h2><div className="opActions"><Link className="opBtn secondary" href={`/admin/centro${ctx.role==='super_admin'?`?org=${orgId}&channel=simulator`:'?channel=simulator'}`}>Solo simulador</Link><Link className="opBtn secondary" href={`/admin/centro${ctx.role==='super_admin'?`?org=${orgId}`:''}`}>Todos</Link></div></div>
      <div className="opTableWrap"><table className="opTable"><thead><tr><th>Caso</th><th>Canal</th><th>Riesgo</th><th>Puntaje</th><th>Alertas</th><th>Estado</th><th>Actualizado</th><th></th></tr></thead><tbody>{rows.map((r:any)=><tr key={r.id}><td><strong>{r.subject_label||String(r.id).slice(0,8).toUpperCase()}</strong><div className="opMuted">{r.wa_user_id}</div></td><td>{r.channel==='simulator'?<span className="opBadge op-test">SIMULADOR</span>:'WhatsApp'}</td><td><span className={badge(r.risk?.level)}>{r.risk?.level||'sin evaluar'}</span></td><td>{r.risk?.score??'-'}</td><td>{r.pendingAlerts||0}</td><td>{r.status}</td><td>{new Date(r.updated_at).toLocaleString('es-MX')}</td><td><Link className="opLink" href={`/admin/casos/${r.id}`}>Abrir</Link></td></tr>)}</tbody></table>{rows.length===0&&<div className="opEmpty">No hay expedientes para este filtro.</div>}</div>
    </div>
  </div></main>;
}
