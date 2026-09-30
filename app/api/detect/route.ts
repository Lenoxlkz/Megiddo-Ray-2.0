import { NextRequest, NextResponse } from 'next/server';
import { detectUrl, Category } from '@/lib/detector';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    let body: {
      url?: string;
      text?: string;
      title?: string;
      requestedCategory?: string;
    } = {};

    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Valid JSON body is required' }, { status: 400 });
    }

    const detection = detectUrl({
      url: body.url,
      text: body.text,
      title: body.title,
    });

    if (!detection.normalizedUrl) {
      return NextResponse.json({
        isValid: false,
        error: detection.reason,
        detection,
      }, { status: 400 });
    }

    // If client provided a requested category override, check if it is supported
    let finalCategory: Category = detection.category;
    let overrideAccepted = false;

    if (body.requestedCategory && body.requestedCategory !== 'unknown') {
      const reqCat = body.requestedCategory as Category;
      // Allow override if category is supported by platform or if platform is unknown/generic
      if (detection.supportedCategories.includes(reqCat) || detection.platform === 'unknown') {
        finalCategory = reqCat;
        overrideAccepted = true;
      }
    }

    return NextResponse.json({
      isValid: true,
      detection,
      validatedCategory: finalCategory,
      overrideAccepted,
      extractorAvailable: detection.extractorAvailable,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error in URL detection';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
