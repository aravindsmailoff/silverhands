import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  let pathString = resolvedParams.path.join('/');
  if (pathString.startsWith('videos/')) {
    pathString = pathString.substring(7);
  }
  const backendUrl = `http://localhost:8000/videos/${pathString}`;

  const headers = new Headers();
  const range = req.headers.get('range');
  if (range) headers.set('range', range);

  try {
    const response = await fetch(backendUrl, { headers });

    const proxyResponse = new NextResponse(response.body as any, {
      status: response.status,
      statusText: response.statusText,
    });

    const headersToForward = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
    headersToForward.forEach(h => {
      const val = response.headers.get(h);
      if (val) proxyResponse.headers.set(h, val);
    });

    return proxyResponse;
  } catch (err) {
    console.error('Video proxy error:', err);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
