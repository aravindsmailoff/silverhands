import { NextResponse } from 'next/server';
import { getPool, initDatabaseSchema } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { providerId, consumerId, availabilityId, slotDate, startTime, endTime, notes } = body;

    if (!providerId || !consumerId || !availabilityId || !slotDate || !startTime || !endTime) {
      return NextResponse.json({ success: false, message: 'Missing booking details.' }, { status: 400 });
    }

    const pool = await getPool();
    if (!pool) {
      return NextResponse.json({ success: false, message: 'Database unavailable.' }, { status: 503 });
    }

    await initDatabaseSchema();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const slotCheck = await client.query(
        `SELECT id FROM provider_appointments
         WHERE provider_id = $1 AND slot_date = $2 AND start_time = $3 AND status != 'cancelled'
         FOR UPDATE`,
        [providerId, slotDate, startTime]
      );

      if (slotCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { success: false, message: 'This appointment slot is already booked. Please choose another time.' },
          { status: 409 }
        );
      }

      const availCheck = await client.query(
        `SELECT id FROM provider_availability WHERE id = $1 AND provider_id = $2 AND is_active = true`,
        [availabilityId, providerId]
      );

      if (availCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ success: false, message: 'This availability slot is no longer offered.' }, { status: 404 });
      }

      const id = `appt_${Date.now()}`;
      await client.query(
        `INSERT INTO provider_appointments
          (id, provider_id, consumer_id, availability_id, slot_date, start_time, end_time, status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed', $8)`,
        [id, providerId, consumerId, availabilityId, slotDate, startTime, endTime, notes || null]
      );

      await client.query('COMMIT');
      return NextResponse.json({ success: true, appointmentId: id, status: 'confirmed' });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    console.error('[appointments]', err);
    return NextResponse.json(
      { success: false, message: 'Could not book appointment. Please try again.' },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const providerId = searchParams.get('providerId');
  const consumerId = searchParams.get('consumerId');

  const pool = await getPool();
  if (!pool) return NextResponse.json({ success: true, appointments: [] });

  await initDatabaseSchema();

  let sql = `SELECT * FROM provider_appointments WHERE 1=1`;
  const params: string[] = [];
  if (providerId) {
    params.push(providerId);
    sql += ` AND provider_id = $${params.length}`;
  }
  if (consumerId) {
    params.push(consumerId);
    sql += ` AND consumer_id = $${params.length}`;
  }
  sql += ' ORDER BY slot_date, start_time';

  const res = await pool.query(sql, params);
  return NextResponse.json({ success: true, appointments: res.rows });
}
