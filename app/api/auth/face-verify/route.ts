import { NextResponse } from 'next/server';
import { getPool, initDatabaseSchema } from '@/lib/db';
import { verifyLiveCapture } from '@/lib/biometrics/face-pipeline';
import { createBiometricSessionToken } from '@/lib/biometrics/session';
import { checkFaceVerifyRateLimit } from '@/lib/biometrics/rate-limit';
import crypto from 'crypto';

function resolveProviderId(req: Request, body: { providerId?: string; userName?: string }): string | null {
  const headerId = req.headers.get('x-provider-id');
  if (headerId) return headerId;
  if (body.providerId) return body.providerId;
  if (body.userName) return body.userName.trim().toLowerCase().replace(/\s+/g, '_');
  return null;
}

function hashIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for') || 'local';
  return crypto.createHash('sha256').update(forwarded).digest('hex').slice(0, 32);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { capturePayload, livenessPassed } = body;

    const providerId = resolveProviderId(req, body);
    if (!providerId) {
      return NextResponse.json({ success: false, message: 'Please sign in as a provider first.' }, { status: 401 });
    }

    const rate = checkFaceVerifyRateLimit(providerId);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: 'Too many verification attempts. Please wait a few minutes and try again.',
          retryAfterMs: rate.retryAfterMs,
        },
        { status: 429 }
      );
    }

    if (!livenessPassed) {
      return NextResponse.json(
        { success: false, verified: false, reason: 'Liveness check did not pass. A still photo cannot be used.' },
        { status: 400 }
      );
    }

    const pool = await getPool();
    if (!pool) {
      return NextResponse.json({ success: false, message: 'Service temporarily unavailable.' }, { status: 503 });
    }

    await initDatabaseSchema();

    const bioRes = await pool.query(
      `SELECT embedding, model_version FROM provider_biometric_records
       WHERE provider_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1`,
      [providerId]
    );

    if (bioRes.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          verified: false,
          reason: 'No face profile enrolled yet. Please complete face enrollment first.',
        },
        { status: 404 }
      );
    }

    const result = verifyLiveCapture(capturePayload, bioRes.rows[0].embedding);

    await pool.query(
      `INSERT INTO biometric_audit_log (id, provider_id, action, success, trust_score, ip_hash)
       VALUES ($1, $2, 'verify', $3, $4, $5)`,
      [`audit_${Date.now()}`, providerId, result.verified, result.trustScore, hashIp(req)]
    );

    if (!result.verified) {
      return NextResponse.json({
        success: false,
        verified: false,
        trustScore: result.trustScore,
        reason: result.reason,
      });
    }

    const { token, context } = createBiometricSessionToken(providerId, result.trustScore);

    return NextResponse.json({
      success: true,
      verified: true,
      trustScore: result.trustScore,
      reason: result.reason,
      biometricSessionToken: token,
      session: context,
    });
  } catch (err: unknown) {
    console.error('[face-verify]', err);
    return NextResponse.json(
      { success: false, verified: false, reason: 'Face verification failed. Please try again.' },
      { status: 500 }
    );
  }
}

/** Server-side validation of an existing biometric session token. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  const providerId = searchParams.get('providerId') || req.headers.get('x-provider-id');

  if (!token || !providerId) {
    return NextResponse.json({ valid: false, reason: 'Token and provider ID required.' }, { status: 400 });
  }

  const { verifyBiometricSessionToken } = await import('@/lib/biometrics/session');
  const check = verifyBiometricSessionToken(token, providerId);
  return NextResponse.json(check);
}
