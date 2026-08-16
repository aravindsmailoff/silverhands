import { NextResponse } from 'next/server';
import { getPool, memoryStore } from '@/lib/db';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const creatorName = searchParams.get('creatorName');

  try {
    const pool = await getPool();

    if (pool) {
      try {
        let query = `SELECT id, creator_name, topic, description, video_url, video_data, is_public, recorded_at FROM recorded_videos`;
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
        creator_name: item.owner_name || item.creator_name,
        topic: item.title || item.topic,
        description: item.description,
        video_url: item.video_url,
        is_public: item.is_public !== undefined ? item.is_public : true,
        recorded_at: item.created_at || item.recorded_at
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
    const { topic, description, videoUrl, videoData, creatorName, isPublic = true } = body;

    if (!topic) {
      return NextResponse.json({ error: 'Video topic is required' }, { status: 400 });
    }

    const videoId = `vid-${Date.now()}`;
    const creator = creatorName || 'Creator';
    const url = videoUrl || 'blob:video-recorded';

    const newVideo = {
      id: videoId,
      creator_name: creator,
      topic,
      description,
      video_url: url,
      is_public: isPublic,
      recorded_at: new Date().toISOString()
    };

    const pool = await getPool();

    if (pool) {
      try {
        await pool.query(
          `INSERT INTO recorded_videos (id, creator_name, topic, description, video_url, video_data, is_public, recorded_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [videoId, creator, topic, description || null, url, videoData || null, isPublic]
        );
        console.log(`[DB] Video "${topic}" (public=${isPublic}) stored successfully for creator ${creator}.`);
      } catch (dbErr) {
        console.warn('[DB] Video insert SQL error, falling back to memory:', dbErr);
        memoryStore.listings.unshift({ ...newVideo, owner_name: creator, title: topic });
      }
    } else {
      memoryStore.listings.unshift({ ...newVideo, owner_name: creator, title: topic });
    }

    return NextResponse.json({
      success: true,
      video: newVideo
    });
  } catch (err: any) {
    console.error('Error saving video to database:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id parameter is required' }, { status: 400 });
  }

  try {
    const pool = await getPool();
    if (pool) {
      try {
        await pool.query('DELETE FROM recorded_videos WHERE id = $1', [id]);
        console.log(`[DB] Video with ID "${id}" deleted successfully.`);
      } catch (dbErr) {
        console.warn('[DB] Video deletion SQL error, falling back to memory store:', dbErr);
      }
    }

    // Also delete from memoryStore listings if present
    const initialLength = memoryStore.listings.length;
    memoryStore.listings = memoryStore.listings.filter((item: any) => item.id !== id);
    console.log(`[Memory] Deleted video ${id}. Remained: ${memoryStore.listings.length} (from ${initialLength})`);

    return NextResponse.json({ success: true, message: 'Video deleted successfully' });
  } catch (err: any) {
    console.error('Error deleting video:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
