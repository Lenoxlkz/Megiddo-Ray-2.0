import { NextRequest, NextResponse } from 'next/server';
import { getServerMetrics, evaluateServerCapacity, formatBytes } from '@/lib/serverGuardian';

export const dynamic = 'force-dynamic';

export async function GET() {
  const metrics = getServerMetrics();
  return NextResponse.json({
    metrics,
    safeLimitFormatted: formatBytes(metrics.safeLimitMB * 1024 * 1024),
    freeMemFormatted: formatBytes(metrics.freeMemBytes),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { estimatedSizeBytes, itemCount, category, durationSeconds } = body;

    const evaluation = evaluateServerCapacity(estimatedSizeBytes, {
      itemCount,
      category,
      durationSeconds,
    });

    return NextResponse.json(evaluation);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al evaluar capacidad del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
