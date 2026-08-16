/**
 * Global Semantic Location Classification & Authoritative Indian Geocoder
 * 
 * Provides:
 * 1. Global classification of location intent:
 *    - valid_indian_location: Recognized city/locality in India
 *    - indian_state_only: User gave a state name without specifying their city
 *    - foreign_location: International cities/countries (e.g. Coronado, London, New York)
 *    - non_geographic: Fictional, celestial, or non-places (e.g. Mars, Moon, Space)
 *    - unknown: Arbitrary unparseable text
 * 2. Strict Indian geocoding (Localities -> Cities -> Districts -> States)
 * 3. Safe conversational feedback without polluting profile state
 */

export type LocationIntent =
  | 'valid_indian_location'
  | 'indian_state_only'
  | 'foreign_location'
  | 'non_geographic'
  | 'unknown';

export interface StructuredLocation {
  locality: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  country: string;
  formatted_address: string;
  is_state_only: boolean;
  needs_clarification: boolean;
  locationIntent: LocationIntent;
  clarification_reason?: string;
  clarification_question?: string;
  confidence: number;
}

// Canonical Indian States and Union Territories with known aliases
export const INDIAN_STATES: Record<string, { canonical: string; aliases: string[] }> = {
  'tamil nadu': { canonical: 'Tamil Nadu', aliases: ['tamil nadu', 'tamilnadu', 'tn', 'tamil nad'] },
  'karnataka': { canonical: 'Karnataka', aliases: ['karnataka', 'ka', 'kar'] },
  'maharashtra': { canonical: 'Maharashtra', aliases: ['maharashtra', 'mh', 'maha'] },
  'kerala': { canonical: 'Kerala', aliases: ['kerala', 'kl', 'ker'] },
  'telangana': { canonical: 'Telangana', aliases: ['telangana', 'ts', 'tg'] },
  'andhra pradesh': { canonical: 'Andhra Pradesh', aliases: ['andhra pradesh', 'andhra', 'ap'] },
  'delhi': { canonical: 'Delhi', aliases: ['delhi', 'new delhi', 'ncr', 'nct of delhi', 'national capital territory of delhi', 'dl'] },
  'gujarat': { canonical: 'Gujarat', aliases: ['gujarat', 'gj', 'guj'] },
  'west bengal': { canonical: 'West Bengal', aliases: ['west bengal', 'bengal', 'wb', 'paschim banga'] },
  'rajasthan': { canonical: 'Rajasthan', aliases: ['rajasthan', 'rj', 'raj'] },
  'uttar pradesh': { canonical: 'Uttar Pradesh', aliases: ['uttar pradesh', 'up'] },
  'madhya pradesh': { canonical: 'Madhya Pradesh', aliases: ['madhya pradesh', 'mp'] },
  'bihar': { canonical: 'Bihar', aliases: ['bihar', 'br'] },
  'punjab': { canonical: 'Punjab', aliases: ['punjab', 'pb'] },
  'haryana': { canonical: 'Haryana', aliases: ['haryana', 'hr'] },
  'odisha': { canonical: 'Odisha', aliases: ['odisha', 'orissa', 'od'] },
  'assam': { canonical: 'Assam', aliases: ['assam', 'as'] },
  'goa': { canonical: 'Goa', aliases: ['goa', 'ga'] },
  'jharkhand': { canonical: 'Jharkhand', aliases: ['jharkhand', 'jh'] },
  'chhattisgarh': { canonical: 'Chhattisgarh', aliases: ['chhattisgarh', 'cg'] },
  'uttarakhand': { canonical: 'Uttarakhand', aliases: ['uttarakhand', 'uk', 'ua'] },
  'himachal pradesh': { canonical: 'Himachal Pradesh', aliases: ['himachal pradesh', 'himachal', 'hp'] },
  'jammu and kashmir': { canonical: 'Jammu and Kashmir', aliases: ['jammu and kashmir', 'jammu & kashmir', 'j&k', 'jk'] },
  'ladakh': { canonical: 'Ladakh', aliases: ['ladakh', 'la'] },
  'puducherry': { canonical: 'Puducherry', aliases: ['puducherry', 'pondicherry', 'py'] },
  'chandigarh': { canonical: 'Chandigarh', aliases: ['chandigarh', 'ch'] },
  'tripura': { canonical: 'Tripura', aliases: ['tripura', 'tr'] },
  'meghalaya': { canonical: 'Meghalaya', aliases: ['meghalaya', 'ml'] },
  'manipur': { canonical: 'Manipur', aliases: ['manipur', 'mn'] },
  'nagaland': { canonical: 'Nagaland', aliases: ['nagaland', 'nl'] },
  'mizoram': { canonical: 'Mizoram', aliases: ['mizoram', 'mz'] },
  'sikkim': { canonical: 'Sikkim', aliases: ['sikkim', 'sk'] },
  'arunachal pradesh': { canonical: 'Arunachal Pradesh', aliases: ['arunachal pradesh', 'arunachal', 'ar'] }
};

// Known Major Cities & Districts in India with State and Locality Mappings
export const MAJOR_CITIES_MAP: Record<string, { city: string; state: string; localities?: string[] }> = {
  // Tamil Nadu
  'chennai': {
    city: 'Chennai',
    state: 'Tamil Nadu',
    localities: ['mylapore', 'adyar', 't nagar', 't. nagar', 'anna nagar', 'velachery', 'guindy', 'triplicane', 'tambaram', 'porur', 'besant nagar', 'nungambakkam', 'egmore', 'chromepet', 'thiruvanmiyur', 'alwarpet', 'vadapalani', 'perambur', 'kilpauk', 'royapettah', 'saidapet', 'kodambakkam', 'sholinganallur', 'avadi', 'ambattur']
  },
  'coimbatore': { city: 'Coimbatore', state: 'Tamil Nadu', localities: ['rs puram', 'gandhipuram', 'peelamedu', 'saibaba colony', 'singanallur', 'saravanampatti'] },
  'madurai': { city: 'Madurai', state: 'Tamil Nadu', localities: ['kk nagar', 'anna nagar', 'tallakulam', 'ss colony', 'simmakkal'] },
  'tiruchirappalli': { city: 'Tiruchirappalli', state: 'Tamil Nadu', localities: ['thillai nagar', 'srirangam', 'k k nagar', 'cantonment'] },
  'trichy': { city: 'Tiruchirappalli', state: 'Tamil Nadu', localities: ['thillai nagar', 'srirangam', 'k k nagar'] },
  'salem': { city: 'Salem', state: 'Tamil Nadu', localities: ['fairlands', 'alagapuram', 'suramangalam'] },
  'tirunelveli': { city: 'Tirunelveli', state: 'Tamil Nadu', localities: ['palayamkottai'] },
  'tiruppur': { city: 'Tiruppur', state: 'Tamil Nadu' },
  'erode': { city: 'Erode', state: 'Tamil Nadu' },
  'vellore': { city: 'Vellore', state: 'Tamil Nadu', localities: ['katpadi', 'sathuvachari'] },
  'thanjavur': { city: 'Thanjavur', state: 'Tamil Nadu' },
  'kanchipuram': { city: 'Kanchipuram', state: 'Tamil Nadu' },
  'dindigul': { city: 'Dindigul', state: 'Tamil Nadu' },
  'nagercoil': { city: 'Nagercoil', state: 'Tamil Nadu' },
  'hosur': { city: 'Hosur', state: 'Tamil Nadu' },
  'cuddalore': { city: 'Cuddalore', state: 'Tamil Nadu' },
  'karur': { city: 'Karur', state: 'Tamil Nadu' },
  'kumbakonam': { city: 'Kumbakonam', state: 'Tamil Nadu' },

  // Karnataka
  'bengaluru': {
    city: 'Bengaluru',
    state: 'Karnataka',
    localities: ['indiranagar', 'koramangala', 'whitefield', 'jayanagar', 'hsr layout', 'malleshwaram', 'jp nagar', 'electronic city', 'marathahalli', 'bellandur', 'hebbal', 'banashankari', 'rajajinagar', 'btm layout', 'yelahanka', 'basavanagudi', 'sadashivanagar', 'frazer town']
  },
  'bangalore': {
    city: 'Bengaluru',
    state: 'Karnataka',
    localities: ['indiranagar', 'koramangala', 'whitefield', 'jayanagar', 'hsr layout', 'malleshwaram', 'jp nagar', 'electronic city', 'marathahalli', 'bellandur', 'hebbal', 'banashankari', 'rajajinagar', 'btm layout', 'yelahanka', 'basavanagudi', 'sadashivanagar', 'frazer town']
  },
  'mysuru': { city: 'Mysuru', state: 'Karnataka', localities: ['gokulam', 'jayalakshmipuram', 'kuvempunagar', 'vijayanagar'] },
  'mysore': { city: 'Mysuru', state: 'Karnataka', localities: ['gokulam', 'jayalakshmipuram', 'kuvempunagar', 'vijayanagar'] },
  'mangaluru': { city: 'Mangaluru', state: 'Karnataka', localities: ['kadri', 'bejai', 'surathkal'] },
  'mangalore': { city: 'Mangaluru', state: 'Karnataka', localities: ['kadri', 'bejai', 'surathkal'] },
  'hubballi': { city: 'Hubballi', state: 'Karnataka' },
  'hubli': { city: 'Hubballi', state: 'Karnataka' },
  'belagavi': { city: 'Belagavi', state: 'Karnataka' },
  'shivamogga': { city: 'Shivamogga', state: 'Karnataka' },
  'shimoga': { city: 'Shivamogga', state: 'Karnataka' },
  'tumakuru': { city: 'Tumakuru', state: 'Karnataka' },
  'udupi': { city: 'Udupi', state: 'Karnataka', localities: ['manipal'] },

  // Maharashtra
  'mumbai': {
    city: 'Mumbai',
    state: 'Maharashtra',
    localities: ['bandra', 'andheri', 'juhu', 'dadar', 'borivali', 'powai', 'colaba', 'worli', 'santacruz', 'malad', 'chembur', 'ghatkopar', 'kurla', 'mulund', 'kandivali', 'goregaon', 'vile parle', 'khar', 'lower parel', 'byculla']
  },
  'pune': {
    city: 'Pune',
    state: 'Maharashtra',
    localities: ['kothrud', 'viman nagar', 'baner', 'wakad', 'hinjewadi', 'hadapsar', 'kalyani nagar', 'aundh', 'shivaji nagar', 'deccan', 'kharadi', 'magarpatta', 'camp', 'bavdhan']
  },
  'nagpur': { city: 'Nagpur', state: 'Maharashtra', localities: ['dharampeth', 'ramdaspeth', 'sitabuldi'] },
  'thane': { city: 'Thane', state: 'Maharashtra', localities: ['ghodbunder road', 'naupada', 'majiwada'] },
  'navi mumbai': { city: 'Navi Mumbai', state: 'Maharashtra', localities: ['vashi', 'nerul', 'kharghar', 'belapur', 'panvel', 'kopar khairane'] },
  'nashik': { city: 'Nashik', state: 'Maharashtra' },
  'aurangabad': { city: 'Chhatrapati Sambhajinagar', state: 'Maharashtra' },
  'chhatrapati sambhajinagar': { city: 'Chhatrapati Sambhajinagar', state: 'Maharashtra' },
  'solapur': { city: 'Solapur', state: 'Maharashtra' },
  'kolhapur': { city: 'Kolhapur', state: 'Maharashtra' },

  // Telangana
  'hyderabad': {
    city: 'Hyderabad',
    state: 'Telangana',
    localities: ['banjara hills', 'jubilee hills', 'hitec city', 'gachibowli', 'madhapur', 'kukatpally', 'kondapur', 'begumpet', 'ameerpet', 'secunderabad', 'dilsukhnagar', 'manikonda', 'miyapur', 'somajiguda', 'abids']
  },
  'secunderabad': { city: 'Secunderabad', state: 'Telangana', localities: ['marredpally', 'sainikpuri', 'trimulgherry'] },
  'warangal': { city: 'Warangal', state: 'Telangana', localities: ['kazipet', 'hanamkonda'] },
  'nizamabad': { city: 'Nizamabad', state: 'Telangana' },
  'karimnagar': { city: 'Karimnagar', state: 'Telangana' },

  // Andhra Pradesh
  'visakhapatnam': { city: 'Visakhapatnam', state: 'Andhra Pradesh', localities: ['mvp colony', 'gajuwaka', 'seethammadhara', 'siripuram', 'rushikonda'] },
  'vizag': { city: 'Visakhapatnam', state: 'Andhra Pradesh' },
  'vijayawada': { city: 'Vijayawada', state: 'Andhra Pradesh', localities: ['benz circle', 'governorpet', 'patamata'] },
  'guntur': { city: 'Guntur', state: 'Andhra Pradesh' },
  'tirupati': { city: 'Tirupati', state: 'Andhra Pradesh' },
  'nellore': { city: 'Nellore', state: 'Andhra Pradesh' },
  'kurnool': { city: 'Kurnool', state: 'Andhra Pradesh' },

  // Delhi NCR
  'new delhi': {
    city: 'New Delhi',
    state: 'Delhi',
    localities: ['connaught place', 'south extension', 'hauz khas', 'saket', 'dwarka', 'vasant kunj', 'lajpat nagar', 'rohini', 'janakpuri', 'karol bagh', 'chandni chowk', 'defence colony', 'greater kailash']
  },
  'delhi': {
    city: 'Delhi',
    state: 'Delhi',
    localities: ['connaught place', 'south extension', 'hauz khas', 'saket', 'dwarka', 'vasant kunj', 'lajpat nagar', 'rohini', 'janakpuri', 'karol bagh', 'chandni chowk', 'defence colony', 'greater kailash']
  },
  'gurugram': { city: 'Gurugram', state: 'Haryana', localities: ['dlf phase', 'cyber city', 'golf course road', 'sector 56', 'sohna road'] },
  'gurgaon': { city: 'Gurugram', state: 'Haryana', localities: ['dlf phase', 'cyber city', 'golf course road', 'sector 56', 'sohna road'] },
  'noida': { city: 'Noida', state: 'Uttar Pradesh', localities: ['sector 18', 'sector 62', 'sector 137', 'greater noida'] },
  'ghaziabad': { city: 'Ghaziabad', state: 'Uttar Pradesh', localities: ['indirapuram', 'vaishali', 'raj nagar'] },
  'faridabad': { city: 'Faridabad', state: 'Haryana' },

  // Kerala
  'kochi': { city: 'Kochi', state: 'Kerala', localities: ['kaloor', 'edappally', 'kakkanad', 'fort kochi', 'marine drive', 'ernakulam', 'aluva'] },
  'cochin': { city: 'Kochi', state: 'Kerala', localities: ['kaloor', 'edappally', 'kakkanad', 'fort kochi', 'marine drive', 'ernakulam', 'aluva'] },
  'thiruvananthapuram': { city: 'Thiruvananthapuram', state: 'Kerala', localities: ['kowdiar', 'pattom', 'vellayambalam', 'kazhakkoottam', 'technopark', 'statue'] },
  'trivandrum': { city: 'Thiruvananthapuram', state: 'Kerala', localities: ['kowdiar', 'pattom', 'vellayambalam', 'kazhakkoottam', 'technopark', 'statue'] },
  'kozhikode': { city: 'Kozhikode', state: 'Kerala', localities: ['mananchira', 'mavoor road', 'calicut'] },
  'calicut': { city: 'Kozhikode', state: 'Kerala' },
  'thrissur': { city: 'Thrissur', state: 'Kerala' },
  'kollam': { city: 'Kollam', state: 'Kerala' },
  'kottayam': { city: 'Kottayam', state: 'Kerala' },
  'palakkad': { city: 'Palakkad', state: 'Kerala' },

  // West Bengal
  'kolkata': {
    city: 'Kolkata',
    state: 'West Bengal',
    localities: ['salt lake', 'park street', 'ballygunge', 'new town', 'alipore', 'behala', 'howrah', 'garia', 'dum dum', 'shyambazar']
  },
  'siliguri': { city: 'Siliguri', state: 'West Bengal' },
  'durgapur': { city: 'Durgapur', state: 'West Bengal' },
  'asansol': { city: 'Asansol', state: 'West Bengal' },

  // Gujarat
  'ahmedabad': { city: 'Ahmedabad', state: 'Gujarat', localities: ['satellite', 'vastrapur', 'bodakdev', 'navrangpura', 'prahlad nagar', 'maninagar', 'sg highway'] },
  'surat': { city: 'Surat', state: 'Gujarat', localities: ['adajan', 'vesu', 'piplod', 'varachha'] },
  'vadodara': { city: 'Vadodara', state: 'Gujarat', localities: ['alkapuri', 'gotri', 'manjalpur'] },
  'baroda': { city: 'Vadodara', state: 'Gujarat', localities: ['alkapuri', 'gotri', 'manjalpur'] },
  'rajkot': { city: 'Rajkot', state: 'Gujarat' },
  'gandhinagar': { city: 'Gandhinagar', state: 'Gujarat' },

  // Rajasthan
  'jaipur': { city: 'Jaipur', state: 'Rajasthan', localities: ['malviya nagar', 'vaishali nagar', 'mansarovar', 'c scheme', 'raja park'] },
  'jodhpur': { city: 'Jodhpur', state: 'Rajasthan' },
  'udaipur': { city: 'Udaipur', state: 'Rajasthan' },
  'kota': { city: 'Kota', state: 'Rajasthan' },

  // Uttar Pradesh
  'lucknow': { city: 'Lucknow', state: 'Uttar Pradesh', localities: ['gomti nagar', 'hazratganj', 'aliganj', 'indira nagar', 'mahanagar'] },
  'kanpur': { city: 'Kanpur', state: 'Uttar Pradesh' },
  'varanasi': { city: 'Varanasi', state: 'Uttar Pradesh', localities: ['bhelupur', 'lanka', 'sigra'] },
  'agra': { city: 'Agra', state: 'Uttar Pradesh' },
  'prayagraj': { city: 'Prayagraj', state: 'Uttar Pradesh', localities: ['civil lines'] },
  'allahabad': { city: 'Prayagraj', state: 'Uttar Pradesh' },
  'meerut': { city: 'Meerut', state: 'Uttar Pradesh' },

  // Madhya Pradesh
  'indore': { city: 'Indore', state: 'Madhya Pradesh', localities: ['vijay nagar', 'palasia', 'rajwada', 'bhawarkua'] },
  'bhopal': { city: 'Bhopal', state: 'Madhya Pradesh', localities: ['mp nagar', 'arera colony', 'kolar road'] },
  'gwalior': { city: 'Gwalior', state: 'Madhya Pradesh' },
  'jabalpur': { city: 'Jabalpur', state: 'Madhya Pradesh' },

  // Punjab & Chandigarh
  'chandigarh': { city: 'Chandigarh', state: 'Chandigarh', localities: ['sector 17', 'sector 35', 'sector 22'] },
  'ludhiana': { city: 'Ludhiana', state: 'Punjab' },
  'amritsar': { city: 'Amritsar', state: 'Punjab' },
  'jalandhar': { city: 'Jalandhar', state: 'Punjab' },

  // Odisha
  'bhubaneswar': { city: 'Bhubaneswar', state: 'Odisha', localities: ['saheed nagar', 'nayapalli', 'patia', 'chandrasekharpur'] },
  'cuttack': { city: 'Cuttack', state: 'Odisha' },

  // Assam & North East
  'guwahati': { city: 'Guwahati', state: 'Assam', localities: ['gs road', 'paltan bazaar', 'dispur'] },
  'shillong': { city: 'Shillong', state: 'Meghalaya' },

  // Goa
  'panaji': { city: 'Panaji', state: 'Goa' },
  'margao': { city: 'Margao', state: 'Goa' },
  'vasco da gama': { city: 'Vasco da Gama', state: 'Goa' },

  // Bihar & Jharkhand
  'patna': { city: 'Patna', state: 'Bihar', localities: ['kankarbagh', 'boring road', 'bailey road'] },
  'ranchi': { city: 'Ranchi', state: 'Jharkhand', localities: ['doranda', 'morabadi', 'lalpur'] },
  'jamshedpur': { city: 'Jamshedpur', state: 'Jharkhand', localities: ['bistupur', 'sakchi'] },

  // Uttarakhand & Himachal
  'dehradun': { city: 'Dehradun', state: 'Uttarakhand', localities: ['rajpur road', 'jakhan'] },
  'shimla': { city: 'Shimla', state: 'Himachal Pradesh' },

  // Chhattisgarh
  'raipur': { city: 'Raipur', state: 'Chhattisgarh' }
};

// Known Non-Geographic / Fictional / Celestial Entities
export const NON_GEOGRAPHIC_ENTITIES = new Set([
  'mars', 'moon', 'jupiter', 'sun', 'saturn', 'venus', 'mercury', 'neptune', 'uranus', 'pluto',
  'space', 'earth', 'galaxy', 'universe', 'planet', 'heaven', 'hell', 'valhalla', 'wonderland',
  'nowhere', 'somewhere', 'anywhere', 'everywhere', 'unknown',
  'home', 'my home', 'my house', 'office', 'room', 'bed', 'here', 'there',
  'zero', 'none', 'nil', 'null', 'nothing', 'na', 'n/a'
]);

// Known International / Foreign Cities & Countries
export const FOREIGN_LOCATIONS = new Set([
  'coronado', 'london', 'new york', 'san francisco', 'los angeles', 'chicago', 'houston', 'miami',
  'seattle', 'boston', 'austin', 'dallas', 'california', 'texas', 'florida', 'washington',
  'dubai', 'abu dhabi', 'singapore', 'kuala lumpur', 'bangkok', 'tokyo', 'seoul', 'sydney',
  'melbourne', 'toronto', 'vancouver', 'montreal', 'paris', 'berlin', 'amsterdam', 'rome',
  'madrid', 'barcelona', 'zurich', 'geneva', 'dublin', 'auckland',
  'usa', 'united states', 'america', 'uk', 'united kingdom', 'england', 'canada', 'australia',
  'germany', 'france', 'italy', 'spain', 'uae', 'japan', 'china', 'russia'
]);

export function findMatchingState(input: string): string | null {
  const clean = input.toLowerCase().trim();
  for (const [, data] of Object.entries(INDIAN_STATES)) {
    for (const alias of data.aliases) {
      const aliasRegex = new RegExp(`\\b${alias.replace('.', '\\.')}\\b`, 'i');
      if (aliasRegex.test(clean)) {
        return data.canonical;
      }
    }
  }
  return null;
}

/**
 * Classifies location intent into 5 clear semantic categories:
 * - non_geographic: Fictional / Celestial (e.g. Mars)
 * - foreign_location: International cities/countries (e.g. Coronado, London)
 * - indian_state_only: State name only without city (e.g. Tamil Nadu)
 * - valid_indian_location: Recognized city/locality in India (e.g. Chennai, Mylapore)
 * - unknown: Unparseable arbitrary text
 */
export function classifyLocationIntent(rawInput: string): {
  intent: LocationIntent;
  entity: string;
  matchedState: string | null;
  matchedCity: string | null;
  matchedLocality: string | null;
} {
  if (!rawInput || !rawInput.trim()) {
    return { intent: 'unknown', entity: '', matchedState: null, matchedCity: null, matchedLocality: null };
  }

  const clean = rawInput
    .toLowerCase()
    .replace(/^i\s+(live|stay|work|am|reside)\s+(in|at|near|from)\s+/i, '')
    .replace(/^from\s+/i, '')
    .replace(/^in\s+/i, '')
    .replace(/^(my\s+location\s+is|location\s+is|located\s+in)\s+/i, '')
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Check Non-Geographic / Celestial
  if (NON_GEOGRAPHIC_ENTITIES.has(clean)) {
    return { intent: 'non_geographic', entity: clean, matchedState: null, matchedCity: null, matchedLocality: null };
  }

  for (const nonGeo of NON_GEOGRAPHIC_ENTITIES) {
    const regex = new RegExp(`\\b${nonGeo}\\b`, 'i');
    if (regex.test(clean)) {
      return { intent: 'non_geographic', entity: nonGeo, matchedState: null, matchedCity: null, matchedLocality: null };
    }
  }

  // 2. Check Foreign / International
  if (FOREIGN_LOCATIONS.has(clean)) {
    return { intent: 'foreign_location', entity: clean, matchedState: null, matchedCity: null, matchedLocality: null };
  }

  for (const foreign of FOREIGN_LOCATIONS) {
    const regex = new RegExp(`\\b${foreign}\\b`, 'i');
    if (regex.test(clean)) {
      return { intent: 'foreign_location', entity: foreign, matchedState: null, matchedCity: null, matchedLocality: null };
    }
  }

  // 3. Check for Recognized Indian Locality inside a City
  let matchedLocality: string | null = null;
  let matchedCity: string | null = null;
  let matchedState: string | null = null;

  for (const [, cityData] of Object.entries(MAJOR_CITIES_MAP)) {
    if (cityData.localities) {
      for (const loc of cityData.localities) {
        const locRegex = new RegExp(`\\b${loc.replace('.', '\\.')}\\b`, 'i');
        if (locRegex.test(clean)) {
          matchedLocality = loc.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          matchedCity = cityData.city;
          matchedState = cityData.state;
          break;
        }
      }
    }
    if (matchedLocality) break;
  }

  // 4. Check for Direct Indian City Match
  if (!matchedCity) {
    for (const [cityName, cityData] of Object.entries(MAJOR_CITIES_MAP)) {
      const cityRegex = new RegExp(`\\b${cityName.replace('.', '\\.')}\\b`, 'i');
      if (cityRegex.test(clean)) {
        matchedCity = cityData.city;
        matchedState = cityData.state;
        break;
      }
    }
  }

  // 5. Check if State was provided
  const detectedState = findMatchingState(clean);
  if (detectedState && !matchedState) {
    matchedState = detectedState;
  }

  // 6. State-Only Input (e.g. "Tamil Nadu", "Karnataka")
  if (matchedState && !matchedCity && !matchedLocality) {
    return { intent: 'indian_state_only', entity: matchedState, matchedState, matchedCity: null, matchedLocality: null };
  }

  // 7. Valid Indian Location (City or Locality found)
  if (matchedCity) {
    return { intent: 'valid_indian_location', entity: clean, matchedState, matchedCity, matchedLocality };
  }

  return { intent: 'unknown', entity: clean, matchedState: null, matchedCity: null, matchedLocality: null };
}

/**
 * Validates, normalizes, and geocodes natural location speech.
 * Enforces meaning-first validation and Indian geolocation semantics.
 */
export function validateAndParseLocation(rawInput: string, existingContextState?: string | null): StructuredLocation {
  if (!rawInput || !rawInput.trim()) {
    return {
      locality: null,
      city: null,
      district: null,
      state: null,
      country: 'India',
      formatted_address: '',
      is_state_only: false,
      needs_clarification: true,
      locationIntent: 'unknown',
      clarification_reason: 'No location was specified in speech.',
      clarification_question: 'Which city or town in India do you live or work in?',
      confidence: 0
    };
  }

  const classification = classifyLocationIntent(rawInput);

  // Case 1: Non-Geographic / Celestial (e.g. "Mars", "Moon")
  if (classification.intent === 'non_geographic') {
    const capitalizedEntity = classification.entity.charAt(0).toUpperCase() + classification.entity.slice(1);
    return {
      locality: null,
      city: null,
      district: null,
      state: null,
      country: 'India',
      formatted_address: '',
      is_state_only: false,
      needs_clarification: true,
      locationIntent: 'non_geographic',
      clarification_reason: `${capitalizedEntity} is not an Indian city or locality.`,
      clarification_question: `I couldn't identify ${capitalizedEntity} as a city or locality in India. Did you mean a place in India? Please tell me your city, town, or locality.`,
      confidence: 0.99
    };
  }

  // Case 2: Foreign / International (e.g. "Coronado", "London")
  if (classification.intent === 'foreign_location') {
    const capitalizedEntity = classification.entity.charAt(0).toUpperCase() + classification.entity.slice(1);
    return {
      locality: null,
      city: null,
      district: null,
      state: null,
      country: 'India',
      formatted_address: '',
      is_state_only: false,
      needs_clarification: true,
      locationIntent: 'foreign_location',
      clarification_reason: `${capitalizedEntity} is an international location.`,
      clarification_question: `I couldn't identify ${capitalizedEntity} as a city or locality in India. Could you tell me the Indian city, town, or locality where you live or work?`,
      confidence: 0.98
    };
  }

  // Case 3: Indian State Only (e.g. "Tamil Nadu")
  if (classification.intent === 'indian_state_only' && classification.matchedState) {
    return {
      locality: null,
      city: null,
      district: null,
      state: classification.matchedState,
      country: 'India',
      formatted_address: classification.matchedState,
      is_state_only: true,
      needs_clarification: true,
      locationIntent: 'indian_state_only',
      clarification_reason: `${classification.matchedState} is a state, but city is missing.`,
      clarification_question: `${classification.matchedState} is a state. Which city or locality in ${classification.matchedState} are you from?`,
      confidence: 0.98
    };
  }

  // Case 4: Valid Indian Location (e.g. "Mylapore", "Chennai", "Bengaluru")
  if (classification.intent === 'valid_indian_location' && classification.matchedCity) {
    const formatted = classification.matchedLocality
      ? `${classification.matchedLocality}, ${classification.matchedCity}${classification.matchedState ? ', ' + classification.matchedState : ''}`
      : `${classification.matchedCity}${classification.matchedState ? ', ' + classification.matchedState : ''}`;

    return {
      locality: classification.matchedLocality,
      city: classification.matchedCity,
      district: null,
      state: classification.matchedState,
      country: 'India',
      formatted_address: formatted,
      is_state_only: false,
      needs_clarification: false,
      locationIntent: 'valid_indian_location',
      confidence: 0.98
    };
  }

  // Case 5: Unknown / Arbitrary Text
  return {
    locality: null,
    city: null,
    district: null,
    state: null,
    country: 'India',
    formatted_address: '',
    is_state_only: false,
    needs_clarification: true,
    locationIntent: 'unknown',
    clarification_reason: 'Location string could not be clearly verified in India.',
    clarification_question: 'Could you please tell me the city or town in India where you are located?',
    confidence: 0.2
  };
}
