import { NextRequest, NextResponse } from 'next/server';
import { POST as preparePost, OPTIONS as prepareOptions } from '../prepare/route';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return prepareOptions();
}

export async function POST(req: NextRequest) {
  return preparePost(req);
}
