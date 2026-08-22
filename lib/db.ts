export * from './types';
export * from './store';

let poolInstance: any = null;

export async function getPool() {
  if (typeof window !== 'undefined') return null; // Client side check

  if (!poolInstance && process.env.DATABASE_URL) {
    try {
      const { Pool } = await import('pg');
      poolInstance = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('railway') || process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: false }
          : false
      });
    } catch (e) {
      console.warn('[DB] Failed importing pg Pool:', e);
    }
  }
  return poolInstance;
}

export async function initDatabaseSchema(): Promise<{ success: boolean; message: string }> {
  const pool = await getPool();
  if (!pool) {
    return { success: false, message: 'Database connection pool not available (DATABASE_URL not set or client context).' };
  }

  const schemaSql = `
    CREATE TABLE IF NOT EXISTS user_accounts (
      id VARCHAR(64) PRIMARY KEY,
      user_name VARCHAR(255) NOT NULL,
      skill VARCHAR(255),
      experience_years INTEGER,
      location VARCHAR(255),
      language VARCHAR(128),
      services TEXT,
      availability VARCHAR(255),
      face_photo_url TEXT,
      voice_pin VARCHAR(64),
      password_hash VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      phone VARCHAR(32) NOT NULL DEFAULT '0000000000',
      role VARCHAR(32) NOT NULL DEFAULT 'elder_creator',
      name VARCHAR(255),
      guardian_phone VARCHAR(32),
      guardian_name VARCHAR(255),
      is_verified BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS guardian_links (
      id VARCHAR(64) PRIMARY KEY,
      senior_user_id VARCHAR(64) NOT NULL,
      guardian_user_id VARCHAR(64) NOT NULL,
      status VARCHAR(32) DEFAULT 'active',
      threshold_amount NUMERIC DEFAULT 500,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS listings (
      id VARCHAR(64) PRIMARY KEY,
      owner_user_id VARCHAR(64) NOT NULL,
      owner_name VARCHAR(255),
      type VARCHAR(32) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      price NUMERIC NOT NULL,
      unit VARCHAR(32) DEFAULT 'session',
      lat NUMERIC NOT NULL,
      lng NUMERIC NOT NULL,
      locality_label VARCHAR(255),
      category VARCHAR(64),
      status VARCHAR(32) DEFAULT 'active',
      guardian_approved BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS request_items (
      id VARCHAR(64) PRIMARY KEY,
      listing_id VARCHAR(64) NOT NULL,
      buyer_user_id VARCHAR(64) NOT NULL,
      buyer_name VARCHAR(255),
      buyer_phone VARCHAR(32),
      listing_title VARCHAR(255),
      listing_price NUMERIC,
      status VARCHAR(32) DEFAULT 'pending',
      type VARCHAR(32) DEFAULT 'learn_request',
      scheduled_time VARCHAR(128),
      notes TEXT,
      guardian_approved BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payments (
      id VARCHAR(64) PRIMARY KEY,
      request_id VARCHAR(64),
      listing_id VARCHAR(64),
      buyer_user_id VARCHAR(64),
      amount NUMERIC NOT NULL,
      status VARCHAR(32) DEFAULT 'created',
      razorpay_link_id VARCHAR(128),
      razorpay_payment_id VARCHAR(128),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ratings (
      id VARCHAR(64) PRIMARY KEY,
      listing_id VARCHAR(64) NOT NULL,
      reviewer_name VARCHAR(255),
      rating INTEGER NOT NULL,
      comment TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recorded_videos (
      id VARCHAR(64) PRIMARY KEY,
      creator_name VARCHAR(255) NOT NULL,
      topic VARCHAR(255) NOT NULL,
      description TEXT,
      video_url TEXT NOT NULL,
      video_data TEXT,
      is_public BOOLEAN DEFAULT true,
      recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Normalized Multi-Skill Relational Architecture ──

    CREATE TABLE IF NOT EXISTS creator_profiles (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      display_name VARCHAR(255) NOT NULL,
      bio TEXT,
      experience_summary TEXT,
      availability VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS skills (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      normalized_name VARCHAR(255) UNIQUE NOT NULL,
      category VARCHAR(128),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS creator_skills (
      id VARCHAR(64) PRIMARY KEY,
      creator_profile_id VARCHAR(64) NOT NULL,
      skill_id VARCHAR(64) NOT NULL,
      skill_type VARCHAR(32) DEFAULT 'primary',
      experience_years INTEGER,
      status VARCHAR(32) DEFAULT 'confirmed',
      source VARCHAR(32) DEFAULT 'voice',
      confidence NUMERIC DEFAULT 1.0,
      is_confirmed BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unq_creator_skill UNIQUE (creator_profile_id, skill_id)
    );

    CREATE TABLE IF NOT EXISTS locations (
      id VARCHAR(64) PRIMARY KEY,
      creator_profile_id VARCHAR(64) NOT NULL,
      locality VARCHAR(255),
      city VARCHAR(255),
      district VARCHAR(255),
      state VARCHAR(255),
      country VARCHAR(128) DEFAULT 'India',
      postal_code VARCHAR(32),
      is_primary BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS offerings (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(128),
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS creator_offerings (
      id VARCHAR(64) PRIMARY KEY,
      creator_profile_id VARCHAR(64) NOT NULL,
      offering_id VARCHAR(64) NOT NULL,
      is_confirmed BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unq_creator_offering UNIQUE (creator_profile_id, offering_id)
    );

    CREATE TABLE IF NOT EXISTS languages (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(128) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS creator_languages (
      id VARCHAR(64) PRIMARY KEY,
      creator_profile_id VARCHAR(64) NOT NULL,
      language_id VARCHAR(64) NOT NULL,
      proficiency VARCHAR(64) DEFAULT 'native',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unq_creator_lang UNIQUE (creator_profile_id, language_id)
    );

    CREATE TABLE IF NOT EXISTS creator_videos (
      id VARCHAR(64) PRIMARY KEY,
      creator_profile_id VARCHAR(64) NOT NULL,
      creator_name VARCHAR(255) NOT NULL,
      topic VARCHAR(255) NOT NULL,
      description TEXT,
      source_url TEXT,
      video_data TEXT,
      content_mode VARCHAR(64) DEFAULT 'tutorial',
      status VARCHAR(32) DEFAULT 'ready',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS profile_change_log (
      id VARCHAR(64) PRIMARY KEY,
      creator_profile_id VARCHAR(64) NOT NULL,
      field_type VARCHAR(64) NOT NULL,
      field_id VARCHAR(64),
      old_value TEXT,
      new_value TEXT,
      source VARCHAR(64) DEFAULT 'voice',
      changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS consumers (
      id VARCHAR(64) PRIMARY KEY,
      username VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      location VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS videos (
      id VARCHAR(64) PRIMARY KEY,
      creator_id VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      video_type VARCHAR(64),
      status VARCHAR(32) DEFAULT 'UPLOADED',
      source_type VARCHAR(32) DEFAULT 'RECORDED',
      storage_key TEXT,
      thumbnail_key TEXT,
      duration_seconds INTEGER,
      transcript TEXT,
      views INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      published_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS video_comments (
      id VARCHAR(64) PRIMARY KEY,
      video_id VARCHAR(64) NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      user_name VARCHAR(255) NOT NULL,
      comment TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS video_versions (
      id VARCHAR(64) PRIMARY KEY,
      video_id VARCHAR(64) NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      storage_key TEXT NOT NULL,
      video_type VARCHAR(64) DEFAULT 'short',
      duration_seconds INTEGER,
      processing_status VARCHAR(32) DEFAULT 'READY',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS live_streams (
      id VARCHAR(64) PRIMARY KEY,
      creator_id VARCHAR(64) NOT NULL,
      creator_name VARCHAR(255) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      meet_url TEXT,
      status VARCHAR(32) DEFAULT 'live',
      viewer_count INTEGER DEFAULT 0,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ended_at TIMESTAMP
    );

    -- ── Provider-scoped relational extensions ──

    CREATE TABLE IF NOT EXISTS provider_profiles (
      id VARCHAR(64) PRIMARY KEY,
      provider_id VARCHAR(64) NOT NULL UNIQUE,
      display_name VARCHAR(255) NOT NULL,
      bio TEXT,
      language VARCHAR(128),
      is_public BOOLEAN DEFAULT false,
      profile_complete BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS provider_skills (
      id VARCHAR(64) PRIMARY KEY,
      provider_id VARCHAR(64) NOT NULL,
      skill_name VARCHAR(255) NOT NULL,
      normalized_name VARCHAR(255) NOT NULL,
      experience_years INTEGER,
      is_confirmed BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unq_provider_skill UNIQUE (provider_id, normalized_name)
    );

    CREATE TABLE IF NOT EXISTS provider_experience (
      id VARCHAR(64) PRIMARY KEY,
      provider_id VARCHAR(64) NOT NULL,
      skill_id VARCHAR(64),
      title VARCHAR(255) NOT NULL,
      years INTEGER,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS provider_locations (
      id VARCHAR(64) PRIMARY KEY,
      provider_id VARCHAR(64) NOT NULL,
      locality VARCHAR(255),
      city VARCHAR(255),
      district VARCHAR(255),
      state VARCHAR(255),
      country VARCHAR(128) DEFAULT 'India',
      is_primary BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS provider_services (
      id VARCHAR(64) PRIMARY KEY,
      provider_id VARCHAR(64) NOT NULL,
      service_name VARCHAR(255) NOT NULL,
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS provider_availability (
      id VARCHAR(64) PRIMARY KEY,
      provider_id VARCHAR(64) NOT NULL,
      day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      timezone VARCHAR(64) DEFAULT 'Asia/Kolkata',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_availability_times CHECK (start_time < end_time)
    );

    CREATE TABLE IF NOT EXISTS provider_appointments (
      id VARCHAR(64) PRIMARY KEY,
      provider_id VARCHAR(64) NOT NULL,
      consumer_id VARCHAR(64) NOT NULL,
      availability_id VARCHAR(64) NOT NULL,
      slot_date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      status VARCHAR(32) DEFAULT 'confirmed',
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unq_provider_slot UNIQUE (provider_id, slot_date, start_time)
    );

    CREATE TABLE IF NOT EXISTS provider_biometric_records (
      id VARCHAR(64) PRIMARY KEY,
      provider_id VARCHAR(64) NOT NULL,
      embedding TEXT NOT NULL,
      model_version VARCHAR(64) NOT NULL DEFAULT 'silverhands-v1-block128',
      enrollment_version INTEGER DEFAULT 1,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS biometric_audit_log (
      id VARCHAR(64) PRIMARY KEY,
      provider_id VARCHAR(64) NOT NULL,
      action VARCHAR(64) NOT NULL,
      success BOOLEAN NOT NULL,
      trust_score NUMERIC,
      ip_hash VARCHAR(128),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS provider_knowledge (
      id VARCHAR(64) PRIMARY KEY,
      provider_id VARCHAR(64) NOT NULL,
      video_id VARCHAR(64),
      topic VARCHAR(255),
      skill VARCHAR(255),
      language VARCHAR(64) DEFAULT 'en',
      summary TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS provider_knowledge_chunks (
      id VARCHAR(64) PRIMARY KEY,
      provider_id VARCHAR(64) NOT NULL,
      video_id VARCHAR(64),
      knowledge_id VARCHAR(64),
      content TEXT NOT NULL,
      topic VARCHAR(255),
      skill VARCHAR(255),
      language VARCHAR(64) DEFAULT 'en',
      timestamp_start NUMERIC,
      timestamp_end NUMERIC,
      embedding TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_provider_knowledge_provider ON provider_knowledge(provider_id);
    CREATE INDEX IF NOT EXISTS idx_provider_knowledge_chunks_provider ON provider_knowledge_chunks(provider_id);
    CREATE INDEX IF NOT EXISTS idx_provider_availability_provider ON provider_availability(provider_id);
    CREATE INDEX IF NOT EXISTS idx_provider_appointments_provider ON provider_appointments(provider_id);
  `;

  try {
    await pool.query(schemaSql);
    // Alter existing tables to add columns if they don't exist
    try {
      await pool.query('ALTER TABLE recorded_videos ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;');
      await pool.query('ALTER TABLE videos ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0;');
      await pool.query('ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS description TEXT;');
      await pool.query('ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;');
      await pool.query('ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP;');
      await pool.query('ALTER TABLE live_streams ALTER COLUMN meet_url DROP NOT NULL;');
      await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS visibility VARCHAR(16) DEFAULT 'PRIVATE';`);
      await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS provider_id VARCHAR(64);`);
      await pool.query(`ALTER TABLE video_versions ADD COLUMN IF NOT EXISTS provider_id VARCHAR(64);`);
      await pool.query(`ALTER TABLE video_versions ADD COLUMN IF NOT EXISTS visibility VARCHAR(16) DEFAULT 'PRIVATE';`);
      await pool.query(`ALTER TABLE video_versions ADD COLUMN IF NOT EXISTS version_type VARCHAR(32) DEFAULT 'draft';`);
      await pool.query(`ALTER TABLE video_versions ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'READY';`);
    } catch (alterErr) {
      console.warn('[DB] ALTER TABLE migrations warning:', alterErr);
    }
    console.log('[DB] Railway PostgreSQL normalized schema initialized successfully.');
    return { success: true, message: 'PostgreSQL normalized schema created successfully.' };
  } catch (err: any) {
    console.error('[DB] Schema initialization error:', err);
    return { success: false, message: err.message || 'Error executing schema SQL.' };
  }
}
