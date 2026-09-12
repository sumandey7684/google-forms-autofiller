import { getFormQuestions, type Form } from '@/core/types/form';
import {
  normalizeQuestionText,
  tokenizeNormalizedText,
} from './normalize';
import type {
  MatchConfidence,
  MatchMethod,
  MatchQuestionInput,
  MatchingReport,
  MatchingTotals,
  ProfileField,
  ProfileFieldCandidate,
  QuestionMatchResult,
} from './types';

interface PhraseRule {
  readonly tokens: readonly string[];
  readonly evidence: string;
}

interface FieldRule {
  readonly profileField: ProfileField;
  readonly canonical: string;
  readonly aliases: readonly string[];
  readonly phraseRules: readonly PhraseRule[];
}

const SUPPORTED_QUESTION_TYPES = new Set(['text', 'paragraph']);

const THIRD_PARTY_CONTEXT_SEQUENCES: readonly (readonly string[])[] = [
  ['company'],
  ['contact', 'person'],
  ['emergency'],
  ['employer'],
  ['manager'],
  ['organization'],
  ['organisation'],
  ['reference'],
  ['referee'],
  ['school'],
  ['supervisor'],
  ['university'],
];

/**
 * Every accepted phrase contains at least two contextual terms. Bare generic
 * labels such as "name", "email", "phone", or "experience" never match.
 */
const FIELD_RULES: readonly FieldRule[] = [
  {
    profileField: 'fullName',
    canonical: 'full name',
    aliases: [
      'your full name',
      'legal name',
      'candidate full name',
      'first and last name',
      'first name and last name',
      'name on resume',
    ],
    phraseRules: [
      { tokens: ['first', 'last', 'name'], evidence: 'first + last + name' },
      { tokens: ['full', 'name'], evidence: 'full + name' },
      { tokens: ['legal', 'name'], evidence: 'legal + name' },
      { tokens: ['candidate', 'name'], evidence: 'candidate + name' },
      { tokens: ['resume', 'name'], evidence: 'resume + name' },
    ],
  },
  {
    profileField: 'email',
    canonical: 'email address',
    aliases: [
      'e mail address',
      'contact email',
      'contact email address',
      'contact e mail address',
      'personal email address',
      'work email address',
    ],
    phraseRules: [
      { tokens: ['email', 'address'], evidence: 'email + address' },
      { tokens: ['e', 'mail', 'address'], evidence: 'e + mail + address' },
      { tokens: ['contact', 'email'], evidence: 'contact + email' },
      { tokens: ['personal', 'email'], evidence: 'personal + email' },
      { tokens: ['work', 'email'], evidence: 'work + email' },
    ],
  },
  {
    profileField: 'phone',
    canonical: 'phone number',
    aliases: [
      'mobile number',
      'telephone number',
      'contact number',
      'contact phone number',
      'cell phone number',
      'phone number with country code',
    ],
    phraseRules: [
      { tokens: ['country', 'code', 'phone'], evidence: 'country + code + phone' },
      { tokens: ['cell', 'phone'], evidence: 'cell + phone' },
      { tokens: ['phone', 'number'], evidence: 'phone + number' },
      { tokens: ['mobile', 'number'], evidence: 'mobile + number' },
      { tokens: ['telephone', 'number'], evidence: 'telephone + number' },
      { tokens: ['contact', 'number'], evidence: 'contact + number' },
    ],
  },
  {
    profileField: 'linkedInUrl',
    canonical: 'linkedin url',
    aliases: [
      'linkedin profile',
      'linkedin profile url',
      'linkedin link',
      'linkedin profile link',
    ],
    phraseRules: [
      { tokens: ['linkedin', 'profile', 'url'], evidence: 'linkedin + profile + url' },
      { tokens: ['linkedin', 'profile'], evidence: 'linkedin + profile' },
      { tokens: ['linkedin', 'url'], evidence: 'linkedin + url' },
      { tokens: ['linkedin', 'link'], evidence: 'linkedin + link' },
    ],
  },
  {
    profileField: 'portfolioUrl',
    canonical: 'portfolio url',
    aliases: [
      'portfolio website',
      'portfolio link',
      'portfolio website url',
      'personal website',
      'personal website url',
    ],
    phraseRules: [
      { tokens: ['portfolio', 'website', 'url'], evidence: 'portfolio + website + url' },
      { tokens: ['portfolio', 'website'], evidence: 'portfolio + website' },
      { tokens: ['portfolio', 'url'], evidence: 'portfolio + url' },
      { tokens: ['portfolio', 'link'], evidence: 'portfolio + link' },
      { tokens: ['personal', 'website'], evidence: 'personal + website' },
    ],
  },
  {
    profileField: 'location',
    canonical: 'current location',
    aliases: [
      'present location',
      'current city',
      'city and state',
      'city and country',
      'current city and state',
      'current city and country',
    ],
    phraseRules: [
      { tokens: ['current', 'city', 'state'], evidence: 'current + city + state' },
      { tokens: ['current', 'city', 'country'], evidence: 'current + city + country' },
      { tokens: ['current', 'location'], evidence: 'current + location' },
      { tokens: ['present', 'location'], evidence: 'present + location' },
      { tokens: ['current', 'city'], evidence: 'current + city' },
      { tokens: ['city', 'state'], evidence: 'city + state' },
      { tokens: ['city', 'country'], evidence: 'city + country' },
    ],
  },
  {
    profileField: 'notes',
    canonical: 'additional notes',
    aliases: [
      'additional information',
      'additional comments',
      'anything else',
      'other notes',
    ],
    phraseRules: [
      { tokens: ['additional', 'information'], evidence: 'additional + information' },
      { tokens: ['additional', 'comments'], evidence: 'additional + comments' },
      { tokens: ['additional', 'notes'], evidence: 'additional + notes' },
      { tokens: ['anything', 'else'], evidence: 'anything + else' },
      { tokens: ['other', 'notes'], evidence: 'other + notes' },
    ],
  },
];

function createTerminalResult(
  input: MatchQuestionInput,
  normalizedQuestionText: string,
  status: 'invalid' | 'unsupported' | 'unmatched',
  reason: string,
): QuestionMatchResult {
  return {
    questionId: input.questionId,
    questionType: input.questionType,
    normalizedQuestionText,
    status,
    method: 'none',
    confidence: 0,
    candidates: [],
    reason,
  };
}

function createCandidates(
  method: Exclude<MatchMethod, 'none'>,
  confidence: Exclude<MatchConfidence, 0>,
  findEvidence: (rule: FieldRule) => string | undefined,
): ProfileFieldCandidate[] {
  const candidates: ProfileFieldCandidate[] = [];
  for (const rule of FIELD_RULES) {
    const evidence = findEvidence(rule);
    if (evidence !== undefined) {
      candidates.push({
        profileField: rule.profileField,
        method,
        confidence,
        evidence,
      });
    }
  }
  return candidates;
}

function resolveCandidates(
  input: MatchQuestionInput,
  normalizedQuestionText: string,
  candidates: readonly ProfileFieldCandidate[],
): QuestionMatchResult {
  const first = candidates[0];
  if (candidates.length === 1 && first !== undefined) {
    return {
      questionId: input.questionId,
      questionType: input.questionType,
      normalizedQuestionText,
      status: 'matched',
      profileField: first.profileField,
      method: first.method,
      confidence: first.confidence,
      candidates,
      reason: `Matched profile field "${first.profileField}" using ${first.method}.`,
    };
  }

  const fields = candidates.map((candidate) => candidate.profileField);
  return {
    questionId: input.questionId,
    questionType: input.questionType,
    normalizedQuestionText,
    status: 'ambiguous',
    method: first?.method ?? 'none',
    confidence: first?.confidence ?? 0,
    candidates,
    ambiguity: {
      candidates: fields,
      reason: 'Multiple profile fields have equally strong deterministic evidence.',
    },
    reason: 'No profile field selected because equally strong candidates remain.',
  };
}

function containsTokenSequence(
  tokens: readonly string[],
  required: readonly string[],
): boolean {
  if (required.length === 0 || required.length > tokens.length) {
    return false;
  }

  const lastStart = tokens.length - required.length;
  for (let start = 0; start <= lastStart; start += 1) {
    if (required.every((token, offset) => tokens[start + offset] === token)) {
      return true;
    }
  }
  return false;
}

export function matchQuestion(
  input: MatchQuestionInput,
): QuestionMatchResult {
  const normalizedQuestionText = normalizeQuestionText(input.text);
  if (
    input.questionId.trim().length === 0 ||
    input.questionType.trim().length === 0 ||
    normalizedQuestionText.length === 0
  ) {
    return createTerminalResult(
      input,
      normalizedQuestionText,
      'invalid',
      'Question id, type, and non-empty normalized text are required.',
    );
  }

  if (!SUPPORTED_QUESTION_TYPES.has(input.questionType)) {
    return createTerminalResult(
      input,
      normalizedQuestionText,
      'unsupported',
      `Question type "${input.questionType}" is not supported by P7 matching.`,
    );
  }

  const tokens = tokenizeNormalizedText(normalizedQuestionText);
  if (
    THIRD_PARTY_CONTEXT_SEQUENCES.some((sequence) =>
      containsTokenSequence(tokens, sequence),
    )
  ) {
    return createTerminalResult(
      input,
      normalizedQuestionText,
      'unmatched',
      'Explicit third-party context prevents a profile-field match.',
    );
  }

  const exactCandidates = createCandidates(
    'exact_canonical',
    1,
    (rule) =>
      normalizedQuestionText === rule.canonical ? rule.canonical : undefined,
  );
  if (exactCandidates.length > 0) {
    return resolveCandidates(input, normalizedQuestionText, exactCandidates);
  }

  const aliasCandidates = createCandidates(
    'explicit_alias',
    0.9,
    (rule) =>
      rule.aliases.find((alias) => normalizedQuestionText === alias),
  );
  if (aliasCandidates.length > 0) {
    return resolveCandidates(input, normalizedQuestionText, aliasCandidates);
  }

  const phraseCandidates = createCandidates(
    'phrase_token',
    0.75,
    (rule) =>
      rule.phraseRules.find((phrase) =>
        containsTokenSequence(tokens, phrase.tokens),
      )?.evidence,
  );
  if (phraseCandidates.length > 0) {
    return resolveCandidates(input, normalizedQuestionText, phraseCandidates);
  }

  return createTerminalResult(
    input,
    normalizedQuestionText,
    'unmatched',
    'No sufficiently specific deterministic profile-field rule matched.',
  );
}

function summarizeMatching(
  results: readonly QuestionMatchResult[],
): MatchingTotals {
  const totals: MatchingTotals = {
    total: results.length,
    matched: 0,
    ambiguous: 0,
    unmatched: 0,
    unsupported: 0,
    invalid: 0,
  };

  for (const result of results) {
    totals[result.status] += 1;
  }
  return totals;
}

export function matchFormQuestions(form: Form): MatchingReport {
  const results = getFormQuestions(form).map((question) =>
    matchQuestion({
      questionId: question.id,
      questionType: question.type,
      text: question.text,
    }),
  );

  return {
    formId: form.id,
    results,
    totals: summarizeMatching(results),
  };
}
