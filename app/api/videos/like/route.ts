import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { videoId } = await req.json();
    if (!videoId) {
      return NextResponse.json({ success: false, error: 'Missing videoId' }, { status: 400 });
    }

    const pool = await getPool();
    if (!pool) {
      return NextResponse.json({ success: true, likes: 1, source: 'memory' });
    }

    const updateSql = `
      UPDATE videos
      SET likes = likes + 1
      WHERE id = $1
      RETURNING likes
    `;
    const res = await pool.query(updateSql, [videoId]);
    
    if (res.rowCount === 0) {
      return NextResponse.json({ success: false, error: 'Video not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, likes: res.rows[0].likes });
  } catch (err: any) {
    console.error('[Likes API error]:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
