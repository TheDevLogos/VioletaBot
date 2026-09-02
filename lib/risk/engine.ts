export type RiskLevel='none'|'low'|'medium'|'high'|'critical';
export type RiskResult={level:RiskLevel;score:number;triggers:string[];categories:string[];requiresHuman:boolean;requestLocation:boolean};
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9ñ\s]/g,' ').replace(/\s+/g,' ').trim();
const critical=[/auxilio/,/estoy en peligro/,/llama a la policia/,/me quiere matar/,/me esta golpeando/,/me esta pegando/,/ven por mi/,/necesito ayuda ya/,/me encerro/];
const physical=[/me pego/,/me golpeo/,/empujo/,/golpe/,/lesion/,/arma/,/cuchillo/,/pistola/];
const threats=[/amenaz/,/tengo miedo/,/me quiere hacer dano/,/no estoy segura/,/me vigila/];
const control=[/controla.*dinero/,/no me deja salir/,/revisa.*telefono/,/me aisla/,/no me deja trabajar/];
const sexual=[/me obliga.*sexo/,/sin mi consentimiento/,/coaccion sexual/,/abuso sexual/];
export function evaluateRisk(text:string,recurrence=0):RiskResult{
 const n=normalize(text); let score=0; const triggers:string[]=[]; const categories:string[]=[];
 const hit=(patterns:RegExp[],pts:number,label:string,cat?:string)=>{if(patterns.some(r=>r.test(n))){score+=pts;triggers.push(label);if(cat&&!categories.includes(cat))categories.push(cat);return true}return false};
 const emergency=hit(critical,80,'emergency_language'); hit(physical,45,'physical_violence','physical'); hit(threats,30,'threat_or_fear','psychological'); hit(control,20,'coercive_control','economic/social'); hit(sexual,55,'sexual_coercion','sexual');
 if(recurrence>=2){score+=15;triggers.push('recurrence')} if(categories.length>=2){score+=10;triggers.push('multiple_violence_types')} score=Math.min(score,100);
 let level:RiskLevel=score>=75?'critical':score>=50?'high':score>=25?'medium':score>0?'low':'none'; if(emergency)level='critical';
 return {level,score,triggers,categories,requiresHuman:['high','critical'].includes(level),requestLocation:level==='critical'};
}
