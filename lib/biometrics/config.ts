/**
 * Face verification threshold configuration.
 *
 * IMPORTANT: Do not assume 0.85 is valid for every embedding model.
 * Calibrate FACE_SIMILARITY_THRESHOLD using held-out validation data
 * for the selected model (silverhands-v1-block128 or future providers).
 */
export const FACE_MODEL_VERSION = 'silverhands-v1-block128';

/** Cosine similarity threshold — tune per model + validation set. */
export const FACE_SIMILARITY_THRESHOLD = Number(
  process.env.FACE_SIMILARITY_THRESHOLD ?? '0.82'
);

/** Biometric verification session TTL (seconds). */
export const BIOMETRIC_SESSION_TTL_SECONDS = Number(
  process.env.BIOMETRIC_SESSION_TTL_SECONDS ?? '300'
);

/** Max face verification attempts per provider per window. */
export const FACE_VERIFY_RATE_LIMIT = Number(
  process.env.FACE_VERIFY_RATE_LIMIT ?? '10'
);

export const FACE_VERIFY_RATE_WINDOW_MS = 15 * 60 * 1000;
