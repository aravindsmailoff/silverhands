import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join('/');
  const backendUrl = `http://localhost:8000/videos/${path}`;

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
