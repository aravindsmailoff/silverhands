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

export const INITIAL_PROVIDERS: ServiceProvider[] = [
  {
    id: 'provider-01',
    name: 'Meenakshi Ammal',
    skill: 'Terracotta Pottery & Clay Wheel Sculpting',
    category: 'pottery',
    experience_years: 35,
    location: 'Mylapore, Chennai',
    avatar: '👵🏽',
    bio: 'Master potter with 35+ years experience in river clay shaping, terracotta hardening, and artisanal pottery wheel turning.',
    rating: 4.95,
    reviews_count: 56,
    hourly_rate: 599,
    available_slots: ['Today 5:00 PM', 'Tomorrow 11:00 AM', 'Tomorrow 4:00 PM']
  },
  {
    id: 'provider-02',
    name: 'Savitri Devi',
    skill: 'Authentic Heritage Cooking & Sun-Dried Pickles',
    category: 'cooking',
    experience_years: 40,
    location: 'Varanasi, UP',
    avatar: '👵🏼',
    bio: 'Heritage culinary expert specializing in traditional Indian tiffin, brass filter coffee brewing, and preservative-free pickles.',
    rating: 4.9,
    reviews_count: 84,
    hourly_rate: 499,
    available_slots: ['Today 6:00 PM', 'Tomorrow 10:00 AM']
  },
  {
    id: 'provider-03',
    name: 'Ramanathan Sir',
    skill: 'Tanjore Painting & 22kt Gold Leaf Embossing',
    category: 'crafts',
    experience_years: 30,
    location: 'Thanjavur, Tamil Nadu',
    avatar: '👴🏽',
    bio: 'Fine arts master skilled in classical Tanjore painting, gold foil embossing, and teak wood framing techniques.',
    rating: 5.0,
    reviews_count: 42,
    hourly_rate: 899,
    available_slots: ['Tomorrow 3:00 PM', 'Saturday 11:00 AM']
  },
  {
    id: 'provider-04',
    name: 'Kamla Verma',
    skill: 'Pure Wool Pashmina Hand-Knitting',
    category: 'textiles',
    experience_years: 28,
    location: 'Shimla, Himachal Pradesh',
    avatar: '👵🏻',
    bio: 'Expert handloom weaver and knitter specializing in natural wool shawls, mufflers, and traditional Himachal patterns.',
    rating: 4.85,
    reviews_count: 31,
    hourly_rate: 450,
    available_slots: ['Tomorrow 2:00 PM', 'Sunday 11:00 AM']
  }
];

export const INITIAL_PRODUCTS: SeniorProduct[] = [
  {
    id: 'prod-pottery-01',
    title: 'Handcrafted Terracotta Clay Water Pot (Cooling Jug)',
    description: 'Traditional eco-friendly terracotta water jug handcrafted using natural river clay. Keeps water naturally cool and mineral-rich.',
    price: 499,
    category: 'pottery',
    creator_name: 'Meenakshi Ammal',
    creator_location: 'Mylapore, Chennai',
    creator_avatar: '👵🏽',
    image_url: 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=800&q=80',
    rating: 4.9,
    reviews_count: 34,
    stock: 12,
    is_active: true
  },
  {
    id: 'prod-pottery-02',
    title: 'Handmade Glazed Ceramic Coffee Mugs (Set of 2)',
    description: 'Artisanal stoneware ceramic mugs hand-turned on traditional pottery wheel and baked at high temperatures.',
    price: 799,
    category: 'pottery',
    creator_name: 'Meenakshi Ammal',
    creator_location: 'Mylapore, Chennai',
    creator_avatar: '👵🏽',
    image_url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=800&q=80',
    rating: 4.8,
    reviews_count: 28,
    stock: 8,
    is_active: true
  },
  {
    id: 'prod-craft-01',
    title: 'Traditional Tanjore Gold Leaf Ganesha Painting (12x10 in)',
    description: 'Authentic 22kt gold leaf Tanjore painting framed in teak wood. Created over 3 weeks of painstaking handcrafting.',
    price: 3499,
    category: 'crafts',
    creator_name: 'Ramanathan Sir',
    creator_location: 'Thanjavur, Tamil Nadu',
    creator_avatar: '👴🏽',
    image_url: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=800&q=80',
    rating: 5.0,
    reviews_count: 42,
    stock: 3,
    is_active: true
  },
  {
    id: 'prod-cooking-01',
    title: 'Authentic Sun-Dried Mango & Garlic Pickle (500g)',
    description: 'Heritage family recipe prepared with cold-pressed mustard oil and hand-ground organic spices. No artificial preservatives.',
    price: 350,
    category: 'cooking',
    creator_name: 'Savitri Devi',
    creator_location: 'Varanasi, UP',
    creator_avatar: '👵🏼',
    image_url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=800&q=80',
    rating: 4.9,
    reviews_count: 89,
    stock: 25,
    is_active: true
  },
  {
    id: 'prod-textile-01',
    title: 'Hand-Knitted Pure Wool Pashmina Shawl',
    description: 'Ultra-soft hand-woven woollen shawl crafted using traditional needle knitting techniques passed down generations.',
    price: 1899,
    category: 'textiles',
    creator_name: 'Kamla Verma',
    creator_location: 'Shimla, HP',
    creator_avatar: '👵🏻',
    image_url: 'https://images.unsplash.com/photo-1606760227091-3dd850d97f1d?auto=format&fit=crop&w=800&q=80',
    rating: 4.9,
    reviews_count: 19,
    stock: 5,
    is_active: true
  }
];

export const INITIAL_LIVE_SESSIONS: LiveSession[] = [
  {
    id: 'session-pottery-01',
    title: '1-on-1 Clay Wheel Pottery Masterclass for Beginners',
    description: 'Learn the fundamentals of shaping clay, wheel balancing, and terracotta hardening directly from master potter Meenakshi Ammal.',
    price: 599,
    duration_mins: 60,
    category: 'pottery',
    creator_name: 'Meenakshi Ammal',
    creator_experience: '35+ Years in Terracotta Pottery',
    creator_location: 'Chennai',
    creator_avatar: '👵🏽',
    available_slots: ['Today 5:00 PM', 'Tomorrow 11:00 AM', 'Tomorrow 4:00 PM'],
    session_type: '1-on-1',
    rating: 4.95
  },
  {
    id: 'session-cooking-01',
    title: '1-on-1 Traditional South Indian Filter Coffee & Tiffin Cooking Class',
    description: 'Master the art of brewing authentic brass-filter coffee, crisp dosas, and authentic coconut chutneys step-by-step.',
    price: 499,
    duration_mins: 45,
    category: 'cooking',
    creator_name: 'Savitri Devi',
    creator_experience: '40+ Years Culinary Mastery',
    creator_location: 'Varanasi',
    creator_avatar: '👵🏼',
    available_slots: ['Today 6:00 PM', 'Tomorrow 10:00 AM'],
    session_type: '1-on-1',
    rating: 4.9
  },
  {
    id: 'session-craft-01',
    title: '1-on-1 Tanjore Painting & Gold Foil Embossing Workshop',
    description: 'Hands-on live guidance on sketching, gesso paste preparation, and 22kt gold leaf placement for Tanjore art.',
    price: 899,
    duration_mins: 90,
    category: 'crafts',
    creator_name: 'Ramanathan Sir',
    creator_experience: '30+ Years Fine Arts Master',
    creator_location: 'Thanjavur',
    creator_avatar: '👴🏽',
    available_slots: ['Tomorrow 3:00 PM', 'Saturday 11:00 AM'],
    session_type: '1-on-1',
    rating: 5.0
  }
];

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

export const INITIAL_FREE_SESSIONS: FreeLiveSession[] = [
  {
    id: 'free-live-cooking-01',
    title: '🎁 Free Live Workshop: Authentic Hyderabadi Dum Biryani Secrets & Spices',
    description: 'Join master chef Savitri Devi live for a 100% free community cooking stream on layer marination and dum rice sealing.',
    category: 'cooking',
    creator_name: 'Savitri Devi',
    creator_avatar: '👵🏼',
    creator_location: 'Varanasi',
    start_time: 'LIVE NOW (Started 10 mins ago)',
    attendees_count: 142,
    banner_color: 'from-amber-600 to-orange-700'
  },
  {
    id: 'free-live-pottery-01',
    title: '🎁 Free Community Pottery Basics: River Clay Centering & Wheel Turning',
    description: 'Open to all learners! Watch Meenakshi Ammal demonstrate live clay shaping and wheel balancing techniques.',
    category: 'pottery',
    creator_name: 'Meenakshi Ammal',
    creator_avatar: '👵🏽',
    creator_location: 'Chennai',
    start_time: 'Starts Today at 4:30 PM',
    attendees_count: 98,
    banner_color: 'from-amber-800 to-yellow-900'
  },
  {
    id: 'free-live-craft-01',
    title: '🎁 Free Tanjore Art Live Webinar: 22kt Gold Foil Embossing Overview',
    description: 'Learn the secrets of classical South Indian Tanjore gold leaf embossing with master artist Ramanathan Sir.',
    category: 'crafts',
    creator_name: 'Ramanathan Sir',
    creator_avatar: '👴🏽',
    creator_location: 'Thanjavur',
    start_time: 'Starts Tomorrow at 11:00 AM',
    attendees_count: 76,
    banner_color: 'from-[#031635] to-blue-900'
  }
];

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

export const INITIAL_VIDEOS: ProviderVideo[] = [
  {
    id: 'video-biryani-01',
    title: ' Authentic Special Hyderabadi Mutton Dum Biryani Recipe & Step-by-Step Cooking Video',
    description: 'Detailed video guide by Savitri Devi showing authentic saffron milk infusion, fried onion garnishing, and dum vessel sealing.',
    category: 'cooking',
    creator_name: 'Savitri Devi',
    creator_avatar: '👵🏼',
    thumbnail_url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=80',
    video_duration: '18:45',
    views_count: 3420,
    posted_at: '2 days ago',
    tags: ['biryani', 'cooking', 'spices', 'mutton biryani', 'dum biryani', 'savitri devi']
  },
  {
    id: 'video-pottery-01',
    title: '📹 Traditional Handcrafted Terracotta Water Pot Turning Video',
    description: 'Watch Meenakshi Ammal transform raw river clay into a perfectly balanced cooling water jug on her artisanal pottery wheel.',
    category: 'pottery',
    creator_name: 'Meenakshi Ammal',
    creator_avatar: '👵🏽',
    thumbnail_url: 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=800&q=80',
    video_duration: '14:20',
    views_count: 2890,
    posted_at: '4 days ago',
    tags: ['pottery', 'clay', 'terracotta', 'water pot', 'meenakshi ammal', 'wheel']
  },
  {
    id: 'video-craft-01',
    title: '📹 Tanjore Ganesha Gold Foil Embossing & Framing Video',
    description: 'Step-by-step video tutorial on preparing gesso paste and applying 22kt gold leaf on Ganesha Tanjore painting.',
    category: 'crafts',
    creator_name: 'Ramanathan Sir',
    creator_avatar: '👴🏽',
    thumbnail_url: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=800&q=80',
    video_duration: '22:10',
    views_count: 1950,
    posted_at: '1 week ago',
    tags: ['tanjore', 'gold foil', 'painting', 'ganesha', 'ramanathan', 'art']
  }
];


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
