import { NextResponse } from 'next/server';
import { getPool, memoryStore } from '@/lib/db';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const creatorName = searchParams.get('creatorName');
  const videoId = searchParams.get('videoId');
  const getVersions = searchParams.get('versions') === 'true';

  try {
    const pool = await getPool();

    if (pool) {
      if (getVersions && videoId) {
        // Fetch versions for a specific video
        const sql = `SELECT * FROM video_versions WHERE video_id = $1 ORDER BY version_number ASC`;
        const res = await pool.query(sql, [videoId]);
        return NextResponse.json({ success: true, versions: res.rows });
      }

      // Fetch from new videos table — PUBLIC published only for consumer feed
      const visibilityFilter = searchParams.get('visibility');
      const publicOnly = searchParams.get('publicOnly') === 'true';

      let newQuery = `
        SELECT 
          v.id, v.creator_id, v.title, v.description, v.video_type, v.status, 
          v.source_type, v.storage_key, v.thumbnail_key, v.duration_seconds, 
          v.transcript, v.views, v.likes, v.visibility, v.created_at, v.updated_at, v.published_at,
          u.user_name as creator_name, u.face_photo_url as creator_avatar,
          (SELECT COUNT(*)::int FROM video_comments WHERE video_id = v.id) as comments_count
        FROM videos v
        LEFT JOIN user_accounts u ON v.creator_id = u.id
      `;
      const newParams: any[] = [];
      const whereClauses: string[] = [];
      if (creatorName) {
        newParams.push(creatorName);
        whereClauses.push(`LOWER(u.user_name) = LOWER($${newParams.length})`);
      }
      if (publicOnly || visibilityFilter === 'PUBLIC') {
        whereClauses.push(`v.visibility = 'PUBLIC' AND v.status = 'PUBLISHED'`);
      } else if (visibilityFilter) {
        newParams.push(visibilityFilter);
        whereClauses.push(`v.visibility = $${newParams.length}`);
      }
      if (whereClauses.length) {
        newQuery += ` WHERE ${whereClauses.join(' AND ')}`;
      }
      newQuery += ` ORDER BY v.created_at DESC`;

      // Fetch from legacy recorded_videos table
      let legacyQuery = `
        SELECT 
          id, NULL as creator_id, topic as title, description, 
          'tutorial' as video_type, 'READY' as status, 'RECORDED' as source_type,
          video_url as storage_key, NULL as thumbnail_key, 60 as duration_seconds,
          NULL as transcript, 0 as views, 0 as likes, recorded_at as created_at,
          recorded_at as updated_at, recorded_at as published_at,
          creator_name, NULL as creator_avatar,
          (SELECT COUNT(*)::int FROM video_comments WHERE video_id = id) as comments_count
        FROM recorded_videos
      `;
      const legacyParams: any[] = [];
      legacyQuery += ` WHERE is_public = true`;
      if (creatorName) {
        legacyParams.push(creatorName);
        legacyQuery += ` AND LOWER(creator_name) = LOWER($${legacyParams.length})`;
      }
      legacyQuery += ` ORDER BY recorded_at DESC`;

      const [resNew, resLegacy] = await Promise.all([
        pool.query(newQuery, newParams),
        pool.query(legacyQuery, legacyParams)
      ]);

      const seen = new Set();
      const mergedVideos = [];

      for (const row of resNew.rows) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          mergedVideos.push(row);
        }
      }

      for (const row of resLegacy.rows) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          mergedVideos.push(row);
        }
      }

      return NextResponse.json({ success: true, videos: mergedVideos, source: 'postgresql' });
    }

    // Fallback using memory store
    let videos = memoryStore.listings
      .filter((item: any) => item.video_url)
      .map((item: any) => ({
        id: item.id,
        creator_name: item.owner_name || item.creator_name,
        title: item.title || item.topic,
        description: item.description,
        video_url: item.video_url,
        duration_seconds: item.duration_seconds || 15,
        views: item.views || 0,
        created_at: item.created_at || item.recorded_at
      }));

    if (creatorName) {
      videos = videos.filter((v: any) => (v.creator_name || '').toLowerCase() === creatorName.toLowerCase());
    }

    return NextResponse.json({ success: true, videos, source: 'memory' });
  } catch (err: any) {
    console.error('Error fetching videos:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      videoId, creatorId, creatorName, title, description, 
      sourceType, storageKey, thumbnailKey, durationSeconds, transcript,
      versionNumber, videoType, publishVersionId 
    } = body;

    const pool = await getPool();
    if (!pool) {
      // Memory Store Fallback
      const vid = videoId || `vid-${Date.now()}`;
      const fallbackVid = {
        id: vid,
        owner_name: creatorName || 'Creator',
        title: title || 'New Lesson',
        description,
        video_url: storageKey || 'blob:video',
        duration_seconds: durationSeconds || 15,
        created_at: new Date().toISOString()
      };
      (memoryStore.listings as any[]).unshift(fallbackVid);
      return NextResponse.json({ success: true, video: fallbackVid, source: 'memory' });
    }

    // 1. Publish specific version
    if (publishVersionId) {
      // Fetch details of version
      const verRes = await pool.query(`SELECT * FROM video_versions WHERE id = $1`, [publishVersionId]);
      if (verRes.rows.length === 0) {
        return NextResponse.json({ success: false, error: 'Version not found' }, { status: 404 });
      }
      const version = verRes.rows[0];

      // Update main video record — publish generated short as PUBLIC
      const updateSql = `
        UPDATE videos 
        SET storage_key = $1, status = 'PUBLISHED', visibility = 'PUBLIC',
            published_at = NOW(), duration_seconds = $2
        WHERE id = $3
        RETURNING *
      `;
      const updateRes = await pool.query(updateSql, [version.storage_key, version.duration_seconds, version.video_id]);
      await pool.query(
        `UPDATE video_versions SET visibility = 'PUBLIC', version_type = 'published_short', status = 'PUBLISHED'
         WHERE id = $1`,
        [publishVersionId]
      );
      return NextResponse.json({ success: true, video: updateRes.rows[0], message: 'Posted to profile successfully' });
    }

    // 2. Insert new version under existing video
    if (videoId && versionNumber) {
      const versionId = `ver-${videoId}-${versionNumber}`;
      const insertVersionSql = `
        INSERT INTO video_versions (id, video_id, version_number, storage_key, video_type, duration_seconds)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          storage_key = EXCLUDED.storage_key,
          duration_seconds = EXCLUDED.duration_seconds
        RETURNING *
      `;
      const verRes = await pool.query(insertVersionSql, [
        versionId, videoId, versionNumber, storageKey, videoType || 'short', durationSeconds || 0
      ]);
      return NextResponse.json({ success: true, version: verRes.rows[0] });
    }

    // 3. Create or update main video record + version 1
    const finalCreatorId = creatorId || creatorName?.trim().toLowerCase().replace(/\s+/g, '_') || 'anonymous';
    const finalVideoId = videoId || `vid-${Date.now()}`;
    const finalTitle = title || 'Unnamed Lesson';

    const insertVideoSql = `
      INSERT INTO videos 
        (id, creator_id, title, description, video_type, status, source_type, storage_key, thumbnail_key, duration_seconds, transcript, visibility, provider_id)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        storage_key = EXCLUDED.storage_key,
        duration_seconds = EXCLUDED.duration_seconds,
        transcript = EXCLUDED.transcript
      RETURNING *
    `;

    const isSourceUpload = (sourceType || 'RECORDED') !== 'GENERATED_SHORT';
    const defaultVisibility = isSourceUpload ? 'PRIVATE' : 'PRIVATE';
    const defaultStatus = isSourceUpload ? 'UPLOADED' : 'READY';

    const vidRes = await pool.query(insertVideoSql, [
      finalVideoId, finalCreatorId, finalTitle, description || null, videoType || 'tutorial', 
      defaultStatus, sourceType || 'RECORDED', storageKey || 'blob:video', thumbnailKey || null, durationSeconds || 0, transcript || null,
      defaultVisibility, finalCreatorId
    ]);

    // Automatically insert version 1 as PRIVATE draft
    const ver1Id = `ver-${Date.now()}-1`;
    await pool.query(`
      INSERT INTO video_versions (id, video_id, version_number, storage_key, video_type, duration_seconds, visibility, version_type, provider_id)
      VALUES ($1, $2, 1, $3, $4, $5, 'PRIVATE', $6, $7)
      ON CONFLICT DO NOTHING
    `, [ver1Id, finalVideoId, storageKey || 'blob:video', videoType || 'tutorial', durationSeconds || 0, isSourceUpload ? 'source' : 'draft', finalCreatorId]);

    return NextResponse.json({ success: true, video: vidRes.rows[0] });
  } catch (err: any) {
    console.error('Error saving video:', err);
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
      await pool.query('DELETE FROM videos WHERE id = $1', [id]);
    }

    // Memory store cleanup
    memoryStore.listings = memoryStore.listings.filter((item: any) => item.id !== id);
    return NextResponse.json({ success: true, message: 'Video deleted successfully' });
  } catch (err: any) {
    console.error('Error deleting video:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
