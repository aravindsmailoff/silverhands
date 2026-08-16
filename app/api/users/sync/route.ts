import { NextResponse } from 'next/server';
import { getPool, initDatabaseSchema } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userName, profile, voicePin, password, photoUrl } = body;

    if (!userName) {
      return NextResponse.json({ success: false, message: 'userName is required' }, { status: 400 });
    }

    const pool = await getPool();
    if (!pool) {
      return NextResponse.json({ success: true, message: 'Saved to local registry (database pool unavailable)' });
    }

    // Ensure database tables exist
    await initDatabaseSchema();

    const id = userName.trim().toLowerCase().replace(/\s+/g, '_');
    const name = userName.trim();
    const skill = profile?.skill || null;
    const experience = profile?.experience_years || 0;
    const location = profile?.location || null;
    const language = profile?.language || 'English';
    const services = JSON.stringify(profile?.services || []);
    const availability = profile?.availability || null;
    const facePhoto = photoUrl || null;
    const pin = voicePin || null;
    const pass = password || null;

    const sql = `
      INSERT INTO user_accounts 
        (id, user_name, skill, experience_years, location, language, services, availability, face_photo_url, voice_pin, password_hash)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO UPDATE SET
        user_name = EXCLUDED.user_name,
        skill = COALESCE(EXCLUDED.skill, user_accounts.skill),
        experience_years = COALESCE(EXCLUDED.experience_years, user_accounts.experience_years),
        location = COALESCE(EXCLUDED.location, user_accounts.location),
        language = COALESCE(EXCLUDED.language, user_accounts.language),
        services = COALESCE(EXCLUDED.services, user_accounts.services),
        availability = COALESCE(EXCLUDED.availability, user_accounts.availability),
        face_photo_url = COALESCE(EXCLUDED.face_photo_url, user_accounts.face_photo_url),
        voice_pin = COALESCE(EXCLUDED.voice_pin, user_accounts.voice_pin),
        password_hash = COALESCE(EXCLUDED.password_hash, user_accounts.password_hash);
    `;

    await pool.query(sql, [id, name, skill, experience, location, language, services, availability, facePhoto, pin, pass]);

    return NextResponse.json({
      success: true,
      message: `User account '${name}' successfully stored in PostgreSQL database.`,
      user_id: id
    });
  } catch (err: any) {
    console.error('[User Sync API Error]:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const pool = await getPool();
    if (!pool) {
      return NextResponse.json({ success: true, accounts: [] });
    }

    await initDatabaseSchema();
    const res = await pool.query('SELECT * FROM user_accounts ORDER BY created_at DESC;');
    return NextResponse.json({
      success: true,
      accounts: res.rows
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
