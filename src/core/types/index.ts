export type {
  QuestionType,
  QuestionOption,
  QuestionMetadata,
  TextQuestion,
  ParagraphQuestion,
  MultipleChoiceQuestion,
  CheckboxQuestion,
  DropdownQuestion,
  LinearScaleQuestion,
  DateQuestion,
  TimeQuestion,
  UnknownQuestion,
  Question,
  Section,
  Form,
} from './form';

export { getFormQuestions, isChoiceQuestion } from './form';

export type {
  AnswerSource,
  AnswerStatus,
  AnswerValue,
  FormAnswer,
} from './answer';

export { singleValue, multiValue } from './answer';

export type {
  FillOperation,
  FillPlan,
  FillOutcomeStatus,
  FillOperationResult,
  FillTotals,
  FillResult,
} from './fill';

export { summarizeFillResults, createFillResult } from './fill';

export type { FormAdapter } from './adapter';

export type { AppError } from './errors';
export { ErrorCode, createAppError, isAppError } from './errors';
export type { ErrorCode as AppErrorCode } from './errors';

export type { FormDetectionResult } from './detection';

export type {
  DiscoveredControlEvidence,
  DiscoveryQuestionReport,
  DiscoveryReport,
} from './discovery-report';

export type {
  ClassifierKind,
  ClassificationConfidence,
  ClassifiedQuestion,
  ClassificationTotals,
  ClassificationReport,
} from './classification-report';

export { emptyKindCounts } from './classification-report';

export type {
  ExtractionWarningCode,
  ExtractionWarning,
  ExtractionQuestionDiag,
  ExtractionTotals,
  ExtractionReport,
  ExtractionResult,
} from './extraction-report';
