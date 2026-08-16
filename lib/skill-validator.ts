/**
 * Robust Skill Registry and Semantic Validation Layer for SilverHands
 * 
 * Provides:
 * 1. Definitive taxonomy of senior livelihood crafts, vocational skills, culinary arts,
 *    handicrafts, tutoring, sports coaching, and services.
 * 2. Phonetic ASR correction dictionary for Indian English / regional speech errors.
 * 3. Strict rejection of conversational artifacts, pronouns, filler words, and non-skill tokens.
 */

import { ProfileSkill } from './voice-agent';

// Authoritative taxonomy of valid senior livelihood skill categories
export interface CanonicalSkill {
  canonicalName: string;
  category: 'Crafts & Textiles' | 'Culinary & Cooking' | 'Teaching & Academics' | 'Fine Arts & Music' | 'Sports & Fitness' | 'Home & Garden' | 'Vedic & Traditional Services';
  keywords: string[];
}

export const CANONICAL_SKILL_REGISTRY: CanonicalSkill[] = [
  // 1. Crafts & Textiles
  {
    canonicalName: 'Tailoring & Stitching',
    category: 'Crafts & Textiles',
    keywords: ['tailor', 'tailoring', 'taylor', 'stitching', 'stitch', 'sewing', 'sew', 'blouse', 'fall pico', 'dress making', 'alterations', 'garment']
  },
  {
    canonicalName: 'Embroidery & Handcraft',
    category: 'Crafts & Textiles',
    keywords: ['embroidery', 'aari work', 'zari', 'needlework', 'thread work', 'cross stitch', 'hand embroidery']
  },
  {
    canonicalName: 'Wool Knitting & Crochet',
    category: 'Crafts & Textiles',
    keywords: ['knitting', 'knit', 'crochet', 'wool', 'sweater knitting', 'woollen']
  },
  {
    canonicalName: 'Jewellery & Beadwork',
    category: 'Crafts & Textiles',
    keywords: ['jewellery', 'jewelry', 'beadwork', 'beads', 'terracotta jewellery', 'silk thread jewellery', 'quilling']
  },
  {
    canonicalName: 'Pottery & Clay Art',
    category: 'Crafts & Textiles',
    keywords: ['pottery', 'clay', 'clay work', 'ceramics', 'terracotta', 'mud art']
  },

  // 2. Culinary & Cooking
  {
    canonicalName: 'Traditional Cooking',
    category: 'Culinary & Cooking',
    keywords: ['cooking', 'traditional cooking', 'cook', 'culinary', 'recipes', 'home food', 'catering']
  },
  {
    canonicalName: 'South Indian Cooking',
    category: 'Culinary & Cooking',
    keywords: ['south indian cooking', 'sambar', 'rasam', 'dosa', 'idli', 'tamil cuisine', 'kerala cuisine', 'andhra cuisine']
  },
  {
    canonicalName: 'North Indian Cooking',
    category: 'Culinary & Cooking',
    keywords: ['north indian cooking', 'roti', 'paratha', 'punjabi food', 'dal makhani', 'curry']
  },
  {
    canonicalName: 'Traditional Pickles & Podis',
    category: 'Culinary & Cooking',
    keywords: ['pickles', 'pickle making', 'podi', 'masala powder', 'chutney powder', 'achar', 'papad', 'vadam', 'sweets making', 'savouries', 'bakery', 'baking']
  },

  // 3. Teaching & Academics
  {
    canonicalName: 'Mathematics Teaching',
    category: 'Teaching & Academics',
    keywords: ['math', 'maths', 'mathematics', 'vedic maths', 'arithmetic', 'algebra', 'geometry', 'calculus']
  },
  {
    canonicalName: 'Science Tutoring',
    category: 'Teaching & Academics',
    keywords: ['science', 'physics', 'chemistry', 'biology', 'science tuition', 'school science']
  },
  {
    canonicalName: 'English Teaching & Spoken English',
    category: 'Teaching & Academics',
    keywords: ['english', 'english teaching', 'spoken english', 'grammar', 'reading', 'phonics', 'literature']
  },
  {
    canonicalName: 'Regional Language Teaching',
    category: 'Teaching & Academics',
    keywords: ['tamil', 'hindi', 'kannada', 'telugu', 'malayalam', 'marathi', 'sanskrit', 'bengali', 'language tuition', 'language teaching']
  },
  {
    canonicalName: 'General Academic Tutoring',
    category: 'Teaching & Academics',
    keywords: ['tutoring', 'tuition', 'homework help', 'teaching children', 'primary tuition', 'school tuition']
  },

  // 4. Fine Arts & Music
  {
    canonicalName: 'Painting & Fine Arts',
    category: 'Fine Arts & Music',
    keywords: ['painting', 'drawing', 'sketching', 'watercolour', 'oil painting', 'acrylic painting', 'tanjore painting', 'madhubani', 'rangoli', 'kolam']
  },
  {
    canonicalName: 'Carnatic / Hindustani Vocal Music',
    category: 'Fine Arts & Music',
    keywords: ['music', 'vocal music', 'singing', 'carnatic music', 'hindustani music', 'classical singing', 'bhajans', 'slokas', 'chanting']
  },
  {
    canonicalName: 'Musical Instruments',
    category: 'Fine Arts & Music',
    keywords: ['veena', 'flute', 'violin', 'harmonium', 'keyboard', 'tabla', 'mridangam', 'guitar', 'sitar']
  },

  // 5. Sports & Fitness
  {
    canonicalName: 'Badminton Coaching',
    category: 'Sports & Fitness',
    keywords: ['badminton', 'shuttlecock', 'shuttle', 'badminton coaching', 'racket sports']
  },
  {
    canonicalName: 'Cricket Coaching',
    category: 'Sports & Fitness',
    keywords: ['cricket', 'batting coaching', 'bowling coaching', 'cricket training']
  },
  {
    canonicalName: 'Tennis & Table Tennis',
    category: 'Sports & Fitness',
    keywords: ['tennis', 'lawn tennis', 'table tennis', 'ping pong']
  },
  {
    canonicalName: 'Chess Coaching',
    category: 'Sports & Fitness',
    keywords: ['chess', 'chess coaching', 'chess training', 'chess tutor']
  },
  {
    canonicalName: 'Yoga & Pranayama',
    category: 'Sports & Fitness',
    keywords: ['yoga', 'pranayama', 'meditation', 'breathing exercises', 'senior fitness', 'gentle yoga']
  },

  // 6. Home & Garden
  {
    canonicalName: 'Gardening & Plant Care',
    category: 'Home & Garden',
    keywords: ['gardening', 'plants', 'bonsai', 'terrace garden', 'kitchen garden', 'organic farming', 'composting']
  },
  {
    canonicalName: 'Cleaning & Housekeeping',
    category: 'Home & Garden',
    keywords: ['cleaning', 'housekeeping', 'home organization', 'maid', 'deep cleaning', 'sweeping', 'vessel washing']
  },

  // 7. Vedic & Traditional Services
  {
    canonicalName: 'Vedic Astrology & Horoscopes',
    category: 'Vedic & Traditional Services',
    keywords: ['astrology', 'jyotish', 'horoscope', 'vedic astrology', 'kundali', 'panchangam', 'numerology', 'vastu']
  },
  {
    canonicalName: 'Pooja & Vedic Rituals',
    category: 'Vedic & Traditional Services',
    keywords: ['pooja', 'puja', 'vedic rituals', 'priest services', 'homa', 'havan', 'mantra chanting']
  }
];

// Phonetic ASR transcription error dictionary for common speech-to-text misrecognitions
export const PHONETIC_ASR_FIXES: Record<string, string> = {
  // Badminton misrecognitions
  'back middle': 'Badminton Coaching',
  'backmitten': 'Badminton Coaching',
  'bad mitten': 'Badminton Coaching',
  'bad minten': 'Badminton Coaching',
  'black mitten': 'Badminton Coaching',
  'blackmitten': 'Badminton Coaching',
  'batminton': 'Badminton Coaching',
  'badmiton': 'Badminton Coaching',
  'shuttle player': 'Badminton Coaching',
  'shuttle': 'Badminton Coaching',

  // Tailoring misrecognitions
  'taylor': 'Tailoring & Stitching',
  'tayloring': 'Tailoring & Stitching',
  'tale ring': 'Tailoring & Stitching',
  'stiching': 'Tailoring & Stitching',
  'stich': 'Tailoring & Stitching',

  // Cooking misrecognitions
  'cookery': 'Traditional Cooking',
  'cool king': 'Traditional Cooking',

  // Astrology misrecognitions
  'astro': 'Vedic Astrology & Horoscopes',
  'horo scope': 'Vedic Astrology & Horoscopes',

  // Yoga misrecognitions
  'yo ga': 'Yoga & Pranayama',
  'pranayam': 'Yoga & Pranayama',

  // Chess misrecognitions
  'ches': 'Chess Coaching'
};

// Conversational tokens and garbage strings that must NEVER be treated as skills
export const FORBIDDEN_SKILL_WORDS = new Set([
  'i think', 'i think i', 'think i', 'i guess', 'i believe', 'i feel',
  'i have', 'i am', 'i do', 'i know', 'i like', 'i like to', 'i want',
  'yes', 'no', 'yeah', 'yep', 'nope', 'correct', 'everything is correct',
  'all good', 'looks good', 'that is right', 'right', 'sure', 'ok', 'okay',
  'experience', 'years', 'year', 'yrs', 'yr', 'months', 'month', 'days',
  'zero', 'none', 'nil', 'null', 'nothing', 'na',
  'doing this', 'have been', 'i have of', 'of experience', 'years of experience',
  'hello', 'hi', 'hey', 'actually', 'basically', 'well', 'also', 'so',
  'my name is', 'my location is', 'living in', 'live in', 'from',
  'mars', 'moon', 'jupiter', 'sun', 'earth', 'space',
  'coronado', 'unknown', 'somewhere', 'anywhere'
]);

/**
 * Validates whether a raw string represents an authentic livelihood skill or service.
 */
export function isValidSkillEntity(raw: string): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const clean = raw.trim().toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ').replace(/\s+/g, ' ');
  if (clean.length < 2) return false;

  // Check forbidden tokens
  if (FORBIDDEN_SKILL_WORDS.has(clean)) return false;

  for (const forbidden of FORBIDDEN_SKILL_WORDS) {
    if (clean === forbidden || clean.startsWith(forbidden + ' ') || clean.endsWith(' ' + forbidden) || clean.includes(' ' + forbidden + ' ')) {
      return false;
    }
  }

  // Reject name introductions, pronouns, and self-declarations
  if (
    clean.startsWith("i'm ") ||
    clean.startsWith('im ') ||
    clean.startsWith('i am ') ||
    clean.startsWith('my name ') ||
    clean.startsWith('myself ') ||
    clean.startsWith('this is ') ||
    clean.startsWith('call me ')
  ) {
    return false;
  }

  // Reject geographical, location, and residency terms
  if (
    clean.includes('from') || 
    clean.includes('live') || 
    clean.includes('stay') || 
    clean.includes('mylapore') || 
    clean.includes('chennai') || 
    clean.includes('bengaluru') || 
    clean.includes('mumbai') || 
    clean.includes('delhi') || 
    clean.includes('nadu')
  ) {
    return false;
  }

  // Reject pure numbers or years phrases
  if (/^\d+$/.test(clean) || /^\d+\s*(?:years?|yrs?|months?)?$/i.test(clean)) {
    return false;
  }

  return true;
}

/**
 * Normalizes a candidate skill string to its canonical title.
 * Performs phonetic lookup, keyword mapping, and strict semantic validation.
 */
export function resolveCanonicalSkill(rawText: string): {
  normalized: string | null;
  category: string | null;
  confidence: number;
  isValid: boolean;
} {
  if (!rawText || !rawText.trim()) {
    return { normalized: null, category: null, confidence: 0, isValid: false };
  }

  let text = rawText
    .toLowerCase()
    .replace(/^(uh|um|well|actually|basically|so|like|i\s+mainly\s+do|i\s+mainly|i\s+also\s+teach|i\s+also\s+do|i\s+also\s+know|i\s+also|i\s+teach|i\s+know|i\s+do|and\s+i|but\s+i|i\s+make|i\s+cook|i\s+specialize\s+in|i\s+have\s+expertise\s+in|i\s+practice)\s+/gi, '')
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Check against Phonetic ASR Corrections
  if (PHONETIC_ASR_FIXES[text]) {
    const fixed = PHONETIC_ASR_FIXES[text];
    const match = CANONICAL_SKILL_REGISTRY.find(c => c.canonicalName.toLowerCase() === fixed.toLowerCase());
    return {
      normalized: fixed,
      category: match?.category || 'General Skills',
      confidence: 0.98,
      isValid: true
    };
  }

  for (const [phonetic, canonical] of Object.entries(PHONETIC_ASR_FIXES)) {
    if (text.includes(phonetic)) {
      const match = CANONICAL_SKILL_REGISTRY.find(c => c.canonicalName.toLowerCase() === canonical.toLowerCase());
      return {
        normalized: canonical,
        category: match?.category || 'General Skills',
        confidence: 0.96,
        isValid: true
      };
    }
  }

  // 2. Check against canonical skill taxonomy keywords
  for (const skill of CANONICAL_SKILL_REGISTRY) {
    for (const kw of skill.keywords) {
      const regex = new RegExp(`\\b${kw.replace('.', '\\.')}\\b`, 'i');
      if (regex.test(text)) {
        return {
          normalized: skill.canonicalName,
          category: skill.category,
          confidence: 0.95,
          isValid: true
        };
      }
    }
  }

  // 3. Fallback validation: check if the phrase is valid semantically
  if (!isValidSkillEntity(text)) {
    return { normalized: null, category: null, confidence: 0, isValid: false };
  }

  // Reject geographical, pronoun, and conversational terms
  if (
    text.includes('live') || 
    text.includes('from') || 
    text.includes('stay') || 
    text.includes('city') || 
    text.includes('town') ||
    text.includes('state') ||
    text.includes('chennai') ||
    text.includes('bengaluru') ||
    text.includes('mumbai') ||
    text.includes('delhi') ||
    text.includes('nadu') ||
    text.includes('mars') ||
    text.includes('coronado')
  ) {
    return { normalized: null, category: null, confidence: 0, isValid: false };
  }

  // If text is a clean 1-3 word craft/work description not matching our database
  const words = text.split(' ').filter(w => w.length > 1);
  if (words.length >= 1 && words.length <= 3) {
    const formatted = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return {
      normalized: formatted,
      category: 'Other Services',
      confidence: 0.8,
      isValid: true
    };
  }

  return { normalized: null, category: null, confidence: 0, isValid: false };
}
