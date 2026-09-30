import { NextRequest, NextResponse } from 'next/server';
import ytSearch from 'yt-search';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q')?.trim();

  if (!query) {
    return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
  }

  try {
    const searchResults = await ytSearch(query);
    const videos = (searchResults.videos || []).slice(0, 6).map((v) => ({
      title: v.title,
      url: v.url,
      timestamp: v.timestamp,
      seconds: v.seconds,
      author: v.author?.name || '',
      thumbnail: v.thumbnail || v.image,
    }));

    return NextResponse.json({
      success: true,
      query,
      results: videos,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error searching audio';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
