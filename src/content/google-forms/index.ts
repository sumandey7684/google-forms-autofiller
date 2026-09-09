export {
  GoogleFormsSelectors,
  DiscoveryControlKind,
  ENTRY_NAME_PATTERN,
  type DiscoverySignal,
} from './selectors';
export type {
  DiscoveredControl,
  DiscoveredControlEvidence,
  DiscoveredQuestion,
  DiscoveredQuestionDiagnostics,
  DiscoveryQuestionReport,
  DiscoveryReport,
} from './types';
export type { DiscoveryControlKind as DiscoveryControlKindType } from './selectors';
export {
  detectGoogleFormsPage,
  canHandleGoogleFormsPage,
  type GoogleFormsPageDetection,
} from './detect';
export {
  discoverQuestionContainers,
  detectRequiredState,
  resolveRequiredState,
  matchProviderId,
  previewText,
  toSafeControlEvidence,
} from './discovery';
export {
  classifyQuestion,
  classifyQuestions,
  summarizeClassification,
  logClassificationSummary,
} from './classification';
export type {
  ClassifierKind,
  ClassificationConfidence,
  ClassifiedQuestion,
  ClassificationTotals,
  ClassificationReport,
} from '@/core/types/classification-report';
export {
  buildDiscoveryReport,
  summarizeDiscoveredQuestions,
  logDiscoverySummary,
  logDiscoveryReport,
  DISCOVERY_DEBUG_LOGGING,
} from './diagnostics';
export {
  extractForm,
  logExtractionSummary,
  type ExtractFormMetadata,
} from './extract';
export type {
  ExtractionWarningCode,
  ExtractionWarning,
  ExtractionQuestionDiag,
  ExtractionTotals,
  ExtractionReport,
  ExtractionResult,
} from '@/core/types/extraction-report';
export { GoogleFormsAdapter, createGoogleFormsAdapter } from './adapter';
