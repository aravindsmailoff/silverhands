import pg from 'pg';
import fs from 'fs';

const envText = fs.readFileSync('.env.local', 'utf-8');
let dbUrl = '';
for (const line of envText.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) {
    dbUrl = line.replace('DATABASE_URL=', '').trim();
  }
}

console.log('Testing DATABASE_URL:', dbUrl);

const { Pool } = pg;
const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

try {
  const res = await pool.query('SELECT NOW();');
  console.log('SUCCESS! Connected to Postgres:', res.rows[0]);
} catch (err) {
  console.error('Postgres Error:', err.message);
} finally {
  await pool.end();
}
