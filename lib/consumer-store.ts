export interface ServiceProvider {
  id: string;
  name: string;
  skill: string;
  category: 'pottery' | 'crafts' | 'cooking' | 'textiles' | 'gardening' | 'art';
  experience_years: number;
  location: string;
  avatar: string;
  bio: string;
  rating: number;
  reviews_count: number;
  hourly_rate: number;
  available_slots: string[];
}

export interface SeniorProduct {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  creator_name: string;
  creator_location: string;
  creator_avatar: string;
  image_url: string;
  rating: number;
  reviews_count: number;
  stock: number;
  is_active: boolean;
}

export interface LiveSession {
  id: string;
  title: string;
  description: string;
  price: number;
  duration_mins: number;
  category: string;
  creator_name: string;
  creator_experience: string;
  creator_location: string;
  creator_avatar: string;
  available_slots: string[];
  session_type: string;
  rating: number;
}

export interface SeniorVideo {
  id: string;
  title: string;
  description: string;
  category: string;
  creator_name: string;
  creator_experience: string;
  creator_location: string;
  creator_avatar: string;
  thumbnail_url: string;
  video_duration: string;
  views_count: number;
  posted_at: string;
  tags: string[];
}

export interface ConsumerUser {
  id: string;
  name?: string;
  username: string;
  email: string;
  password?: string;
  phone?: string;
  location?: string;
  interests?: string[];
  created_at?: string;
}

export interface ConsumerBooking {
  id: string;
  session_id: string;
  session_title: string;
  creator_name: string;
  slot: string;
  price: number;
  booked_at: string;
  status: 'confirmed' | 'completed' | 'cancelled';
}

export const INITIAL_PROVIDERS: ServiceProvider[] = [];
export const INITIAL_PRODUCTS: SeniorProduct[] = [];
export const INITIAL_LIVE_SESSIONS: LiveSession[] = [];

export interface FreeLiveSession {
  id: string;
  title: string;
  description: string;
  category: 'pottery' | 'crafts' | 'cooking' | 'textiles' | 'gardening' | 'art';
  creator_name: string;
  creator_avatar: string;
  creator_location: string;
  start_time: string;
  attendees_count: number;
  banner_color: string;
}

export const INITIAL_FREE_SESSIONS: FreeLiveSession[] = [];

export interface ProviderVideo {
  id: string;
  title: string;
  description: string;
  category: 'pottery' | 'crafts' | 'cooking' | 'textiles' | 'gardening' | 'art';
  creator_name: string;
  creator_avatar: string;
  thumbnail_url: string;
  video_duration: string;
  views_count: number;
  posted_at: string;
  tags: string[];
}

export const INITIAL_VIDEOS: ProviderVideo[] = [];

function getCategoryImageUrl(category: string, existingUrl?: string | null): string {
  if (existingUrl && existingUrl.trim().length > 0) return existingUrl;
  const cat = (category || '').toLowerCase();
  if (cat.includes('cook') || cat.includes('food') || cat.includes('recipe') || cat.includes('masala') || cat.includes('cake') || cat.includes('pickle')) {
    return 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=800&q=80';
  }
  if (cat.includes('potter') || cat.includes('clay') || cat.includes('terracotta')) {
    return 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=800&q=80';
  }
  if (cat.includes('craft') || cat.includes('art') || cat.includes('paint')) {
    return 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=800&q=80';
  }
  if (cat.includes('textile') || cat.includes('wool') || cat.includes('tailor') || cat.includes('knit')) {
    return 'https://images.unsplash.com/photo-1606760227091-3dd850d97f1d?auto=format&fit=crop&w=800&q=80';
  }
  return 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80';
}

export async function fetchLiveConsumerProducts(): Promise<SeniorProduct[]> {
  const allProducts: SeniorProduct[] = [];
  const seenIds = new Set<string>();

  // 1. Fetch from /api/products
  try {
    const res = await fetch('/api/products');
    const data = await res.json();
    if (data.success && Array.isArray(data.products)) {
      for (const p of data.products) {
        if (!seenIds.has(p.id)) {
          seenIds.add(p.id);
          allProducts.push({
            id: p.id,
            title: p.title,
            description: p.description || '',
            price: Number(p.price) || 0,
            category: p.category || 'general',
            creator_name: p.creator_name || 'Senior Creator',
            creator_location: 'India',
            creator_avatar: '👵🏽',
            image_url: getCategoryImageUrl(p.category, p.image_url),
            rating: 5.0,
            reviews_count: 1,
            stock: p.stock ?? 1,
            is_active: p.is_active !== false,
          });
        }
      }
    }
  } catch (e) {
    console.warn('[ConsumerStore] Error fetching products:', e);
  }

  // 2. Fetch product-type items from /api/listings
  try {
    const res = await fetch('/api/listings?status=all');
    const data = await res.json();
    if (data.success && Array.isArray(data.listings)) {
      for (const l of data.listings) {
        if (l.type === 'product' && !seenIds.has(l.id)) {
          seenIds.add(l.id);
          allProducts.push({
            id: l.id,
            title: l.title,
            description: l.description || '',
            price: Number(l.price) || 0,
            category: l.category || 'general',
            creator_name: l.owner_name || 'Senior Creator',
            creator_location: l.locality_label || 'India',
            creator_avatar: '👵🏽',
            image_url: getCategoryImageUrl(l.category, null),
            rating: 5.0,
            reviews_count: 1,
            stock: 1,
            is_active: true,
          });
        }
      }
    }
  } catch (e) {
    console.warn('[ConsumerStore] Error fetching product listings:', e);
  }

  return allProducts;
}

export async function fetchLiveConsumerListings(): Promise<LiveSession[]> {
  try {
    const res = await fetch('/api/listings?status=all');
    const data = await res.json();
    if (data.success && Array.isArray(data.listings)) {
      return data.listings.map((l: any) => ({
        id: l.id,
        title: l.title,
        description: l.description || '',
        price: Number(l.price) || 0,
        duration_mins: 60,
        category: l.category || 'cooking',
        creator_name: l.owner_name || 'Senior Creator',
        creator_experience: 'Senior Master Artisan',
        creator_location: l.locality_label || 'India',
        creator_avatar: '👵🏽',
        available_slots: ['Today 5:00 PM', 'Tomorrow 11:00 AM', 'Tomorrow 4:00 PM'],
        session_type: l.type === 'product' ? 'Product Order' : '1-on-1',
        rating: 5.0,
      }));
    }
  } catch (e) {
    console.warn('[ConsumerStore] Error fetching live listings:', e);
  }
  return [];
}

export async function fetchLiveConsumerVideos(): Promise<ProviderVideo[]> {
  try {
    const res = await fetch('/api/videos');
    const data = await res.json();
    if (data.success && Array.isArray(data.videos)) {
      return data.videos.map((v: any) => ({
        id: v.id,
        title: v.topic || 'Provider Video Lesson',
        description: v.description || '',
        category: 'cooking',
        creator_name: v.creator_name || 'Senior Creator',
        creator_avatar: '👵🏽',
        thumbnail_url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=80',
        video_duration: '15:00',
        views_count: 42,
        posted_at: 'Recently posted',
        tags: [(v.topic || '').toLowerCase(), 'video', 'tutorial'],
      }));
    }
  } catch (e) {
    console.warn('[ConsumerStore] Error fetching live videos:', e);
  }
  return [];
}

export function getRegisteredProvidersFromStorage(): ServiceProvider[] {
  if (typeof window === 'undefined') return [];
  try {
    const accountsData = localStorage.getItem('silverhands_user_accounts');
    if (!accountsData) return [];
    const accounts = JSON.parse(accountsData);
    if (!Array.isArray(accounts)) return [];

    return accounts.map((acc: any, index: number) => {
      const profile = acc.profile || {};
      const name = acc.userName || profile.name || `Provider ${index + 1}`;
      const skillsStr = Array.isArray(profile.skills)
        ? profile.skills.map((s: any) => (typeof s === 'string' ? s : s.name)).join(', ')
        : 'Senior Artisan Crafts';

      return {
        id: `reg-provider-${index}`,
        name,
        skill: skillsStr || 'Senior Master Skills',
        category: 'crafts',
        experience_years: profile.experience_years || 10,
        location: profile.location || 'India',
        avatar: acc.photoUrl ? '📷' : '👵🏽',
        bio: profile.bio || `Verified senior master artisan provider on SilverHands.`,
        rating: 5.0,
        reviews_count: 1,
        hourly_rate: 499,
        available_slots: ['Today 5:00 PM', 'Tomorrow 11:00 AM', 'Tomorrow 4:00 PM'],
      };
    });
  } catch (e) {
    return [];
  }
}


const CONSUMER_STORAGE_KEY = 'silverhands_consumer_user';
const CONSUMER_REGISTRY_KEY = 'silverhands_consumer_registry';

export function getSavedConsumerUser(): ConsumerUser | null {
  if (typeof window !== 'undefined') {
    try {
      const data = localStorage.getItem(CONSUMER_STORAGE_KEY);
      if (data) return JSON.parse(data);
    } catch (e) {}
  }
  return null;
}

export function saveConsumerUser(user: ConsumerUser): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(CONSUMER_STORAGE_KEY, JSON.stringify(user));
      const registry = getConsumerRegistry();
      registry[user.email.toLowerCase()] = user;
      localStorage.setItem(CONSUMER_REGISTRY_KEY, JSON.stringify(registry));
    } catch (e) {}
  }
}

export function getConsumerRegistry(): Record<string, ConsumerUser> {
  if (typeof window !== 'undefined') {
    try {
      const data = localStorage.getItem(CONSUMER_REGISTRY_KEY);
      if (data) return JSON.parse(data);
    } catch (e) {}
  }
  return {};
}

export function logoutConsumer(): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(CONSUMER_STORAGE_KEY);
    } catch (e) {}
  }
}
