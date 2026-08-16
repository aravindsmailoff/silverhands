import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { streamId } = body;

    if (!streamId) {
      return NextResponse.json({ success: false, error: 'streamId is required' }, { status: 400 });
    }

    const pool = await getPool();
    if (!pool) {
      return NextResponse.json({ success: false, error: 'Database connection not available' }, { status: 500 });
    }

    const sql = `
      UPDATE live_streams
      SET viewer_count = GREATEST(0, viewer_count - 1)
      WHERE id = $1 AND status = 'live'
      RETURNING *
    `;
    const res = await pool.query(sql, [streamId]);
    if (res.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Stream not found or inactive' }, { status: 404 });
    }

    return NextResponse.json({ success: true, stream: res.rows[0] });
  } catch (err: any) {
    console.error('[Leave Live Stream Error]:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
