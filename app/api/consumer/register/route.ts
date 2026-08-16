import { NextResponse } from 'next/server';
import { getPool, initDatabaseSchema } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, username, password, location } = body;

    if (!email || !username || !password) {
      return NextResponse.json({ success: false, error: 'Email, username, and password are required' }, { status: 400 });
    }

    const pool = await getPool();
    if (!pool) {
      return NextResponse.json({ success: false, error: 'Database connection not available' }, { status: 500 });
    }

    // Ensure database tables exist
    await initDatabaseSchema();

    // Check if user already exists
    const checkRes = await pool.query('SELECT id FROM consumers WHERE email = $1', [email.trim().toLowerCase()]);
    if (checkRes.rows.length > 0) {
      return NextResponse.json({ success: false, error: 'A user with this email address already exists' }, { status: 400 });
    }

    const userId = 'usr-' + Date.now();
    const sql = `
      INSERT INTO consumers (id, username, email, password_hash, location)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, username, email, location, created_at
    `;
    const result = await pool.query(sql, [
      userId,
      username.trim(),
      email.trim().toLowerCase(),
      password,
      location || null
    ]);

    const newUser = result.rows[0];
    return NextResponse.json({ success: true, user: newUser });
  } catch (err: any) {
    console.error('[Consumer Register Error]:', err);
    return NextResponse.json({ success: false, error: err.message || 'Error occurred during registration' }, { status: 500 });
  }
}
