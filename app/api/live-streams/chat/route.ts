import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

async function ensureChatTable(pool: any) {
  const checkSql = `
    CREATE TABLE IF NOT EXISTS live_stream_chats (
      id VARCHAR(64) PRIMARY KEY,
      stream_id VARCHAR(64) NOT NULL,
      user_name VARCHAR(255) NOT NULL,
      comment TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await pool.query(checkSql);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const streamId = searchParams.get('streamId');
    if (!streamId) {
      return NextResponse.json({ success: false, error: 'Missing streamId query parameter' }, { status: 400 });
    }

    const pool = await getPool();
    if (!pool) {
      return NextResponse.json({ success: true, comments: [] });
    }

    await ensureChatTable(pool);

    const fetchSql = `
      SELECT id, user_name, comment, created_at
      FROM live_stream_chats
      WHERE stream_id = $1
      ORDER BY created_at ASC
    `;
    const res = await pool.query(fetchSql, [streamId]);
    return NextResponse.json({ success: true, comments: res.rows });
  } catch (err: any) {
    console.error('[Stream Chat GET error]:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { streamId, userName, comment } = await req.json();
    if (!streamId || !userName || !comment) {
      return NextResponse.json({ success: false, error: 'Missing required parameters' }, { status: 400 });
    }

    const pool = await getPool();
    if (!pool) {
      return NextResponse.json({
        success: true,
        comment: {
          id: `chat-${Date.now()}`,
          user_name: userName,
          comment,
          created_at: new Date().toISOString()
        }
      });
    }

    await ensureChatTable(pool);

    const insertSql = `
      INSERT INTO live_stream_chats (id, stream_id, user_name, comment)
      VALUES ($1, $2, $3, $4)
      RETURNING id, user_name, comment, created_at
    `;
    const chatId = `chat-${Date.now()}`;
    const res = await pool.query(insertSql, [chatId, streamId, userName, comment]);

    return NextResponse.json({ success: true, comment: res.rows[0] });
  } catch (err: any) {
    console.error('[Stream Chat POST error]:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const streamId = searchParams.get('streamId');
    if (!streamId) {
      return NextResponse.json({ success: false, error: 'Missing streamId' }, { status: 400 });
    }

    const pool = await getPool();
    if (pool) {
      await ensureChatTable(pool);
      await pool.query('DELETE FROM live_stream_chats WHERE stream_id = $1', [streamId]);
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
