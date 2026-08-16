import fs from 'fs';
import { Pool } from 'pg';

const env = fs.readFileSync('.env.local', 'utf8');
const match = env.match(/DATABASE_URL=(.+)/);
const pool = new Pool({ connectionString: match[1].trim(), ssl: { rejectUnauthorized: false } });

async function main() {
  console.log('Connecting to PostgreSQL database...');
  
  // Delete test accounts
  const deleteRes = await pool.query("DELETE FROM user_accounts WHERE LOWER(user_name) = 'rahul' OR id = 'rahul' OR LOWER(user_name) = 'aravind' OR id = 'aravind' OR LOWER(user_name) = 'ganesh' OR id = 'ganesh';");
  console.log('Deleted test user rows from user_accounts:', deleteRes.rowCount);

  await pool.query("DELETE FROM users WHERE LOWER(name) IN ('rahul', 'aravind', 'ganesh') OR id IN ('rahul', 'aravind', 'ganesh');");
  await pool.query("DELETE FROM recorded_videos WHERE LOWER(creator_name) IN ('rahul', 'aravind', 'ganesh');");

  const accounts = await pool.query("SELECT user_name, id, created_at FROM user_accounts;");
  console.log('Remaining registered user accounts in DB:', accounts.rows);

  await pool.end();
  console.log('Done!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
