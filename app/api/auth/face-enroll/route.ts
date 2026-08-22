import { NextResponse } from 'next/server';
import { getPool, initDatabaseSchema } from '@/lib/db';
import { embeddingFromClientPayload } from '@/lib/biometrics/face-pipeline';
import { FACE_MODEL_VERSION } from '@/lib/biometrics/config';

function resolveProviderId(req: Request, body: { providerId?: string; userName?: string }): string | null {
  const headerId = req.headers.get('x-provider-id');
  if (headerId) return headerId;
  if (body.providerId) return body.providerId;
  if (body.userName) return body.userName.trim().toLowerCase().replace(/\s+/g, '_');
  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { capturePayload, livenessPassed } = body;

    if (!livenessPassed) {
      return NextResponse.json(
        { success: false, message: 'Please complete the liveness check before enrolling your face.' },
        { status: 400 }
      );
    }

    const providerId = resolveProviderId(req, body);
    if (!providerId) {
      return NextResponse.json({ success: false, message: 'Provider identity is required.' }, { status: 401 });
    }

    const embeddingResult = embeddingFromClientPayload(capturePayload);
    if (!embeddingResult) {
      return NextResponse.json(
        { success: false, message: 'We could not process your face photo. Please try again with better lighting.' },
        { status: 400 }
      );
    }

    const pool = await getPool();
    if (!pool) {
      return NextResponse.json({ success: false, message: 'Database unavailable.' }, { status: 503 });
    }

    await initDatabaseSchema();

    const recordId = `bio_${providerId}_${Date.now()}`;
    const embeddingJson = JSON.stringify(embeddingResult.embedding);

    await pool.query(
      `UPDATE provider_biometric_records SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE provider_id = $1`,
      [providerId]
    );

    await pool.query(
      `INSERT INTO provider_biometric_records
        (id, provider_id, embedding, model_version, enrollment_version, is_active)
       VALUES ($1, $2, $3, $4,
         COALESCE((SELECT MAX(enrollment_version) + 1 FROM provider_biometric_records WHERE provider_id = $2), 1),
         true)`,
      [recordId, providerId, embeddingJson, FACE_MODEL_VERSION]
    );

    await pool.query(
      `INSERT INTO biometric_audit_log (id, provider_id, action, success, trust_score)
       VALUES ($1, $2, 'enroll', true, 1.0)`,
      [`audit_${Date.now()}`, providerId]
    );

    return NextResponse.json({
      success: true,
      message: 'Face enrolled successfully.',
      modelVersion: FACE_MODEL_VERSION,
    });
  } catch (err: unknown) {
    console.error('[face-enroll]', err);
    return NextResponse.json(
      { success: false, message: 'Face enrollment failed. Please try again.' },
      { status: 500 }
    );
  }
}
