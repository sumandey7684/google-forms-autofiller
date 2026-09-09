/**
 * Serializable discovery diagnostics (no DOM references, no answer values).
 * Produced by page adapters; consumed by messaging / debug UI.
 */

export interface DiscoveredControlEvidence {
  kind: string;
  tagName: string;
  role: string | null;
  inputType: string | null;
  ariaLabel: string | null;
  name: string | null;
  hasProviderId: boolean;
  /** Names only of data-* attributes present (values omitted). */
  dataAttributeNames: readonly string[];
}

export interface DiscoveryQuestionReport {
  index: number;
  discoveryId: string;
  providerId: string | null;
  controlCount: number;
  hasTextCandidate: boolean;
  hasDescriptionCandidate: boolean;
  hasInteractiveControls: boolean;
  /** true/false when known; null when unknown. */
  required: boolean | null;
  /** Truncated question prompt preview only — never an answer value. */
  textPreview: string | null;
  controls: readonly DiscoveredControlEvidence[];
  notes: readonly string[];
}

export interface DiscoveryReport {
  url: string;
  canHandle: boolean;
  signal: 'role-listitem' | 'data-params-fallback' | 'none';
  containerCount: number;
  recognized: number;
  missingControls: number;
  missingTitles: number;
  missingProviderIds: number;
  totalControls: number;
  questions: readonly DiscoveryQuestionReport[];
}
