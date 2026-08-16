/**
 * Indian Location Validation & Normalization Layer
 * Provides authoritative classification of geographic entities in India:
 * - State vs City vs Locality vs District
 * - Handles state-only inputs requiring city clarification
 * - Normalizes addresses without guessing or inventing localities/cities
 */

export interface StructuredLocation {
  locality: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  country: string | null;
  formatted_address: string;
  is_state_only: boolean;
  needs_clarification: boolean;
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
  'uttarakhand': { canonical: 'Uttarakhand', aliases: ['uttarakhand', ' उत्तरांचल', 'uk', 'ua'] },
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

// Known Major Cities & Districts in India with State Mappings
export const MAJOR_CITIES_MAP: Record<string, { city: string; state: string; localities?: string[] }> = {
  // Tamil Nadu
  'chennai': {
    city: 'Chennai',
    state: 'Tamil Nadu',
    localities: ['mylapore', 'adyar', 't nagar', 't. nagar', 'anna nagar', 'velachery', 'guindy', 'triplicane', 'tambaram', 'porur', 'besant nagar', 'nungambakkam', 'egmore', 'chromepet', 'thiruvanmiyur', 'alwarpet', 'vadapalani', 'perambur', 'kilpauk', 'royapettah', 'saidapet']
  },
  'coimbatore': { city: 'Coimbatore', state: 'Tamil Nadu', localities: ['rs puram', 'gandhipuram', 'peelamedu', 'saibaba colony', 'singanallur'] },
  'madurai': { city: 'Madurai', state: 'Tamil Nadu', localities: ['kk nagar', 'anna nagar', 'tallakulam', 'ss colony'] },
  'tiruchirappalli': { city: 'Tiruchirappalli', state: 'Tamil Nadu', localities: ['thillai nagar', 'srirangam', 'k k nagar', 'cantonment'] },
  'trichy': { city: 'Tiruchirappalli', state: 'Tamil Nadu', localities: ['thillai nagar', 'srirangam', 'k k nagar'] },
  'salem': { city: 'Salem', state: 'Tamil Nadu' },
  'tirunelveli': { city: 'Tirunelveli', state: 'Tamil Nadu' },
  'tiruppur': { city: 'Tiruppur', state: 'Tamil Nadu' },
  'erode': { city: 'Erode', state: 'Tamil Nadu' },
  'vellore': { city: 'Vellore', state: 'Tamil Nadu' },
  'thanjavur': { city: 'Thanjavur', state: 'Tamil Nadu' },
  'kanchipuram': { city: 'Kanchipuram', state: 'Tamil Nadu' },
  'dindigul': { city: 'Dindigul', state: 'Tamil Nadu' },
  'nagercoil': { city: 'Nagercoil', state: 'Tamil Nadu' },
  'hosur': { city: 'Hosur', state: 'Tamil Nadu' },

  // Karnataka
  'bengaluru': {
    city: 'Bengaluru',
    state: 'Karnataka',
    localities: ['indiranagar', 'koramangala', 'whitefield', 'jayanagar', 'hsr layout', 'malleshwaram', 'jp nagar', 'electronic city', 'marathahalli', 'bellandur', 'hebbal', 'banashankari', 'rajajinagar', 'btm layout', 'yelahanka']
  },
  'bangalore': {
    city: 'Bengaluru',
    state: 'Karnataka',
    localities: ['indiranagar', 'koramangala', 'whitefield', 'jayanagar', 'hsr layout', 'malleshwaram', 'jp nagar', 'electronic city', 'marathahalli', 'bellandur', 'hebbal', 'banashankari', 'rajajinagar', 'btm layout', 'yelahanka']
  },
  'mysuru': { city: 'Mysuru', state: 'Karnataka', localities: ['gokulam', 'jayalakshmipuram', 'kuvempunagar', 'vijayanagar'] },
  'mysore': { city: 'Mysuru', state: 'Karnataka', localities: ['gokulam', 'jayalakshmipuram', 'kuvempunagar', 'vijayanagar'] },
  'mangaluru': { city: 'Mangaluru', state: 'Karnataka' },
  'mangalore': { city: 'Mangaluru', state: 'Karnataka' },
  'hubballi': { city: 'Hubballi', state: 'Karnataka' },
  'hubli': { city: 'Hubballi', state: 'Karnataka' },
  'belagavi': { city: 'Belagavi', state: 'Karnataka' },
  'shivamogga': { city: 'Shivamogga', state: 'Karnataka' },

  // Maharashtra
  'mumbai': {
    city: 'Mumbai',
    state: 'Maharashtra',
    localities: ['bandra', 'andheri', 'juhu', 'dadar', 'borivali', 'powai', 'colaba', 'worli', 'santacruz', 'malad', 'chembur', 'ghatkopar', 'kurla', 'mulund', 'kandivali', 'goregaon', 'vile parle', 'khar']
  },
  'pune': {
    city: 'Pune',
    state: 'Maharashtra',
    localities: ['kothrud', 'viman nagar', 'baner', 'wakad', 'hinjewadi', 'hadapsar', 'kalyani nagar', 'aundh', 'shivaji nagar', 'deccan', 'kharadi', 'magarpatta']
  },
  'nagpur': { city: 'Nagpur', state: 'Maharashtra', localities: ['dharampeth', 'ramdaspeth', 'sitabuldi'] },
  'thane': { city: 'Thane', state: 'Maharashtra' },
  'navi mumbai': { city: 'Navi Mumbai', state: 'Maharashtra', localities: ['vashi', 'nerul', 'kharghar', 'belapur', 'panvel'] },
  'nashik': { city: 'Nashik', state: 'Maharashtra' },
  'aurangabad': { city: 'Chhatrapati Sambhajinagar', state: 'Maharashtra' },
  'chhatrapati sambhajinagar': { city: 'Chhatrapati Sambhajinagar', state: 'Maharashtra' },
  'solapur': { city: 'Solapur', state: 'Maharashtra' },
  'kolhapur': { city: 'Kolhapur', state: 'Maharashtra' },

  // Telangana
  'hyderabad': {
    city: 'Hyderabad',
    state: 'Telangana',
    localities: ['banjara hills', 'jubilee hills', 'hitec city', 'gachibowli', 'madhapur', 'kukatpally', 'kondapur', 'begumpet', 'ameerpet', 'secunderabad', 'dilsukhnagar', 'manikonda', 'miyapur', 'somajiguda']
  },
  'secunderabad': { city: 'Secunderabad', state: 'Telangana' },
  'warangal': { city: 'Warangal', state: 'Telangana' },
  'nizamabad': { city: 'Nizamabad', state: 'Telangana' },

  // Andhra Pradesh
  'visakhapatnam': { city: 'Visakhapatnam', state: 'Andhra Pradesh', localities: ['mvp colony', 'gajuwaka', 'seethammadhara', 'siripuram'] },
  'vizag': { city: 'Visakhapatnam', state: 'Andhra Pradesh' },
  'vijayawada': { city: 'Vijayawada', state: 'Andhra Pradesh', localities: ['benz circle', 'governorpet', 'patamata'] },
  'guntur': { city: 'Guntur', state: 'Andhra Pradesh' },
  'tirupati': { city: 'Tirupati', state: 'Andhra Pradesh' },
  'nellore': { city: 'Nellore', state: 'Andhra Pradesh' },
  'kurnool': { city: 'Kurnool', state: 'Andhra Pradesh' },
  'kakinada': { city: 'Kakinada', state: 'Andhra Pradesh' },

  // Kerala
  'kochi': { city: 'Kochi', state: 'Kerala', localities: ['kakkanad', 'edapally', 'fort kochi', 'kaloor', 'panampilly nagar', 'mg road', 'aluva', 'marine drive'] },
  'cochin': { city: 'Kochi', state: 'Kerala' },
  'thiruvananthapuram': { city: 'Thiruvananthapuram', state: 'Kerala', localities: ['kazhakkoottam', 'kowdiar', 'palayam', 'technopark', 'vellayambalam'] },
  'trivandrum': { city: 'Thiruvananthapuram', state: 'Kerala' },
  'kozhikode': { city: 'Kozhikode', state: 'Kerala' },
  'calicut': { city: 'Kozhikode', state: 'Kerala' },
  'thrissur': { city: 'Thrissur', state: 'Kerala' },
  'kollam': { city: 'Kollam', state: 'Kerala' },
  'alappuzha': { city: 'Alappuzha', state: 'Kerala' },
  'kannur': { city: 'Kannur', state: 'Kerala' },
  'palakkad': { city: 'Palakkad', state: 'Kerala' },

  // Delhi NCR
  'new delhi': { city: 'New Delhi', state: 'Delhi', localities: ['connaught place', 'saket', 'hauz khas', 'lajpat nagar', 'vasant kunj', 'dwarka', 'karol bagh', 'rohini', 'janakpuri', 'nehru place', 'greater kailash'] },
  'delhi': { city: 'Delhi', state: 'Delhi', localities: ['connaught place', 'saket', 'hauz khas', 'lajpat nagar', 'vasant kunj', 'dwarka', 'karol bagh', 'rohini', 'janakpuri', 'nehru place', 'greater kailash', 'chandni chowk'] },
  'noida': { city: 'Noida', state: 'Uttar Pradesh', localities: ['sector 18', 'sector 62', 'sector 137', 'sector 50'] },
  'greater noida': { city: 'Greater Noida', state: 'Uttar Pradesh' },
  'gurgaon': { city: 'Gurugram', state: 'Haryana', localities: ['dlf phase 1', 'dlf phase 2', 'cyber city', 'sector 56', 'golf course road', 'sohna road'] },
  'gurugram': { city: 'Gurugram', state: 'Haryana', localities: ['dlf phase 1', 'dlf phase 2', 'cyber city', 'sector 56', 'golf course road', 'sohna road'] },
  'ghaziabad': { city: 'Ghaziabad', state: 'Uttar Pradesh', localities: ['indrapuram', 'vaishali', 'raj nagar'] },
  'faridabad': { city: 'Faridabad', state: 'Haryana' },

  // West Bengal
  'kolkata': { city: 'Kolkata', state: 'West Bengal', localities: ['salt lake', 'park street', 'new town', 'ballygunge', 'alipore', 'howrah', 'behala', 'dum dum', 'jadavpur', 'garia'] },
  'calcutta': { city: 'Kolkata', state: 'West Bengal' },
  'howrah': { city: 'Howrah', state: 'West Bengal' },
  'siliguri': { city: 'Siliguri', state: 'West Bengal' },
  'durgapur': { city: 'Durgapur', state: 'West Bengal' },

  // Gujarat
  'ahmedabad': { city: 'Ahmedabad', state: 'Gujarat', localities: ['satellite', 'bodakdev', 'vastrapur', 'navrangpura', 'prahlad nagar', 'maninagar'] },
  'surat': { city: 'Surat', state: 'Gujarat', localities: ['adajan', 'vesu', 'varachha'] },
  'vadodara': { city: 'Vadodara', state: 'Gujarat', localities: ['alkapuri', 'gotri', 'manjalpur'] },
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
  'varanasi': { city: 'Varanasi', state: 'Uttar Pradesh' },
  'banaras': { city: 'Varanasi', state: 'Uttar Pradesh' },
  'kashi': { city: 'Varanasi', state: 'Uttar Pradesh' },
  'agra': { city: 'Agra', state: 'Uttar Pradesh' },
  'prayagraj': { city: 'Prayagraj', state: 'Uttar Pradesh' },
  'allahabad': { city: 'Prayagraj', state: 'Uttar Pradesh' },
  'meerut': { city: 'Meerut', state: 'Uttar Pradesh' },

  // Madhya Pradesh
  'indore': { city: 'Indore', state: 'Madhya Pradesh', localities: ['vijay nagar', 'palasia', 'saket'] },
  'bhopal': { city: 'Bhopal', state: 'Madhya Pradesh', localities: ['mp nagar', 'arera colony', 'kolar'] },
  'gwalior': { city: 'Gwalior', state: 'Madhya Pradesh' },
  'jabalpur': { city: 'Jabalpur', state: 'Madhya Pradesh' },

  // Bihar
  'patna': { city: 'Patna', state: 'Bihar', localities: ['kankarbagh', 'boring road', 'bailey road'] },
  'gaya': { city: 'Gaya', state: 'Bihar' },

  // Punjab & Chandigarh
  'chandigarh': { city: 'Chandigarh', state: 'Chandigarh', localities: ['sector 17', 'sector 35', 'sector 22'] },
  'ludhiana': { city: 'Ludhiana', state: 'Punjab' },
  'amritsar': { city: 'Amritsar', state: 'Punjab' },

  // Odisha
  'bhubaneswar': { city: 'Bhubaneswar', state: 'Odisha', localities: ['patia', 'saheed nagar', 'nayapalli'] },
  'cuttack': { city: 'Cuttack', state: 'Odisha' },
  'puri': { city: 'Puri', state: 'Odisha' },

  // Jharkhand
  'ranchi': { city: 'Ranchi', state: 'Jharkhand' },
  'jamshedpur': { city: 'Jamshedpur', state: 'Jharkhand' },

  // Chhattisgarh
  'raipur': { city: 'Raipur', state: 'Chhattisgarh' },

  // Goa
  'panaji': { city: 'Panaji', state: 'Goa' },
  'margao': { city: 'Margao', state: 'Goa' },

  // Assam
  'guwahati': { city: 'Guwahati', state: 'Assam' },

  // Uttarakhand & Himachal
  'dehradun': { city: 'Dehradun', state: 'Uttarakhand' },
  'haridwar': { city: 'Haridwar', state: 'Uttarakhand' },
  'shimla': { city: 'Shimla', state: 'Himachal Pradesh' }
};

/**
 * Finds if a string contains any recognized Indian State.
 */
export function findMatchingState(text: string): string | null {
  const clean = text.toLowerCase().trim();
  for (const [, stateInfo] of Object.entries(INDIAN_STATES)) {
    for (const alias of stateInfo.aliases) {
      // Regex word boundary matching
      const regex = new RegExp(`\\b${alias.replace('.', '\\.')}\\b`, 'i');
      if (regex.test(clean)) {
        return stateInfo.canonical;
      }
    }
  }
  return null;
}

/**
 * Validates and parses raw spoken location string into structured geographic object.
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
      needs_clarification: false,
      confidence: 0
    };
  }

  // Check for negative / refusal responses
  const clean = rawInput
    .toLowerCase()
    .replace(/^i\s+(live|stay|work|am|reside)\s+(in|at|near|from)\s+/i, '')
    .replace(/^from\s+/i, '')
    .replace(/^in\s+/i, '')
    .replace(/^(my\s+location\s+is|location\s+is)\s+/i, '')
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const INVALID_LOCATIONS = new Set(['mars', 'moon', 'jupiter', 'sun', 'space', 'earth', 'nowhere', 'unknown', 'anywhere', 'somewhere', 'planet', 'universe']);
  if (INVALID_LOCATIONS.has(clean.toLowerCase())) {
    return {
      locality: null,
      city: null,
      district: null,
      state: null,
      country: 'India',
      formatted_address: '',
      is_state_only: false,
      needs_clarification: true,
      clarification_reason: 'Non-geographic or invalid location provided.',
      clarification_question: 'Could you please tell me which city or town in India you live in?',
      confidence: 0.1
    };
  }

  if (
    clean === 'none' ||
    clean === 'no' ||
    clean.includes("don't want to say") ||
    clean.includes("prefer not to say") ||
    clean.includes("not now") ||
    clean.includes("skip")
  ) {
    return {
      locality: null,
      city: null,
      district: null,
      state: null,
      country: 'India',
      formatted_address: '',
      is_state_only: false,
      needs_clarification: false,
      confidence: 1.0
    };
  }

  const detectedState = findMatchingState(clean) || (existingContextState ? findMatchingState(existingContextState) : null);

  // 1. Check if the user mentioned a known locality within a city
  let matchedLocality: string | null = null;
  let matchedCity: string | null = null;
  let matchedState: string | null = detectedState;

  for (const [cityName, cityData] of Object.entries(MAJOR_CITIES_MAP)) {
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

  // 2. If no locality matched yet, check for direct city match
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

  // 3. Check if input was ONLY a state name (e.g. "Tamil Nadu", "Maharashtra", "I live in Tamil Nadu")
  // If matchedState is found, but no city or locality was detected in the speech
  const isStateOnly = Boolean(detectedState && !matchedCity && !matchedLocality);

  if (isStateOnly && detectedState) {
    // Check if the user specified a specific city that is not in our major dictionary (e.g. "Tiruvannamalai", "Kottayam")
    // If the entire speech is basically just the state name:
    const withoutState = clean
      .replace(new RegExp(`\\b${detectedState.toLowerCase()}\\b`, 'gi'), '')
      .replace(/\s+/g, ' ')
      .trim();

    if (withoutState.length < 3) {
      // Confirmed State-Only input
      return {
        locality: null,
        city: null,
        district: null,
        state: detectedState,
        country: 'India',
        formatted_address: detectedState,
        is_state_only: true,
        needs_clarification: true,
        clarification_reason: `A state (${detectedState}) was provided, but the requested city or locality is missing.`,
        clarification_question: `Which city or locality in ${detectedState} do you live or work in?`,
        confidence: 0.98
      };
    } else {
      // The user gave another token along with state, treat that token as city/locality
      const customCity = withoutState.charAt(0).toUpperCase() + withoutState.slice(1);
      return {
        locality: null,
        city: customCity,
        district: null,
        state: detectedState,
        country: 'India',
        formatted_address: `${customCity}, ${detectedState}`,
        is_state_only: false,
        needs_clarification: false,
        confidence: 0.85
      };
    }
  }

  // 4. City was detected
  if (matchedCity) {
    const formatted = matchedLocality
      ? `${matchedLocality}, ${matchedCity}${matchedState ? ', ' + matchedState : ''}`
      : `${matchedCity}${matchedState ? ', ' + matchedState : ''}`;

    return {
      locality: matchedLocality,
      city: matchedCity,
      district: null,
      state: matchedState,
      country: 'India',
      formatted_address: formatted,
      is_state_only: false,
      needs_clarification: false,
      confidence: 0.96
    };
  }

  // 5. Unrecognized location: check against non-geographic filters
  const NON_LOCATION_WORDS = new Set([
    'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'years', 'year', 'yrs', 'yr', 'months', 'month', 'days', 'day',
    'cooking', 'cleaning', 'tailoring', 'stitching', 'pottery', 'teaching', 'painting', 'knitting',
    'like', 'doing', 'good', 'craft', 'skill', 'work', 'experience', 'services', 'service',
    'yes', 'no', 'correct', 'right', 'wrong', 'actually', 'instead',
    'name', 'called', 'am', 'is', 'are', 'was'
  ]);

  const cleanTokens = clean.split(' ').filter(t => t.length > 1 && !NON_LOCATION_WORDS.has(t.toLowerCase()) && !/^\d+$/.test(t));
  
  // Only accept if at least one token is a capitalized proper noun place name AND user didn't mention skill/experience words
  const hasVerbOrSkill = clean.split(' ').some(w => NON_LOCATION_WORDS.has(w.toLowerCase()) || /^\d+$/.test(w));

  if (!hasVerbOrSkill && cleanTokens.length > 0 && cleanTokens.length <= 3) {
    const titleCased = cleanTokens.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return {
      locality: null,
      city: titleCased,
      district: null,
      state: detectedState || null,
      country: 'India',
      formatted_address: detectedState ? `${titleCased}, ${detectedState}` : titleCased,
      is_state_only: false,
      needs_clarification: false,
      confidence: 0.7
    };
  }

  return {
    locality: null,
    city: null,
    district: null,
    state: detectedState || null,
    country: 'India',
    formatted_address: detectedState || '',
    is_state_only: isStateOnly,
    needs_clarification: true,
    clarification_reason: 'Location string could not be clearly validated.',
    clarification_question: 'Could you please name the city or town in India where you are located?',
    confidence: 0.3
  };
}
