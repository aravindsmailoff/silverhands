import { NextResponse } from 'next/server';

const VIDEOMODEL_URL = process.env.VIDEOMODEL_URL || 'http://localhost:8000';

/**
 * Proxy: POST /api/videomodel/analyze
 * Accepts: multipart/form-data with { file: Blob } OR { url: string }
 * Forwards to: vediomodel FastAPI POST /api/analyze
 * Returns: { session_id, subject, suggestions, duration, content_mode }
 */
export async function POST(req: Request) {
  try {
    // Health check first — return friendly error if backend is down
    const health = await fetch(`${VIDEOMODEL_URL}/api/health`, { signal: AbortSignal.timeout(3000) })
      .catch(() => null);
    if (!health?.ok) {
      return NextResponse.json(
        { error: 'Video processing backend is not running. Start it with: npm run video:start' },
        { status: 503 }
      );
    }

    // Forward the raw multipart body directly
    const contentType = req.headers.get('content-type') || '';
    const body = await req.arrayBuffer();

    const upstream = await fetch(`${VIDEOMODEL_URL}/api/analyze`, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body,
      signal: AbortSignal.timeout(300_000), // 5 min for large uploads
    });

    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (err: any) {
    console.error('[videomodel/analyze] error:', err);
    return NextResponse.json({ error: err.message || 'Analysis failed' }, { status: 500 });
  }
}
