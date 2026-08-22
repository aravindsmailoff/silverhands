/**
 * Consumer-Side Geofencing and Location Privacy Service for SilverHands
 * 
 * Provides:
 * - 500m grid coordinate masking for senior privacy protection
 * - Local Haversine distance calculations
 * - Consumer-side geofencing filters for providers and products
 */

// Round coordinate to ~500m grid for privacy
export function roundTo500mGrid(val: number): number {
  return Math.round(val * 200) / 200;
}

// Haversine formula calculation in kilometers
export function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

// Approximate city center coordinates in India for local distance queries
export const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  chennai: { lat: 13.0827, lng: 80.2707 },
  coimbatore: { lat: 11.0168, lng: 76.9558 },
  madurai: { lat: 9.9252, lng: 78.1198 },
  bangalore: { lat: 12.9716, lng: 77.5946 },
  bengaluru: { lat: 12.9716, lng: 77.5946 },
  hyderabad: { lat: 17.3850, lng: 78.4867 },
  mumbai: { lat: 19.0760, lng: 72.8777 },
  delhi: { lat: 28.7041, lng: 77.1025 },
  kolkata: { lat: 22.5726, lng: 88.3639 },
  pune: { lat: 18.5204, lng: 73.8567 },
  jaipur: { lat: 26.9124, lng: 75.7873 },
  ahmedabad: { lat: 23.0225, lng: 72.5714 },
  kochi: { lat: 9.9312, lng: 76.2673 },
};

export function getApproximateCityCoords(cityNameOrLocation: string): { lat: number; lng: number } {
  const q = (cityNameOrLocation || '').toLowerCase().trim();
  for (const [city, coords] of Object.entries(CITY_COORDINATES)) {
    if (q.includes(city)) {
      return {
        lat: roundTo500mGrid(coords.lat),
        lng: roundTo500mGrid(coords.lng)
      };
    }
  }
  // Default to Chennai coordinates
  return { lat: 13.08, lng: 80.27 };
}

export function filterByGeofence<T extends { location?: string; creator_location?: string; lat?: number; lng?: number }>(
  items: T[],
  consumerCityOrCoords: string | { lat: number; lng: number },
  maxRadiusKm: number = 50
): T[] {
  let targetCoords: { lat: number; lng: number };

  if (typeof consumerCityOrCoords === 'string') {
    targetCoords = getApproximateCityCoords(consumerCityOrCoords);
  } else {
    targetCoords = consumerCityOrCoords;
  }

  const results: Array<T & { distanceKm: number }> = [];

  for (const item of items) {
    const locStr = item.location || item.creator_location || '';
    const itemCoords = (item.lat && item.lng)
      ? { lat: item.lat, lng: item.lng }
      : getApproximateCityCoords(locStr);

    const dist = calculateHaversineDistance(
      targetCoords.lat,
      targetCoords.lng,
      itemCoords.lat,
      itemCoords.lng
    );

    if (dist <= maxRadiusKm) {
      results.push({ ...item, distanceKm: dist });
    }
  }

  return results.sort((a, b) => a.distanceKm - b.distanceKm);
}
