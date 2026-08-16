import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const videoId = searchParams.get('videoId');
    if (!videoId) {
      return NextResponse.json({ success: false, error: 'Missing videoId query parameter' }, { status: 400 });
    }

    const pool = await getPool();
    if (!pool) {
      return NextResponse.json({ success: true, comments: [] });
    }

    const fetchSql = `
      SELECT id, user_name, comment, created_at
      FROM video_comments
      WHERE video_id = $1
      ORDER BY created_at ASC
    `;
    const res = await pool.query(fetchSql, [videoId]);
    return NextResponse.json({ success: true, comments: res.rows });
  } catch (err: any) {
    console.error('[Comments GET API error]:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { videoId, userName, comment } = await req.json();
    if (!videoId || !userName || !comment) {
      return NextResponse.json({ success: false, error: 'Missing required parameters' }, { status: 400 });
    }

    const pool = await getPool();
    if (!pool) {
      return NextResponse.json({
        success: true,
        comment: {
          id: `cmt-${Date.now()}`,
          user_name: userName,
          comment,
          created_at: new Date().toISOString()
        }
      });
    }

    const insertSql = `
      INSERT INTO video_comments (id, video_id, user_name, comment)
      VALUES ($1, $2, $3, $4)
      RETURNING id, user_name, comment, created_at
    `;
    const commentId = `cmt-${Date.now()}`;
    const res = await pool.query(insertSql, [commentId, videoId, userName, comment]);

    return NextResponse.json({ success: true, comment: res.rows[0] });
  } catch (err: any) {
    console.error('[Comments POST API error]:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
