/**
 * Location Smoothing and Interpolation Engine for SilverHands
 * 
 * Provides:
 * - Linear interpolation (LERP) between coordinate updates to eliminate GPS marker jitter
 * - Smooth transition calculation for map markers
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export function lerpCoordinate(start: LatLng, end: LatLng, fraction: number): LatLng {
  const f = Math.max(0, Math.min(1, fraction));
  return {
    lat: start.lat + (end.lat - start.lat) * f,
    lng: start.lng + (end.lng - start.lng) * f,
  };
}

export class MarkerSmoother {
  private currentPos: LatLng;
  private targetPos: LatLng;
  private startTime: number = 0;
  private durationMs: number = 600;
  private animFrameId: number | null = null;
  private onUpdate: (pos: LatLng) => void;

  constructor(initialPos: LatLng, onUpdate: (pos: LatLng) => void, durationMs: number = 600) {
    this.currentPos = { ...initialPos };
    this.targetPos = { ...initialPos };
    this.durationMs = durationMs;
    this.onUpdate = onUpdate;
  }

  public setTarget(newTarget: LatLng): void {
    // If distance is massive (e.g. initial teleport), snap directly without smoothing
    const latDiff = Math.abs(newTarget.lat - this.currentPos.lat);
    const lngDiff = Math.abs(newTarget.lng - this.currentPos.lng);

    if (latDiff > 0.5 || lngDiff > 0.5) {
      this.currentPos = { ...newTarget };
      this.targetPos = { ...newTarget };
      this.onUpdate(this.currentPos);
      return;
    }

    this.targetPos = { ...newTarget };
    this.startTime = performance.now();
    this.startAnimation();
  }

  private startAnimation(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }

    const animate = (now: number) => {
      const elapsed = now - this.startTime;
      const progress = Math.min(1, elapsed / this.durationMs);

      // Ease out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const interpolated = lerpCoordinate(this.currentPos, this.targetPos, easeProgress);

      this.onUpdate(interpolated);

      if (progress < 1) {
        this.animFrameId = requestAnimationFrame(animate);
      } else {
        this.currentPos = { ...this.targetPos };
        this.animFrameId = null;
      }
    };

    this.animFrameId = requestAnimationFrame(animate);
  }

  public destroy(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }
}
