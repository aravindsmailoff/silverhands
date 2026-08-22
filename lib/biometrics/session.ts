import crypto from 'crypto';
import { BIOMETRIC_SESSION_TTL_SECONDS } from './config';

export interface BiometricSessionPayload {
  providerId: string;
  biometricVerified: true;
  trustScore: number;
  verifiedAt: string;
  expiresAt: string;
  nonce: string;
}

const SESSION_PREFIX = 'bvs1';

function getSigningSecret(): string {
  const secret = process.env.BIOMETRIC_SESSION_SECRET || process.env.GEMINI_API_KEY;
  if (!secret) {
    throw new Error('BIOMETRIC_SESSION_SECRET is not configured.');
  }
  return secret;
}

function sign(data: string): string {
  return crypto.createHmac('sha256', getSigningSecret()).update(data).digest('base64url');
}

export function createBiometricSessionToken(
  providerId: string,
  trustScore: number
): { token: string; context: BiometricSessionPayload } {
  const now = Date.now();
  const verifiedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + BIOMETRIC_SESSION_TTL_SECONDS * 1000).toISOString();
  const nonce = crypto.randomBytes(16).toString('hex');

  const payload: BiometricSessionPayload = {
    providerId,
    biometricVerified: true,
    trustScore,
    verifiedAt,
    expiresAt,
    nonce,
  };

  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sign(`${SESSION_PREFIX}.${body}`);
  const token = `${SESSION_PREFIX}.${body}.${signature}`;

  return { token, context: payload };
}

export function verifyBiometricSessionToken(
  token: string,
  expectedProviderId: string
): { valid: boolean; payload?: BiometricSessionPayload; reason?: string } {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== SESSION_PREFIX) {
      return { valid: false, reason: 'Invalid token format.' };
    }

    const [, body, signature] = parts;
    const expectedSig = sign(`${SESSION_PREFIX}.${body}`);
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false, reason: 'Invalid token signature.' };
    }

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as BiometricSessionPayload;

    if (payload.providerId !== expectedProviderId) {
      return { valid: false, reason: 'Token not bound to this provider.' };
    }

    if (new Date(payload.expiresAt).getTime() < Date.now()) {
      return { valid: false, reason: 'Biometric session has expired. Please verify your face again.' };
    }

    if (payload.biometricVerified !== true) {
      return { valid: false, reason: 'Biometric verification flag invalid.' };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, reason: 'Could not verify biometric session.' };
  }
}

/** In-memory replay protection for consumed nonces (production: use Redis). */
const consumedNonces = new Map<string, number>();

export function consumeBiometricNonce(nonce: string): boolean {
  const now = Date.now();
  for (const [k, exp] of consumedNonces) {
    if (exp < now) consumedNonces.delete(k);
  }
  if (consumedNonces.has(nonce)) return false;
  consumedNonces.set(nonce, now + BIOMETRIC_SESSION_TTL_SECONDS * 1000);
  return true;
}
