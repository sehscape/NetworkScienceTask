/**
 * Lightweight language detection for the UI badge. Gemini does the real
 * detection from the audio; this only labels what the caller is speaking,
 * based on the script of the live transcript.
 */
export interface Language {
  code: string;
  name: string;
  native: string;
}

const SCRIPTS: [RegExp, Language][] = [
  [/[ঀ-৿]/g, { code: 'bn', name: 'Bengali', native: 'বাংলা' }],
  [/[਀-੿]/g, { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' }],
  [/[઀-૿]/g, { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી' }],
  [/[଀-୿]/g, { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ' }],
  [/[஀-௿]/g, { code: 'ta', name: 'Tamil', native: 'தமிழ்' }],
  [/[ఀ-౿]/g, { code: 'te', name: 'Telugu', native: 'తెలుగు' }],
  [/[ಀ-೿]/g, { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' }],
  [/[ഀ-ൿ]/g, { code: 'ml', name: 'Malayalam', native: 'മലയാളം' }],
  [/[؀-ۿ]/g, { code: 'ur', name: 'Urdu', native: 'اردو' }],
];

const HINDI: Language = { code: 'hi', name: 'Hindi', native: 'हिन्दी' };
const MARATHI: Language = { code: 'mr', name: 'Marathi', native: 'मराठी' };
const HINGLISH: Language = { code: 'hi-Latn', name: 'Hinglish', native: 'Hinglish' };
const ENGLISH: Language = { code: 'en', name: 'English', native: 'English' };

// Words that are common in Hindi written in Latin script and rare in English.
const HINGLISH_WORDS =
  /\b(hai|hain|mera|meri|mere|mujhe|kya|kyun|kaise|kitna|kitne|nahi|nahin|hua|hui|tha|thi|bhi|aap|aapka|hum|humko|karna|karu|karein|kar|diya|liya|wala|wali|bahut|abhi|kab|paisa|paise|lekin|aur|ho|gaya|gayi)\b/gi;

// Frequent Marathi-only words, to tell it apart from Hindi (both use Devanagari).
const MARATHI_WORDS = /(आहे|आहेत|माझ्या|माझा|माझी|नाही|मला|तुम्ही|काय|झाला|झाली|होते|आणि)/g;

export function detectLanguage(text: string): Language | null {
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (letters.length < 6) return null;

  const devanagari = (text.match(/[ऀ-ॿ]/g) ?? []).length;
  let best: Language | null = null;
  let bestCount = devanagari;
  for (const [re, lang] of SCRIPTS) {
    const count = (text.match(re) ?? []).length;
    if (count > bestCount) {
      best = lang;
      bestCount = count;
    }
  }

  if (bestCount > letters.length * 0.3) {
    if (best) return best;
    return (text.match(MARATHI_WORDS) ?? []).length >= 2 ? MARATHI : HINDI;
  }

  const words = text.split(/\s+/).length;
  const hinglish = (text.match(HINGLISH_WORDS) ?? []).length;
  return hinglish >= 2 && hinglish / words > 0.12 ? HINGLISH : ENGLISH;
}
