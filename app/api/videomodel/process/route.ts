import { NextResponse } from 'next/server';

const VIDEOMODEL_URL = process.env.VIDEOMODEL_URL || 'http://localhost:8000';

/**
 * Proxy: POST /api/videomodel/process
 * Accepts: { session_id, mode, focus? }
 * Forwards to: vediomodel FastAPI POST /api/process
 * Returns: { job_id, session_id }
 */
export async function POST(req: Request) {
  try {
    const { session_id, mode = 'highlight', focus = '', silverhands = true } = await req.json();

    if (!session_id) {
      return NextResponse.json({ error: 'session_id is required' }, { status: 400 });
    }

    const formData = new FormData();
    formData.append('session_id', session_id);
    formData.append('mode', mode);
    formData.append('silverhands', silverhands ? 'true' : 'false');
    if (focus) formData.append('focus', focus);

    const upstream = await fetch(`${VIDEOMODEL_URL}/api/process`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(30_000),
    });

    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (err: any) {
    console.error('[videomodel/process] error:', err);
    return NextResponse.json({ error: err.message || 'Process submission failed' }, { status: 500 });
  }
}
