import { FACE_MODEL_VERSION, FACE_SIMILARITY_THRESHOLD } from './config';

export interface FaceVerificationResult {
  verified: boolean;
  trustScore: number;
  reason: string;
}

export interface FaceEmbeddingResult {
  embedding: number[];
  modelVersion: string;
}

const EMBEDDING_DIM = 128;

/**
 * Decode a base64 JPEG/PNG data URL or raw base64 into RGBA pixel buffer (server-side).
 * Uses a minimal PNG/JPEG decode via sharp-less approach: expects pre-processed pixel arrays from client
 * or base64 that can be parsed. For data URLs we extract dimensions from client-supplied landmarks when available.
 */
export function parseBase64ImageData(imageBase64: string): {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
} | null {
  try {
    const raw = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const binary = Buffer.from(raw, 'base64');

    // Minimal BMP-less decode: client sends normalized 64x64 RGBA as base64 length check
    // If buffer looks like raw RGBA (64*64*4 = 16384 bytes), use directly
    const size = 64;
    const expected = size * size * 4;
    if (binary.length === expected) {
      return {
        pixels: new Uint8ClampedArray(binary),
        width: size,
        height: size,
      };
    }

    // Fallback: treat as grayscale block features from client pixel payload JSON
    return null;
  } catch {
    return null;
  }
}

/**
 * Generate a normalized 128-dim embedding from aligned face pixel data.
 * Block-mean + gradient features — replaceable with a stronger model provider later.
 */
export function generateFaceEmbedding(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): FaceEmbeddingResult {
  const blockRows = 8;
  const blockCols = 16;
  const blockH = Math.floor(height / blockRows);
  const blockW = Math.floor(width / blockCols);
  const features: number[] = [];

  for (let by = 0; by < blockRows; by++) {
    for (let bx = 0; bx < blockCols; bx++) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let grad = 0;
      let count = 0;

      for (let py = 0; py < blockH; py++) {
        for (let px = 0; px < blockW; px++) {
          const x = bx * blockW + px;
          const y = by * blockH + py;
          const idx = (y * width + x) * 4;
          const r = pixels[idx];
          const g = pixels[idx + 1];
          const b = pixels[idx + 2];
          sumR += r;
          sumG += g;
          sumB += b;
          if (px > 0) {
            const prev = (y * width + (x - 1)) * 4;
            grad += Math.abs(r - pixels[prev]);
          }
          count++;
        }
      }

      features.push(sumR / count / 255);
      features.push(sumG / count / 255);
      features.push(sumB / count / 255);
      features.push(grad / (count * 255));
    }
  }

  // Pad or trim to EMBEDDING_DIM
  while (features.length < EMBEDDING_DIM) features.push(0);
  const embedding = normalizeVector(features.slice(0, EMBEDDING_DIM));

  return { embedding, modelVersion: FACE_MODEL_VERSION };
}

export function embeddingFromClientPayload(payload: {
  pixels?: number[];
  width?: number;
  height?: number;
}): FaceEmbeddingResult | null {
  if (!payload.pixels || !payload.width || !payload.height) return null;
  const arr = new Uint8ClampedArray(payload.pixels);
  return generateFaceEmbedding(arr, payload.width, payload.height);
}

function normalizeVector(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export function parseStoredEmbedding(raw: string): number[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'number')) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function compareFaceEmbeddings(
  live: number[],
  enrolled: number[],
  threshold: number = FACE_SIMILARITY_THRESHOLD
): FaceVerificationResult {
  const trustScore = cosineSimilarity(live, enrolled);

  if (trustScore >= threshold) {
    return {
      verified: true,
      trustScore,
      reason: 'Face match within configured threshold.',
    };
  }

  return {
    verified: false,
    trustScore,
    reason: 'Face did not match the enrolled profile. Please try again in good lighting.',
  };
}

export function verifyLiveCapture(
  livePayload: { pixels?: number[]; width?: number; height?: number },
  enrolledEmbeddingJson: string,
  threshold?: number
): FaceVerificationResult {
  const liveResult = embeddingFromClientPayload(livePayload);
  if (!liveResult) {
    return { verified: false, trustScore: 0, reason: 'Could not process face capture.' };
  }

  const enrolled = parseStoredEmbedding(enrolledEmbeddingJson);
  if (!enrolled) {
    return { verified: false, trustScore: 0, reason: 'No enrolled face profile found.' };
  }

  return compareFaceEmbeddings(liveResult.embedding, enrolled, threshold);
}
