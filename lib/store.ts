import { User, GuardianLink, Listing, RequestItem, Payment, Rating } from './types';

// Global in-memory storage fallback for initial demonstration & unconfigured DB state
const MOCK_USERS: User[] = [
  { id: 'usr-senior-1', name: 'Savitri Devi', phone: '+91 98765 43210', role: 'senior', language_pref: 'hi' },
  { id: 'usr-senior-2', name: 'Ramesh Sharma', phone: '+91 98111 22334', role: 'senior', language_pref: 'en' },
  { id: 'usr-senior-3', name: 'Kamla Patel', phone: '+91 99222 33445', role: 'senior', language_pref: 'gu' },
  { id: 'usr-buyer-1', name: 'Aarav Mehta', phone: '+91 97777 88888', role: 'buyer', language_pref: 'en' },
  { id: 'usr-guardian-1', name: 'Vikram Devi (Son)', phone: '+91 98765 43211', role: 'guardian', language_pref: 'hi' }
];

const MOCK_GUARDIAN_LINKS: GuardianLink[] = [
  { id: 'glink-1', senior_user_id: 'usr-senior-1', guardian_user_id: 'usr-guardian-1', relationship: 'Son', approval_threshold_amount: 500 }
];

const MOCK_LISTINGS: Listing[] = [
  {
    id: 'lst-1',
    owner_user_id: 'usr-senior-1',
    owner_name: 'Savitri Devi',
    type: 'skill',
    title: 'Authentic Rajasthani Dal Baati & Gatte ki Sabzi Cooking Workshop',
    description: 'Learn ancestral secrets of wood-fired Rajasthani cooking. 45 years of home cooking experience shared step-by-step.',
    price: 450,
    unit: 'session',
    lat: 28.6139,
    lng: 77.2090,
    locality_label: 'Connaught Place, New Delhi (~500m area)',
    status: 'live',
    category: 'cooking'
  },
  {
    id: 'lst-2',
    owner_user_id: 'usr-senior-2',
    owner_name: 'Ramesh Sharma',
    type: 'skill',
    title: 'Handcrafted Wooden Toys & Organic Bonsai Gardening Masterclass',
    description: 'Learn organic soil preparation, pruning techniques, and crafting miniature wooden toys for kids using natural neem wood.',
    price: 350,
    unit: 'session',
    lat: 28.6250,
    lng: 77.2180,
    locality_label: 'Bengali Market, New Delhi (~500m area)',
    status: 'live',
    category: 'gardening'
  },
  {
    id: 'lst-3',
    owner_user_id: 'usr-senior-3',
    owner_name: 'Kamla Patel',
    type: 'product',
    title: 'Hand-Embroidered Bandhani Dupatta & Kurti Covers',
    description: '100% pure cotton hand-stitched Bandhani work with intricate Mirrorwork borders. Made with love and precision.',
    price: 850,
    unit: 'item',
    lat: 28.6012,
    lng: 77.2210,
    locality_label: 'Khan Market, New Delhi (~500m area)',
    status: 'live',
    category: 'handicrafts'
  },
  {
    id: 'lst-4',
    owner_user_id: 'usr-senior-1',
    owner_name: 'Savitri Devi',
    type: 'product',
    title: 'Homemade Organic Amla & Mango Pickle (500g Jar)',
    description: 'Traditional sun-dried pickle made with cold-pressed mustard oil, rock salt, and home-ground spices.',
    price: 280,
    unit: 'item',
    lat: 28.6145,
    lng: 77.2105,
    locality_label: 'Connaught Place, New Delhi (~500m area)',
    status: 'live',
    category: 'cooking'
  },
  {
    id: 'lst-5',
    owner_user_id: 'usr-senior-2',
    owner_name: 'Ramesh Sharma',
    type: 'skill',
    title: 'Vedic Mathematics & Speed Calculation Tutoring for Kids',
    description: 'Retired Math teacher with 38 years experience. Help your children master mental calculations without calculators.',
    price: 500,
    unit: 'session',
    lat: 28.6300,
    lng: 77.2150,
    locality_label: 'Barakhamba Road, New Delhi (~500m area)',
    status: 'live',
    category: 'tutoring'
  }
];

const MOCK_REQUESTS: RequestItem[] = [
  {
    id: 'req-101',
    listing_id: 'lst-1',
    listing_title: 'Authentic Rajasthani Dal Baati & Gatte ki Sabzi Cooking Workshop',
    listing_type: 'skill',
    listing_price: 450,
    listing_unit: 'session',
    buyer_user_id: 'usr-buyer-1',
    buyer_name: 'Aarav Mehta',
    buyer_phone: '+91 97777 88888',
    senior_name: 'Savitri Devi',
    type: 'learn_request',
    status: 'pending',
    created_at: new Date(Date.now() - 3600000).toISOString(),
    scheduled_time: 'Tomorrow, 4:00 PM',
    notes: 'Would love to learn the thali preparation for a family dinner!'
  }
];

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
