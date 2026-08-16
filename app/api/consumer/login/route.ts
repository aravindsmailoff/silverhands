import { NextResponse } from 'next/server';
import { getPool, initDatabaseSchema } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ success: false, error: 'Email and password are required' }, { status: 400 });
    }

    const pool = await getPool();
    if (!pool) {
      return NextResponse.json({ success: false, error: 'Database connection not available' }, { status: 500 });
    }

    // Ensure database tables exist
    await initDatabaseSchema();

    // Query consumer credentials
    const sql = `
      SELECT id, username, email, password_hash, location, created_at
      FROM consumers
      WHERE email = $1
    `;
    const result = await pool.query(sql, [email.trim().toLowerCase()]);
    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Invalid email or password' }, { status: 400 });
    }

    const user = result.rows[0];
    if (user.password_hash !== password) {
      return NextResponse.json({ success: false, error: 'Invalid email or password' }, { status: 400 });
    }

    // Don't send password hash back
    const { password_hash, ...safeUser } = user;
    return NextResponse.json({ success: true, user: safeUser });
  } catch (err: any) {
    console.error('[Consumer Login Error]:', err);
    return NextResponse.json({ success: false, error: err.message || 'Error occurred during login' }, { status: 500 });
  }
}
