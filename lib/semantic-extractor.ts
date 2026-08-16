import { validateAndParseLocation, StructuredLocation } from './location-validator';
import { ProfileSkill } from './voice-agent';

export interface ProfileExtractionResult {
  field: 'name' | 'skill' | 'experience_years' | 'location' | 'services' | 'confirmation' | 'unknown';
  normalized_name?: string | null;
  normalized_skill?: string | null;
  normalized_skills?: ProfileSkill[];
  normalized_experience?: number | null;
  structured_location?: StructuredLocation | null;
  confidence: number;
  needs_clarification: boolean;
  clarification_reason?: string;
  clarification_question?: string;
}

/**
 * Normalizes user name from speech, stripping all conversational framing
 * (e.g. "I think I'm Harish" -> "Harish", "You can call me Lakshmi Amma" -> "Lakshmi Amma")
 */
export function normalizeName(rawSpeech: string): { name: string | null; confidence: number } {
  if (!rawSpeech || !rawSpeech.trim()) return { name: null, confidence: 0 };

  // Isolate name clause if part of a compound introduction (e.g. "I'm Harish, I do tailoring...")
  let clause = rawSpeech.split(/,\s*|\s+(?:and\s+)?(?:i\s+do|i\s+have|i\s+know|i\s+teach|i\s+work|i\s+am\s+from|from|living\s+in)\b/i)[0];

  let text = clause
    .replace(/^(uh|um|well|actually|basically|so|like|hello|hi|hey|good\s+morning|good\s+afternoon|good\s+evening)\s+/gi, '')
    .trim();

  // Strip conversational qualifiers & introduction prefixes
  text = text
    .replace(/^i\s+think\s+my\s+name\s+is\s+/i, '')
    .replace(/^i\s+think\s+you\s+can\s+call\s+me\s+/i, '')
    .replace(/^i\s+think\s+i'?m\s+called\s+/i, '')
    .replace(/^i\s+think\s+i'?m\s+/i, '')
    .replace(/^i\s+think\s+i\s+am\s+/i, '')
    .replace(/^i\s+think\s+it'?s\s+/i, '')
    .replace(/^i\s+think\s+/i, '')
    .replace(/^i\s+guess\s+my\s+name\s+is\s+/i, '')
    .replace(/^i\s+guess\s+i'?m\s+/i, '')
    .replace(/^i\s+believe\s+my\s+name\s+is\s+/i, '')
    .replace(/^people\s+call\s+me\s+/i, '')
    .replace(/^they\s+call\s+me\s+/i, '')
    .replace(/^you\s+can\s+call\s+me\s+/i, '')
    .replace(/^call\s+me\s+/i, '')
    .replace(/^my\s+name\s+is\s+/i, '')
    .replace(/^this\s+is\s+/i, '')
    .replace(/^i\s+am\s+called\s+/i, '')
    .replace(/^i\s+am\s+/i, '')
    .replace(/^i'?m\s+/i, '')
    .replace(/^iam\s+/i, '')
    .replace(/^myself\s+/i, '')
    .replace(/^it'?s\s+/i, '')
    .replace(/^it\s+is\s+/i, '')
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip trailing "here", "speaking", "this side"
  text = text
    .replace(/\s+(here|speaking|this\s+side)$/i, '')
    .trim();

  // Non-name action verbs, craft words, and conversational fillers
  const NON_NAME_TOKENS = new Set([
    'like', 'likes', 'love', 'loves', 'do', 'doing', 'does', 'know', 'knows', 'good', 'great',
    'cook', 'cooking', 'clean', 'cleaning', 'tailor', 'tailoring', 'stitch', 'stitching',
    'pottery', 'clay', 'teach', 'teaching', 'paint', 'painting', 'knit', 'knitting',
    'embroidery', 'crochet', 'music', 'singing', 'math', 'mathematics',
    'years', 'year', 'yrs', 'yr', 'months', 'days', 'zero', 'one', 'two', 'three', 'four', 'five',
    'live', 'living', 'stay', 'staying', 'work', 'working', 'services', 'service',
    'yes', 'no', 'yeah', 'yep', 'nope', 'correct', 'true', 'false', 'actually', 'instead',
    'sure', 'ok', 'okay', 'fine', 'ready', 'hello', 'hi', 'hey'
  ]);

  // Remove common filler words if any still precede a proper noun
  const fillerTokens = ['i', 'think', 'im', "i'm", 'am', 'is', 'my', 'name', 'the', 'a', 'just', 'to'];
  const words = text.split(' ').filter(w => w.length > 0);
  const cleanWords = words.filter(w => !fillerTokens.includes(w.toLowerCase()));

  const finalNameWords = cleanWords.length > 0 ? cleanWords : words;
  if (finalNameWords.length === 0 || finalNameWords.length > 3) return { name: null, confidence: 0 };

  // If any token in the candidate name is an action verb or craft word, reject it
  if (finalNameWords.some(w => NON_NAME_TOKENS.has(w.toLowerCase()))) {
    return { name: null, confidence: 0 };
  }

  const titleCased = finalNameWords
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  return { name: titleCased, confidence: 0.95 };
}

/**
 * Generic semantic extraction and normalization for a single skill entity
 */
export function normalizeSkill(rawSpeech: string): {
  normalized: string | null;
  confidence: number;
  needs_clarification: boolean;
  clarification_question?: string;
} {
  if (!rawSpeech || !rawSpeech.trim()) {
    return { normalized: null, confidence: 0, needs_clarification: true };
  }

  let text = rawSpeech
    .toLowerCase()
    .replace(/^(uh|um|well|actually|basically|so|like|yeah)\s+/gi, '')
    .trim();

  // Strip conversational self-declarations
  text = text
    .replace(/^i'?ve\s+been\s+doing\s+/i, '')
    .replace(/^i'?ve\s+been\s+/i, '')
    .replace(/^i\s+have\s+been\s+doing\s+/i, '')
    .replace(/^i\s+have\s+been\s+/i, '')
    .replace(/^i'?m\s+good\s+at\s+playing\s+/i, '')
    .replace(/^i'?m\s+good\s+at\s+doing\s+/i, '')
    .replace(/^i'?m\s+good\s+at\s+making\s+/i, '')
    .replace(/^i'?m\s+good\s+at\s+teaching\s+/i, '')
    .replace(/^i'?m\s+good\s+at\s+/i, '')
    .replace(/^i\s+am\s+good\s+at\s+playing\s+/i, '')
    .replace(/^i\s+am\s+good\s+at\s+/i, '')
    .replace(/^i\s+know\s+how\s+to\s+play\s+/i, '')
    .replace(/^i\s+know\s+how\s+to\s+make\s+/i, '')
    .replace(/^i\s+know\s+how\s+to\s+cook\s+/i, 'cooking ')
    .replace(/^i\s+know\s+how\s+to\s+/i, '')
    .replace(/^i\s+know\s+/i, '')
    .replace(/^i\s+like\s+to\s+play\s+/i, '')
    .replace(/^i\s+like\s+to\s+make\s+/i, '')
    .replace(/^i\s+like\s+to\s+/i, '')
    .replace(/^i\s+love\s+to\s+/i, '')
    .replace(/^my\s+skill\s+is\s+/i, '')
    .replace(/^my\s+craft\s+is\s+/i, '')
    .replace(/^my\s+work\s+is\s+/i, '')
    .replace(/^my\s+offering\s+is\s+/i, '')
    .replace(/^i\s+do\s+/i, '')
    .replace(/^i\s+make\s+/i, '')
    .replace(/^i\s+cook\s+/i, 'cooking ')
    .replace(/^i\s+teach\s+/i, 'teaching ')
    .replace(/^i\s+specialize\s+in\s+/i, '')
    .replace(/^i\s+have\s+expertise\s+in\s+/i, '')
    .replace(/^i\s+practice\s+/i, '')
    .replace(/^playing\s+/i, '')
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Phonetic & common Indian ASR transcription error mappings
  const phoneticBadminton = [
    'badminton', 'bad minten', 'bad mitten', 'black mitten', 'blackmitten',
    'batminton', 'badmitten', 'shuttle', 'shuttlecock', 'shuttle cock', 'badmiton', 'shuttle player'
  ];
  if (phoneticBadminton.some(term => text.includes(term))) {
    return { normalized: 'Badminton', confidence: 0.98, needs_clarification: false };
  }

  const phoneticCricket = ['cricket', 'cricketer', 'batting', 'bowling coaching', 'cricket coaching'];
  if (phoneticCricket.some(term => text.includes(term))) {
    return { normalized: 'Cricket Coaching', confidence: 0.95, needs_clarification: false };
  }

  const phoneticTennis = ['tennis', 'lawn tennis', 'table tennis'];
  if (phoneticTennis.some(term => text.includes(term))) {
    return { normalized: text.includes('table') ? 'Table Tennis' : 'Tennis', confidence: 0.95, needs_clarification: false };
  }

  const phoneticChess = ['chess', 'chess coaching', 'ches coaching', 'chess teacher'];
  if (phoneticChess.some(term => text.includes(term))) {
    return { normalized: 'Chess Coaching', confidence: 0.95, needs_clarification: false };
  }

  if (text.includes('tailor') || text.includes('taylor') || text.includes('stitch') || text.includes('blouse') || text.includes('sewing') || text.includes('embroidery')) {
    if (text.includes('blouse')) return { normalized: 'Tailoring / Blouse Stitching', confidence: 0.97, needs_clarification: false };
    if (text.includes('embroidery')) return { normalized: 'Embroidery & Handcraft', confidence: 0.97, needs_clarification: false };
    return { normalized: 'Tailoring & Stitching', confidence: 0.96, needs_clarification: false };
  }
  if (text.includes('jewel') || text.includes('jewellery') || text.includes('jewelry') || text.includes('beads')) {
    return { normalized: 'Jewellery Making', confidence: 0.97, needs_clarification: false };
  }
  if (text.includes('pottery') || text.includes('potery') || text.includes('clay')) {
    return { normalized: 'Pottery', confidence: 0.97, needs_clarification: false };
  }
  if (text.includes('paint') || text.includes('art') || text.includes('drawing') || text.includes('sketch')) {
    return { normalized: 'Painting & Fine Arts', confidence: 0.96, needs_clarification: false };
  }
  if (text.includes('south indian food') || text.includes('south indian cooking') || text.includes('sambar') || text.includes('dosa') || text.includes('idli')) {
    return { normalized: 'South Indian Cooking', confidence: 0.97, needs_clarification: false };
  }
  if (text.includes('clean') || text.includes('cleaning') || text.includes('housekeeping') || text.includes('maid') || text.includes('sweeping')) {
    return { normalized: 'Cleaning & Housekeeping', confidence: 0.95, needs_clarification: false };
  }
  if (text.includes('traditional cooking') || text.includes('cooking') || text.includes('recipe') || text.includes('culinary') || text.includes('bake') || text.includes('baking')) {
    return { normalized: 'Traditional Cooking', confidence: 0.95, needs_clarification: false };
  }
  if (text.includes('math') || text.includes('mathematics')) {
    return { normalized: 'Mathematics Teaching', confidence: 0.96, needs_clarification: false };
  }
  if (text.includes('english')) {
    return { normalized: 'English Teaching', confidence: 0.96, needs_clarification: false };
  }
  if (text.includes('science') || text.includes('physics') || text.includes('chemistry') || text.includes('biology')) {
    return { normalized: 'Science Tutoring', confidence: 0.95, needs_clarification: false };
  }
  if (text.includes('coach') || text.includes('coaching') || text.includes('children')) {
    return { normalized: 'Sports Coaching', confidence: 0.95, needs_clarification: false };
  }
  if (text.includes('yoga') || text.includes('pranayama') || text.includes('meditation')) {
    return { normalized: 'Yoga & Meditation', confidence: 0.97, needs_clarification: false };
  }
  if (text.includes('music') || text.includes('singing') || text.includes('carnatic') || text.includes('hindustani') || text.includes('vocal')) {
    if (text.includes('carnatic')) return { normalized: 'Carnatic Vocal Music', confidence: 0.97, needs_clarification: false };
    return { normalized: 'Music & Vocal Training', confidence: 0.95, needs_clarification: false };
  }
  if (text.includes('gardening') || text.includes('bonsai') || text.includes('plants') || text.includes('organic farming') || text.includes('watering')) {
    return { normalized: 'Gardening & Plant Care', confidence: 0.96, needs_clarification: false };
  }
  if (text.includes('knit') || text.includes('crochet') || text.includes('wool') || text.includes('sweater')) {
    return { normalized: 'Wool Knitting & Crochet', confidence: 0.96, needs_clarification: false };
  }
  if (text.includes('astrology') || text.includes('horoscope') || text.includes('jyotish')) {
    return { normalized: 'Vedic Astrology', confidence: 0.96, needs_clarification: false };
  }

  // Ambiguity check: if user said something very generic like "I work with clothes"
  if (text === 'clothes' || text === 'making things' || text === 'hand work' || text === 'crafts') {
    return {
      normalized: 'Handcrafts',
      confidence: 0.6,
      needs_clarification: true,
      clarification_question: `Do you want to list ${text === 'clothes' ? 'Tailoring & Stitching' : 'Handicrafts'} as your primary skill?`
    };
  }

  // Reject conversational self-intros, fillers, numbers, experience phrases, and location clauses
  const fillerWords = ['actually', 'basically', 'well', 'also', 'so', 'yes', 'no', 'yeah', 'hello', 'hi', 'hey', 'okay', 'ok', 'right', 'sure', 'fine'];
  if (
    fillerWords.includes(text) ||
    text.includes('experience') ||
    text.includes('year') ||
    text.includes('years') ||
    text.includes('doing this') ||
    text.includes('have been') ||
    text.includes('i have of') ||
    text.includes('like to do') ||
    text.includes('like to') ||
    text.match(/^\d+\s*(?:years?|yrs?|yr)?$/i) ||
    text.match(/^(?:about|around|for|with)?\s*\d+\s*(?:years?|yrs?)?$/i) ||
    text.match(/^(?:about|around|for|with)?\s*(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty)\s*(?:years?|yrs?)?$/i) ||
    text.match(/^\d+$/) ||
    text.includes('from ') ||
    text.includes('living in') ||
    text.includes('live in') ||
    text.startsWith('my name is') ||
    text.match(/^i'?m\s+[a-z]+$/i) ||
    text.match(/^i\s+am\s+[a-z]+$/i) ||
    text === 'yes' ||
    text === 'no' ||
    text.includes('correct')
  ) {
    return { normalized: null, confidence: 0, needs_clarification: true };
  }

  // Generic fallback: title-case the cleaned skill string (must be at least 3 chars and not a pronoun/location)
  if (text.length >= 3) {
    const formatted = text
      .split(' ')
      .filter(w => w.length > 0)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');

    return {
      normalized: formatted,
      confidence: 0.88,
      needs_clarification: false
    };
  }

  return {
    normalized: null,
    confidence: 0,
    needs_clarification: true,
    clarification_question: 'Could you please describe your primary skill or craft in a few words?'
  };
}

/**
 * Extracts multiple distinct skills and any inline experience numbers provided in natural speech.
 * Example inputs:
 * - "I do tailoring and I also teach mathematics"
 *   -> [{ name: "Tailoring & Stitching", experience_years: null }, { name: "Mathematics Teaching", experience_years: null }]
 * - "I've been doing tailoring for 10 years and teaching maths for 4 years"
 *   -> [{ name: "Tailoring & Stitching", experience_years: 10 }, { name: "Mathematics Teaching", experience_years: 4 }]
 * - "I mainly do tailoring, but I also do embroidery"
 *   -> [{ name: "Tailoring & Stitching", type: "primary", experience_years: null }, { name: "Embroidery & Handcraft", type: "additional", experience_years: null }]
 */
export function normalizeSkillsList(rawSpeech: string): ProfileSkill[] {
  if (!rawSpeech || !rawSpeech.trim()) return [];

  const rawLower = rawSpeech.toLowerCase().trim();

  // 1. Check for primary vs additional phrasing
  const isMainlyPrimary = rawLower.includes('mainly') || rawLower.includes('primary') || rawLower.includes('main skill');

  // Split speech on multi-skill connectives (commas, 'and', 'but also', 'as well as', 'also')
  const chunks = rawSpeech
    .split(/,|\b(?:and|also|as\s+well\s+as|along\s+with|plus|but)\b/gi)
    .map(c => c.trim())
    .filter(c => c.length > 1);

  const results: ProfileSkill[] = [];
  const seenNames = new Set<string>();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // Check if inline experience was mentioned inside this specific chunk
    let chunkExperience: number | null = null;

    if (chunk.match(/\b(just\s+started|beginner|fresh|started\s+recently|learning\s+now|start)\b/i)) {
      chunkExperience = 0;
    } else {
      const expMatch = chunk.match(/\b(?:for|with|about|around|approx)?\s*(\d+)\s*(?:years?|yrs?)?\b/i);
      if (expMatch && chunk.match(/\b(?:years?|yrs?|for\s+\d+|with\s+\d+|about\s+\d+|around\s+\d+)\b/i)) {
        const parsed = parseInt(expMatch[1], 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 80) {
          chunkExperience = parsed;
        }
      } else {
        // Check for number words in chunk (e.g. "for six years" or "for six")
        for (const [word, num] of Object.entries(NUMBER_WORDS)) {
          if (new RegExp(`\\b(?:for|with|about|around)?\\s*${word}\\s*(?:years?|yrs?)?\\b`, 'i').test(chunk) && chunk.match(/\b(?:years?|for\s+[a-z]+|about\s+[a-z]+)\b/i)) {
            chunkExperience = num;
            break;
          }
        }
      }
    }

    // Clean chunk text from experience phrases to isolate the skill name
    const skillNameText = chunk
      .replace(/\b(?:for|with|about|around|approx|doing\s+this\s+for)?\s*(?:about|around)?\s*\d+\s*(?:years?|yrs?)?\b/gi, '')
      .replace(/\b(?:for|with|about|around)?\s*(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty)\s*(?:years?|yrs?)?\b/gi, '')
      .replace(/\b(just\s+started|started\s+recently|beginner)\b/gi, '')
      .replace(/^(i\s+mainly\s+do|i\s+mainly|i\s+also\s+do|i\s+also|i\s+know|i\s+teach|i\s+do|and\s+i|but\s+i)\s+/gi, '')
      .replace(/\s+(for|about|around|with)$/i, '')
      .trim();

    const normalized = normalizeSkill(skillNameText);
    if (normalized.normalized) {
      const existing = results.find(r => r.name.toLowerCase() === normalized.normalized!.toLowerCase());
      if (existing) {
        if (chunkExperience !== null) {
          existing.experience_years = chunkExperience;
        }
      } else {
        seenNames.add(normalized.normalized);

        let skillType: 'primary' | 'additional' = results.length === 0 ? 'primary' : 'additional';
        if (isMainlyPrimary) {
          if (chunk.toLowerCase().includes('mainly') || results.length === 0) skillType = 'primary';
          else skillType = 'additional';
        }

        results.push({
          name: normalized.normalized,
          type: skillType,
          experience_years: chunkExperience
        });
      }
    } else if (chunkExperience !== null && results.length > 0) {
      // Experience was spoken as a trailing chunk (e.g. "cooking, 10 years" or "cooking and cleaning, 0 years")
      // Attach to the last skill that does not have experience years yet
      const unassignedSkill = results.slice().reverse().find(r => r.experience_years === null);
      if (unassignedSkill) {
        unassignedSkill.experience_years = chunkExperience;
      }
    }
  }

  // Fallback: If chunking returned nothing, try full string
  if (results.length === 0) {
    const single = normalizeSkill(rawSpeech);
    if (single.normalized) {
      results.push({
        name: single.normalized,
        type: 'primary',
        experience_years: null
      });
    }
  }

  return results;
}

// Word-to-number dictionary for natural Indian spoken English
const NUMBER_WORDS: Record<string, number> = {
  'zero': 0, 'none': 0, 'nil': 0, 'no': 0, 'nothing': 0, 'null': 0, 'fresh': 0, 'beginner': 0, 'starter': 0,
  'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
  'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
  'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20,
  'twenty one': 21, 'twenty two': 22, 'twenty three': 23, 'twenty four': 24, 'twenty five': 25,
  'thirty': 30, 'thirty five': 35, 'forty': 40, 'forty five': 45, 'fifty': 50,
  'sixty': 60
};

/**
 * Robustly converts natural spoken audio digits/words into numeric PIN string.
 * Example: "four two four two" -> "4242", "one two three four" -> "1234", "9 8 7 6" -> "9876"
 */
export function extractSpokenDigits(rawSpeech: string, targetLength: number = 4): string {
  if (!rawSpeech) return '';
  const wordMap: Record<string, string> = {
    'zero': '0', 'oh': '0', 'o': '0', 'nil': '0',
    'one': '1', 'won': '1',
    'two': '2', 'to': '2', 'too': '2',
    'three': '3', 'tree': '3',
    'four': '4', 'for': '4', 'fore': '4',
    'five': '5',
    'six': '6',
    'seven': '7',
    'eight': '8', 'ate': '8',
    'nine': '9'
  };

  const tokens = rawSpeech.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean);
  let digits = '';
  for (const t of tokens) {
    if (/^\d+$/.test(t)) {
      digits += t;
    } else if (wordMap[t]) {
      digits += wordMap[t];
    }
  }

  return digits.slice(0, targetLength);
}

/**
 * Accurately extracts experience in years from natural spoken audio.
 * NEVER defaults to 30 or any arbitrary dummy number!
 * Correctly parses "0", "0 years", "none", "zero", "15 years", "about twenty years", etc.
 */
export function normalizeExperience(rawSpeech: string): {
  experience_years: number | null;
  confidence: number;
  needs_clarification: boolean;
  clarification_question?: string;
} {
  if (!rawSpeech || !rawSpeech.trim()) {
    return { experience_years: null, confidence: 0, needs_clarification: true };
  }

  const clean = rawSpeech
    .toLowerCase()
    .replace(/^(uh|um|well|i\s+have|i\s+got|around|about|almost|nearly|more\s+than|past|over|for)\s+/gi, '')
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Check for explicit Zero / None / Beginner
  if (
    clean === '0' ||
    clean === '0 years' ||
    clean === '0 yrs' ||
    clean === 'zero' ||
    clean === 'zero years' ||
    clean === 'none' ||
    clean === 'none at all' ||
    clean === 'no experience' ||
    clean === 'nil' ||
    clean === 'just starting' ||
    clean === 'i have no experience' ||
    clean === 'no years' ||
    clean === 'fresh' ||
    clean === 'beginner'
  ) {
    return { experience_years: 0, confidence: 0.99, needs_clarification: false };
  }

  // 2. Check for numeric digits in speech (e.g. "5 years", "15", "30 years", "0")
  const digitMatch = clean.match(/\b\d+\b/);
  if (digitMatch) {
    const parsedNum = parseInt(digitMatch[0], 10);
    if (!isNaN(parsedNum) && parsedNum >= 0 && parsedNum <= 80) {
      return { experience_years: parsedNum, confidence: 0.98, needs_clarification: false };
    }
  }

  // 3. Check for spoken number words ("fifteen years", "twenty", "five", "zero")
  for (const [word, num] of Object.entries(NUMBER_WORDS)) {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    if (regex.test(clean)) {
      return { experience_years: num, confidence: 0.95, needs_clarification: false };
    }
  }

  // If unparseable, return null and ask for clarification. NEVER default to 30!
  return {
    experience_years: null,
    confidence: 0,
    needs_clarification: true,
    clarification_question: 'Could you please tell me how many years of experience you have, for example, zero, five, or ten years?'
  };
}

/**
 * Checks if speech is a confirmation response (Yes/No)
 */
export function isConfirmationResponse(rawSpeech: string): { isConfirmed: boolean; isRejected: boolean; isUnclear: boolean } {
  const clean = rawSpeech.toLowerCase().trim();

  const yesKeywords = ['yes', 'yeah', 'yep', 'correct', 'right', 'looks good', 'fine', 'sure', 'confirm', 'perfect', 'accurate', 'ok', 'okay', 'all good', 'proceed', 'save', 'everything is correct', 'that is correct', 'its correct', 'it is right'];
  const noKeywords = ['no', 'nope', 'incorrect', 'wrong', 'not correct', 'change', 'fix', 'mistake', 'actually no', 'not really'];

  for (const yk of yesKeywords) {
    if (new RegExp(`\\b${yk}\\b`, 'i').test(clean)) {
      return { isConfirmed: true, isRejected: false, isUnclear: false };
    }
  }

  for (const nk of noKeywords) {
    if (new RegExp(`\\b${nk}\\b`, 'i').test(clean)) {
      return { isConfirmed: false, isRejected: true, isUnclear: false };
    }
  }

  return { isConfirmed: false, isRejected: false, isUnclear: true };
}

export interface CorrectionParseResult {
  intent: 'bare_rejection' | 'field_targeted' | 'inline_correction' | 'unknown';
  targetField?: 'name' | 'skill' | 'experience_years' | 'location' | null;
  extractedValue?: any;
}

/**
 * Natural conversational correction parser
 * Handles:
 * - "No" -> bare_rejection
 * - "My skill" -> field_targeted ('skill')
 * - "No, my skill is tailoring" -> inline_correction ('skill', 'Tailoring & Stitching')
 * - "Actually I have 5 years experience" -> inline_correction ('experience_years', 5)
 * - "No, I live in Coimbatore" -> inline_correction ('location', 'Coimbatore, Tamil Nadu')
 */
export function parseCorrectionIntent(speech: string): CorrectionParseResult {
  const text = speech.toLowerCase().trim();

  // 1. Check for inline experience correction
  if (text.includes('year') || text.includes('years') || text.includes('experience') || text.includes('doing this for') || text.match(/\b\d+\s*(?:years?|yrs?)?\b/i)) {
    if (text === 'experience' || text === 'my experience' || text === 'the experience' || text === 'experience is wrong') {
      return { intent: 'field_targeted', targetField: 'experience_years' };
    }
    const exp = normalizeExperience(speech);
    if (exp.experience_years !== null) {
      return { intent: 'inline_correction', targetField: 'experience_years', extractedValue: exp.experience_years };
    }
  }

  // 2. Check for inline skill correction
  if (text.includes('skill') || text.includes('craft') || text.includes('work') || text.includes('teach') || text.includes('playing') || text.includes('good at') || text.includes('badminton') || text.includes('tailor') || text.includes('pottery') || text.includes('cooking') || text.includes('math')) {
    // If it's just mentioning the field: "my skill", "the skill", "skill is wrong"
    if (text === 'skill' || text === 'my skill' || text === 'the skill' || text === 'skill is wrong' || text === 'skill is incorrect') {
      return { intent: 'field_targeted', targetField: 'skill' };
    }
    // Extract normalized inline skill
    const norm = normalizeSkill(speech);
    if (norm.normalized) {
      return { intent: 'inline_correction', targetField: 'skill', extractedValue: norm.normalized };
    }
  }

  // 3. Check for inline location correction
  if (text.includes('location') || text.includes('city') || text.includes('live in') || text.includes('moved to') || text.includes('based in') || text.includes('chennai') || text.includes('coimbatore') || text.includes('madurai') || text.includes('bengaluru') || text.includes('mumbai') || text.includes('delhi')) {
    if (text === 'location' || text === 'my location' || text === 'the location' || text === 'city' || text === 'my city') {
      return { intent: 'field_targeted', targetField: 'location' };
    }
    const loc = validateAndParseLocation(speech);
    if (loc.city || loc.formatted_address) {
      return { intent: 'inline_correction', targetField: 'location', extractedValue: loc.formatted_address || loc.city };
    }
  }

  // 4. Check for inline name correction
  if (text.includes('name')) {
    if (text === 'name' || text === 'my name' || text === 'the name') {
      return { intent: 'field_targeted', targetField: 'name' };
    }
    const nameResult = normalizeName(speech);
    if (nameResult.name) {
      return { intent: 'inline_correction', targetField: 'name', extractedValue: nameResult.name };
    }
  }

  // 5. Check for bare rejection ("no", "nope", "wrong")
  const conf = isConfirmationResponse(speech);
  if (conf.isRejected) {
    return { intent: 'bare_rejection' };
  }

  return { intent: 'unknown' };
}

