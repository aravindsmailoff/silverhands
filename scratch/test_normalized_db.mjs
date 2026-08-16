import assert from 'assert';
import fs from 'fs';
import path from 'path';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      process.env[key] = val;
    }
  }
}

import { getPool, initDatabaseSchema } from '../lib/db.ts';

async function testDatabase() {
  console.log('========================================================');
  console.log('   NORMALIZED RELATIONAL DB SCHEMA & SYNC TEST          ');
  console.log('========================================================\n');

  const pool = await getPool();
  if (!pool) {
    console.log('⚠️ Database connection pool not available. Skipping DB tests.');
    return;
  }

  console.log('1. Initializing Normalized DB Schema...');
  const initResult = await initDatabaseSchema();
  assert.strictEqual(initResult.success, true);
  console.log('✅ Schema initialized successfully.\n');

  console.log('2. Verifying Normalized Tables in PostgreSQL...');
  const resTables = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `);
  const tableNames = resTables.rows.map(r => r.table_name);
  console.log('Found tables in DB:', tableNames.join(', '));

  assert.ok(tableNames.includes('creator_profiles'), 'Missing creator_profiles table');
  assert.ok(tableNames.includes('skills'), 'Missing skills table');
  assert.ok(tableNames.includes('creator_skills'), 'Missing creator_skills table');
  assert.ok(tableNames.includes('locations'), 'Missing locations table');
  assert.ok(tableNames.includes('profile_change_log'), 'Missing profile_change_log table');
  console.log('✅ All normalized relational tables verified in PostgreSQL.\n');

  console.log('3. Testing Multi-Skill Relational Sync via /api/users/sync ...');
  const testPayload = {
    userName: 'Harish Relational Test',
    profile: {
      name: 'Harish Relational Test',
      skills: [
        { name: 'Tailoring & Stitching', type: 'primary', experience_years: 10 },
        { name: 'Mathematics Teaching', type: 'additional', experience_years: 3 },
        { name: 'Pottery', type: 'additional', experience_years: 15 }
      ],
      location: 'Mylapore, Chennai, Tamil Nadu',
      language: 'Tamil',
      availability: 'Mon - Fri'
    },
    voicePin: '4242',
    password: 'securePassword123'
  };

  const syncRes = await fetch('http://localhost:3000/api/users/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testPayload)
  });
  const syncData = await syncRes.json();
  assert.strictEqual(syncData.success, true);
  console.log('✅ Profile synced into normalized schema.\n');

  console.log('4. Verifying Relational Rows in PostgreSQL...');
  const userId = 'harish_relational_test';
  const profileId = `cp_${userId}`;

  const resCreatorSkills = await pool.query(`
    SELECT s.name, cs.skill_type, cs.experience_years, cs.status, cs.is_confirmed
    FROM creator_skills cs
    JOIN skills s ON cs.skill_id = s.id
    WHERE cs.creator_profile_id = $1
    ORDER BY cs.experience_years DESC;
  `, [profileId]);

  console.log('Retrieved creator skills from normalized junction table:');
  console.table(resCreatorSkills.rows);
  assert.strictEqual(resCreatorSkills.rows.length, 3);
  assert.ok(resCreatorSkills.rows.some(s => s.name === 'Tailoring & Stitching' && Number(s.experience_years) === 10));
  assert.ok(resCreatorSkills.rows.some(s => s.name === 'Pottery' && Number(s.experience_years) === 15));
  assert.ok(resCreatorSkills.rows.some(s => s.name === 'Mathematics Teaching' && Number(s.experience_years) === 3));

  const resLoc = await pool.query(`SELECT * FROM locations WHERE creator_profile_id = $1;`, [profileId]);
  console.log('\nRetrieved structured location:');
  console.table(resLoc.rows);
  assert.strictEqual(resLoc.rows.length, 1);
  assert.strictEqual(resLoc.rows[0].city, 'Chennai');

  console.log('\n========================================================');
  console.log('✅ ALL NORMALIZED RELATIONAL DB TESTS PASSED!');
  console.log('========================================================\n');
}

testDatabase().catch(err => {
  console.error('❌ DB Test failed:', err);
  process.exit(1);
});
