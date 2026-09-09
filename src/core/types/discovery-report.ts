/**
 * Serializable discovery diagnostics (no DOM references, no answer values).
 * Produced by page adapters; consumed by messaging / debug UI.
 */

export interface DiscoveredControlEvidence {
  tagName: string;
  role: string | null;
  inputType: string | null;
  ariaLabel: string | null;
  name: string | null;
  /** Names only of data-* attributes present (values omitted). */
  dataAttributeNames: readonly string[];
}

export interface DiscoveryQuestionReport {
  index: number;
  controlCount: number;
  hasTextCandidate: boolean;
  hasDescriptionCandidate: boolean;
  hasRecognizableControls: boolean;
  /** Truncated question prompt preview only — never an answer value. */
  textPreview: string | null;
  controls: readonly DiscoveredControlEvidence[];
  notes: readonly string[];
}

export interface DiscoveryReport {
  url: string;
  canHandle: boolean;
  strategy: 'role-listitem';
  containerCount: number;
  containersWithControls: number;
  containersWithoutControls: number;
  totalControls: number;
  questions: readonly DiscoveryQuestionReport[];
}
