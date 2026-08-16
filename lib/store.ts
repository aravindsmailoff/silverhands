import { User, GuardianLink, Listing, RequestItem, Payment, Rating } from './types';

// Storage fallback for new dynamic accounts
const MOCK_USERS: User[] = [];
const MOCK_GUARDIAN_LINKS: GuardianLink[] = [];
const MOCK_LISTINGS: Listing[] = [];
const MOCK_REQUESTS: RequestItem[] = [];
const MOCK_PAYMENTS: Payment[] = [];
const MOCK_RATINGS: Rating[] = [];

// Stateful memory store clean client/server object
export const memoryStore = {
  users: [...MOCK_USERS],
  guardianLinks: [...MOCK_GUARDIAN_LINKS],
  listings: [...MOCK_LISTINGS],
  requests: [...MOCK_REQUESTS],
  payments: [...MOCK_PAYMENTS],
  ratings: [...MOCK_RATINGS]
};

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
