import {NextResponse} from 'next/server';export async function GET(){return NextResponse.json({ok:true,service:'violeta-bot',time:new Date().toISOString()})}
