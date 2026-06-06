const USAGE_PATTERNS = [
  /\brecuerdo que\b/i,
  /\bcomo mencionaste\b/i,
  /\bsegún tus preferencias\b/i,
  /\bbased on your preference\b/i,
  /\bas you mentioned\b/i,
  /\bI remember\b/i,
  /\bI know you prefer\b/i,
  /\byou've told me\b/i,
  /\bI recall\b/i,
];

export function usesMemory(text: string): boolean {
  return USAGE_PATTERNS.some((re) => re.test(text));
}

const SAVE_PATTERNS = [
  /I(?:'ll| will) (?:remember|note) (?:that )?(.+?)(?:\.|$)/im,
  /(?:I'll keep in mind|noted|I'll keep that in mind)[:\s]+(.+?)(?:\.|$)/im,
  /voy a recordar (?:que )?(.+?)(?:\.|$)/im,
  /anotado[:\s]+(.+?)(?:\.|$)/im,
];

export function extractLearningCandidate(text: string): string | null {
  for (const re of SAVE_PATTERNS) {
    const match = re.exec(text);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}
