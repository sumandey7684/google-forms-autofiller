/**
 * DOM-layer discovery types for Google Forms.
 * These are NOT core domain Form/Question types and must stay in the content layer.
 */

import type {
  DiscoveredControlEvidence,
  DiscoveryQuestionReport,
  DiscoveryReport,
} from '@/core/types/discovery-report';
import type { DiscoveryControlKind, DiscoverySignal } from './selectors';

export type {
  DiscoveredControlEvidence,
  DiscoveryQuestionReport,
  DiscoveryReport,
  DiscoveryControlKind,
  DiscoverySignal,
};

/**
 * Interactive control found inside a question container.
 * P2 does not capture control values (privacy / read-structure-only).
 */
export interface DiscoveredControl {
  element: HTMLElement;
  kind: DiscoveryControlKind;
  /** Google Forms entry id when present on this control (e.g. entry.123). */
  providerId?: string;
  /** Accessibility / chrome label candidate — not an answer value. */
  label?: string;
}

export interface DiscoveredQuestionDiagnostics {
  signal: DiscoverySignal;
  hasInteractiveControls: boolean;
  hasTitleCandidate: boolean;
  hasDescriptionCandidate: boolean;
  hasProviderId: boolean;
  /** true | false when confident; omitted when unknown. */
  requiredKnown: boolean;
  notes: readonly string[];
  controlEvidence: readonly DiscoveredControlEvidence[];
}

/**
 * In-memory discovery hit with live Element references.
 * Do not send across extension messaging boundaries.
 */
export interface DiscoveredQuestion {
  /**
   * Internal discovery-only id (e.g. `discovery:q-0`).
   * Not a stable Google Forms identifier.
   */
  discoveryId: string;
  /** Google Forms provider id when found (e.g. `entry.123456`). */
  providerId?: string;
  index: number;
  container: HTMLElement;
  titleElement?: HTMLElement;
  descriptionElement?: HTMLElement;
  /**
   * Required when detectable with confidence; `undefined` means unknown.
   * Never invent required=true from a lone "*" glyph.
   */
  required?: boolean;
  controls: readonly DiscoveredControl[];
  diagnostics: DiscoveredQuestionDiagnostics;
}
