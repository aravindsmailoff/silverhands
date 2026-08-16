import { NextResponse } from 'next/server';

const VIDEOMODEL_URL = process.env.VIDEOMODEL_URL || 'http://localhost:8000';

/**
 * Proxy: GET /api/videomodel/clip/videos/{jobId}/{filename}
 * Streams the actual .mp4 file from the vediomodel static file server.
 * This lets the browser load clips without knowing about port :8000.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const upstreamPath = path.join('/');
    const upstream = await fetch(`${VIDEOMODEL_URL}/videos/${upstreamPath}`, {
      signal: AbortSignal.timeout(60_000),
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
    }

    const headers = new Headers();
    headers.set('content-type', upstream.headers.get('content-type') || 'video/mp4');
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) headers.set('content-length', contentLength);
    headers.set('accept-ranges', 'bytes');
    headers.set('cache-control', 'public, max-age=3600');

    return new Response(upstream.body, { status: 200, headers });
  } catch (err: any) {
    console.error('[videomodel/clip] error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
