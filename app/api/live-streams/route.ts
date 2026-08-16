import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const pool = await getPool();
    if (!pool) {
      return NextResponse.json({ success: true, streams: [] });
    }

    const sql = `
      SELECT id, creator_id, creator_name, title, meet_url, status, viewer_count, created_at
      FROM live_streams
      WHERE status = 'live'
      ORDER BY created_at DESC
    `;
    const res = await pool.query(sql);
    return NextResponse.json({ success: true, streams: res.rows });
  } catch (err: any) {
    console.error('[GET Live Streams Error]:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { creatorId, creatorName, title, meetUrl } = body;

    if (!creatorId || !creatorName || !meetUrl) {
      return NextResponse.json({ success: false, error: 'creatorId, creatorName, and meetUrl are required' }, { status: 400 });
    }

    const pool = await getPool();
    if (!pool) {
      return NextResponse.json({ success: false, error: 'Database connection not available' }, { status: 500 });
    }

    // Set any existing live streams for this creator to ended
    await pool.query(
      `UPDATE live_streams SET status = 'ended' WHERE creator_id = $1 AND status = 'live'`,
      [creatorId]
    );

    const streamId = `live-${Date.now()}`;
    const insertSql = `
      INSERT INTO live_streams (id, creator_id, creator_name, title, meet_url, status, viewer_count)
      VALUES ($1, $2, $3, $4, $5, 'live', 0)
      RETURNING *
    `;
    const result = await pool.query(insertSql, [
      streamId,
      creatorId,
      creatorName,
      title || `${creatorName}'s Live Session`,
      meetUrl
    ]);

    return NextResponse.json({ success: true, stream: result.rows[0] });
  } catch (err: any) {
    console.error('[POST Live Stream Error]:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const creatorId = searchParams.get('creatorId');

    if (!creatorId) {
      return NextResponse.json({ success: false, error: 'creatorId is required' }, { status: 400 });
    }

    const pool = await getPool();
    if (!pool) {
      return NextResponse.json({ success: false, error: 'Database connection not available' }, { status: 500 });
    }

    // End active streams
    await pool.query(
      `UPDATE live_streams SET status = 'ended' WHERE creator_id = $1 AND status = 'live'`,
      [creatorId]
    );

    return NextResponse.json({ success: true, message: 'Live stream stopped successfully' });
  } catch (err: any) {
    console.error('[DELETE Live Stream Error]:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
