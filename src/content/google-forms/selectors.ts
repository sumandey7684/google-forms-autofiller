/**
 * Centralized Google Forms DOM selectors.
 * Prefer semantic/ARIA/structural signals over generated CSS class names.
 * Do not scatter these strings through the codebase.
 */

export const GoogleFormsSelectors = {
  /**
   * Primary question list on the respondent view.
   * Google Forms typically renders questions as a list of listitems.
   */
  questionList: '[role="list"]',

  /**
   * Candidate question containers.
   * Not every listitem is a question (header / footer / submit may appear).
   */
  questionContainer: '[role="listitem"]',

  /**
   * Candidate question title / prompt text within a container.
   */
  questionHeading: '[role="heading"]',

  /**
   * Answer-control candidates inside a question container.
   * Intentionally broad for discovery; classification comes later.
   */
  answerControl: [
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="reset"])',
    'textarea',
    'select',
    '[role="textbox"]',
    '[role="radio"]',
    '[role="checkbox"]',
    '[role="radiogroup"]',
    '[role="listbox"]',
    '[role="combobox"]',
    '[role="spinbutton"]',
    '[role="slider"]',
    '[role="option"]',
    '[contenteditable="true"]',
  ].join(', '),

  /**
   * Non-answer interactive chrome often nested in listitems.
   */
  chromeControl: 'button, [role="button"], input[type="submit"], input[type="button"]',
} as const;

/** Roles treated as answer-control evidence during discovery. */
export const ANSWER_CONTROL_ROLES = [
  'textbox',
  'radio',
  'checkbox',
  'radiogroup',
  'listbox',
  'combobox',
  'spinbutton',
  'slider',
  'option',
] as const;
