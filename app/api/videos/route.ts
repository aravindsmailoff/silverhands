import { NextResponse } from 'next/server';
import { getPool, memoryStore } from '@/lib/db';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const creatorName = searchParams.get('creatorName');

  try {
    const pool = await getPool();

    if (pool) {
      try {
        let query = `SELECT id, creator_name, topic, description, video_url, video_data, recorded_at FROM recorded_videos`;
        const params: any[] = [];

        if (creatorName) {
          query += ` WHERE LOWER(creator_name) = LOWER($1)`;
          params.push(creatorName);
        }
        query += ` ORDER BY recorded_at DESC`;

        const res = await pool.query(query, params);
        return NextResponse.json({ success: true, videos: res.rows, source: 'postgresql' });
      } catch (dbErr) {
        console.warn('[DB] Video SQL query error, falling back to memory store:', dbErr);
      }
    }

    let videos = memoryStore.listings
      .filter((item: any) => item.video_url)
      .map((item: any) => ({
        id: item.id,
        creator_name: item.owner_name,
        topic: item.title,
        description: item.description,
        video_url: item.video_url,
        recorded_at: item.created_at
      }));

    if (creatorName) {
      videos = videos.filter((v: any) => (v.creator_name || '').toLowerCase() === creatorName.toLowerCase());
    }

    return NextResponse.json({ success: true, videos, source: 'memory' });
  } catch (err: any) {
    console.error('Error fetching videos from database:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { topic, description, videoUrl, videoData, creatorName } = body;

    if (!topic) {
      return NextResponse.json({ error: 'Video topic is required' }, { status: 400 });
    }

    const videoId = `vid-${Date.now()}`;
    const creator = creatorName || 'Creator';
    const url = videoUrl || 'blob:video-recorded';

    const pool = await getPool();

    if (pool) {
      try {
        await pool.query(
          `INSERT INTO recorded_videos (id, creator_name, topic, description, video_url, video_data, recorded_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [videoId, creator, topic, description || null, url, videoData || null]
        );
        console.log(`[DB] Video "${topic}" stored successfully for creator ${creator}.`);
      } catch (dbErr) {
        console.warn('[DB] Video insert SQL error:', dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      video: {
        id: videoId,
        creator_name: creator,
        topic,
        description,
        video_url: url,
        recorded_at: new Date().toISOString()
      }
    });
  } catch (err: any) {
    console.error('Error saving video to database:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
