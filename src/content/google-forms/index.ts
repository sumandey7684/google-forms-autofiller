export { GoogleFormsSelectors, ANSWER_CONTROL_ROLES } from './selectors';
export type {
  DiscoveredControlEvidence,
  DiscoveredQuestion,
  DiscoveredQuestionDiagnostics,
  DiscoveryQuestionReport,
  DiscoveryReport,
} from './types';
export {
  detectGoogleFormsPage,
  canHandleGoogleFormsPage,
  type GoogleFormsPageDetection,
} from './detect';
export {
  discoverQuestionContainers,
  collectControlEvidence,
  previewText,
} from './discover';
export {
  buildDiscoveryReport,
  summarizeDiscoveredQuestions,
  logDiscoveryReport,
} from './diagnostics';
export { GoogleFormsAdapter, createGoogleFormsAdapter } from './adapter';
