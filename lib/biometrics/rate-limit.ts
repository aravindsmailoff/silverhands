import { FACE_VERIFY_RATE_LIMIT, FACE_VERIFY_RATE_WINDOW_MS } from './config';

const attempts = new Map<string, { count: number; windowStart: number }>();

export function checkFaceVerifyRateLimit(providerId: string): {
  allowed: boolean;
  retryAfterMs?: number;
} {
  const now = Date.now();
  const entry = attempts.get(providerId);

  if (!entry || now - entry.windowStart > FACE_VERIFY_RATE_WINDOW_MS) {
    attempts.set(providerId, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count >= FACE_VERIFY_RATE_LIMIT) {
    return {
      allowed: false,
      retryAfterMs: FACE_VERIFY_RATE_WINDOW_MS - (now - entry.windowStart),
    };
  }

  entry.count += 1;
  return { allowed: true };
}
