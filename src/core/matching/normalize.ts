/**
 * Deterministic question-text normalization for P7 matching.
 *
 * Keeps Unicode letters and numbers, converts separators to token boundaries,
 * and never applies stemming, fuzzy edits, or probabilistic transforms.
 */
export function normalizeQuestionText(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/&/gu, ' and ')
    .replace(/\+/gu, ' plus ')
    .replace(/#/gu, ' number ')
    .replace(/@/gu, ' at ')
    // Punctuation/symbols become spaces instead of being removed, preventing
    // adjacent terms such as "email/phone" from being merged.
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function tokenizeNormalizedText(
  normalizedText: string,
): readonly string[] {
  return normalizedText.length === 0 ? [] : normalizedText.split(' ');
}
