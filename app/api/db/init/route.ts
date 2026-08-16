import { NextResponse } from 'next/server';
import { initDatabaseSchema, getPool } from '@/lib/db';

export async function GET() {
  try {
    const result = await initDatabaseSchema();
    const pool = await getPool();

    let tableList: string[] = [];
    if (pool && result.success) {
      const res = await pool.query(`
        SELECT table_name 
        from information_schema.tables 
        WHERE table_schema = 'public';
      `);
      tableList = res.rows.map((r: any) => r.table_name);
    }

    return NextResponse.json({
      success: result.success,
      message: result.message,
      database_url_configured: Boolean(process.env.DATABASE_URL),
      tables: tableList
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message || 'Failed to initialize database'
    }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
