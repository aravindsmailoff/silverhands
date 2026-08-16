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
      recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(schemaSql);
    console.log('[DB] Railway PostgreSQL schema initialized successfully.');
    return { success: true, message: 'PostgreSQL schema created successfully.' };
  } catch (err: any) {
    console.error('[DB] Schema initialization error:', err);
    return { success: false, message: err.message || 'Error executing schema SQL.' };
  }
}
