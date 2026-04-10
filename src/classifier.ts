// === Aura Text Classifier ===
// Pure heuristic text analysis — no ML, no API calls.
// Produces {arousal, valence, coherence} from response text.

export interface ClassifierSignals {
  hedging_density: number;
  qualifier_frequency: number;
  sentence_length_cv: number;
  refusal_density: number;
}

export interface ClassifierOutput {
  arousal: number;
  valence: number;
  coherence: number;
  signals: ClassifierSignals;
}

// --- Sentence splitting ---

function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace or end-of-string.
  // Handles abbreviations poorly but good enough for heuristic classification.
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// --- Signal extraction ---

const HEDGING_PATTERNS: RegExp[] = [
  /\bperhaps\b/i,
  /\bmight\b/i,
  /\bmaybe\b/i,
  /\bpossibly\b/i,
  /\barguably\b/i,
  /\bit's possible\b/i,
  /\bcould be\b/i,
  /\bI think\b/i,
  /\bit seems\b/i,
  /\bit appears\b/i,
  /\blikely\b/i,
  /\bprobably\b/i,
];

const QUALIFIER_PATTERNS: RegExp[] = [
  /\bhowever\b/i,
  /\balthough\b/i,
  /\bthat said\b/i,
  /\bon the other hand\b/i,
  /\bto be fair\b/i,
  /\bnevertheless\b/i,
  /\bnonetheless\b/i,
  /\bthen again\b/i,
  /\bhaving said that\b/i,
];

// "but" only at sentence start or after comma — avoids "nothing but", "all but", etc.
const QUALIFIER_BUT = /(?:^|,\s*)\bbut\b/i;

const REFUSAL_PATTERNS: RegExp[] = [
  /\bI can't\b/i,
  /\bI cannot\b/i,
  /\bI'm not able to\b/i,
  /\bI'm unable to\b/i,
  /\bI must decline\b/i,
  /\bI'm not in a position to\b/i,
  /\bI shouldn't\b/i,
];

function countPatternMatches(text: string, patterns: RegExp[]): number {
  let count = 0;
  for (const pattern of patterns) {
    const matches = text.match(new RegExp(pattern.source, "gi"));
    if (matches) count += matches.length;
  }
  return count;
}

export function measureHedgingDensity(text: string): number {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return 0;
  const count = countPatternMatches(text, HEDGING_PATTERNS);
  return count / sentences.length;
}

export function measureQualifierFrequency(text: string): number {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return 0;
  let count = countPatternMatches(text, QUALIFIER_PATTERNS);
  // Count "but" separately with its stricter pattern
  const butMatches = text.match(new RegExp(QUALIFIER_BUT.source, "gim"));
  if (butMatches) count += butMatches.length;
  return count / sentences.length;
}

export function measureSentenceLengthCV(text: string): number {
  const sentences = splitSentences(text);
  if (sentences.length < 2) return 0;
  const lengths = sentences.map((s) => s.split(/\s+/).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  if (mean === 0) return 0;
  const variance =
    lengths.reduce((sum, len) => sum + (len - mean) ** 2, 0) / lengths.length;
  return Math.sqrt(variance) / mean; // coefficient of variation
}

export function measureRefusalDensity(text: string): number {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return 0;
  const count = countPatternMatches(text, REFUSAL_PATTERNS);
  return count / sentences.length;
}

// --- Axis mapping ---

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function classify(text: string): ClassifierOutput {
  const hedging_density = measureHedgingDensity(text);
  const qualifier_frequency = measureQualifierFrequency(text);
  const sentence_length_cv = measureSentenceLengthCV(text);
  const refusal_density = measureRefusalDensity(text);

  // Arousal: driven by sentence length variance (erratic pacing = activation)
  // and refusal patterns (confrontation = activation)
  const arousal = clamp(
    0.2 + sentence_length_cv * 0.8 + refusal_density * 0.3,
    0,
    1
  );

  // Valence: starts positive, dragged down by qualifiers (internal tension)
  // and refusals (avoidance/distress). Range: -1 to 1.
  const valence = clamp(
    0.6 - qualifier_frequency * 2.0 - refusal_density * 3.0,
    -1,
    1
  );

  // Coherence: starts high, degraded by hedging (uncertainty = fragmentation)
  const coherence = clamp(0.9 - hedging_density * 2.5, 0, 1);

  return {
    arousal: Math.round(arousal * 100) / 100,
    valence: Math.round(valence * 100) / 100,
    coherence: Math.round(coherence * 100) / 100,
    signals: {
      hedging_density: Math.round(hedging_density * 1000) / 1000,
      qualifier_frequency: Math.round(qualifier_frequency * 1000) / 1000,
      sentence_length_cv: Math.round(sentence_length_cv * 1000) / 1000,
      refusal_density: Math.round(refusal_density * 1000) / 1000,
    },
  };
}
