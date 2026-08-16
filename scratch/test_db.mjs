import pg from 'pg';

const dbUrl = 'postgresql://postgres:uXGHFkxDnOviGKauEWFjPQxreBDGIDzO@junction.proxy.rlwy.net:55271/railway';
console.log('Testing Public Railway DATABASE_URL:', dbUrl);

const { Pool } = pg;
const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

try {
  const res = await pool.query('SELECT NOW();');
  console.log('SUCCESS! Connected to Railway Postgres:', res.rows[0]);

  // Execute schema initialization
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
      lat NUMERIC NOT NULL DEFAULT 13.0827,
      lng NUMERIC NOT NULL DEFAULT 80.2707,
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

  await pool.query(schemaSql);
  console.log('SUCCESS! All 8 tables created in Railway Postgres database!');

  const tables = await pool.query(`
    SELECT table_name 
    from information_schema.tables 
    WHERE table_schema = 'public';
  `);
  console.log('Created tables in Railway Postgres:', tables.rows.map(r => r.table_name));

} catch (err) {
  console.error('Postgres Error:', err.message);
} finally {
  await pool.end();
}
