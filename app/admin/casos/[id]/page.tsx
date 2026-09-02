import { notFound } from 'next/navigation';
import { AdminNav } from '@/components/admin/AdminNav';
import { requireStaffPage } from '@/lib/auth/staff';
import { supabaseAdmin } from '@/lib/supabase/admin';
function badge(level?:string){return `opBadge op-${level||'none'}`}
export const dynamic='force-dynamic';
export default async function CaseDetail({params}:{params:Promise<{id:string}>}){
 const ctx=await requireStaffPage();const {id}=await params;const db=supabaseAdmin();
 const {data:conv}=await db.from('conversations').select('*').eq('id',id).maybeSingle();if(!conv)notFound();if(ctx.role!=='super_admin'&&conv.organization_id!==ctx.organizationId)notFound();
 const [{data:org},{data:messages},{data:risks},{data:alerts},{data:notes},{data:locations},{data:staff}]=await Promise.all([
  db.from('organizations').select('name').eq('id',conv.organization_id).single(),
  db.from('messages').select('id,direction,content,message_type,created_at,metadata').eq('conversation_id',id).order('created_at'),
  db.from('risk_events').select('*').eq('conversation_id',id).order('created_at',{ascending:false}),
  db.from('alerts').select('*').eq('conversation_id',id).order('created_at',{ascending:false}),
  db.from('case_notes').select('*').eq('conversation_id',id).order('created_at',{ascending:false}),
  db.from('locations').select('*').eq('conversation_id',id).order('created_at',{ascending:false}),
  db.from('profiles').select('id,full_name,role,active').eq('organization_id',conv.organization_id).eq('active',true).order('full_name')
 ]);
 const risk=risks?.[0];const assigned=(staff||[]).find((s:any)=>s.id===conv.assigned_to);
 return <main className="opShell"><div className="opWrap"><AdminNav ctx={ctx} organizationName={org?.name}/>
  <div className="opHero"><div><h1>{conv.subject_label||`Caso ${String(conv.id).slice(0,8).toUpperCase()}`}</h1><p>{conv.channel==='simulator'?'Simulación interna':'Conversación WhatsApp'} · {conv.status}</p></div><span className={badge(risk?.level)}>{risk?.level||'sin evaluar'} {risk?.score!=null?`· ${risk.score}`:''}</span></div>
  <div className="opGrid4"><div className="opStat"><small>Responsable</small><strong style={{fontSize:18}}>{assigned?.full_name||'Sin asignar'}</strong></div><div className="opStat"><small>Recurrencia</small><strong>{conv.recurrence_count}</strong></div><div className="opStat"><small>Alertas</small><strong>{alerts?.length||0}</strong></div><div className="opStat"><small>Ubicaciones</small><strong>{locations?.length||0}</strong></div></div>
  <div className="opTwo"><section><div className="opPanel"><h2>Conversación</h2><div className="opTimeline">{(messages||[]).map((m:any)=><div key={m.id} className={`opMessage ${m.direction}`}><div>{m.content||`[${m.message_type}]`}</div><div className="opMeta">{m.direction==='inbound'?'Usuaria':'VioletaBot'} · {new Date(m.created_at).toLocaleString('es-MX')}</div></div>)}</div></div>
   <div className="opPanel"><h2>Evaluaciones de riesgo</h2>{(risks||[]).map((r:any)=><div key={r.id} className="opNote"><span className={badge(r.level)}>{r.level}</span> <strong>{r.score}/100</strong><div className="opMeta">{(r.triggers||[]).join(', ')||'Sin disparadores'} · {new Date(r.created_at).toLocaleString('es-MX')}</div></div>)}</div></section>
   <aside><div className="opPanel"><h3>Gestión del caso</h3><form action={`/api/admin/cases/${id}/assign`} method="post"><label className="opLabel">Responsable</label><select className="opSelect" name="assigned_to" defaultValue={conv.assigned_to||''}><option value="">Sin asignar</option>{(staff||[]).filter((s:any)=>['admin','supervisor','operator'].includes(s.role)).map((s:any)=><option key={s.id} value={s.id}>{s.full_name||s.id.slice(0,8)} · {s.role}</option>)}</select><button className="opBtn" style={{marginTop:10}}>Asignar</button></form><hr style={{border:0,borderTop:'1px solid #eadff0',margin:'18px 0'}}/><form action={`/api/admin/cases/${id}/status`} method="post"><label className="opLabel">Estado</label><select className="opSelect" name="status" defaultValue={conv.status}><option value="open">Abierto</option><option value="in_review">En revisión</option><option value="closed">Cerrado</option></select><input className="opInput" name="reason" placeholder="Motivo de cierre (opcional)" style={{marginTop:8}}/><button className="opBtn secondary" style={{marginTop:10}}>Actualizar estado</button></form></div>
    <div className="opPanel"><h3>Notas internas</h3><form action={`/api/admin/cases/${id}/notes`} method="post"><textarea className="opTextarea" name="note" maxLength={5000} required placeholder="Observación para el equipo..."/><button className="opBtn" style={{marginTop:10}}>Guardar nota</button></form>{(notes||[]).map((n:any)=><div key={n.id} className="opNote">{n.note}<div className="opMeta">{new Date(n.created_at).toLocaleString('es-MX')}</div></div>)}</div>
    <div className="opPanel"><h3>Alertas</h3>{(alerts||[]).map((a:any)=><div key={a.id} className="opAlert"><strong>{a.priority} · {a.status}</strong><div className="opMeta">{new Date(a.created_at).toLocaleString('es-MX')}</div></div>)}{!alerts?.length&&<p className="opMuted">Sin alertas.</p>}<p className="opDangerText" style={{fontSize:12}}>El Centro no realiza despacho policial automático.</p></div>
   </aside></div>
 </div></main>;
}
