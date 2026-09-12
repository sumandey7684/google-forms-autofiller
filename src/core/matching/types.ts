/**
 * P7 supports only existing user-profile fields.
 * `updatedAt` is profile metadata and is intentionally excluded.
 */
export const MATCHABLE_PROFILE_FIELDS = [
  'fullName',
  'email',
  'phone',
  'linkedInUrl',
  'portfolioUrl',
  'location',
  'notes',
] as const;

export type ProfileField = (typeof MATCHABLE_PROFILE_FIELDS)[number];

export type MatchMethod =
  | 'exact_canonical'
  | 'explicit_alias'
  | 'phrase_token'
  | 'none';

/** Discrete rule strength, not a probability. */
export type MatchConfidence = 1 | 0.9 | 0.75 | 0;

export type MatchStatus =
  | 'matched'
  | 'ambiguous'
  | 'unmatched'
  | 'unsupported'
  | 'invalid';

/**
 * DOM-free matching input. Normal Form questions map directly to this shape.
 * `questionType` remains a string so unsupported runtime/provider kinds can
 * produce an explicit `unsupported` result instead of throwing.
 */
export interface MatchQuestionInput {
  questionId: string;
  questionType: string;
  text: string;
}

export interface ProfileFieldCandidate {
  profileField: ProfileField;
  method: Exclude<MatchMethod, 'none'>;
  confidence: Exclude<MatchConfidence, 0>;
  /** Canonical phrase or alias that supplied the evidence. */
  evidence: string;
}

export interface MatchAmbiguity {
  candidates: readonly ProfileField[];
  reason: string;
}

export interface QuestionMatchResult {
  questionId: string;
  questionType: string;
  normalizedQuestionText: string;
  status: MatchStatus;
  profileField?: ProfileField;
  method: MatchMethod;
  confidence: MatchConfidence;
  candidates: readonly ProfileFieldCandidate[];
  ambiguity?: MatchAmbiguity;
  reason: string;
}

export interface MatchingTotals {
  total: number;
  matched: number;
  ambiguous: number;
  unmatched: number;
  unsupported: number;
  invalid: number;
}

export interface MatchingReport {
  formId: string;
  results: readonly QuestionMatchResult[];
  totals: MatchingTotals;
}
