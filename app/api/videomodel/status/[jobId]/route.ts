import { NextResponse } from 'next/server';

const VIDEOMODEL_URL = process.env.VIDEOMODEL_URL || 'http://localhost:8000';

/**
 * Proxy: GET /api/videomodel/status/[jobId]
 * Forwards to: vediomodel FastAPI GET /api/status/{job_id}
 * Returns: { status, progress, current_step, result: { clips } }
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const upstream = await fetch(`${VIDEOMODEL_URL}/api/status/${jobId}`, {
      signal: AbortSignal.timeout(10_000),
    });
    const data = await upstream.json();

    // Rewrite clip video_url so they proxy through Next.js instead of pointing at :8000 directly
    if (data?.result?.clips) {
      data.result.clips = data.result.clips.map((clip: any) => ({
        ...clip,
        video_url: clip.video_url
          ? `/api/videomodel/clip${clip.video_url}` // e.g. /api/videomodel/clip/videos/job123/clip_1.mp4
          : null,
      }));
    }

    return NextResponse.json(data, { status: upstream.status });
  } catch (err: any) {
    console.error('[videomodel/status] error:', err);
    return NextResponse.json({ error: err.message || 'Status check failed' }, { status: 500 });
  }
}
