/**
 * Core Google Form domain model.
 * Independent of DOM, Chrome APIs, React, and AI providers.
 */

export type QuestionType =
  | 'text'
  | 'paragraph'
  | 'multiple_choice'
  | 'checkbox'
  | 'dropdown'
  | 'linear_scale'
  | 'date'
  | 'time'
  | 'unknown';

/** Stable option identity — adapters assign IDs; never rely on array index alone. */
export interface QuestionOption {
  id: string;
  label: string;
}

/**
 * Optional adapter/engine hints. Not part of Google's semantic model.
 * Keep values JSON-serializable.
 */
export type QuestionMetadata = Readonly<
  Record<string, string | number | boolean | null>
>;

interface QuestionBase {
  id: string;
  text: string;
  description?: string;
  /**
   * Required when known.
   * - `true` — known required
   * - `false` — known optional
   * - omitted / undefined — unknown (must NOT be treated as optional)
   */
  required?: boolean;
  /** Owning section id when the form is sectioned. */
  sectionId?: string;
  metadata?: QuestionMetadata;
}

export interface TextQuestion extends QuestionBase {
  type: 'text';
}

export interface ParagraphQuestion extends QuestionBase {
  type: 'paragraph';
}

export interface MultipleChoiceQuestion extends QuestionBase {
  type: 'multiple_choice';
  options: readonly QuestionOption[];
}

export interface CheckboxQuestion extends QuestionBase {
  type: 'checkbox';
  options: readonly QuestionOption[];
}

export interface DropdownQuestion extends QuestionBase {
  type: 'dropdown';
  options: readonly QuestionOption[];
}

export interface LinearScaleQuestion extends QuestionBase {
  type: 'linear_scale';
  min: number;
  max: number;
  minLabel?: string;
  maxLabel?: string;
}

export interface DateQuestion extends QuestionBase {
  type: 'date';
}

export interface TimeQuestion extends QuestionBase {
  type: 'time';
}

/** Catch-all for controls we detect but do not model yet. */
export interface UnknownQuestion extends QuestionBase {
  type: 'unknown';
  options?: readonly QuestionOption[];
}

export type Question =
  | TextQuestion
  | ParagraphQuestion
  | MultipleChoiceQuestion
  | CheckboxQuestion
  | DropdownQuestion
  | LinearScaleQuestion
  | DateQuestion
  | TimeQuestion
  | UnknownQuestion;

export interface Section {
  id: string;
  title: string;
  description?: string;
  questions: readonly Question[];
}

export interface Form {
  id: string;
  title: string;
  description?: string;
  /** Page URL at extraction time (informational; not a DOM handle). */
  url: string;
  sections: readonly Section[];
  extractedAt: string;
}

/** Flatten section questions in document order. */
export function getFormQuestions(form: Form): readonly Question[] {
  return form.sections.flatMap((section) => section.questions);
}

export function isChoiceQuestion(
  question: Question,
): question is MultipleChoiceQuestion | CheckboxQuestion | DropdownQuestion {
  return (
    question.type === 'multiple_choice' ||
    question.type === 'checkbox' ||
    question.type === 'dropdown'
  );
}
