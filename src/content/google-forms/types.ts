/**
 * DOM-layer discovery types for Google Forms.
 * Element-bearing types stay here; serializable reports live in core.
 */

import type {
  DiscoveredControlEvidence,
  DiscoveryQuestionReport,
  DiscoveryReport,
} from '@/core/types/discovery-report';

export type {
  DiscoveredControlEvidence,
  DiscoveryQuestionReport,
  DiscoveryReport,
};

export interface DiscoveredQuestionDiagnostics {
  controlEvidence: readonly DiscoveredControlEvidence[];
  hasRecognizableControls: boolean;
  notes: readonly string[];
}

/**
 * In-memory discovery hit. Holds live Element references for later phases.
 * Do not send this object across extension messaging boundaries.
 */
export interface DiscoveredQuestion {
  index: number;
  container: HTMLElement;
  candidateTextElement: HTMLElement | null;
  candidateDescriptionElement: HTMLElement | null;
  candidateControls: readonly HTMLElement[];
  diagnostics: DiscoveredQuestionDiagnostics;
}
