/**
 * Centralized Google Forms DOM selectors and attribute patterns.
 * Prefer semantic/ARIA/structural signals over generated CSS class names.
 * Do not scatter these strings through the codebase.
 */

export const GoogleFormsSelectors = {
  /** Primary question list on the respondent view. */
  questionList: '[role="list"]',

  /**
   * Primary candidate question containers.
   * Header / footer / submit listitems may appear and are filtered via diagnostics.
   */
  questionContainer: '[role="listitem"]',

  /**
   * Fallback containers when list/listitem structure is absent.
   * `data-params` is provider-specific and less stable than roles — use only as fallback.
   */
  questionContainerFallback: '[data-params]',

  /** Candidate question title / prompt. */
  questionHeading: '[role="heading"]',

  /**
   * Interactive control candidates inside a question container.
   * Discovery-level only — not semantic question classification.
   */
  interactiveControl: [
    'input:not([type="hidden"])',
    'textarea',
    'select',
    'button',
    '[role="textbox"]',
    '[role="radio"]',
    '[role="checkbox"]',
    '[role="radiogroup"]',
    '[role="listbox"]',
    '[role="combobox"]',
    '[role="spinbutton"]',
    '[role="slider"]',
    '[role="option"]',
    '[role="button"]',
    '[contenteditable="true"]',
  ].join(', '),

  /**
   * Controls used to locate provider entry IDs (may include hidden inputs).
   * Hidden inputs are metadata sources only — not treated as interactive answers.
   */
  providerIdControl: 'input[name^="entry."], textarea[name^="entry."], select[name^="entry."], [name^="entry."]',

  /** Required-state attribute probes. */
  requiredTrue: '[aria-required="true"], [required]',
  requiredFalse: '[aria-required="false"]',
} as const;

/**
 * Exact `name` attribute pattern for Google Forms entry identifiers.
 * Requires end-of-string so `entry.123abc` does not partially match.
 */
export const ENTRY_NAME_PATTERN = /^entry\.\d+$/;

/**
 * Discovery-level control categories (DOM shape), NOT semantic question types.
 * Semantic classification belongs to P3.
 */
export const DiscoveryControlKind = {
  native_input: 'native_input',
  native_textarea: 'native_textarea',
  native_select: 'native_select',
  native_button: 'native_button',
  aria_textbox: 'aria_textbox',
  aria_radio: 'aria_radio',
  aria_checkbox: 'aria_checkbox',
  aria_radiogroup: 'aria_radiogroup',
  aria_listbox: 'aria_listbox',
  aria_combobox: 'aria_combobox',
  aria_option: 'aria_option',
  aria_spinbutton: 'aria_spinbutton',
  aria_slider: 'aria_slider',
  aria_button: 'aria_button',
  contenteditable: 'contenteditable',
  other_interactive: 'other_interactive',
} as const;

export type DiscoveryControlKind =
  (typeof DiscoveryControlKind)[keyof typeof DiscoveryControlKind];

export type DiscoverySignal =
  | 'role-listitem'
  | 'data-params-fallback'
  | 'none';
