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

    const userId = userName.trim().toLowerCase().replace(/\s+/g, '_');
    const profileId = `cp_${userId}`;
    const name = userName.trim();
    const skillsList = Array.isArray(profile?.skills) && profile.skills.length > 0 ? profile.skills : [];
    const legacySkill = skillsList.length > 0 ? skillsList.map((s: any) => s.name).join(', ') : (profile?.skill || null);
    const legacyExp = skillsList.length > 0 && skillsList[0]?.experience_years !== null && skillsList[0]?.experience_years !== undefined
      ? Number(skillsList[0].experience_years)
      : (profile?.experience_years ?? 0);
    const location = profile?.location || null;
    const language = profile?.language || 'English';
    const services = JSON.stringify(skillsList.length > 0 ? skillsList : (profile?.services || []));
    const availability = profile?.availability || null;
    const facePhoto = photoUrl || null;
    const pin = voicePin || null;
    const pass = password || null;

    // 1. Upsert into core user_accounts table (Legacy + Core Auth compatibility)
    const sqlUserAccounts = `
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
    await pool.query(sqlUserAccounts, [userId, name, legacySkill, legacyExp, location, language, services, availability, facePhoto, pin, pass]);

    // 2. Upsert into creator_profiles
    const sqlProfile = `
      INSERT INTO creator_profiles
        (id, user_id, display_name, bio, experience_summary, availability, updated_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        bio = COALESCE(EXCLUDED.bio, creator_profiles.bio),
        experience_summary = COALESCE(EXCLUDED.experience_summary, creator_profiles.experience_summary),
        availability = COALESCE(EXCLUDED.availability, creator_profiles.availability),
        updated_at = CURRENT_TIMESTAMP;
    `;
    await pool.query(sqlProfile, [profileId, userId, name, profile?.bio || null, `${legacyExp} Years Experience`, availability]);

    // 3. Upsert normalized skills & creator_skills records
    if (skillsList.length > 0) {
      for (const sk of skillsList) {
        const skillName = (sk.name || 'Skill').trim();
        const normName = skillName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const skillId = `sk_${normName}`;

        // Upsert into master skill catalogue
        await pool.query(`
          INSERT INTO skills (id, name, normalized_name)
          VALUES ($1, $2, $3)
          ON CONFLICT (normalized_name) DO UPDATE SET name = EXCLUDED.name;
        `, [skillId, skillName, normName]);

        // Upsert into creator_skills junction table
        const csId = `cs_${userId}_${normName}`;
        const sType = sk.type || 'primary';
        const expYrs = sk.experience_years !== null && sk.experience_years !== undefined ? Number(sk.experience_years) : null;
        await pool.query(`
          INSERT INTO creator_skills
            (id, creator_profile_id, skill_id, skill_type, experience_years, status, is_confirmed, updated_at)
          VALUES
            ($1, $2, $3, $4, $5, 'confirmed', true, CURRENT_TIMESTAMP)
          ON CONFLICT (creator_profile_id, skill_id) DO UPDATE SET
            skill_type = EXCLUDED.skill_type,
            experience_years = COALESCE(EXCLUDED.experience_years, creator_skills.experience_years),
            status = 'confirmed',
            is_confirmed = true,
            updated_at = CURRENT_TIMESTAMP;
        `, [csId, profileId, skillId, sType, expYrs]);
      }
    }

    // 4. Upsert structured location
    if (location) {
      const locId = `loc_${userId}`;
      const locParts = location.split(',').map((p: string) => p.trim());
      const locality = locParts.length > 2 ? locParts[0] : null;
      const city = locParts.length > 1 ? locParts[locParts.length - 2] : locParts[0];
      const state = locParts.length > 1 ? locParts[locParts.length - 1] : null;

      await pool.query(`
        INSERT INTO locations
          (id, creator_profile_id, locality, city, state, country, is_primary, updated_at)
        VALUES
          ($1, $2, $3, $4, $5, 'India', true, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          locality = EXCLUDED.locality,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          updated_at = CURRENT_TIMESTAMP;
      `, [locId, profileId, locality, city, state]);
    }

    // 5. Log profile change
    await pool.query(`
      INSERT INTO profile_change_log
        (id, creator_profile_id, field_type, field_id, new_value, source)
      VALUES
        ($1, $2, 'profile_sync', $3, $4, 'voice');
    `, [`log_${Date.now()}_${userId}`, profileId, userId, JSON.stringify({ skills: skillsList, location })]);

    return NextResponse.json({
      success: true,
      message: `User account and normalized creator profile for '${name}' successfully stored in PostgreSQL database.`,
      user_id: userId,
      profile_id: profileId
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

    // Query core user accounts
    const resUsers = await pool.query('SELECT * FROM user_accounts ORDER BY created_at DESC;');
    const accounts = resUsers.rows;

    // Fetch normalized skills for each account
    for (const acc of accounts) {
      const profileId = `cp_${acc.id}`;
      try {
        const resSkills = await pool.query(`
          SELECT s.name, cs.skill_type as type, cs.experience_years, cs.is_confirmed
          FROM creator_skills cs
          JOIN skills s ON cs.skill_id = s.id
          WHERE cs.creator_profile_id = $1
          ORDER BY cs.created_at ASC;
        `, [profileId]);

        if (resSkills.rows && resSkills.rows.length > 0) {
          acc.skills = resSkills.rows;
        }
      } catch (e) {
        // Safe fallback to legacy fields
      }
    }

    return NextResponse.json({
      success: true,
      accounts: accounts
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
