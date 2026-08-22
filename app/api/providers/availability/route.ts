import { NextResponse } from 'next/server';
import { getPool, initDatabaseSchema } from '@/lib/db';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatSlot(dayOfWeek: number, startTime: string, endTime: string): string {
  const day = DAY_NAMES[dayOfWeek] ?? 'Day';
  const start = String(startTime).slice(0, 5);
  const end = String(endTime).slice(0, 5);
  return `${day} ${start} – ${end}`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const providerId = searchParams.get('providerId');

  if (!providerId) {
    return NextResponse.json({ success: false, message: 'providerId is required' }, { status: 400 });
  }

  const pool = await getPool();
  if (!pool) {
    return NextResponse.json({ success: true, slots: [], formatted: [] });
  }

  await initDatabaseSchema();

  const res = await pool.query(
    `SELECT id, day_of_week, start_time, end_time, timezone
     FROM provider_availability
     WHERE provider_id = $1 AND is_active = true
     ORDER BY day_of_week, start_time`,
    [providerId]
  );

  const formatted = res.rows.map((row: { id: string; day_of_week: number; start_time: string; end_time: string; timezone: string }) => ({
    id: row.id,
    label: formatSlot(Number(row.day_of_week), row.start_time, row.end_time),
    day_of_week: row.day_of_week,
    start_time: row.start_time,
    end_time: row.end_time,
    timezone: row.timezone,
  }));

  return NextResponse.json({ success: true, slots: res.rows, formatted });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { providerId, dayOfWeek, startTime, endTime, timezone } = body;

    if (!providerId || dayOfWeek === undefined || !startTime || !endTime) {
      return NextResponse.json({ success: false, message: 'Missing required fields.' }, { status: 400 });
    }

    const pool = await getPool();
    if (!pool) {
      return NextResponse.json({ success: false, message: 'Database unavailable.' }, { status: 503 });
    }

    await initDatabaseSchema();

    const id = `avail_${providerId}_${dayOfWeek}_${Date.now()}`;
    await pool.query(
      `INSERT INTO provider_availability (id, provider_id, day_of_week, start_time, end_time, timezone)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, providerId, dayOfWeek, startTime, endTime, timezone || 'Asia/Kolkata']
    );

    return NextResponse.json({ success: true, id, label: formatSlot(dayOfWeek, startTime, endTime) });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : 'Failed to save availability.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const providerId = searchParams.get('providerId');

  if (!id || !providerId) {
    return NextResponse.json({ success: false, message: 'id and providerId required.' }, { status: 400 });
  }

  const pool = await getPool();
  if (!pool) {
    return NextResponse.json({ success: false, message: 'Database unavailable.' }, { status: 503 });
  }

  await pool.query(
    `UPDATE provider_availability SET is_active = false, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND provider_id = $2`,
    [id, providerId]
  );

  return NextResponse.json({ success: true });
}
