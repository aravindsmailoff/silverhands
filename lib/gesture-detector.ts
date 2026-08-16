/**
 * gesture-detector.ts
 * Orientation-agnostic gesture detection for video recording control.
 * Works with mirrored webcam. No hardcoded "left" or "right" hand.
 */

export interface HandResult {
  landmarks: { x: number; y: number; z: number }[];
}

/** Returns normalised direction vector from wrist (lm[0]) to middle fingertip (lm[12]) */
function handDirection(lm: { x: number; y: number }[]) {
  const dx = lm[12].x - lm[0].x;
  const dy = lm[12].y - lm[0].y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: dx / len, y: dy / len };
}

/** True if all 4 fingers (not thumb) are extended */
function allFingersExtended(lm: { x: number; y: number }[]): boolean {
  const pairs: [number, number][] = [[8, 6], [12, 10], [16, 14], [20, 18]];
  return pairs.every(([tip, pip]) => lm[tip].y < lm[pip].y - 0.03);
}

/** True if thumb is clearly pointing up */
function thumbUp(lm: { x: number; y: number }[]): boolean {
  return lm[4].y < lm[3].y - 0.04 && lm[4].y < lm[0].y - 0.08;
}

/** True if all 4 fingers are curled */
function allFingersCurled(lm: { x: number; y: number }[]): boolean {
  const pairs: [number, number][] = [[8, 6], [12, 10], [16, 14], [20, 18]];
  return pairs.every(([tip, pip]) => lm[tip].y > lm[pip].y + 0.02);
}

// ─── GESTURE 1: BOTH THUMBS UP (Start recording) ─────────────────────────────

/**
 * Detects both hands showing thumbs-up simultaneously.
 * Requires multiHandLandmarks.length >= 2
 */
export function detectBothThumbs(results: any): boolean {
  const hands: any[][] = results?.multiHandLandmarks;
  if (!hands || hands.length < 2) return false;
  return hands.every(lm => thumbUp(lm) && allFingersCurled(lm));
}

// ─── GESTURE 2: T-SHAPE (Pause / Resume) ─────────────────────────────────────

/**
 * Detects the T-shape (time-out) gesture:
 * - One hand pointing mostly vertical (wrist→middle pointing up or down)
 * - Other hand pointing mostly horizontal (left or right)
 * - Horizontal hand's wrist is at or below the vertical hand's fingertip Y
 * 
 * Fully orientation-agnostic: works with either hand in either role, mirrored.
 */
export function detectTshape(results: any): boolean {
  const hands: any[][] = results?.multiHandLandmarks;
  if (!hands || hands.length < 2) return false;

  const VERTICAL_THRESHOLD = 0.75;   // |dy| must be this large to be "vertical"
  const HORIZONTAL_THRESHOLD = 0.75; // |dx| must be this large to be "horizontal"

  for (let i = 0; i < 2; i++) {
    const a = hands[i];
    const b = hands[1 - i];

    const dirA = handDirection(a);
    const dirB = handDirection(b);

    const aIsVertical   = Math.abs(dirA.y) > VERTICAL_THRESHOLD;
    const bIsHorizontal = Math.abs(dirB.x) > HORIZONTAL_THRESHOLD;

    if (aIsVertical && bIsHorizontal) {
      // Horizontal hand's wrist must be at or below vertical hand's middle fingertip
      const verticalTipY = a[12].y;
      const horizontalWristY = b[0].y;
      if (horizontalWristY >= verticalTipY - 0.08) return true;
    }
  }
  return false;
}

// ─── GESTURE 3: BOTH OPEN PALMS + SHAKE (Stop recording) ────────────────────

export interface ShakeHistory {
  x: number;
  y: number;
  t: number; // timestamp ms
}

/**
 * Detects both open palms that are shaking (moving).
 * Shake = any single hand centroid moved more than `minMovePx` (normalised 0–1)
 * over the last `windowMs` milliseconds.
 */
export function detectBothOpenShaking(
  results: any,
  history: ShakeHistory[],
  minMove = 0.04,   // normalised distance in 0-1 coordinate space
  windowMs = 600
): boolean {
  const hands: any[][] = results?.multiHandLandmarks;
  if (!hands || hands.length < 2) return false;
  if (!hands.every(lm => allFingersExtended(lm))) return false;

  const now = Date.now();
  const recent = history.filter(h => now - h.t < windowMs);
  if (recent.length < 3) return false;

  // Check if any hand centroid moved enough in the window
  const oldest = recent[0];
  const latest = recent[recent.length - 1];
  const dx = latest.x - oldest.x;
  const dy = latest.y - oldest.y;
  return Math.sqrt(dx * dx + dy * dy) > minMove;
}

/** Call this every frame to maintain the shake history (max 30 entries) */
export function pushShakeHistory(
  results: any,
  history: ShakeHistory[]
): ShakeHistory[] {
  const hands: any[][] = results?.multiHandLandmarks;
  if (!hands || hands.length === 0) return history;

  // Use average centroid of all detected hands
  let sx = 0, sy = 0, count = 0;
  for (const lm of hands) {
    sx += lm[0].x; sy += lm[0].y; count++;
  }
  const next = [...history, { x: sx / count, y: sy / count, t: Date.now() }];
  return next.length > 30 ? next.slice(-30) : next;
}
