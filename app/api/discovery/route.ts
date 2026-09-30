import { NextRequest, NextResponse } from 'next/server';
import { discoverContentMetadata } from '@/lib/discovery';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== 'string' || !url.trim()) {
      return NextResponse.json({ error: 'Falta el parámetro de URL para analizar.' }, { status: 400 });
    }

    const discovery = await discoverContentMetadata(url);
    return NextResponse.json(discovery, { status: 200 });
  } catch (err: unknown) {
    console.error('Discovery endpoint error:', err);
    const message = err instanceof Error ? err.message : 'Error durante el análisis y descubrimiento de metadatos';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
