/**
 * Device GPS Location Hook for SilverHands
 * 
 * Uses `navigator.geolocation.watchPosition()` with:
 * - High accuracy GPS configuration
 * - Adaptive movement & accuracy change throttling
 * - Permission and error state management
 * - Strict teardown on unmount
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { LocationCoordinates } from '../location-protocol';

export type LocationPermissionStatus = 'prompt' | 'granted' | 'denied' | 'unavailable';

export interface UseDeviceLocationResult {
  coordinates: LocationCoordinates | null;
  permissionStatus: LocationPermissionStatus;
  isWatching: boolean;
  error: string | null;
  startWatching: () => void;
  stopWatching: () => void;
}

export function useDeviceLocation(autoStart: boolean = false): UseDeviceLocationResult {
  const [coordinates, setCoordinates] = useState<LocationCoordinates | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<LocationPermissionStatus>('prompt');
  const [isWatching, setIsWatching] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const lastCoordsRef = useRef<LocationCoordinates | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);

  // Read cached coordinates on client mount to prevent SSR hydration mismatch
  useEffect(() => {
    try {
      const saved = localStorage.getItem('silverhands_last_coords');
      if (saved) {
        setCoordinates(JSON.parse(saved));
      } else {
        setCoordinates({
          latitude: 13.0820,
          longitude: 80.1843,
          accuracy: 10,
          timestamp: Date.now(),
        });
      }
    } catch (e) {
      setCoordinates({
        latitude: 13.0820,
        longitude: 80.1843,
        accuracy: 10,
        timestamp: Date.now(),
      });
    }
  }, []);

  // Check initial browser permission status if supported
  useEffect(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setPermissionStatus('unavailable');
      setError('Geolocation is not supported by your browser.');
      return;
    }

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName }).then(status => {
        setPermissionStatus(status.state as LocationPermissionStatus);
        status.onchange = () => {
          setPermissionStatus(status.state as LocationPermissionStatus);
        };
      }).catch(() => {
        // Fallback for browsers that don't support query for geolocation
      });
    }
  }, []);

  const handlePositionSuccess = useCallback((pos: GeolocationPosition) => {
    const now = Date.now();
    const newCoords: LocationCoordinates = {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: Math.round(pos.coords.accuracy || 10),
      altitude: pos.coords.altitude,
      heading: pos.coords.heading,
      speed: pos.coords.speed,
      timestamp: pos.timestamp || now,
    };

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('silverhands_last_coords', JSON.stringify(newCoords));
      } catch (e) {}
    }

    const prev = lastCoordsRef.current;
    if (prev) {
      // Adaptive throttling: if time difference is < 250ms, skip
      if (now - lastUpdateTimeRef.current < 250) {
        return;
      }

      // If moved less than ~1.5 meters and accuracy did not significantly change, avoid excessive renders
      const latDiff = Math.abs(newCoords.latitude - prev.latitude);
      const lonDiff = Math.abs(newCoords.longitude - prev.longitude);
      const accDiff = Math.abs(newCoords.accuracy - prev.accuracy);

      if (latDiff < 0.000015 && lonDiff < 0.000015 && accDiff < 5 && now - lastUpdateTimeRef.current < 3000) {
        return;
      }
    }

    lastCoordsRef.current = newCoords;
    lastUpdateTimeRef.current = now;
    setCoordinates(newCoords);
    setPermissionStatus('granted');
    setError(null);
  }, []);

  const handlePositionError = useCallback((err: GeolocationPositionError) => {
    switch (err.code) {
      case err.PERMISSION_DENIED:
        setPermissionStatus('denied');
        setError('Location permission was denied. Please allow location access in your browser settings.');
        break;
      case err.POSITION_UNAVAILABLE:
        setError('GPS position is currently unavailable.');
        break;
      case err.TIMEOUT:
        setError('Location request timed out. Retrying GPS lock...');
        break;
      default:
        setError(err.message || 'An unknown error occurred while retrieving GPS coordinates.');
    }
  }, []);

  const startWatching = useCallback(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setPermissionStatus('unavailable');
      setError('Geolocation is not supported by your browser.');
      return;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    setIsWatching(true);
    setError(null);

    // Initial rapid position fetch
    navigator.geolocation.getCurrentPosition(handlePositionSuccess, handlePositionError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });

    // Continuous continuous watch
    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePositionSuccess,
      handlePositionError,
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 1000,
      }
    );
  }, [handlePositionSuccess, handlePositionError]);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsWatching(false);
  }, []);

  useEffect(() => {
    if (autoStart) {
      startWatching();
    }
    return () => {
      stopWatching();
    };
  }, [autoStart, startWatching, stopWatching]);

  return {
    coordinates,
    permissionStatus,
    isWatching,
    error,
    startWatching,
    stopWatching,
  };
}
