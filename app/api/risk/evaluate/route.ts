import {NextResponse} from 'next/server';import {evaluateRisk} from '@/lib/risk/engine';
export async function POST(req:Request){const body=await req.json().catch(()=>null);if(!body||typeof body.text!=='string')return NextResponse.json({error:'text is required'},{status:400});return NextResponse.json(evaluateRisk(body.text,Number(body.recurrence||0)))}
